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

import path from "path";
import fs from "fs";
import { startScheduler } from "./utils/scheduler";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5001;

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

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({ status: "healthy", timestamp: new Date() });
});

// Global error handler
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error(err.stack);
  res.status(500).json({ error: "Something went wrong on the server!" });
});

// Start the server
app.listen(PORT, () => {
  console.log(`Backend server successfully running on port ${PORT}`);
  startScheduler();
});
