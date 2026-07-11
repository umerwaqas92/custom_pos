"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const dotenv = __importStar(require("dotenv"));
// Import Controllers
const auth_controller_1 = __importDefault(require("./controllers/auth.controller"));
const product_controller_1 = __importDefault(require("./controllers/product.controller"));
const inventory_controller_1 = __importDefault(require("./controllers/inventory.controller"));
const sales_controller_1 = __importDefault(require("./controllers/sales.controller"));
const repairs_controller_1 = __importDefault(require("./controllers/repairs.controller"));
const accounting_controller_1 = __importDefault(require("./controllers/accounting.controller"));
const reports_controller_1 = __importDefault(require("./controllers/reports.controller"));
const settings_controller_1 = __importDefault(require("./controllers/settings.controller"));
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const scheduler_1 = require("./utils/scheduler");
dotenv.config();
const app = (0, express_1.default)();
const PORT = process.env.PORT || 5001;
// Ensure upload directory exists
const uploadsDir = path_1.default.join(__dirname, "../public/uploads");
if (!fs_1.default.existsSync(uploadsDir)) {
    fs_1.default.mkdirSync(uploadsDir, { recursive: true });
}
// Middleware
app.use((0, cors_1.default)());
app.use(express_1.default.json());
app.use(express_1.default.urlencoded({ extended: true }));
app.use("/uploads", express_1.default.static(uploadsDir));
// Routing API endpoints
app.use("/api/auth", auth_controller_1.default);
app.use("/api/products", product_controller_1.default);
app.use("/api/inventory", inventory_controller_1.default);
app.use("/api/sales", sales_controller_1.default);
app.use("/api/repairs", repairs_controller_1.default);
app.use("/api/accounting", accounting_controller_1.default);
app.use("/api/reports", reports_controller_1.default);
app.use("/api/settings", settings_controller_1.default);
// Health check endpoint
app.get("/health", (req, res) => {
    res.json({ status: "healthy", timestamp: new Date() });
});
// Global error handler
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ error: "Something went wrong on the server!" });
});
// Start the server
app.listen(PORT, () => {
    console.log(`Backend server successfully running on port ${PORT}`);
    (0, scheduler_1.startScheduler)();
});
