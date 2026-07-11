"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runAutoBackup = runAutoBackup;
exports.startScheduler = startScheduler;
const backup_1 = require("./backup");
async function runAutoBackup() {
    try {
        (0, backup_1.ensureBackupsDir)();
        const autos = (0, backup_1.listBackupFiles)().filter((f) => f.filename.startsWith("auto-backup-"));
        const now = Date.now();
        const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
        let needsBackup = autos.length === 0;
        if (!needsBackup && autos.length > 0) {
            // Prefer timestamp from filename suffix; fall back to mtime
            const newest = autos[0];
            const parts = newest.filename.replace("auto-backup-", "").replace(".zip", "").split("-");
            const ts = Number(parts[parts.length - 1]);
            const lastTime = Number.isFinite(ts) && ts > 1e12 ? ts : new Date(newest.createdAt).getTime();
            if (now - lastTime >= sevenDaysMs) {
                needsBackup = true;
            }
        }
        if (needsBackup) {
            console.log("[Scheduler] Creating weekly automatic backup...");
            const meta = await (0, backup_1.writeBackupToDisk)("auto-backup");
            console.log(`[Scheduler] Weekly backup created successfully: ${meta.filename}`);
        }
        (0, backup_1.pruneAutoBackups)(5);
    }
    catch (error) {
        console.error("[Scheduler] Automatic backup process failed:", error);
    }
}
function startScheduler() {
    console.log("[Scheduler] Initializing automatic backup daemon (7-day intervals)...");
    // Run on startup (async; don't block listen)
    void runAutoBackup();
    // Run periodic check (every 12 hours)
    const twelveHoursMs = 12 * 60 * 60 * 1000;
    setInterval(() => {
        void runAutoBackup();
    }, twelveHoursMs);
}
