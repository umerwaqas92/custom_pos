import { Router } from "express";
import prisma from "../utils/db";
import { protect, restrictTo } from "../middleware/auth";

const router = Router();

// ==================== CUSTOMER MANAGEMENT ====================

// List Customers
router.get("/customers", protect, async (req, res) => {
  try {
    const list = await prisma.customer.findMany({ orderBy: { name: "asc" } });
    return res.json(list);
  } catch (error) {
    return res.status(500).json({ error: "Failed to load customers." });
  }
});

// Create Customer
router.post("/customers", protect, async (req, res) => {
  const { name, phone, email, address, creditLimit, notes } = req.body;
  if (!name || !phone) return res.status(400).json({ error: "Name and phone number are required." });

  try {
    const exists = await prisma.customer.findUnique({ where: { phone } });
    if (exists) return res.status(400).json({ error: "Customer with this phone number already exists." });

    const customer = await prisma.customer.create({
      data: {
        name,
        phone,
        email: email || null,
        address: address || null,
        creditLimit: creditLimit ? Number(creditLimit) : 0.0,
        notes: notes || null
      }
    });
    return res.status(201).json(customer);
  } catch (error) {
    return res.status(500).json({ error: "Failed to create customer profile." });
  }
});

// Update Customer
router.put("/customers/:id", protect, async (req, res) => {
  const { id } = req.params;
  const { name, phone, email, address, creditLimit, notes } = req.body;
  try {
    const updated = await prisma.customer.update({
      where: { id },
      data: { name, phone, email, address, creditLimit: creditLimit ? Number(creditLimit) : undefined, notes }
    });
    return res.json(updated);
  } catch (error) {
    return res.status(500).json({ error: "Failed to update customer." });
  }
});

// Record Customer Credit Repayment
router.post("/customers/:id/repay", protect, async (req, res) => {
  const { id } = req.params;
  const { amount, paymentMethod, notes } = req.body;
  if (!amount || amount <= 0 || !paymentMethod) {
    return res.status(400).json({ error: "Repayment amount and payment method are required." });
  }

  try {
    const customer = await prisma.customer.findUnique({ where: { id } });
    if (!customer) return res.status(404).json({ error: "Customer not found." });

    const repay = Number(amount);
    const updatedBalance = Math.max(0, customer.creditBalance - repay);

    const paymentResult = await prisma.$transaction(async (tx) => {
      // Record credit payment receipt
      const log = await tx.customerCreditPayment.create({
        data: {
          customerId: id,
          amount: repay,
          paymentMethod,
          notes
        }
      });

      // Update customer balance
      await tx.customer.update({
        where: { id },
        data: { creditBalance: updatedBalance }
      });

      return log;
    });

    return res.json({ paymentResult, newBalance: updatedBalance });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Failed to process credit payment." });
  }
});

// ==================== SUPPLIER MANAGEMENT ====================

// List Suppliers
router.get("/suppliers", protect, async (req, res) => {
  try {
    const suppliers = await prisma.supplier.findMany({ orderBy: { company: "asc" } });
    return res.json(suppliers);
  } catch (error) {
    return res.status(500).json({ error: "Failed to load suppliers." });
  }
});

// Create Supplier
router.post("/suppliers", protect, restrictTo("OWNER", "MANAGER"), async (req, res) => {
  const { company, contactPerson, phone, email, address } = req.body;
  if (!company) return res.status(400).json({ error: "Company name is required." });

  try {
    const supplier = await prisma.supplier.create({
      data: { company, contactPerson, phone, email, address }
    });
    return res.status(201).json(supplier);
  } catch (error) {
    return res.status(500).json({ error: "Failed to create supplier." });
  }
});

// Update Supplier
router.put("/suppliers/:id", protect, restrictTo("OWNER", "MANAGER"), async (req, res) => {
  const { id } = req.params;
  const { company, contactPerson, phone, email, address } = req.body;
  try {
    const updated = await prisma.supplier.update({
      where: { id },
      data: { company, contactPerson, phone, email, address }
    });
    return res.json(updated);
  } catch (error) {
    return res.status(500).json({ error: "Failed to update supplier details." });
  }
});

// ==================== PURCHASE MANAGEMENT (RESTOCKING) ====================

// List Purchase Orders
router.get("/purchases", protect, async (req, res) => {
  try {
    const list = await prisma.purchaseOrder.findMany({
      include: {
        supplier: true,
        items: { include: { product: true } }
      },
      orderBy: { orderDate: "desc" }
    });
    return res.json(list);
  } catch (error) {
    return res.status(500).json({ error: "Failed to load purchase orders." });
  }
});

// Place a Purchase Restock Order
router.post("/purchases", protect, restrictTo("OWNER", "MANAGER", "WAREHOUSE"), async (req, res) => {
  const { supplierId, items, notes } = req.body; // items: array of { productId, quantity, costPrice }

  if (!supplierId || !items || items.length === 0) {
    return res.status(400).json({ error: "Supplier ID and restock items are required." });
  }

  try {
    let total = 0;
    const itemsData = items.map((it: any) => {
      const lineCost = Number(it.costPrice) * Number(it.quantity);
      total += lineCost;
      return {
        productId: it.productId,
        quantity: Number(it.quantity),
        costPrice: Number(it.costPrice)
      };
    });

    const order = await prisma.purchaseOrder.create({
      data: {
        supplierId,
        totalAmount: total,
        status: "PENDING",
        notes,
        items: {
          create: itemsData
        }
      },
      include: {
        items: true,
        supplier: true
      }
    });

    return res.status(201).json(order);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Failed to create purchase order." });
  }
});

// Update Purchase Order Status (e.g., Mark as RECEIVED -> adds stock quantities)
router.put("/purchases/:id/status", protect, restrictTo("OWNER", "MANAGER", "WAREHOUSE"), async (req, res) => {
  const { id } = req.params;
  const { status, branchId } = req.body; // branchId is where stocks should be routed

  if (!status) return res.status(400).json({ error: "Status is required." });

  try {
    const purchase = await prisma.purchaseOrder.findUnique({
      where: { id },
      include: { items: true }
    });

    if (!purchase) return res.status(404).json({ error: "Purchase order not found." });

    if (purchase.status === "RECEIVED") {
      return res.status(400).json({ error: "Purchase order items have already been received." });
    }

    const updatedOrder = await prisma.$transaction(async (tx) => {
      const order = await tx.purchaseOrder.update({
        where: { id },
        data: { status }
      });

      // If status is changed to RECEIVED, increment stock
      if (status === "RECEIVED") {
        if (!branchId) throw new Error("A destination branch must be provided to receive items into stock.");

        for (const item of purchase.items) {
          // Increment branch stock
          await tx.branchStock.upsert({
            where: { branchId_productId: { branchId, productId: item.productId } },
            update: { quantity: { increment: item.quantity } },
            create: { branchId, productId: item.productId, quantity: item.quantity }
          });

          // Increment product overall stock
          await tx.product.update({
            where: { id: item.productId },
            data: { stockQuantity: { increment: item.quantity } }
          });

          // Log movement
          await tx.stockMovement.create({
            data: {
              productId: item.productId,
              quantity: item.quantity,
              type: "IN",
              branchId,
              referenceId: id,
              notes: `Items received from Purchase Order ${id}`
            }
          });
        }
      }

      return order;
    });

    return res.json(updatedOrder);
  } catch (error: any) {
    console.error(error);
    return res.status(400).json({ error: error.message || "Failed to update purchase status." });
  }
});

// ==================== EXPENSE TRACKING ====================

// List Expenses
router.get("/expenses", protect, restrictTo("OWNER", "MANAGER"), async (req, res) => {
  try {
    const expenses = await prisma.expense.findMany({ orderBy: { date: "desc" } });
    return res.json(expenses);
  } catch (error) {
    return res.status(500).json({ error: "Failed to load expenses list." });
  }
});

// Add Expense Record
router.post("/expenses", protect, restrictTo("OWNER", "MANAGER"), async (req, res) => {
  const { category, amount, description, paymentMethod } = req.body;
  if (!category || !amount || !paymentMethod) {
    return res.status(400).json({ error: "Category, amount, and payment method are required." });
  }

  try {
    const expense = await prisma.expense.create({
      data: {
        category,
        amount: Number(amount),
        description: description || null,
        paymentMethod
      }
    });
    return res.status(201).json(expense);
  } catch (error) {
    return res.status(500).json({ error: "Failed to log expense." });
  }
});

export default router;
