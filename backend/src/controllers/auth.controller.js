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
const express_1 = require("express");
const bcrypt = __importStar(require("bcryptjs"));
const jwt = __importStar(require("jsonwebtoken"));
const db_1 = __importDefault(require("../utils/db"));
const auth_1 = require("../middleware/auth");
const cache_1 = require("../utils/cache");
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const multer_1 = __importDefault(require("multer"));
const backup_1 = require("../utils/backup");
const router = (0, express_1.Router)();
const JWT_SECRET = process.env.JWT_SECRET || "super-secret-key-change-in-prod";
// Configure Multer for backup zip uploads
const uploadDir = path_1.default.resolve(__dirname, "../../public/uploads");
if (!fs_1.default.existsSync(uploadDir)) {
    fs_1.default.mkdirSync(uploadDir, { recursive: true });
}
const backupStorage = multer_1.default.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        cb(null, `backup-import-${Date.now()}.zip`);
    }
});
const backupUpload = (0, multer_1.default)({
    storage: backupStorage,
    fileFilter: (req, file, cb) => {
        const isZip = path_1.default.extname(file.originalname).toLowerCase() === ".zip";
        if (isZip) {
            cb(null, true);
        }
        else {
            cb(new Error("Only ZIP archive files are allowed."), false);
        }
    }
});
// Login
router.post("/login", async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
        return res.status(400).json({ error: "Username and password are required." });
    }
    try {
        const user = await db_1.default.user.findUnique({
            where: { username },
            include: { branch: true }
        });
        if (!user || !user.isActive) {
            return res.status(401).json({ error: "Invalid username or password." });
        }
        const isValidPassword = await bcrypt.compare(password, user.passwordHash);
        if (!isValidPassword) {
            return res.status(401).json({ error: "Invalid username or password." });
        }
        const token = jwt.sign({
            id: user.id,
            username: user.username,
            role: user.role,
            branchId: user.branchId
        }, JWT_SECRET, { expiresIn: "24h" });
        return res.json({
            token,
            user: {
                id: user.id,
                name: user.name,
                username: user.username,
                role: user.role,
                email: user.email,
                phone: user.phone,
                branch: user.branch
            }
        });
    }
    catch (error) {
        console.error(error);
        return res.status(500).json({ error: "Internal server error." });
    }
});
// Get profile of logged-in user
router.get("/me", auth_1.protect, async (req, res) => {
    if (!req.user)
        return res.status(401).json({ error: "Unauthorized." });
    try {
        const user = await db_1.default.user.findUnique({
            where: { id: req.user.id },
            include: { branch: true }
        });
        if (!user)
            return res.status(404).json({ error: "User not found." });
        return res.json(user);
    }
    catch (error) {
        return res.status(500).json({ error: "Internal server error." });
    }
});
// List all users (Staff Management)
router.get("/users", auth_1.protect, (0, auth_1.restrictTo)("OWNER", "MANAGER", "SUPER_ADMIN"), async (req, res) => {
    try {
        const users = await db_1.default.user.findMany({
            include: { branch: true },
            orderBy: { createdAt: "desc" }
        });
        return res.json(users);
    }
    catch (error) {
        return res.status(500).json({ error: "Internal server error." });
    }
});
// Create new staff user (OWNER only)
router.post("/users", auth_1.protect, (0, auth_1.restrictTo)("OWNER"), async (req, res) => {
    const { name, username, password, role, email, phone, branchId } = req.body;
    if (!name || !username || !password || !role) {
        return res.status(400).json({ error: "Name, username, password, and role are required." });
    }
    try {
        const existing = await db_1.default.user.findUnique({ where: { username } });
        if (existing) {
            return res.status(400).json({ error: "Username already exists." });
        }
        const salt = await bcrypt.genSalt(10);
        const passwordHash = await bcrypt.hash(password, salt);
        const newUser = await db_1.default.user.create({
            data: {
                name,
                username,
                passwordHash,
                role,
                email,
                phone,
                branchId: branchId || null
            },
            include: { branch: true }
        });
        return res.status(201).json(newUser);
    }
    catch (error) {
        console.error(error);
        return res.status(500).json({ error: "Internal server error." });
    }
});
// Update user details (OWNER only)
router.put("/users/:id", auth_1.protect, (0, auth_1.restrictTo)("OWNER"), async (req, res) => {
    const { id } = req.params;
    const { name, role, email, phone, branchId, isActive, password } = req.body;
    try {
        const data = {
            name,
            role,
            email,
            phone,
            branchId: branchId || null,
            isActive
        };
        if (password) {
            const salt = await bcrypt.genSalt(10);
            data.passwordHash = await bcrypt.hash(password, salt);
        }
        const updatedUser = await db_1.default.user.update({
            where: { id },
            data,
            include: { branch: true }
        });
        return res.json(updatedUser);
    }
    catch (error) {
        console.error(error);
        return res.status(500).json({ error: "Internal server error." });
    }
});
// Toggle user status (Active / Inactive)
router.delete("/users/:id", auth_1.protect, (0, auth_1.restrictTo)("OWNER"), async (req, res) => {
    const { id } = req.params;
    try {
        const user = await db_1.default.user.findUnique({ where: { id } });
        if (!user)
            return res.status(404).json({ error: "User not found." });
        const updated = await db_1.default.user.update({
            where: { id },
            data: { isActive: !user.isActive }
        });
        return res.json({ message: `User status set to ${updated.isActive ? "Active" : "Inactive"}.` });
    }
    catch (error) {
        return res.status(500).json({ error: "Internal server error." });
    }
});
// Get all branches
router.get("/branches", auth_1.protect, async (req, res) => {
    try {
        const branches = await db_1.default.branch.findMany();
        return res.json(branches);
    }
    catch (error) {
        return res.status(500).json({ error: "Internal server error." });
    }
});
// Create new branch (OWNER only)
router.post("/branches", auth_1.protect, (0, auth_1.restrictTo)("OWNER"), async (req, res) => {
    const { name, address, phone } = req.body;
    if (!name)
        return res.status(400).json({ error: "Branch name is required." });
    try {
        const newBranch = await db_1.default.branch.create({
            data: { name, address, phone }
        });
        return res.status(201).json(newBranch);
    }
    catch (error) {
        return res.status(500).json({ error: "Internal server error." });
    }
});
// Update branch (OWNER only)
router.put("/branches/:id", auth_1.protect, (0, auth_1.restrictTo)("OWNER"), async (req, res) => {
    const { id } = req.params;
    const { name, address, phone } = req.body;
    if (!name)
        return res.status(400).json({ error: "Branch name is required." });
    try {
        const updatedBranch = await db_1.default.branch.update({
            where: { id },
            data: { name, address, phone }
        });
        return res.json(updatedBranch);
    }
    catch (error) {
        return res.status(500).json({ error: "Failed to update branch." });
    }
});
// Delete branch (OWNER only)
router.delete("/branches/:id", auth_1.protect, (0, auth_1.restrictTo)("OWNER"), async (req, res) => {
    const { id } = req.params;
    try {
        await db_1.default.branchStock.deleteMany({ where: { branchId: id } });
        await db_1.default.user.updateMany({ where: { branchId: id }, data: { branchId: null } });
        await db_1.default.dailyClosing.deleteMany({ where: { branchId: id } });
        await db_1.default.branch.delete({ where: { id } });
        return res.json({ message: "Branch deleted successfully." });
    }
    catch (error) {
        console.error(error);
        return res.status(500).json({ error: "Failed to delete branch." });
    }
});
// Clear all transactions data but keep products, categories, brands, customers, suppliers, branches, users (OWNER only)
router.post("/reset-transactions", auth_1.protect, (0, auth_1.restrictTo)("OWNER"), async (req, res) => {
    try {
        await db_1.default.$transaction([
            // 1. Delete dependent transactional records
            db_1.default.activityLog.deleteMany({}),
            db_1.default.emiInstallment.deleteMany({}),
            db_1.default.saleEmi.deleteMany({}),
            db_1.default.saleReturnItem.deleteMany({}),
            db_1.default.saleReturn.deleteMany({}),
            db_1.default.warrantyClaim.deleteMany({}),
            db_1.default.saleItem.deleteMany({}),
            db_1.default.sale.deleteMany({}),
            db_1.default.repairJob.deleteMany({}),
            db_1.default.purchaseItem.deleteMany({}),
            db_1.default.purchaseOrder.deleteMany({}),
            db_1.default.supplierPayment.deleteMany({}),
            db_1.default.customerCreditPayment.deleteMany({}),
            db_1.default.expense.deleteMany({}),
            db_1.default.stockMovement.deleteMany({}),
            db_1.default.dailyClosing.deleteMany({}),
            db_1.default.transaction.deleteMany({}),
            // 2. Reset customer credit balances and reward points to 0
            db_1.default.customer.updateMany({
                data: {
                    creditBalance: 0.0,
                    rewardPoints: 0
                }
            }),
            // 3. Reset BankAccount balances to 0
            db_1.default.bankAccount.updateMany({
                data: {
                    balance: 0.0
                }
            })
        ]);
        (0, cache_1.invalidateCache)("reports:");
        return res.json({ message: "All transactions and sales history have been cleared successfully. Products, categories, and contacts have been preserved." });
    }
    catch (error) {
        console.error("Failed to reset transactions:", error);
        return res.status(500).json({ error: "Failed to clear transaction records." });
    }
});
// List on-disk backups (auto + manual)
router.get("/backup/list", auth_1.protect, (0, auth_1.restrictTo)("OWNER", "MANAGER"), (_req, res) => {
    try {
        (0, backup_1.ensureBackupsDir)();
        return res.json((0, backup_1.listBackupFiles)());
    }
    catch (error) {
        console.error("Backup list failed:", error);
        return res.status(500).json({ error: "Failed to list backups." });
    }
});
// Create a manual backup saved under backups/
router.post("/backup/create", auth_1.protect, (0, auth_1.restrictTo)("OWNER", "MANAGER"), async (_req, res) => {
    try {
        const meta = await (0, backup_1.writeBackupToDisk)("manual-backup");
        return res.status(201).json({
            message: "Backup created successfully.",
            ...meta
        });
    }
    catch (error) {
        console.error("Backup create failed:", error);
        return res.status(500).json({ error: error.message || "Failed to create backup." });
    }
});
// Download a stored backup by filename
router.get("/backup/download/:filename", auth_1.protect, (0, auth_1.restrictTo)("OWNER", "MANAGER"), (req, res) => {
    try {
        const full = (0, backup_1.resolveBackupFilename)(req.params.filename);
        return res.download(full, path_1.default.basename(full));
    }
    catch (error) {
        return res.status(404).json({ error: error.message || "Backup not found." });
    }
});
// Restore from a stored backup filename
router.post("/backup/restore/:filename", auth_1.protect, (0, auth_1.restrictTo)("OWNER"), async (req, res) => {
    try {
        const full = (0, backup_1.resolveBackupFilename)(req.params.filename);
        await (0, backup_1.restoreFromZipFile)(full);
        (0, cache_1.invalidateCache)();
        return res.json({
            message: "System data restored from backup. Reloading is recommended."
        });
    }
    catch (error) {
        console.error("Backup restore failed:", error);
        return res.status(500).json({ error: error.message || "Failed to restore backup." });
    }
});
// Delete a stored backup
router.delete("/backup/delete/:filename", auth_1.protect, (0, auth_1.restrictTo)("OWNER", "MANAGER"), (req, res) => {
    try {
        const full = (0, backup_1.resolveBackupFilename)(req.params.filename);
        fs_1.default.unlinkSync(full);
        return res.json({ message: "Backup deleted." });
    }
    catch (error) {
        return res.status(400).json({ error: error.message || "Failed to delete backup." });
    }
});
// Export Database and Uploads Backup (OWNER & MANAGER)
router.get("/backup/export", auth_1.protect, (0, auth_1.restrictTo)("OWNER", "MANAGER"), async (_req, res) => {
    try {
        const zip = await (0, backup_1.buildBackupZip)();
        const buffer = zip.toBuffer();
        res.set({
            "Content-Type": "application/zip",
            "Content-Disposition": `attachment; filename="pos-backup-${new Date().toISOString().split("T")[0]}.zip"`,
            "Content-Length": buffer.length
        });
        return res.send(buffer);
    }
    catch (error) {
        console.error("Backup export failed:", error);
        return res.status(500).json({ error: error.message || "Failed to generate backup archive." });
    }
});
// Import Database and Uploads Backup (OWNER only)
router.post("/backup/import", auth_1.protect, (0, auth_1.restrictTo)("OWNER"), backupUpload.single("backup"), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: "Please upload a valid backup zip file." });
    }
    const tempFilePath = req.file.path;
    try {
        await (0, backup_1.restoreFromZipFile)(tempFilePath);
        (0, cache_1.invalidateCache)();
        if (fs_1.default.existsSync(tempFilePath)) {
            fs_1.default.unlinkSync(tempFilePath);
        }
        return res.json({
            message: "Data restored successfully from backup. The page will reload."
        });
    }
    catch (error) {
        console.error("Backup import failed:", error);
        if (fs_1.default.existsSync(tempFilePath)) {
            fs_1.default.unlinkSync(tempFilePath);
        }
        return res.status(500).json({
            error: error.message || "Failed to restore data from the uploaded backup."
        });
    }
});
exports.default = router;
