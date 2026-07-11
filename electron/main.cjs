/**
 * Electron main — Mac & Windows desktop shell for MZK POS.
 * Packaged app uses its own port (5101) so it does not fight with npm run dev (5001).
 */
const { app, BrowserWindow, shell, dialog } = require("electron");
const path = require("path");
const fs = require("fs");
const http = require("http");
const { spawn } = require("child_process");
const net = require("net");

// Dev uses 5001 (same as browser). Packaged desktop uses 5101 to avoid conflicts.
const isDev = !app.isPackaged;
const API_HOST = "127.0.0.1";
const API_PORT = process.env.POS_PORT || (isDev ? "5001" : "5101");
const HEALTH_URL = `http://${API_HOST}:${API_PORT}/health`;
const APP_URL_DEV = process.env.POS_DEV_URL || "http://127.0.0.1:3333";
const APP_URL_PROD = `http://${API_HOST}:${API_PORT}`;

let mainWindow = null;
let backendProc = null;
let frontendProc = null;
let isQuitting = false;
let logStream = null;

function projectRoot() {
  if (isDev) return path.join(__dirname, "..");
  return process.resourcesPath;
}

function logFilePath() {
  try {
    return path.join(app.getPath("userData"), "desktop.log");
  } catch {
    return path.join(require("os").tmpdir(), "mzk-pos-desktop.log");
  }
}

function log(...args) {
  const line = `[POS Desktop ${new Date().toISOString()}] ${args
    .map((a) => (typeof a === "string" ? a : JSON.stringify(a)))
    .join(" ")}\n`;
  try {
    if (!logStream) {
      logStream = fs.createWriteStream(logFilePath(), { flags: "a" });
    }
    logStream.write(line);
  } catch (_) {}
  console.log(line.trim());
}

function waitForUrl(url, { maxAttempts = 100, intervalMs = 400, requireElectron = false } = {}) {
  return new Promise((resolve, reject) => {
    let attempts = 0;
    const tick = () => {
      attempts += 1;
      const req = http.get(url, (res) => {
        let body = "";
        res.on("data", (c) => (body += c));
        res.on("end", () => {
          const ok = res.statusCode && res.statusCode < 500;
          if (ok && requireElectron) {
            try {
              const j = JSON.parse(body);
              if (j.electron !== true && j.electron !== "true") {
                // Wrong process on this port (e.g. old browser dev server)
                if (attempts >= maxAttempts) {
                  reject(new Error("Port in use by another server that is not MZK desktop."));
                } else setTimeout(tick, intervalMs);
                return;
              }
            } catch {
              if (attempts >= maxAttempts) reject(new Error("Invalid health response"));
              else setTimeout(tick, intervalMs);
              return;
            }
          }
          if (ok) resolve(true);
          else if (attempts >= maxAttempts) reject(new Error("API health check failed"));
          else setTimeout(tick, intervalMs);
        });
      });
      req.on("error", () => {
        if (attempts >= maxAttempts) reject(new Error("API did not start in time. See desktop.log"));
        else setTimeout(tick, intervalMs);
      });
      req.setTimeout(2000, () => req.destroy());
    };
    tick();
  });
}

function userDataDbPath() {
  const dir = app.getPath("userData");
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, "pos.db");
}

function ensureDatabase() {
  const dest = userDataDbPath();
  if (fs.existsSync(dest) && fs.statSync(dest).size > 0) return dest;

  const candidates = [
    path.join(projectRoot(), "backend", "prisma", "dev.db"),
    path.join(projectRoot(), "prisma", "dev.db"),
  ];
  for (const src of candidates) {
    if (fs.existsSync(src)) {
      try {
        fs.copyFileSync(src, dest);
        log("Copied database to", dest);
        return dest;
      } catch (e) {
        log("DB copy failed", e.message);
      }
    }
  }
  return dest;
}

function bin(root, pkg, name) {
  const local = path.join(
    root,
    pkg,
    "node_modules",
    ".bin",
    process.platform === "win32" ? `${name}.cmd` : name
  );
  if (fs.existsSync(local)) return local;
  return path.join(
    root,
    "node_modules",
    ".bin",
    process.platform === "win32" ? `${name}.cmd` : name
  );
}

function startBackend() {
  const root = projectRoot();
  const backendDir = path.join(root, "backend");
  const dbFile = isDev ? path.join(backendDir, "prisma", "dev.db") : ensureDatabase();
  const dbUrl = "file:" + dbFile.replace(/\\/g, "/");

  const env = {
    ...process.env,
    PORT: String(API_PORT),
    HOST: API_HOST,
    SERVE_FRONTEND: isDev ? "0" : "1",
    DATABASE_URL: dbUrl,
    ELECTRON: "1",
    POS_RESOURCES: root,
    FRONTEND_DIST: path.join(root, "frontend", "dist"),
  };

  log("Starting backend", { isDev, port: API_PORT, backendDir, dbUrl });

  if (isDev) {
    const tscDev = bin(root, "backend", "ts-node-dev");
    backendProc = spawn(tscDev, ["--respawn", "--transpile-only", "src/index.ts"], {
      cwd: backendDir,
      env,
      shell: process.platform === "win32",
      stdio: "pipe",
    });
  } else {
    const backendEntry = path.join(backendDir, "dist", "index.js");
    if (!fs.existsSync(backendEntry)) {
      throw new Error("Backend build missing: " + backendEntry);
    }
    // Run Express with Electron binary as Node (works on Mac + Windows)
    backendProc = spawn(process.execPath, [backendEntry], {
      cwd: backendDir,
      env: {
        ...env,
        ELECTRON_RUN_AS_NODE: "1",
      },
      stdio: "pipe",
    });
  }

  backendProc.stdout?.on("data", (d) => log("[backend]", d.toString().trim()));
  backendProc.stderr?.on("data", (d) => log("[backend:err]", d.toString().trim()));
  backendProc.on("exit", (code) => {
    log("Backend exited", code);
    backendProc = null;
    if (!isQuitting && code && code !== 0) {
      dialog.showErrorBox(
        "MZK POS server stopped",
        `Backend exited (code ${code}).\n\nLog: ${logFilePath()}`
      );
    }
  });
}

function startFrontendDev() {
  if (!isDev) return;
  const root = projectRoot();
  const frontendDir = path.join(root, "frontend");
  const viteBin = bin(root, "frontend", "vite");
  log("Starting Vite", viteBin);
  frontendProc = spawn(viteBin, [], {
    cwd: frontendDir,
    env: { ...process.env },
    shell: process.platform === "win32",
    stdio: "pipe",
  });
  frontendProc.stdout?.on("data", (d) => log("[vite]", d.toString().trim()));
  frontendProc.stderr?.on("data", (d) => log("[vite:err]", d.toString().trim()));
  frontendProc.on("exit", () => {
    frontendProc = null;
  });
}

function createWindow() {
  const iconPath = isDev
    ? path.join(projectRoot(), "frontend", "public", "favicon.png")
    : path.join(projectRoot(), "frontend", "dist", "favicon.png");

  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 680,
    title: "MZK POS",
    show: false,
    backgroundColor: "#0f172a",
    autoHideMenuBar: true,
    frame: true,
    ...(fs.existsSync(iconPath) ? { icon: iconPath } : {}),
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  const url = isDev ? APP_URL_DEV : APP_URL_PROD;
  log("Loading window", url);
  mainWindow.loadURL(url);

  mainWindow.once("ready-to-show", () => {
    mainWindow.show();
    mainWindow.focus();
    if (process.platform === "darwin") app.dock?.show();
  });

  mainWindow.webContents.on("did-fail-load", (_e, code, desc, validatedURL) => {
    log("did-fail-load", code, desc, validatedURL);
    dialog.showErrorBox(
      "Failed to load MZK POS",
      `${desc}\n\nURL: ${validatedURL}\nCode: ${code}\n\nLog: ${logFilePath()}`
    );
  });

  mainWindow.webContents.setWindowOpenHandler(({ url: openUrl }) => {
    shell.openExternal(openUrl);
    return { action: "deny" };
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

function killChild(proc) {
  if (!proc || proc.killed) return;
  try {
    if (process.platform === "win32") {
      spawn("taskkill", ["/pid", String(proc.pid), "/f", "/t"], { shell: true });
    } else {
      proc.kill("SIGTERM");
      setTimeout(() => {
        try {
          if (!proc.killed) proc.kill("SIGKILL");
        } catch (_) {}
      }, 1500);
    }
  } catch (e) {
    log("kill error", e.message);
  }
}

async function boot() {
  log("=== Boot ===", { isDev, version: app.getVersion(), port: API_PORT });
  try {
    startBackend();
    if (isDev) startFrontendDev();

    if (isDev) {
      await waitForUrl(HEALTH_URL, { requireElectron: true }).catch(() =>
        waitForUrl(HEALTH_URL, { requireElectron: false })
      );
      await waitForUrl(APP_URL_DEV, { requireElectron: false });
    } else {
      // Must be OUR desktop backend (serves UI + electron:true)
      await waitForUrl(HEALTH_URL, { requireElectron: true, maxAttempts: 120 });
    }

    createWindow();
  } catch (err) {
    log("Boot failed", err && err.message);
    dialog.showErrorBox(
      "Failed to start MZK POS",
      `${(err && err.message) || err}\n\n` +
        `Port: ${API_PORT}\n` +
        `Log file:\n${logFilePath()}\n\n` +
        `Tip: Quit any old "npm run dev" terminals, then try again.\n` +
        `If macOS blocks the app: System Settings → Privacy & Security → Open Anyway`
    );
    app.quit();
  }
}

/**
 * Old Electron crashes can leave SingletonLock pointing at a dead PID.
 * That makes every new open exit immediately with no window.
 */
function clearStaleSingletonLocks() {
  try {
    const userData = app.getPath("userData");
    const lockPath = path.join(userData, "SingletonLock");
    if (!fs.existsSync(lockPath)) return;
    let target = "";
    try {
      target = fs.readlinkSync(lockPath);
    } catch {
      return;
    }
    // Format often: "hostname-PID"
    const m = String(target).match(/-(\d+)$/);
    if (!m) return;
    const pid = Number(m[1]);
    if (!pid) return;
    try {
      process.kill(pid, 0); // throws if not running
    } catch {
      // PID is dead — remove stale locks
      for (const name of ["SingletonLock", "SingletonCookie", "SingletonSocket"]) {
        try {
          fs.unlinkSync(path.join(userData, name));
        } catch (_) {}
      }
      log("Removed stale singleton lock for dead PID", pid);
    }
  } catch (e) {
    log("clearStaleSingletonLocks", e.message);
  }
}

clearStaleSingletonLocks();

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  // Another live instance owns the lock — quit quietly (it should focus itself)
  console.log("[POS Desktop] Another instance is already running.");
  app.quit();
} else {
  app.on("second-instance", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });

  app.whenReady().then(boot);

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0 && !isQuitting) {
      if (isDev) createWindow();
      else boot();
    } else mainWindow?.show();
  });

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
  });

  app.on("before-quit", () => {
    isQuitting = true;
    killChild(frontendProc);
    killChild(backendProc);
    try {
      logStream?.end();
    } catch (_) {}
  });
}
