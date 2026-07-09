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

// ==================== BANK ACCOUNTS ====================

// List Bank Accounts
router.get("/bank-accounts", protect, restrictTo("OWNER", "MANAGER"), async (req, res) => {
  try {
    const accounts = await prisma.bankAccount.findMany({
      include: { transactions: { orderBy: { createdAt: "desc" }, take: 1 } },
      orderBy: { createdAt: "asc" }
    });
    return res.json(accounts);
  } catch (error) {
    return res.status(500).json({ error: "Failed to load bank accounts." });
  }
});

// Create Bank Account
router.post("/bank-accounts", protect, restrictTo("OWNER", "MANAGER"), async (req, res) => {
  const { name, type, accountNumber, bankName, notes } = req.body;
  if (!name || !type) return res.status(400).json({ error: "Name and type are required." });

  try {
    const account = await prisma.bankAccount.create({
      data: { name, type, accountNumber, bankName, notes }
    });
    return res.status(201).json(account);
  } catch (error) {
    return res.status(500).json({ error: "Failed to create bank account." });
  }
});

// Update Bank Account
router.put("/bank-accounts/:id", protect, restrictTo("OWNER", "MANAGER"), async (req, res) => {
  const { id } = req.params;
  const { name, type, accountNumber, bankName, notes, isActive } = req.body;
  try {
    const updated = await prisma.bankAccount.update({
      where: { id },
      data: { name, type, accountNumber, bankName, notes, isActive }
    });
    return res.json(updated);
  } catch (error) {
    return res.status(500).json({ error: "Failed to update bank account." });
  }
});

// ==================== CASH BOOK / TRANSACTIONS ====================

// List Transactions (Cash Book)
router.get("/transactions", protect, restrictTo("OWNER", "MANAGER"), async (req, res) => {
  const { bankAccountId, type, category, startDate, endDate } = req.query;
  try {
    const where: any = {};
    if (bankAccountId) where.bankAccountId = String(bankAccountId);
    if (type) where.type = String(type);
    if (category) where.category = String(category);
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = new Date(String(startDate));
      if (endDate) where.createdAt.lte = new Date(String(endDate) + "T23:59:59.999Z");
    }

    const transactions = await prisma.transaction.findMany({
      where,
      include: { bankAccount: true },
      orderBy: { createdAt: "desc" },
      take: 200
    });
    return res.json(transactions);
  } catch (error) {
    return res.status(500).json({ error: "Failed to load transactions." });
  }
});

// Record a Manual Transaction (Income or Expense)
router.post("/transactions", protect, restrictTo("OWNER", "MANAGER"), async (req: AuthenticatedRequest, res) => {
  const { bankAccountId, type, category, amount, description, branchId } = req.body;
  if (!bankAccountId || !type || !amount) {
    return res.status(400).json({ error: "Bank account, type, and amount are required." });
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      const account = await tx.bankAccount.findUnique({ where: { id: bankAccountId } });
      if (!account) throw new Error("Bank account not found.");

      const amt = Number(amount);
      const newBalance = type === "INCOME" ? account.balance + amt : account.balance - amt;

      await tx.bankAccount.update({
        where: { id: bankAccountId },
        data: { balance: newBalance }
      });

      const transaction = await tx.transaction.create({
        data: {
          bankAccountId,
          type,
          category: category || "ADJUSTMENT",
          amount: amt,
          description: description || null,
          branchId: branchId || null,
          createdBy: req.user?.id || null
        }
      });

      return transaction;
    });

    return res.status(201).json(result);
  } catch (error: any) {
    return res.status(400).json({ error: error.message || "Failed to record transaction." });
  }
});

// Transfer between accounts
router.post("/transactions/transfer", protect, restrictTo("OWNER", "MANAGER"), async (req: AuthenticatedRequest, res) => {
  const { fromAccountId, toAccountId, amount, description } = req.body;
  if (!fromAccountId || !toAccountId || !amount) {
    return res.status(400).json({ error: "Source, destination, and amount are required." });
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      const fromAccount = await tx.bankAccount.findUnique({ where: { id: fromAccountId } });
      const toAccount = await tx.bankAccount.findUnique({ where: { id: toAccountId } });
      if (!fromAccount || !toAccount) throw new Error("One or both accounts not found.");

      const amt = Number(amount);
      if (fromAccount.balance < amt) throw new Error("Insufficient balance in source account.");

      await tx.bankAccount.update({ where: { id: fromAccountId }, data: { balance: fromAccount.balance - amt } });
      await tx.bankAccount.update({ where: { id: toAccountId }, data: { balance: toAccount.balance + amt } });

      const desc = description || `Transfer from ${fromAccount.name} to ${toAccount.name}`;

      const outTx = await tx.transaction.create({
        data: { bankAccountId: fromAccountId, type: "TRANSFER", category: "TRANSFER", amount: amt, description: desc, createdBy: req.user?.id || null }
      });
      const inTx = await tx.transaction.create({
        data: { bankAccountId: toAccountId, type: "TRANSFER", category: "TRANSFER", amount: amt, description: desc, createdBy: req.user?.id || null }
      });

      return { outTx, inTx };
    });

    return res.status(201).json(result);
  } catch (error: any) {
    return res.status(400).json({ error: error.message || "Failed to transfer funds." });
  }
});

// ==================== PROFIT & LOSS REPORT ====================

router.get("/profit-loss", protect, restrictTo("OWNER", "MANAGER"), async (req, res) => {
  const { startDate, endDate } = req.query;

  try {
    const start = startDate ? new Date(String(startDate)) : new Date(new Date().setDate(1)); // First of current month
    const end = endDate ? new Date(String(endDate) + "T23:59:59.999Z") : new Date();

    // Sales Revenue
    const salesAgg = await prisma.sale.aggregate({
      where: { saleDate: { gte: start, lte: end } },
      _sum: { payableAmount: true, taxAmount: true, discountAmount: true },
      _count: { id: true }
    });

    // Cost of Goods Sold (COGS) - sum of purchasePrice * quantity for sold items
    const soldItems = await prisma.saleItem.findMany({
      where: { sale: { saleDate: { gte: start, lte: end } } },
      include: { product: { select: { purchasePrice: true } } }
    });

    let cogs = 0;
    soldItems.forEach(item => {
      cogs += item.product.purchasePrice * item.quantity;
    });

    const grossProfit = (salesAgg._sum.payableAmount || 0) - cogs;
    const grossMargin = salesAgg._sum.payableAmount ? ((grossProfit / salesAgg._sum.payableAmount) * 100) : 0;

    // Expenses
    const expenses = await prisma.expense.findMany({
      where: { date: { gte: start, lte: end } }
    });

    const expensesByCategory: { [key: string]: number } = {};
    let totalExpenses = 0;
    expenses.forEach(exp => {
      expensesByCategory[exp.category] = (expensesByCategory[exp.category] || 0) + exp.amount;
      totalExpenses += exp.amount;
    });

    // Net Profit
    const netProfit = grossProfit - totalExpenses;
    const netMargin = salesAgg._sum.payableAmount ? ((netProfit / salesAgg._sum.payableAmount) * 100) : 0;

    return res.json({
      period: { startDate: start, endDate: end },
      revenue: {
        totalSales: salesAgg._count.id || 0,
        grossRevenue: salesAgg._sum.payableAmount || 0,
        taxCollected: salesAgg._sum.taxAmount || 0,
        discountsGiven: salesAgg._sum.discountAmount || 0
      },
      cogs: {
        totalCOGS: cogs,
        grossProfit,
        grossMargin: Math.round(grossMargin * 100) / 100
      },
      expenses: {
        byCategory: expensesByCategory,
        totalExpenses
      },
      netProfit,
      netMargin: Math.round(netMargin * 100) / 100
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Failed to generate P&L report." });
  }
});

// ==================== DAILY CLOSING ====================

// List Daily Closings
router.get("/daily-closings", protect, restrictTo("OWNER", "MANAGER"), async (req, res) => {
  try {
    const closings = await prisma.dailyClosing.findMany({
      orderBy: { closingDate: "desc" },
      take: 30
    });
    return res.json(closings);
  } catch (error) {
    return res.status(500).json({ error: "Failed to load daily closings." });
  }
});

// Create Daily Closing (auto-calculates expected balance)
router.post("/daily-closings", protect, restrictTo("OWNER", "MANAGER"), async (req: AuthenticatedRequest, res) => {
  const { closingDate, branchId, openingBalance, cashIn, cashOut, actualBalance, notes } = req.body;

  if (actualBalance === undefined || actualBalance === null) {
    return res.status(400).json({ error: "Actual balance is required." });
  }

  try {
    const targetDate = closingDate ? new Date(closingDate) : new Date();
    const startOfDay = new Date(targetDate);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(targetDate);
    endOfDay.setHours(23, 59, 59, 999);

    // Check if already closed
    const existing = await prisma.dailyClosing.findFirst({
      where: { closingDate: { gte: startOfDay, lte: endOfDay } }
    });
    if (existing) return res.status(400).json({ error: "Daily closing already exists for this date." });

    // Fetch sales for the day
    const salesAgg = await prisma.sale.aggregate({
      where: {
        saleDate: { gte: startOfDay, lte: endOfDay },
        paymentStatus: { not: "UNPAID" },
        ...(branchId ? { branchId } : {})
      },
      _sum: { paidAmount: true }
    });

    // Fetch expenses for the day
    const expenseAgg = await prisma.expense.aggregate({
      where: { date: { gte: startOfDay, lte: endOfDay } },
      _sum: { amount: true }
    });

    // Fetch returns for the day (sales with paymentStatus UNPAID that were returns)
    const totalSales = salesAgg._sum.paidAmount || 0;
    const totalExpenses = expenseAgg._sum.amount || 0;
    const totalReturns = 0; // Returns tracking can be enhanced later

    const ob = Number(openingBalance) || 0;
    const ci = Number(cashIn) || 0;
    const co = Number(cashOut) || 0;
    const expectedBalance = ob + totalSales + ci - totalExpenses - co - totalReturns;
    const variance = Number(actualBalance) - expectedBalance;

    const closing = await prisma.dailyClosing.create({
      data: {
        closingDate: startOfDay,
        branchId: branchId || null,
        openingBalance: ob,
        totalSales,
        totalExpenses,
        totalReturns,
        cashIn: ci,
        cashOut: co,
        expectedBalance,
        actualBalance: Number(actualBalance),
        variance,
        status: "CLOSED",
        notes: notes || null,
        closedBy: req.user?.id || null
      }
    });

    return res.status(201).json(closing);
  } catch (error: any) {
    return res.status(400).json({ error: error.message || "Failed to create daily closing." });
  }
});

// Get Daily Closing Summary (preview before closing)
router.get("/daily-closings/preview", protect, restrictTo("OWNER", "MANAGER"), async (req, res) => {
  const { date, branchId } = req.query;

  try {
    const targetDate = date ? new Date(String(date)) : new Date();
    const startOfDay = new Date(targetDate);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(targetDate);
    endOfDay.setHours(23, 59, 59, 999);

    const salesAgg = await prisma.sale.aggregate({
      where: {
        saleDate: { gte: startOfDay, lte: endOfDay },
        paymentStatus: { not: "UNPAID" },
        ...(branchId ? { branchId } : {})
      },
      _sum: { paidAmount: true },
      _count: { id: true }
    });

    const expenseAgg = await prisma.expense.aggregate({
      where: { date: { gte: startOfDay, lte: endOfDay } },
      _sum: { amount: true }
    });

    // Previous closing's closing date to determine opening balance
    const prevClosing = await prisma.dailyClosing.findFirst({
      where: { closingDate: { lt: startOfDay } },
      orderBy: { closingDate: "desc" }
    });

    const openingBalance = prevClosing?.actualBalance || 0;

    return res.json({
      date: startOfDay,
      openingBalance,
      totalSales: salesAgg._sum.paidAmount || 0,
      totalSalesCount: salesAgg._count.id || 0,
      totalExpenses: expenseAgg._sum.amount || 0,
      totalReturns: 0
    });
  } catch (error) {
    return res.status(500).json({ error: "Failed to generate closing preview." });
  }
});

export default router;
