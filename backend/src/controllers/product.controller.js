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
/**
 * Proxy Google Suggest so the browser avoids CORS.
 * Uses: https://suggestqueries.google.com/complete/search?output=toolbar&hl=en&q=...
 */
router.get("/suggest", auth_1.protect, async (req, res) => {
    const q = String(req.query.q || "").trim();
    if (!q || q.length < 1) {
        return res.json({ suggestions: [] });
    }
    if (q.length > 80) {
        return res.status(400).json({ error: "Query too long." });
    }
    try {
        const url = "https://suggestqueries.google.com/complete/search?output=toolbar&hl=en&q=" +
            encodeURIComponent(q);
        const response = await fetch(url, {
            headers: {
                "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                Accept: "application/xml,text/xml,*/*",
            },
        });
        if (!response.ok) {
            return res.status(502).json({ error: "Suggest service unavailable.", suggestions: [] });
        }
        const xml = await response.text();
        const suggestions = [];
        const re = /<suggestion\s+data="([^"]*)"/gi;
        let match;
        while ((match = re.exec(xml)) !== null) {
            const decoded = match[1]
                .replace(/&amp;/g, "&")
                .replace(/&lt;/g, "<")
                .replace(/&gt;/g, ">")
                .replace(/&quot;/g, '"')
                .replace(/&#39;/g, "'")
                .trim();
            if (decoded && !suggestions.includes(decoded)) {
                suggestions.push(decoded);
            }
        }
        return res.json({ suggestions: suggestions.slice(0, 10) });
    }
    catch (error) {
        console.error("Suggest proxy failed:", error);
        return res.status(502).json({ error: "Failed to fetch suggestions.", suggestions: [] });
    }
});
/** Build a short unique SKU when the client leaves SKU empty. */
async function generateUniqueSku(name, brandId, model) {
    let brandPrefix = "";
    if (brandId) {
        const brand = await db_1.default.brand.findUnique({ where: { id: brandId }, select: { name: true } });
        if (brand?.name) {
            brandPrefix = brand.name
                .toUpperCase()
                .replace(/[^A-Z0-9]+/g, "")
                .slice(0, 6);
        }
    }
    const modelPart = (model || "")
        .toUpperCase()
        .replace(/[^A-Z0-9]+/g, "")
        .slice(0, 8);
    const namePart = name
        .toUpperCase()
        .replace(/[^A-Z0-9]+/g, "")
        .slice(0, 8);
    const base = [brandPrefix || namePart || "PRD", modelPart || null].filter(Boolean).join("-");
    for (let attempt = 0; attempt < 8; attempt++) {
        const suffix = Date.now().toString(36).toUpperCase().slice(-4) + Math.random().toString(36).toUpperCase().slice(2, 4);
        const sku = `${base}-${suffix}`.slice(0, 40);
        const existing = await db_1.default.product.findUnique({ where: { sku } });
        if (!existing)
            return sku;
    }
    return `PRD-${Date.now().toString(36).toUpperCase()}`;
}
// ==================== CATEGORY ROUTES ====================
// List Categories
router.get("/categories", auth_1.protect, async (req, res) => {
    try {
        const categories = await db_1.default.category.findMany({
            orderBy: { name: "asc" }
        });
        return res.json(categories);
    }
    catch (error) {
        return res.status(500).json({ error: "Failed to load categories." });
    }
});
// Create Category
router.post("/categories", auth_1.protect, (0, auth_1.restrictTo)("OWNER", "MANAGER"), async (req, res) => {
    const { name } = req.body;
    if (!name)
        return res.status(400).json({ error: "Name is required." });
    try {
        const category = await db_1.default.category.create({ data: { name } });
        (0, cache_1.invalidateCache)("reports:");
        return res.status(201).json(category);
    }
    catch (error) {
        return res.status(400).json({ error: "Category already exists." });
    }
});
// Update Category
router.put("/categories/:id", auth_1.protect, (0, auth_1.restrictTo)("OWNER", "MANAGER"), async (req, res) => {
    const { id } = req.params;
    const { name } = req.body;
    if (!name)
        return res.status(400).json({ error: "Name is required." });
    try {
        const updated = await db_1.default.category.update({
            where: { id },
            data: { name }
        });
        (0, cache_1.invalidateCache)("reports:");
        return res.json(updated);
    }
    catch (error) {
        return res.status(400).json({ error: "Failed to update category." });
    }
});
// Delete Category
router.delete("/categories/:id", auth_1.protect, (0, auth_1.restrictTo)("OWNER", "MANAGER"), async (req, res) => {
    const { id } = req.params;
    try {
        await db_1.default.$transaction(async (tx) => {
            await tx.product.updateMany({
                where: { categoryId: id },
                data: { categoryId: null }
            });
            await tx.category.delete({ where: { id } });
        });
        (0, cache_1.invalidateCache)("reports:");
        return res.json({ message: "Category deleted successfully." });
    }
    catch (error) {
        return res.status(500).json({ error: "Failed to delete category." });
    }
});
// ==================== BRAND ROUTES ====================
// List Brands
router.get("/brands", auth_1.protect, async (req, res) => {
    try {
        const brands = await db_1.default.brand.findMany({
            orderBy: { name: "asc" }
        });
        return res.json(brands);
    }
    catch (error) {
        return res.status(500).json({ error: "Failed to load brands." });
    }
});
// Create Brand
router.post("/brands", auth_1.protect, (0, auth_1.restrictTo)("OWNER", "MANAGER"), async (req, res) => {
    const { name } = req.body;
    if (!name)
        return res.status(400).json({ error: "Name is required." });
    try {
        const brand = await db_1.default.brand.create({ data: { name } });
        (0, cache_1.invalidateCache)("reports:");
        return res.status(201).json(brand);
    }
    catch (error) {
        return res.status(400).json({ error: "Brand already exists." });
    }
});
// Update Brand
router.put("/brands/:id", auth_1.protect, (0, auth_1.restrictTo)("OWNER", "MANAGER"), async (req, res) => {
    const { id } = req.params;
    const { name } = req.body;
    if (!name)
        return res.status(400).json({ error: "Name is required." });
    try {
        const updated = await db_1.default.brand.update({
            where: { id },
            data: { name }
        });
        (0, cache_1.invalidateCache)("reports:");
        return res.json(updated);
    }
    catch (error) {
        return res.status(400).json({ error: "Failed to update brand." });
    }
});
// Delete Brand
router.delete("/brands/:id", auth_1.protect, (0, auth_1.restrictTo)("OWNER", "MANAGER"), async (req, res) => {
    const { id } = req.params;
    try {
        await db_1.default.$transaction(async (tx) => {
            await tx.product.updateMany({
                where: { brandId: id },
                data: { brandId: null }
            });
            await tx.brand.delete({ where: { id } });
        });
        (0, cache_1.invalidateCache)("reports:");
        return res.json({ message: "Brand deleted successfully." });
    }
    catch (error) {
        return res.status(500).json({ error: "Failed to delete brand." });
    }
});
// Bulk Delete Categories
router.post("/categories/bulk-delete", auth_1.protect, (0, auth_1.restrictTo)("OWNER", "MANAGER"), async (req, res) => {
    const { ids } = req.body;
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ error: "No category IDs provided." });
    }
    try {
        await db_1.default.$transaction(async (tx) => {
            await tx.product.updateMany({ where: { categoryId: { in: ids } }, data: { categoryId: null } });
            await tx.category.deleteMany({ where: { id: { in: ids } } });
        });
        (0, cache_1.invalidateCache)("reports:");
        return res.json({ message: `${ids.length} categories deleted successfully.` });
    }
    catch (error) {
        return res.status(500).json({ error: "Failed to bulk delete categories." });
    }
});
// Bulk Delete Brands
router.post("/brands/bulk-delete", auth_1.protect, (0, auth_1.restrictTo)("OWNER", "MANAGER"), async (req, res) => {
    const { ids } = req.body;
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ error: "No brand IDs provided." });
    }
    try {
        await db_1.default.$transaction(async (tx) => {
            await tx.product.updateMany({ where: { brandId: { in: ids } }, data: { brandId: null } });
            await tx.brand.deleteMany({ where: { id: { in: ids } } });
        });
        (0, cache_1.invalidateCache)("reports:");
        return res.json({ message: `${ids.length} brands deleted successfully.` });
    }
    catch (error) {
        return res.status(500).json({ error: "Failed to bulk delete brands." });
    }
});
// ==================== PRODUCT ROUTES ====================
// List and Search Products
router.get("/", auth_1.protect, async (req, res) => {
    const { search, category, brand, sku, barcode, lite, branchId } = req.query;
    const isLite = lite === "1" || lite === "true";
    const branchFilter = branchId ? String(branchId) : undefined;
    try {
        const whereClause = {};
        if (sku)
            whereClause.sku = String(sku);
        if (barcode)
            whereClause.barcode = String(barcode);
        if (category)
            whereClause.categoryId = String(category);
        if (brand)
            whereClause.brandId = String(brand);
        if (search) {
            const searchStr = String(search);
            whereClause.OR = [
                { name: { contains: searchStr } },
                { sku: { contains: searchStr } },
                { barcode: { contains: searchStr } },
                { model: { contains: searchStr } },
                { serialNumber: { contains: searchStr } },
                { imei: { contains: searchStr } }
            ];
        }
        const products = isLite
            ? await db_1.default.product.findMany({
                where: whereClause,
                select: {
                    id: true,
                    name: true,
                    sku: true,
                    barcode: true,
                    categoryId: true,
                    brandId: true,
                    model: true,
                    serialNumber: true,
                    imei: true,
                    sellingPrice: true,
                    purchasePrice: true,
                    taxRate: true,
                    discountRate: true,
                    stockQuantity: true,
                    minStock: true,
                    type: true,
                    category: {
                        select: { id: true, name: true }
                    },
                    brand: {
                        select: { id: true, name: true }
                    },
                    ...(branchFilter
                        ? {
                            branchStocks: {
                                where: { branchId: branchFilter },
                                select: { branchId: true, quantity: true }
                            }
                        }
                        : {})
                },
                orderBy: { name: "asc" }
            })
            : await db_1.default.product.findMany({
                where: whereClause,
                include: {
                    category: true,
                    brand: true,
                    supplier: true,
                    branchStocks: branchFilter
                        ? {
                            where: { branchId: branchFilter },
                            include: { branch: true }
                        }
                        : {
                            include: { branch: true }
                        }
                },
                orderBy: { name: "asc" }
            });
        return res.json(products);
    }
    catch (error) {
        console.error(error);
        return res.status(500).json({ error: "Failed to fetch products." });
    }
});
// Get Single Product
router.get("/:id", auth_1.protect, async (req, res) => {
    const { id } = req.params;
    try {
        const product = await db_1.default.product.findUnique({
            where: { id },
            include: {
                category: true,
                brand: true,
                supplier: true,
                branchStocks: {
                    include: { branch: true }
                }
            }
        });
        if (!product)
            return res.status(404).json({ error: "Product not found." });
        return res.json(product);
    }
    catch (error) {
        return res.status(500).json({ error: "Failed to load product." });
    }
});
// Create Product
router.post("/", auth_1.protect, (0, auth_1.restrictTo)("OWNER", "MANAGER", "WAREHOUSE"), async (req, res) => {
    const { name, sku, barcode, qrCode, categoryId, brandId, model, serialNumber, imei, color, storage, ram, processor, warrantyMonths, supplierId, purchasePrice, sellingPrice, wholesalePrice, taxRate, discountRate, description, weight, minStock, type } = req.body;
    if (!name || purchasePrice === undefined || purchasePrice === "" || sellingPrice === undefined || sellingPrice === "") {
        return res.status(400).json({ error: "Name, purchase price, and selling price are required." });
    }
    try {
        // Auto-generate SKU when blank (Excel-style catalogs rarely have SKUs)
        let finalSku = typeof sku === "string" ? sku.trim() : "";
        if (!finalSku) {
            finalSku = await generateUniqueSku(String(name), brandId || null, model || null);
        }
        // Check if SKU is unique
        const existingSku = await db_1.default.product.findUnique({ where: { sku: finalSku } });
        if (existingSku)
            return res.status(400).json({ error: "SKU already exists." });
        if (barcode) {
            const existingBarcode = await db_1.default.product.findUnique({ where: { barcode } });
            if (existingBarcode)
                return res.status(400).json({ error: "Barcode already exists." });
        }
        const product = await db_1.default.product.create({
            data: {
                name,
                sku: finalSku,
                barcode: barcode || null,
                qrCode: qrCode || null,
                categoryId: categoryId || null,
                brandId: brandId || null,
                model: model || null,
                serialNumber: serialNumber || null,
                imei: imei || null,
                color: color || null,
                storage: storage || null,
                ram: ram || null,
                processor: processor || null,
                warrantyMonths: Number(warrantyMonths) || 0,
                supplierId: supplierId || null,
                purchasePrice: Number(purchasePrice),
                sellingPrice: Number(sellingPrice),
                wholesalePrice: wholesalePrice ? Number(wholesalePrice) : null,
                taxRate: taxRate ? Number(taxRate) : 0.0,
                discountRate: discountRate ? Number(discountRate) : 0.0,
                images: JSON.stringify([]),
                description: description || null,
                weight: weight ? Number(weight) : null,
                stockQuantity: 0,
                minStock: minStock ? Number(minStock) : 5,
                type: type || "SINGLE"
            }
        });
        // Automatically initialize branch stocks with 0 quantity
        const branches = await db_1.default.branch.findMany({
            select: { id: true }
        });
        if (branches.length > 0) {
            await db_1.default.branchStock.createMany({
                data: branches.map((b) => ({
                    branchId: b.id,
                    productId: product.id,
                    quantity: 0
                }))
            });
        }
        (0, cache_1.invalidateCache)("reports:");
        return res.status(201).json(product);
    }
    catch (error) {
        console.error(error);
        return res.status(500).json({ error: "Failed to create product." });
    }
});
// Update Product
router.put("/:id", auth_1.protect, (0, auth_1.restrictTo)("OWNER", "MANAGER", "WAREHOUSE"), async (req, res) => {
    const { id } = req.params;
    const { name, sku, barcode, qrCode, categoryId, brandId, model, serialNumber, imei, color, storage, ram, processor, warrantyMonths, supplierId, purchasePrice, sellingPrice, wholesalePrice, taxRate, discountRate, description, weight, minStock, type } = req.body;
    try {
        // Check SKU conflicts
        if (sku) {
            const existing = await db_1.default.product.findFirst({
                where: { sku, id: { not: id } }
            });
            if (existing)
                return res.status(400).json({ error: "SKU is already in use by another product." });
        }
        const updated = await db_1.default.product.update({
            where: { id },
            data: {
                name,
                sku,
                barcode: barcode || null,
                qrCode: qrCode || null,
                categoryId: categoryId || null,
                brandId: brandId || null,
                model: model || null,
                serialNumber: serialNumber || null,
                imei: imei || null,
                color: color || null,
                storage: storage || null,
                ram: ram || null,
                processor: processor || null,
                warrantyMonths: warrantyMonths !== undefined ? Number(warrantyMonths) : undefined,
                supplierId: supplierId || null,
                purchasePrice: purchasePrice !== undefined ? Number(purchasePrice) : undefined,
                sellingPrice: sellingPrice !== undefined ? Number(sellingPrice) : undefined,
                wholesalePrice: wholesalePrice !== undefined ? (wholesalePrice ? Number(wholesalePrice) : null) : undefined,
                taxRate: taxRate !== undefined ? Number(taxRate) : undefined,
                discountRate: discountRate !== undefined ? Number(discountRate) : undefined,
                description: description || null,
                weight: weight !== undefined ? (weight ? Number(weight) : null) : undefined,
                minStock: minStock !== undefined ? Number(minStock) : undefined,
                type
            }
        });
        (0, cache_1.invalidateCache)("reports:");
        return res.json(updated);
    }
    catch (error) {
        console.error(error);
        return res.status(500).json({ error: "Failed to update product." });
    }
});
// Delete Product
router.delete("/:id", auth_1.protect, (0, auth_1.restrictTo)("OWNER"), async (req, res) => {
    const { id } = req.params;
    try {
        // Check if referenced in sales history, purchase orders, or warranty claims
        const hasSales = await db_1.default.saleItem.findFirst({ where: { productId: id } });
        const hasPurchases = await db_1.default.purchaseItem.findFirst({ where: { productId: id } });
        const hasWarranties = await db_1.default.warrantyClaim.findFirst({ where: { productId: id } });
        if (hasSales || hasPurchases || hasWarranties) {
            return res.status(400).json({
                error: "Cannot delete product because it is referenced in sales history, purchase orders, or warranty claims."
            });
        }
        // Cascade-deleting stocks is automatically handled or manual
        await db_1.default.branchStock.deleteMany({ where: { productId: id } });
        await db_1.default.stockMovement.deleteMany({ where: { productId: id } });
        await db_1.default.product.delete({ where: { id } });
        (0, cache_1.invalidateCache)("reports:");
        return res.json({ message: "Product deleted successfully." });
    }
    catch (error) {
        console.error(error);
        return res.status(500).json({ error: "Failed to delete product." });
    }
});
// Bulk Delete Products
router.post("/bulk-delete", auth_1.protect, (0, auth_1.restrictTo)("OWNER"), async (req, res) => {
    const { ids } = req.body;
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ error: "No product IDs provided." });
    }
    try {
        // Check if any product is referenced in sales history, purchase orders, or warranty claims
        const hasSales = await db_1.default.saleItem.findFirst({ where: { productId: { in: ids } } });
        const hasPurchases = await db_1.default.purchaseItem.findFirst({ where: { productId: { in: ids } } });
        const hasWarranties = await db_1.default.warrantyClaim.findFirst({ where: { productId: { in: ids } } });
        if (hasSales || hasPurchases || hasWarranties) {
            return res.status(400).json({
                error: "Cannot delete selected products because one or more are referenced in sales history, purchase orders, or warranty claims."
            });
        }
        await db_1.default.branchStock.deleteMany({ where: { productId: { in: ids } } });
        await db_1.default.stockMovement.deleteMany({ where: { productId: { in: ids } } });
        await db_1.default.product.deleteMany({ where: { id: { in: ids } } });
        (0, cache_1.invalidateCache)("reports:");
        return res.json({ message: `${ids.length} products deleted successfully.` });
    }
    catch (error) {
        console.error(error);
        return res.status(500).json({ error: "Failed to bulk delete products." });
    }
});
exports.default = router;
