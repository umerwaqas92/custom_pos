import { Router } from "express";
import prisma from "../utils/db";
import { protect, restrictTo } from "../middleware/auth";

const router = Router();

// ==================== CATEGORY ROUTES ====================

// List Categories
router.get("/categories", protect, async (req, res) => {
  try {
    const categories = await prisma.category.findMany({
      orderBy: { name: "asc" }
    });
    return res.json(categories);
  } catch (error) {
    return res.status(500).json({ error: "Failed to load categories." });
  }
});

// Create Category
router.post("/categories", protect, restrictTo("OWNER", "MANAGER"), async (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: "Name is required." });
  try {
    const category = await prisma.category.create({ data: { name } });
    return res.status(201).json(category);
  } catch (error) {
    return res.status(400).json({ error: "Category already exists." });
  }
});

// Update Category
router.put("/categories/:id", protect, restrictTo("OWNER", "MANAGER"), async (req, res) => {
  const { id } = req.params;
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: "Name is required." });
  try {
    const updated = await prisma.category.update({
      where: { id },
      data: { name }
    });
    return res.json(updated);
  } catch (error) {
    return res.status(400).json({ error: "Failed to update category." });
  }
});

// Delete Category
router.delete("/categories/:id", protect, restrictTo("OWNER", "MANAGER"), async (req, res) => {
  const { id } = req.params;
  try {
    await prisma.$transaction(async (tx) => {
      await tx.product.updateMany({
        where: { categoryId: id },
        data: { categoryId: null }
      });
      await tx.category.delete({ where: { id } });
    });
    return res.json({ message: "Category deleted successfully." });
  } catch (error) {
    return res.status(500).json({ error: "Failed to delete category." });
  }
});

// ==================== BRAND ROUTES ====================

// List Brands
router.get("/brands", protect, async (req, res) => {
  try {
    const brands = await prisma.brand.findMany({
      orderBy: { name: "asc" }
    });
    return res.json(brands);
  } catch (error) {
    return res.status(500).json({ error: "Failed to load brands." });
  }
});

// Create Brand
router.post("/brands", protect, restrictTo("OWNER", "MANAGER"), async (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: "Name is required." });
  try {
    const brand = await prisma.brand.create({ data: { name } });
    return res.status(201).json(brand);
  } catch (error) {
    return res.status(400).json({ error: "Brand already exists." });
  }
});

// Update Brand
router.put("/brands/:id", protect, restrictTo("OWNER", "MANAGER"), async (req, res) => {
  const { id } = req.params;
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: "Name is required." });
  try {
    const updated = await prisma.brand.update({
      where: { id },
      data: { name }
    });
    return res.json(updated);
  } catch (error) {
    return res.status(400).json({ error: "Failed to update brand." });
  }
});

// Delete Brand
router.delete("/brands/:id", protect, restrictTo("OWNER", "MANAGER"), async (req, res) => {
  const { id } = req.params;
  try {
    await prisma.$transaction(async (tx) => {
      await tx.product.updateMany({
        where: { brandId: id },
        data: { brandId: null }
      });
      await tx.brand.delete({ where: { id } });
    });
    return res.json({ message: "Brand deleted successfully." });
  } catch (error) {
    return res.status(500).json({ error: "Failed to delete brand." });
  }
});

// ==================== PRODUCT ROUTES ====================

// List and Search Products
router.get("/", protect, async (req, res) => {
  const { search, category, brand, sku, barcode } = req.query;

  try {
    const whereClause: any = {};

    if (sku) whereClause.sku = String(sku);
    if (barcode) whereClause.barcode = String(barcode);
    if (category) whereClause.categoryId = String(category);
    if (brand) whereClause.brandId = String(brand);

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

    const products = await prisma.product.findMany({
      where: whereClause,
      include: {
        category: true,
        brand: true,
        supplier: true,
        branchStocks: {
          include: { branch: true }
        }
      },
      orderBy: { name: "asc" }
    });

    return res.json(products);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Failed to fetch products." });
  }
});

// Get Single Product
router.get("/:id", protect, async (req, res) => {
  const { id } = req.params;
  try {
    const product = await prisma.product.findUnique({
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

    if (!product) return res.status(404).json({ error: "Product not found." });
    return res.json(product);
  } catch (error) {
    return res.status(500).json({ error: "Failed to load product." });
  }
});

// Create Product
router.post("/", protect, restrictTo("OWNER", "MANAGER", "WAREHOUSE"), async (req, res) => {
  const {
    name, sku, barcode, qrCode, categoryId, brandId, model,
    serialNumber, imei, color, storage, ram, processor, warrantyMonths,
    supplierId, purchasePrice, sellingPrice, wholesalePrice, taxRate,
    discountRate, description, weight, minStock, type
  } = req.body;

  if (!name || !sku || purchasePrice === undefined || sellingPrice === undefined) {
    return res.status(400).json({ error: "Name, SKU, purchase price, and selling price are required." });
  }

  try {
    // Check if SKU is unique
    const existingSku = await prisma.product.findUnique({ where: { sku } });
    if (existingSku) return res.status(400).json({ error: "SKU already exists." });

    if (barcode) {
      const existingBarcode = await prisma.product.findUnique({ where: { barcode } });
      if (existingBarcode) return res.status(400).json({ error: "Barcode already exists." });
    }

    const product = await prisma.product.create({
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
    const branches = await prisma.branch.findMany();
    for (const b of branches) {
      await prisma.branchStock.create({
        data: {
          branchId: b.id,
          productId: product.id,
          quantity: 0
        }
      });
    }

    return res.status(201).json(product);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Failed to create product." });
  }
});

// Update Product
router.put("/:id", protect, restrictTo("OWNER", "MANAGER", "WAREHOUSE"), async (req, res) => {
  const { id } = req.params;
  const {
    name, sku, barcode, qrCode, categoryId, brandId, model,
    serialNumber, imei, color, storage, ram, processor, warrantyMonths,
    supplierId, purchasePrice, sellingPrice, wholesalePrice, taxRate,
    discountRate, description, weight, minStock, type
  } = req.body;

  try {
    // Check SKU conflicts
    if (sku) {
      const existing = await prisma.product.findFirst({
        where: { sku, id: { not: id } }
      });
      if (existing) return res.status(400).json({ error: "SKU is already in use by another product." });
    }

    const updated = await prisma.product.update({
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

    return res.json(updated);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Failed to update product." });
  }
});

// Delete Product
router.delete("/:id", protect, restrictTo("OWNER"), async (req, res) => {
  const { id } = req.params;
  try {
    // Cascade-deleting stocks is automatically handled or manual
    await prisma.branchStock.deleteMany({ where: { productId: id } });
    await prisma.stockMovement.deleteMany({ where: { productId: id } });
    await prisma.product.delete({ where: { id } });
    return res.json({ message: "Product deleted successfully." });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Failed to delete product." });
  }
});

// Bulk Delete Products
router.post("/bulk-delete", protect, restrictTo("OWNER"), async (req, res) => {
  const { ids } = req.body;
  if (!ids || !Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ error: "No product IDs provided." });
  }
  try {
    await prisma.branchStock.deleteMany({ where: { productId: { in: ids } } });
    await prisma.stockMovement.deleteMany({ where: { productId: { in: ids } } });
    await prisma.product.deleteMany({ where: { id: { in: ids } } });
    return res.json({ message: `${ids.length} products deleted successfully.` });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Failed to bulk delete products." });
  }
});

export default router;
