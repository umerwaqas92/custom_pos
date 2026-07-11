import path from "path";
import fs from "fs";
import { execFileSync } from "child_process";
import prisma from "./db";
const AdmZip = require("adm-zip");

/**
 * Resolve paths for both:
 * - Dev: backend/prisma/dev.db
 * - Electron desktop (Mac/Windows): userData (writable; Program Files is read-only on Windows)
 */
function resolveFromDatabaseUrl(): string | null {
  const url = process.env.DATABASE_URL;
  if (!url || !url.startsWith("file:")) return null;
  let p = url.slice("file:".length);
  // file:///C:/... or file:/C:/... or file:./dev.db
  if (p.startsWith("///")) p = p.slice(2); // keep leading /
  else if (p.startsWith("//") && !p.startsWith("//./")) {
    // file://hostname/path — rare
    p = p.replace(/^\/\/[^/]*/, "");
  }
  // Windows absolute after file:  C:/Users/...
  if (/^[A-Za-z]:[\\/]/.test(p) || path.isAbsolute(p)) {
    return path.normalize(p);
  }
  // Relative to prisma folder
  return path.resolve(__dirname, "../../prisma", p.replace(/^\.\//, ""));
}

function userDataRoot(): string | null {
  return process.env.POS_USER_DATA || null;
}

const resolvedDb = resolveFromDatabaseUrl();
export const DB_PATH = resolvedDb || path.resolve(__dirname, "../../prisma/dev.db");
export const DB_WAL_PATH = DB_PATH + "-wal";
export const DB_SHM_PATH = DB_PATH + "-shm";

const dataRoot = userDataRoot();
export const BACKUPS_DIR = dataRoot
  ? path.join(dataRoot, "backups")
  : path.resolve(__dirname, "../../backups");
export const UPLOADS_PATH = dataRoot
  ? path.join(dataRoot, "uploads")
  : path.resolve(__dirname, "../../public/uploads");
export const BACKEND_ROOT = path.resolve(__dirname, "../../");

/** Ensure backups directory exists */
export function ensureBackupsDir() {
  if (!fs.existsSync(BACKUPS_DIR)) {
    fs.mkdirSync(BACKUPS_DIR, { recursive: true });
  }
}

/** Flush SQLite WAL into the main DB so the .db file is self-contained */
export async function checkpointDatabase() {
  try {
    await prisma.$queryRawUnsafe("PRAGMA wal_checkpoint(TRUNCATE);");
  } catch (err) {
    console.warn("[Backup] WAL checkpoint failed (continuing):", err);
  }
}

function removeIfExists(filePath: string) {
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
}

/**
 * After replacing the main DB, leftover -wal/-shm from the running process
 * would replay old transactions and undo the restore. Always clear them.
 */
export function clearSqliteSidecars() {
  removeIfExists(DB_WAL_PATH);
  removeIfExists(DB_SHM_PATH);
}

/** Build a backup zip (DB + uploads). Checkpoints SQLite first. */
export async function buildBackupZip(): Promise<InstanceType<typeof AdmZip>> {
  await checkpointDatabase();

  const zip = new AdmZip();

  if (!fs.existsSync(DB_PATH)) {
    throw new Error("Database file not found at " + DB_PATH);
  }
  // Always store as prisma/dev.db inside zip for compatibility
  zip.addLocalFile(DB_PATH, "prisma", "dev.db");

  if (fs.existsSync(DB_WAL_PATH) && fs.statSync(DB_WAL_PATH).size > 0) {
    zip.addLocalFile(DB_WAL_PATH, "prisma", "dev.db-wal");
  }
  if (fs.existsSync(DB_SHM_PATH) && fs.statSync(DB_SHM_PATH).size > 0) {
    zip.addLocalFile(DB_SHM_PATH, "prisma", "dev.db-shm");
  }

  if (fs.existsSync(UPLOADS_PATH)) {
    const uploadFiles = fs.readdirSync(UPLOADS_PATH).filter((f) => !f.startsWith("."));
    if (uploadFiles.length > 0) {
      zip.addLocalFolder(UPLOADS_PATH, "public/uploads");
    }
  }

  return zip;
}

/** Write a named backup into backups/ and return metadata */
export async function writeBackupToDisk(prefix = "manual-backup"): Promise<{
  filename: string;
  path: string;
  size: number;
  createdAt: string;
}> {
  ensureBackupsDir();
  const zip = await buildBackupZip();
  const now = Date.now();
  const dateStr = new Date().toISOString().split("T")[0];
  const filename = `${prefix}-${dateStr}-${now}.zip`;
  const filePath = path.join(BACKUPS_DIR, filename);
  zip.writeZip(filePath);
  const stat = fs.statSync(filePath);
  return {
    filename,
    path: filePath,
    size: stat.size,
    createdAt: stat.mtime.toISOString()
  };
}

/** Validate backup zip has a database file */
export function zipContainsDatabase(zip: InstanceType<typeof AdmZip>): boolean {
  return zip.getEntries().some((entry: any) => {
    const name = String(entry.entryName).replace(/\\/g, "/");
    return (
      name === "prisma/dev.db" ||
      name.endsWith("/prisma/dev.db") ||
      name === "dev.db" ||
      name.endsWith("/dev.db")
    );
  });
}

/**
 * Restore database + uploads from a zip path.
 * Safely handles SQLite WAL sidecars that otherwise undo restores.
 */
export async function restoreFromZipFile(zipPath: string): Promise<void> {
  if (!fs.existsSync(zipPath)) {
    throw new Error("Backup file not found.");
  }

  const zip = new AdmZip(zipPath);
  if (!zipContainsDatabase(zip)) {
    throw new Error("Invalid backup archive. Expected prisma/dev.db inside the ZIP.");
  }

  // Ensure parent dirs exist (desktop app userData)
  const dbDir = path.dirname(DB_PATH);
  if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });

  await prisma.$disconnect();

  try {
    clearSqliteSidecars();

    const tempDb = DB_PATH + ".restore-tmp";
    removeIfExists(tempDb);

    const entries = zip.getEntries();
    let dbEntry: any = null;
    const uploadEntries: any[] = [];

    for (const entry of entries) {
      if (entry.isDirectory) continue;
      const name = String(entry.entryName).replace(/\\/g, "/");

      if (
        name === "prisma/dev.db" ||
        name.endsWith("/prisma/dev.db") ||
        name === "dev.db" ||
        name.endsWith("/dev.db")
      ) {
        dbEntry = entry;
      } else if (name.startsWith("public/uploads/") || name.includes("/public/uploads/")) {
        uploadEntries.push(entry);
      }
    }

    if (!dbEntry) {
      throw new Error("Database entry missing from backup ZIP.");
    }

    fs.writeFileSync(tempDb, dbEntry.getData());

    if (fs.existsSync(DB_PATH)) {
      const bak = DB_PATH + ".pre-restore";
      removeIfExists(bak);
      // On Windows, rename can fail if file is locked — try copy+unlink fallback
      try {
        fs.renameSync(DB_PATH, bak);
      } catch {
        fs.copyFileSync(DB_PATH, bak);
        try {
          fs.unlinkSync(DB_PATH);
        } catch {
          /* ignore */
        }
      }
      try {
        try {
          fs.renameSync(tempDb, DB_PATH);
        } catch {
          fs.copyFileSync(tempDb, DB_PATH);
          removeIfExists(tempDb);
        }
        removeIfExists(bak);
      } catch (err) {
        if (fs.existsSync(bak) && !fs.existsSync(DB_PATH)) {
          try {
            fs.renameSync(bak, DB_PATH);
          } catch {
            fs.copyFileSync(bak, DB_PATH);
          }
        }
        throw err;
      }
    } else {
      try {
        fs.renameSync(tempDb, DB_PATH);
      } catch {
        fs.copyFileSync(tempDb, DB_PATH);
        removeIfExists(tempDb);
      }
    }

    clearSqliteSidecars();

    if (!fs.existsSync(UPLOADS_PATH)) {
      fs.mkdirSync(UPLOADS_PATH, { recursive: true });
    }
    for (const entry of uploadEntries) {
      const name = String(entry.entryName).replace(/\\/g, "/");
      const rel = name.includes("public/uploads/")
        ? name.split("public/uploads/").pop()!
        : path.basename(name);
      if (!rel || rel.includes("..")) continue;
      const dest = path.join(UPLOADS_PATH, rel);
      const destDir = path.dirname(dest);
      if (!fs.existsSync(destDir)) {
        fs.mkdirSync(destDir, { recursive: true });
      }
      fs.writeFileSync(dest, entry.getData());
    }
  } finally {
    try {
      await prisma.$connect();
      await prisma.$queryRawUnsafe("SELECT 1");
    } catch (err) {
      console.error("[Backup] Failed to reconnect after restore:", err);
      throw new Error(
        "Restore wrote files but database reconnect failed. Restart the app completely."
      );
    }
  }

  await applyPendingMigrations();
}

export async function applyPendingMigrations(): Promise<void> {
  const backendRoot = BACKEND_ROOT;
  const prismaBin =
    process.platform === "win32"
      ? path.join(backendRoot, "node_modules", ".bin", "prisma.cmd")
      : path.join(backendRoot, "node_modules", ".bin", "prisma");
  const prismaJs = path.join(backendRoot, "node_modules", "prisma", "build", "index.js");

  if (!fs.existsSync(prismaBin) && !fs.existsSync(prismaJs)) {
    console.warn("[Backup] prisma binary not found; skip migrate deploy");
    return;
  }

  try {
    await prisma.$disconnect();
  } catch {
    /* ignore */
  }

  try {
    const env = {
      ...process.env,
      DATABASE_URL: process.env.DATABASE_URL || `file:${DB_PATH.replace(/\\/g, "/")}`,
    };
    let out: string;
    if (fs.existsSync(prismaBin)) {
      out = execFileSync(prismaBin, ["migrate", "deploy"], {
        cwd: backendRoot,
        encoding: "utf8",
        env,
        timeout: 120000,
        shell: process.platform === "win32",
      });
    } else {
      out = execFileSync(process.execPath, [prismaJs, "migrate", "deploy"], {
        cwd: backendRoot,
        encoding: "utf8",
        env: { ...env, ELECTRON_RUN_AS_NODE: "1" },
        timeout: 120000,
      });
    }
    console.log("[Backup] migrate deploy after restore:\n", out);
  } catch (err: any) {
    console.error("[Backup] migrate deploy failed after restore:", err?.message || err);
  } finally {
    try {
      await prisma.$connect();
      await prisma.$queryRawUnsafe("SELECT 1");
    } catch (err) {
      console.error("[Backup] reconnect after migrate failed:", err);
    }
  }
}

export function listBackupFiles(): Array<{
  filename: string;
  size: number;
  createdAt: string;
}> {
  ensureBackupsDir();
  const files = fs.readdirSync(BACKUPS_DIR);
  return files
    .filter((f) => f.endsWith(".zip") && !f.startsWith("."))
    .map((filename) => {
      const full = path.join(BACKUPS_DIR, filename);
      const stat = fs.statSync(full);
      return {
        filename,
        size: stat.size,
        createdAt: stat.mtime.toISOString()
      };
    })
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

export function resolveBackupFilename(filename: string): string {
  const base = path.basename(filename);
  if (base !== filename || !base.endsWith(".zip") || base.includes("..")) {
    throw new Error("Invalid backup filename.");
  }
  const full = path.join(BACKUPS_DIR, base);
  const resolved = path.resolve(full);
  const backupsResolved = path.resolve(BACKUPS_DIR);
  // Windows-safe path containment check
  if (
    resolved !== backupsResolved &&
    !resolved.toLowerCase().startsWith(backupsResolved.toLowerCase() + path.sep)
  ) {
    throw new Error("Invalid backup path.");
  }
  if (!fs.existsSync(full)) {
    throw new Error("Backup file not found.");
  }
  return full;
}

export function pruneAutoBackups(maxKeep = 5) {
  ensureBackupsDir();
  const autos = listBackupFiles().filter((f) => f.filename.startsWith("auto-backup-"));
  if (autos.length <= maxKeep) return;
  for (const item of autos.slice(maxKeep)) {
    try {
      fs.unlinkSync(path.join(BACKUPS_DIR, item.filename));
      console.log(`[Scheduler] Deleted old automatic backup: ${item.filename}`);
    } catch {
      /* ignore */
    }
  }
}
