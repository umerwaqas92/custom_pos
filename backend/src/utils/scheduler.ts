import path from "path";
import fs from "fs";
const AdmZip = require("adm-zip");

export function runAutoBackup() {
  try {
    const backupsDir = path.resolve(__dirname, "../../backups");
    if (!fs.existsSync(backupsDir)) {
      fs.mkdirSync(backupsDir, { recursive: true });
    }

    // 1. Scan existing automatic backups
    const files = fs.readdirSync(backupsDir);
    const autoBackups = files
      .filter(f => f.startsWith("auto-backup-") && f.endsWith(".zip"))
      .map(f => {
        const timePart = f.replace("auto-backup-", "").replace(".zip", "");
        const parts = timePart.split("-");
        const timestamp = Number(parts[parts.length - 1]);
        return { filename: f, timestamp };
      })
      .sort((a, b) => b.timestamp - a.timestamp); // Newest first

    const now = Date.now();
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;

    // 2. Check if a new automatic backup is needed
    let needsBackup = false;
    if (autoBackups.length === 0) {
      needsBackup = true;
    } else {
      const lastBackupTime = autoBackups[0].timestamp;
      if (now - lastBackupTime >= sevenDaysMs) {
        needsBackup = true;
      }
    }

    if (needsBackup) {
      console.log("[Scheduler] Creating weekly automatic backup...");
      const zip = new AdmZip();
      const dbPath = path.resolve(__dirname, "../../prisma/dev.db");
      const uploadsPath = path.resolve(__dirname, "../../public/uploads");

      if (fs.existsSync(dbPath)) {
        zip.addLocalFile(dbPath, "prisma");
      }

      if (fs.existsSync(uploadsPath)) {
        const uploadFiles = fs.readdirSync(uploadsPath);
        if (uploadFiles.length > 0) {
          zip.addLocalFolder(uploadsPath, "public/uploads");
        }
      }

      const dateStr = new Date().toISOString().split("T")[0];
      const newBackupFilename = `auto-backup-${dateStr}-${now}.zip`;
      const newBackupPath = path.join(backupsDir, newBackupFilename);
      
      zip.writeZip(newBackupPath);
      console.log(`[Scheduler] Weekly backup created successfully: ${newBackupFilename}`);

      // Add to head of active list
      autoBackups.unshift({ filename: newBackupFilename, timestamp: now });
    }

    // 3. Keep-clean: Limit storage to the last 5 backups
    const maxBackups = 5;
    if (autoBackups.length > maxBackups) {
      const itemsToDelete = autoBackups.slice(maxBackups);
      itemsToDelete.forEach(item => {
        const filePath = path.join(backupsDir, item.filename);
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
          console.log(`[Scheduler] Deleted old automatic backup: ${item.filename}`);
        }
      });
    }
  } catch (error) {
    console.error("[Scheduler] Automatic backup process failed:", error);
  }
}

export function startScheduler() {
  console.log("[Scheduler] Initializing automatic backup daemon (7-day intervals)...");
  
  // Run on startup
  runAutoBackup();

  // Run periodic check (every 12 hours)
  const twelveHoursMs = 12 * 60 * 60 * 1000;
  setInterval(() => {
    runAutoBackup();
  }, twelveHoursMs);
}
