"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.BACKEND_ROOT = exports.UPLOADS_PATH = exports.DB_SHM_PATH = exports.DB_WAL_PATH = exports.DB_PATH = exports.BACKUPS_DIR = void 0;
exports.ensureBackupsDir = ensureBackupsDir;
exports.checkpointDatabase = checkpointDatabase;
exports.clearSqliteSidecars = clearSqliteSidecars;
exports.buildBackupZip = buildBackupZip;
exports.writeBackupToDisk = writeBackupToDisk;
exports.zipContainsDatabase = zipContainsDatabase;
exports.restoreFromZipFile = restoreFromZipFile;
exports.applyPendingMigrations = applyPendingMigrations;
exports.listBackupFiles = listBackupFiles;
exports.resolveBackupFilename = resolveBackupFilename;
exports.pruneAutoBackups = pruneAutoBackups;
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const child_process_1 = require("child_process");
const db_1 = __importDefault(require("./db"));
const AdmZip = require("adm-zip");
exports.BACKUPS_DIR = path_1.default.resolve(__dirname, "../../backups");
exports.DB_PATH = path_1.default.resolve(__dirname, "../../prisma/dev.db");
exports.DB_WAL_PATH = path_1.default.resolve(__dirname, "../../prisma/dev.db-wal");
exports.DB_SHM_PATH = path_1.default.resolve(__dirname, "../../prisma/dev.db-shm");
exports.UPLOADS_PATH = path_1.default.resolve(__dirname, "../../public/uploads");
exports.BACKEND_ROOT = path_1.default.resolve(__dirname, "../../");
/** Ensure backups directory exists */
function ensureBackupsDir() {
    if (!fs_1.default.existsSync(exports.BACKUPS_DIR)) {
        fs_1.default.mkdirSync(exports.BACKUPS_DIR, { recursive: true });
    }
}
/** Flush SQLite WAL into the main DB so the .db file is self-contained */
async function checkpointDatabase() {
    try {
        await db_1.default.$queryRawUnsafe("PRAGMA wal_checkpoint(TRUNCATE);");
    }
    catch (err) {
        console.warn("[Backup] WAL checkpoint failed (continuing):", err);
    }
}
function removeIfExists(filePath) {
    if (fs_1.default.existsSync(filePath)) {
        fs_1.default.unlinkSync(filePath);
    }
}
/**
 * After replacing the main DB, leftover -wal/-shm from the running process
 * would replay old transactions and undo the restore. Always clear them.
 */
function clearSqliteSidecars() {
    removeIfExists(exports.DB_WAL_PATH);
    removeIfExists(exports.DB_SHM_PATH);
}
/** Build a backup zip (DB + uploads). Checkpoints SQLite first. */
async function buildBackupZip() {
    await checkpointDatabase();
    const zip = new AdmZip();
    if (!fs_1.default.existsSync(exports.DB_PATH)) {
        throw new Error("Database file not found.");
    }
    zip.addLocalFile(exports.DB_PATH, "prisma");
    // Optional sidecars only if still present after checkpoint (normally empty/truncated)
    if (fs_1.default.existsSync(exports.DB_WAL_PATH) && fs_1.default.statSync(exports.DB_WAL_PATH).size > 0) {
        zip.addLocalFile(exports.DB_WAL_PATH, "prisma");
    }
    if (fs_1.default.existsSync(exports.DB_SHM_PATH) && fs_1.default.statSync(exports.DB_SHM_PATH).size > 0) {
        zip.addLocalFile(exports.DB_SHM_PATH, "prisma");
    }
    if (fs_1.default.existsSync(exports.UPLOADS_PATH)) {
        const uploadFiles = fs_1.default.readdirSync(exports.UPLOADS_PATH).filter((f) => !f.startsWith("."));
        if (uploadFiles.length > 0) {
            zip.addLocalFolder(exports.UPLOADS_PATH, "public/uploads");
        }
    }
    return zip;
}
/** Write a named backup into backups/ and return metadata */
async function writeBackupToDisk(prefix = "manual-backup") {
    ensureBackupsDir();
    const zip = await buildBackupZip();
    const now = Date.now();
    const dateStr = new Date().toISOString().split("T")[0];
    const filename = `${prefix}-${dateStr}-${now}.zip`;
    const filePath = path_1.default.join(exports.BACKUPS_DIR, filename);
    zip.writeZip(filePath);
    const stat = fs_1.default.statSync(filePath);
    return {
        filename,
        path: filePath,
        size: stat.size,
        createdAt: stat.mtime.toISOString()
    };
}
/** Validate backup zip has a database file */
function zipContainsDatabase(zip) {
    return zip.getEntries().some((entry) => {
        const name = String(entry.entryName).replace(/\\/g, "/");
        return name === "prisma/dev.db" || name.endsWith("/prisma/dev.db") || name === "dev.db";
    });
}
/**
 * Restore database + uploads from a zip path.
 * Safely handles SQLite WAL sidecars that otherwise undo restores.
 */
async function restoreFromZipFile(zipPath) {
    if (!fs_1.default.existsSync(zipPath)) {
        throw new Error("Backup file not found.");
    }
    const zip = new AdmZip(zipPath);
    if (!zipContainsDatabase(zip)) {
        throw new Error("Invalid backup archive. Expected prisma/dev.db inside the ZIP.");
    }
    // Release Prisma's hold on the DB
    await db_1.default.$disconnect();
    try {
        // Clear live sidecars BEFORE overwrite — critical for correct restore
        clearSqliteSidecars();
        // Extract carefully: write DB to a temp name first, then swap
        const tempDb = exports.DB_PATH + ".restore-tmp";
        removeIfExists(tempDb);
        const entries = zip.getEntries();
        let dbEntry = null;
        const uploadEntries = [];
        for (const entry of entries) {
            if (entry.isDirectory)
                continue;
            const name = String(entry.entryName).replace(/\\/g, "/");
            if (name === "prisma/dev.db" || name.endsWith("/prisma/dev.db") || name === "dev.db") {
                dbEntry = entry;
            }
            else if (name.startsWith("public/uploads/") ||
                name.includes("/public/uploads/")) {
                uploadEntries.push(entry);
            }
            // Intentionally ignore wal/shm from zip — we start clean after restore
        }
        if (!dbEntry) {
            throw new Error("Database entry missing from backup ZIP.");
        }
        fs_1.default.writeFileSync(tempDb, dbEntry.getData());
        // Atomic-ish replace of main DB
        if (fs_1.default.existsSync(exports.DB_PATH)) {
            const bak = exports.DB_PATH + ".pre-restore";
            removeIfExists(bak);
            fs_1.default.renameSync(exports.DB_PATH, bak);
            try {
                fs_1.default.renameSync(tempDb, exports.DB_PATH);
                removeIfExists(bak);
            }
            catch (err) {
                // Roll back if swap fails
                if (fs_1.default.existsSync(bak) && !fs_1.default.existsSync(exports.DB_PATH)) {
                    fs_1.default.renameSync(bak, exports.DB_PATH);
                }
                throw err;
            }
        }
        else {
            fs_1.default.renameSync(tempDb, exports.DB_PATH);
        }
        // Ensure no WAL from previous process overrides restored data
        clearSqliteSidecars();
        // Restore uploads
        if (!fs_1.default.existsSync(exports.UPLOADS_PATH)) {
            fs_1.default.mkdirSync(exports.UPLOADS_PATH, { recursive: true });
        }
        for (const entry of uploadEntries) {
            const name = String(entry.entryName).replace(/\\/g, "/");
            const rel = name.includes("public/uploads/")
                ? name.split("public/uploads/").pop()
                : path_1.default.basename(name);
            if (!rel || rel.includes(".."))
                continue;
            const dest = path_1.default.join(exports.UPLOADS_PATH, rel);
            const destDir = path_1.default.dirname(dest);
            if (!fs_1.default.existsSync(destDir)) {
                fs_1.default.mkdirSync(destDir, { recursive: true });
            }
            fs_1.default.writeFileSync(dest, entry.getData());
        }
    }
    finally {
        // Always try to reconnect so the server keeps working
        try {
            await db_1.default.$connect();
            // Sanity query
            await db_1.default.$queryRawUnsafe("SELECT 1");
        }
        catch (err) {
            console.error("[Backup] Failed to reconnect after restore:", err);
            throw new Error("Restore wrote files but database reconnect failed. Restart the server.");
        }
    }
    // Older backups may predate newer Prisma migrations (e.g. SaleReturn).
    // Apply pending migrations so the app schema matches the restored DB.
    await applyPendingMigrations();
}
/**
 * Run `prisma migrate deploy` against the restored database.
 * Safe if already up to date; required when restoring older backups.
 */
async function applyPendingMigrations() {
    const backendRoot = exports.BACKEND_ROOT;
    const prismaBin = path_1.default.join(backendRoot, "node_modules", ".bin", "prisma");
    if (!fs_1.default.existsSync(prismaBin)) {
        console.warn("[Backup] prisma binary not found; skip migrate deploy");
        return;
    }
    try {
        await db_1.default.$disconnect();
    }
    catch {
        /* ignore */
    }
    try {
        const out = (0, child_process_1.execFileSync)(prismaBin, ["migrate", "deploy"], {
            cwd: backendRoot,
            encoding: "utf8",
            env: process.env,
            timeout: 120000
        });
        console.log("[Backup] migrate deploy after restore:\n", out);
    }
    catch (err) {
        console.error("[Backup] migrate deploy failed after restore:", err?.message || err);
        // Reconnect even if migrate failed so API still responds
    }
    finally {
        try {
            await db_1.default.$connect();
            await db_1.default.$queryRawUnsafe("SELECT 1");
        }
        catch (err) {
            console.error("[Backup] reconnect after migrate failed:", err);
        }
    }
}
/** List backup zip files in backups/ */
function listBackupFiles() {
    ensureBackupsDir();
    const files = fs_1.default.readdirSync(exports.BACKUPS_DIR);
    return files
        .filter((f) => f.endsWith(".zip") && !f.startsWith("."))
        .map((filename) => {
        const full = path_1.default.join(exports.BACKUPS_DIR, filename);
        const stat = fs_1.default.statSync(full);
        return {
            filename,
            size: stat.size,
            createdAt: stat.mtime.toISOString()
        };
    })
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}
/** Resolve a backup filename safely (no path traversal) */
function resolveBackupFilename(filename) {
    const base = path_1.default.basename(filename);
    if (base !== filename || !base.endsWith(".zip") || base.includes("..")) {
        throw new Error("Invalid backup filename.");
    }
    const full = path_1.default.join(exports.BACKUPS_DIR, base);
    if (!full.startsWith(exports.BACKUPS_DIR)) {
        throw new Error("Invalid backup path.");
    }
    if (!fs_1.default.existsSync(full)) {
        throw new Error("Backup file not found.");
    }
    return full;
}
/** Prune old auto backups, keep newest N */
function pruneAutoBackups(maxKeep = 5) {
    ensureBackupsDir();
    const autos = listBackupFiles().filter((f) => f.filename.startsWith("auto-backup-"));
    if (autos.length <= maxKeep)
        return;
    for (const item of autos.slice(maxKeep)) {
        try {
            fs_1.default.unlinkSync(path_1.default.join(exports.BACKUPS_DIR, item.filename));
            console.log(`[Scheduler] Deleted old automatic backup: ${item.filename}`);
        }
        catch {
            /* ignore */
        }
    }
}
