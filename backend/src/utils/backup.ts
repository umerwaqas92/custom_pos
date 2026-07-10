import path from "path";
import fs from "fs";
import prisma from "./db";
const AdmZip = require("adm-zip");

export const BACKUPS_DIR = path.resolve(__dirname, "../../backups");
export const DB_PATH = path.resolve(__dirname, "../../prisma/dev.db");
export const DB_WAL_PATH = path.resolve(__dirname, "../../prisma/dev.db-wal");
export const DB_SHM_PATH = path.resolve(__dirname, "../../prisma/dev.db-shm");
export const UPLOADS_PATH = path.resolve(__dirname, "../../public/uploads");
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
    throw new Error("Database file not found.");
  }
  zip.addLocalFile(DB_PATH, "prisma");

  // Optional sidecars only if still present after checkpoint (normally empty/truncated)
  if (fs.existsSync(DB_WAL_PATH) && fs.statSync(DB_WAL_PATH).size > 0) {
    zip.addLocalFile(DB_WAL_PATH, "prisma");
  }
  if (fs.existsSync(DB_SHM_PATH) && fs.statSync(DB_SHM_PATH).size > 0) {
    zip.addLocalFile(DB_SHM_PATH, "prisma");
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
    return name === "prisma/dev.db" || name.endsWith("/prisma/dev.db") || name === "dev.db";
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

  // Release Prisma's hold on the DB
  await prisma.$disconnect();

  try {
    // Clear live sidecars BEFORE overwrite — critical for correct restore
    clearSqliteSidecars();

    // Extract carefully: write DB to a temp name first, then swap
    const tempDb = DB_PATH + ".restore-tmp";
    removeIfExists(tempDb);

    const entries = zip.getEntries();
    let dbEntry: any = null;
    const uploadEntries: any[] = [];

    for (const entry of entries) {
      if (entry.isDirectory) continue;
      const name = String(entry.entryName).replace(/\\/g, "/");

      if (name === "prisma/dev.db" || name.endsWith("/prisma/dev.db") || name === "dev.db") {
        dbEntry = entry;
      } else if (
        name.startsWith("public/uploads/") ||
        name.includes("/public/uploads/")
      ) {
        uploadEntries.push(entry);
      }
      // Intentionally ignore wal/shm from zip — we start clean after restore
    }

    if (!dbEntry) {
      throw new Error("Database entry missing from backup ZIP.");
    }

    fs.writeFileSync(tempDb, dbEntry.getData());

    // Atomic-ish replace of main DB
    if (fs.existsSync(DB_PATH)) {
      const bak = DB_PATH + ".pre-restore";
      removeIfExists(bak);
      fs.renameSync(DB_PATH, bak);
      try {
        fs.renameSync(tempDb, DB_PATH);
        removeIfExists(bak);
      } catch (err) {
        // Roll back if swap fails
        if (fs.existsSync(bak) && !fs.existsSync(DB_PATH)) {
          fs.renameSync(bak, DB_PATH);
        }
        throw err;
      }
    } else {
      fs.renameSync(tempDb, DB_PATH);
    }

    // Ensure no WAL from previous process overrides restored data
    clearSqliteSidecars();

    // Restore uploads
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
    // Always try to reconnect so the server keeps working
    try {
      await prisma.$connect();
      // Sanity query
      await prisma.$queryRawUnsafe("SELECT 1");
    } catch (err) {
      console.error("[Backup] Failed to reconnect after restore:", err);
      throw new Error("Restore wrote files but database reconnect failed. Restart the server.");
    }
  }
}

/** List backup zip files in backups/ */
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

/** Resolve a backup filename safely (no path traversal) */
export function resolveBackupFilename(filename: string): string {
  const base = path.basename(filename);
  if (base !== filename || !base.endsWith(".zip") || base.includes("..")) {
    throw new Error("Invalid backup filename.");
  }
  const full = path.join(BACKUPS_DIR, base);
  if (!full.startsWith(BACKUPS_DIR)) {
    throw new Error("Invalid backup path.");
  }
  if (!fs.existsSync(full)) {
    throw new Error("Backup file not found.");
  }
  return full;
}

/** Prune old auto backups, keep newest N */
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
