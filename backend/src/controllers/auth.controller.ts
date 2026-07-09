import { Router, Response } from "express";
import * as bcrypt from "bcryptjs";
import * as jwt from "jsonwebtoken";
import prisma from "../utils/db";
import { protect, restrictTo, AuthenticatedRequest } from "../middleware/auth";
import { invalidateCache } from "../utils/cache";

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET || "super-secret-key-change-in-prod";

// Login
router.post("/login", async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: "Username and password are required." });
  }

  try {
    const user = await prisma.user.findUnique({
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

    const token = jwt.sign(
      {
        id: user.id,
        username: user.username,
        role: user.role,
        branchId: user.branchId
      },
      JWT_SECRET,
      { expiresIn: "24h" }
    );

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
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Internal server error." });
  }
});

// Get profile of logged-in user
router.get("/me", protect, async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) return res.status(401).json({ error: "Unauthorized." });

  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      include: { branch: true }
    });
    if (!user) return res.status(404).json({ error: "User not found." });

    return res.json(user);
  } catch (error) {
    return res.status(500).json({ error: "Internal server error." });
  }
});

// List all users (Staff Management)
router.get("/users", protect, restrictTo("OWNER", "MANAGER"), async (req, res) => {
  try {
    const users = await prisma.user.findMany({
      include: { branch: true },
      orderBy: { createdAt: "desc" }
    });
    return res.json(users);
  } catch (error) {
    return res.status(500).json({ error: "Internal server error." });
  }
});

// Create new staff user (OWNER only)
router.post("/users", protect, restrictTo("OWNER"), async (req, res) => {
  const { name, username, password, role, email, phone, branchId } = req.body;

  if (!name || !username || !password || !role) {
    return res.status(400).json({ error: "Name, username, password, and role are required." });
  }

  try {
    const existing = await prisma.user.findUnique({ where: { username } });
    if (existing) {
      return res.status(400).json({ error: "Username already exists." });
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    const newUser = await prisma.user.create({
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
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Internal server error." });
  }
});

// Update user details (OWNER only)
router.put("/users/:id", protect, restrictTo("OWNER"), async (req, res) => {
  const { id } = req.params;
  const { name, role, email, phone, branchId, isActive, password } = req.body;

  try {
    const data: any = {
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

    const updatedUser = await prisma.user.update({
      where: { id },
      data,
      include: { branch: true }
    });

    return res.json(updatedUser);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Internal server error." });
  }
});

// Toggle user status (Active / Inactive)
router.delete("/users/:id", protect, restrictTo("OWNER"), async (req, res) => {
  const { id } = req.params;
  try {
    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) return res.status(404).json({ error: "User not found." });

    const updated = await prisma.user.update({
      where: { id },
      data: { isActive: !user.isActive }
    });
    return res.json({ message: `User status set to ${updated.isActive ? "Active" : "Inactive"}.` });
  } catch (error) {
    return res.status(500).json({ error: "Internal server error." });
  }
});

// Get all branches
router.get("/branches", protect, async (req, res) => {
  try {
    const branches = await prisma.branch.findMany();
    return res.json(branches);
  } catch (error) {
    return res.status(500).json({ error: "Internal server error." });
  }
});

// Create new branch (OWNER only)
router.post("/branches", protect, restrictTo("OWNER"), async (req, res) => {
  const { name, address, phone } = req.body;
  if (!name) return res.status(400).json({ error: "Branch name is required." });
  try {
    const newBranch = await prisma.branch.create({
      data: { name, address, phone }
    });
    return res.status(201).json(newBranch);
  } catch (error) {
    return res.status(500).json({ error: "Internal server error." });
  }
});

// Update branch (OWNER only)
router.put("/branches/:id", protect, restrictTo("OWNER"), async (req, res) => {
  const { id } = req.params;
  const { name, address, phone } = req.body;
  if (!name) return res.status(400).json({ error: "Branch name is required." });
  try {
    const updatedBranch = await prisma.branch.update({
      where: { id },
      data: { name, address, phone }
    });
    return res.json(updatedBranch);
  } catch (error) {
    return res.status(500).json({ error: "Failed to update branch." });
  }
});

// Delete branch (OWNER only)
router.delete("/branches/:id", protect, restrictTo("OWNER"), async (req, res) => {
  const { id } = req.params;
  try {
    await prisma.branchStock.deleteMany({ where: { branchId: id } });
    await prisma.user.updateMany({ where: { branchId: id }, data: { branchId: null } });
    await prisma.dailyClosing.deleteMany({ where: { branchId: id } });
    await prisma.branch.delete({ where: { id } });
    return res.json({ message: "Branch deleted successfully." });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Failed to delete branch." });
  }
});

// Clear all transactions data but keep products, categories, brands, customers, suppliers, branches, users (OWNER only)
router.post("/reset-transactions", protect, restrictTo("OWNER"), async (req, res) => {
  try {
    await prisma.$transaction([
      // 1. Delete dependent transactional records
      prisma.activityLog.deleteMany({}),
      prisma.emiInstallment.deleteMany({}),
      prisma.saleEmi.deleteMany({}),
      prisma.saleItem.deleteMany({}),
      prisma.sale.deleteMany({}),
      
      prisma.warrantyClaim.deleteMany({}),
      prisma.repairJob.deleteMany({}),
      
      prisma.purchaseItem.deleteMany({}),
      prisma.purchaseOrder.deleteMany({}),
      
      prisma.supplierPayment.deleteMany({}),
      prisma.customerCreditPayment.deleteMany({}),
      prisma.expense.deleteMany({}),
      prisma.stockMovement.deleteMany({}),
      
      prisma.dailyClosing.deleteMany({}),
      prisma.transaction.deleteMany({}),
      
      // 2. Reset customer credit balances and reward points to 0
      prisma.customer.updateMany({
        data: {
          creditBalance: 0.0,
          rewardPoints: 0
        }
      }),

      // 3. Reset BankAccount balances to 0
      prisma.bankAccount.updateMany({
        data: {
          balance: 0.0
        }
      })
    ]);

    invalidateCache("reports:");

    return res.json({ message: "All transactions and sales history have been cleared successfully. Products, categories, and contacts have been preserved." });
  } catch (error) {
    console.error("Failed to reset transactions:", error);
    return res.status(500).json({ error: "Failed to clear transaction records." });
  }
});

export default router;
