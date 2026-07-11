"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const db_1 = __importDefault(require("../utils/db"));
const auth_1 = require("../middleware/auth");
const cache_1 = require("../utils/cache");
const router = (0, express_1.Router)();
const LOW_STOCK_THRESHOLD = 3;
// Adjust stock quantity manually (OWNER, MANAGER, WAREHOUSE)
router.post("/adjust", auth_1.protect, (0, auth_1.restrictTo)("OWNER", "MANAGER", "WAREHOUSE"), async (req, res) => {
    const { productId, branchId, quantity, reason } = req.body;
    if (!productId || !branchId || quantity === undefined) {
        return res.status(400).json({ error: "Product ID, Branch ID, and quantity adjustment value are required." });
    }
    const change = Number(quantity);
    try {
        const product = await db_1.default.product.findUnique({ where: { id: productId } });
        if (!product)
            return res.status(404).json({ error: "Product not found." });
        // Transaction to update branch stock, aggregate product total stock, and log movement
        const result = await db_1.default.$transaction(async (tx) => {
            // Find or create branch stock entry
            const bStock = await tx.branchStock.findUnique({
                where: { branchId_productId: { branchId, productId } }
            });
            const currentQty = bStock ? bStock.quantity : 0;
            const newQty = currentQty + change;
            if (newQty < 0) {
                throw new Error("Adjusted quantity cannot lead to negative stock.");
            }
            await tx.branchStock.upsert({
                where: { branchId_productId: { branchId, productId } },
                update: { quantity: newQty },
                create: { branchId, productId, quantity: newQty }
            });
            // Update total stock quantity
            await tx.product.update({
                where: { id: productId },
                data: { stockQuantity: { increment: change } }
            });
            // Log movement
            const movement = await tx.stockMovement.create({
                data: {
                    productId,
                    quantity: change,
                    type: change > 0 ? "ADJUSTMENT" : "DAMAGE",
                    branchId,
                    notes: reason || "Manual adjustment"
                }
            });
            return movement;
        });
        (0, cache_1.invalidateCache)("reports:");
        return res.json(result);
    }
    catch (error) {
        return res.status(400).json({ error: error.message || "Failed to adjust stock." });
    }
});
// Transfer stock between branches (OWNER, MANAGER, WAREHOUSE)
router.post("/transfer", auth_1.protect, (0, auth_1.restrictTo)("OWNER", "MANAGER", "WAREHOUSE"), async (req, res) => {
    const { productId, fromBranchId, toBranchId, quantity, notes } = req.body;
    if (!productId || !fromBranchId || !toBranchId || !quantity) {
        return res.status(400).json({ error: "Product ID, Source Branch, Destination Branch, and Quantity are required." });
    }
    const qty = Number(quantity);
    if (qty <= 0)
        return res.status(400).json({ error: "Quantity must be greater than zero." });
    try {
        const result = await db_1.default.$transaction(async (tx) => {
            // Check source stock
            const fromStock = await tx.branchStock.findUnique({
                where: { branchId_productId: { branchId: fromBranchId, productId } }
            });
            if (!fromStock || fromStock.quantity < qty) {
                throw new Error("Insufficient stock at the source branch.");
            }
            // Deduct from source
            await tx.branchStock.update({
                where: { branchId_productId: { branchId: fromBranchId, productId } },
                data: { quantity: { decrement: qty } }
            });
            // Add to destination
            await tx.branchStock.upsert({
                where: { branchId_productId: { branchId: toBranchId, productId } },
                update: { quantity: { increment: qty } },
                create: { branchId: toBranchId, productId, quantity: qty }
            });
            // Log movement (OUT from source, IN to dest)
            await tx.stockMovement.create({
                data: {
                    productId,
                    quantity: -qty,
                    type: "TRANSFER",
                    branchId: fromBranchId,
                    notes: `Transferred to branch: ${toBranchId}. ${notes || ""}`
                }
            });
            await tx.stockMovement.create({
                data: {
                    productId,
                    quantity: qty,
                    type: "TRANSFER",
                    branchId: toBranchId,
                    notes: `Transferred from branch: ${fromBranchId}. ${notes || ""}`
                }
            });
            return { success: true, transferred: qty };
        });
        (0, cache_1.invalidateCache)("reports:");
        return res.json(result);
    }
    catch (error) {
        return res.status(400).json({ error: error.message || "Transfer failed." });
    }
});
// Get stock movements history
router.get("/movements", auth_1.protect, async (req, res) => {
    try {
        const movements = await db_1.default.stockMovement.findMany({
            include: {
                product: {
                    include: { brand: true, category: true }
                }
            },
            orderBy: { createdAt: "desc" },
            take: 100
        });
        return res.json(movements);
    }
    catch (error) {
        return res.status(500).json({ error: "Failed to load movements history." });
    }
});
// Get low / out-of-stock alerts (branch stock; matches Inventory low-stock rule: qty <= 3)
router.get("/alerts", auth_1.protect, async (req, res) => {
    try {
        const branchId = req.query.branchId ? String(req.query.branchId) : "";
        const products = await db_1.default.product.findMany({
            include: {
                brand: true,
                category: true,
                branchStocks: {
                    include: { branch: true }
                }
            }
        });
        const alerts = products
            .map((product) => {
            let availableQty;
            if (branchId) {
                availableQty =
                    product.branchStocks.find((bs) => bs.branchId === branchId)?.quantity ?? 0;
            }
            else if (product.branchStocks.length > 0) {
                availableQty = product.branchStocks.reduce((sum, bs) => sum + (bs.quantity || 0), 0);
            }
            else {
                availableQty = product.stockQuantity || 0;
            }
            // Keep in sync with Inventory.tsx: lowStockOnly uses LOW_STOCK_THRESHOLD (3)
            const status = availableQty <= 0 ? "OUT" : availableQty <= LOW_STOCK_THRESHOLD ? "LOW" : "OK";
            return {
                id: product.id,
                name: product.name,
                sku: product.sku,
                brand: product.brand,
                category: product.category,
                branchStocks: product.branchStocks,
                stockQuantity: availableQty,
                minStock: LOW_STOCK_THRESHOLD,
                status
            };
        })
            .filter((p) => p.status === "OUT" || p.status === "LOW")
            .sort((a, b) => a.stockQuantity - b.stockQuantity);
        return res.json(alerts);
    }
    catch (error) {
        console.error(error);
        return res.status(500).json({ error: "Failed to load stock alerts." });
    }
});
exports.default = router;
