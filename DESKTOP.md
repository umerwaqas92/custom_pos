# MZK POS Desktop (Mac & Windows)

The POS runs as a **native desktop app** window via **Electron + local API**  
(same backend/database as the browser app).

## Requirements

- Node.js 18+ installed  
- On first setup: `npm install` from the project root  

## Run as desktop app (development)

From project root:

```bash
npm run electron:dev
```

This will:

1. Start the **API** (port `5001`)  
2. Start the **Vite UI** (port `3333`)  
3. Open a **desktop window** (not a browser tab)

Login is the same as before (`admin` / `admin123` by default).

You can still use the browser at http://localhost:3333 if you prefer:

```bash
npm run dev
```

## Build installers

```bash
# Both platforms (from that OS where possible)
npm run electron:dist

# Mac only (.dmg / .zip) — run on a Mac
npm run electron:dist:mac

# Windows only (.exe installer + portable) — run on Windows (or CI with Windows)
npm run electron:dist:win
```

Output goes to the `release/` folder:

| OS | Output |
|----|--------|
| Mac | `MZK POS-x.x.x.dmg`, `.zip` |
| Windows | `MZK POS Setup x.x.x.exe`, portable `.exe` |

## How it works

```
┌─────────────────────┐
│  Electron window    │  ← looks like a normal Mac/Windows app
│  (your POS UI)      │
└──────────┬──────────┘
           │ http://127.0.0.1:5001  (or :3333 in dev)
┌──────────▼──────────┐
│  Express API        │
│  + Prisma + SQLite  │
└─────────────────────┘
```

- **Dev:** UI from Vite, API from `ts-node-dev`  
- **Packaged app:** API serves the built UI; SQLite lives in the user data folder  

## Ports

| Port | Use |
|------|-----|
| 5001 | API (+ UI in packaged app) |
| 3333 | Vite UI (dev only) |

If something else uses these ports, quit that process and try again.

## Notes

- Single instance: opening the app twice focuses the existing window.  
- Data: browser `npm run dev` uses `backend/prisma/dev.db`.  
  Packaged desktop copies DB into app user data on first run.  
- Windows shortcuts are created by the NSIS installer.  
- Code signing (Mac notarization / Windows SmartScreen) is optional for distribution outside your shop.  
