import express from "express";
import cors from "cors";
import * as dotenv from "dotenv";

// Import Controllers
import authRouter from "./controllers/auth.controller";
import productRouter from "./controllers/product.controller";
import inventoryRouter from "./controllers/inventory.controller";
import salesRouter from "./controllers/sales.controller";
import repairsRouter from "./controllers/repairs.controller";
import accountingRouter from "./controllers/accounting.controller";
import reportsRouter from "./controllers/reports.controller";
import settingsRouter from "./controllers/settings.controller";

import path from "path";
import fs from "fs";
import { startScheduler } from "./utils/scheduler";

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT || 5001);
const HOST = process.env.HOST || "0.0.0.0";

// Ensure upload directory exists
const uploadsDir = path.join(__dirname, "../public/uploads");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use("/uploads", express.static(uploadsDir));

// Routing API endpoints
app.use("/api/auth", authRouter);
app.use("/api/products", productRouter);
app.use("/api/inventory", inventoryRouter);
app.use("/api/sales", salesRouter);
app.use("/api/repairs", repairsRouter);
app.use("/api/accounting", accountingRouter);
app.use("/api/reports", reportsRouter);
app.use("/api/settings", settingsRouter);

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({ status: "healthy", timestamp: new Date(), electron: process.env.ELECTRON === "1" });
});

/**
 * Desktop / production: serve built React app from frontend/dist
 * so Electron can load http://127.0.0.1:PORT as a single window.
 */
const serveFrontend = process.env.SERVE_FRONTEND === "1" || process.env.ELECTRON === "1";
const frontendDistCandidates = [
  process.env.FRONTEND_DIST,
  path.join(__dirname, "../../frontend/dist"),
  path.join(__dirname, "../frontend/dist"),
  process.env.POS_RESOURCES ? path.join(process.env.POS_RESOURCES, "frontend", "dist") : "",
].filter(Boolean) as string[];

const frontendDist = frontendDistCandidates.find((p) => p && fs.existsSync(path.join(p, "index.html")));

if (serveFrontend && frontendDist) {
  app.use(express.static(frontendDist));
  // SPA fallback (not for /api or /uploads)
  app.get("*", (req, res, next) => {
    if (req.path.startsWith("/api") || req.path.startsWith("/uploads") || req.path === "/health") {
      return next();
    }
    res.sendFile(path.join(frontendDist, "index.html"));
  });
  console.log(`Serving frontend from ${frontendDist}`);
}

// Global error handler
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error(err.stack);
  res.status(500).json({ error: "Something went wrong on the server!" });
});

// Start the server
app.listen(PORT, HOST, () => {
  console.log(`Backend server successfully running on http://${HOST}:${PORT}`);
  startScheduler();
});
