import { Router, Response } from "express";
import prisma from "../utils/db";
import { protect, AuthenticatedRequest } from "../middleware/auth";

const router = Router();

// Process checkout sale
router.post("/", protect, async (req: AuthenticatedRequest, res: Response) => {
  const {
    customerId,
    items, // array of { productId, quantity, discount, tax, serialNumber, imei }
    paymentMethod, // 'CASH', 'CARD', 'MOBILE', 'SPLIT', 'CREDIT'
    paidAmount,
    discountAmount, // overall cart discount
    taxAmount, // overall cart tax
    notes
  } = req.body;

  if (!items || items.length === 0 || !paymentMethod || paidAmount === undefined) {
    return res.status(400).json({ error: "Missing checkout parameters." });
  }

  const branchId = req.user?.branchId;
  const cashierId = req.user?.id;

  if (!branchId || !cashierId) {
    return res.status(400).json({ error: "Cashier session lacks a designated branch location." });
  }

  try {
    const saleResult = await prisma.$transaction(async (tx) => {
      let subtotal = 0;

      // 1. Validate stocks and compute prices
      const itemsToCreate = [];
      const movementsToCreate = [];

      for (const item of items) {
        const prod = await tx.product.findUnique({ where: { id: item.productId } });
        if (!prod) throw new Error(`Product not found: ${item.productId}`);

        // Check branch stock
        const bStock = await tx.branchStock.findUnique({
          where: { branchId_productId: { branchId, productId: item.productId } }
        });

        if (!bStock || bStock.quantity < item.quantity) {
          throw new Error(`Insufficient stock for product ${prod.name} at this branch.`);
        }

        const itemUnitPrice = prod.sellingPrice;
        const itemDiscount = item.discount || 0; // percentage or fixed
        const itemTax = item.tax || 0;
        
        // Calculate item total
        const baseTotal = itemUnitPrice * item.quantity;
        const discValue = baseTotal * (itemDiscount / 100);
        const taxValue = (baseTotal - discValue) * (itemTax / 100);
        const itemTotal = baseTotal - discValue + taxValue;

        subtotal += itemTotal;

        itemsToCreate.push({
          productId: item.productId,
          quantity: item.quantity,
          unitPrice: itemUnitPrice,
          discount: itemDiscount,
          tax: itemTax,
          totalPrice: itemTotal,
          serialNumber: item.serialNumber || null,
          imei: item.imei || null
        });

        // Decrement branch stock
        await tx.branchStock.update({
          where: { branchId_productId: { branchId, productId: item.productId } },
          data: { quantity: { decrement: item.quantity } }
        });

        // Decrement product total stock
        await tx.product.update({
          where: { id: item.productId },
          data: { stockQuantity: { decrement: item.quantity } }
        });

        // Prepare stock movement
        movementsToCreate.push({
          productId: item.productId,
          quantity: -item.quantity,
          type: "OUT",
          branchId,
          notes: `POS sale checkout`
        });
      }

      // Calculate final payable amount
      const payableAmount = Math.max(0, subtotal - (discountAmount || 0) + (taxAmount || 0));
      
      // Determine payment status
      let paymentStatus = "PAID";
      let debt = 0;

      if (paymentMethod === "CREDIT") {
        if (!customerId) throw new Error("Customer profile is required for credit transactions.");
        debt = payableAmount;
        paymentStatus = "UNPAID";
      } else if (paidAmount < payableAmount) {
        debt = payableAmount - paidAmount;
        paymentStatus = "PARTIAL";
      }

      // Check customer credit limits
      if (debt > 0 && customerId) {
        const customer = await tx.customer.findUnique({ where: { id: customerId } });
        if (!customer) throw new Error("Customer profile not found.");

        const projectedBalance = customer.creditBalance + debt;
        if (projectedBalance > customer.creditLimit) {
          throw new Error(`Transaction exceeds customer's credit limit of Rs. ${customer.creditLimit}.`);
        }

        // Increase customer credit debt
        await tx.customer.update({
          where: { id: customerId },
          data: { creditBalance: projectedBalance }
        });
      }

      // Award reward points (e.g., 1 point per $10 spent)
      if (customerId) {
        const pointsEarned = Math.floor(payableAmount / 10);
        await tx.customer.update({
          where: { id: customerId },
          data: { rewardPoints: { increment: pointsEarned } }
        });
      }

      // Create Sale record
      const sale = await tx.sale.create({
        data: {
          customerId: customerId || null,
          cashierId,
          branchId,
          totalAmount: subtotal,
          discountAmount: discountAmount || 0.0,
          taxAmount: taxAmount || 0.0,
          payableAmount,
          paidAmount,
          paymentMethod,
          paymentStatus,
          notes,
          items: {
            create: itemsToCreate
          }
        },
        include: {
          items: { include: { product: true } },
          customer: true,
          cashier: true,
          branch: true
        }
      });

      // Insert movements
      for (const mv of movementsToCreate) {
        await tx.stockMovement.create({
          data: {
            ...mv,
            referenceId: sale.id
          }
        });
      }

      return sale;
    });

    return res.status(201).json(saleResult);
  } catch (error: any) {
    console.error(error);
    return res.status(400).json({ error: error.message || "Failed to process sale." });
  }
});

// List Sales History
router.get("/", protect, async (req, res) => {
  const { branchId, customerId } = req.query;
  try {
    const where: any = {};
    if (branchId) where.branchId = String(branchId);
    if (customerId) where.customerId = String(customerId);

    const sales = await prisma.sale.findMany({
      where,
      include: {
        customer: true,
        cashier: true,
        items: { include: { product: true } }
      },
      orderBy: { saleDate: "desc" }
    });
    return res.json(sales);
  } catch (error) {
    return res.status(500).json({ error: "Failed to load sales list." });
  }
});

// Fetch Single Sale Receipt
router.get("/:id", protect, async (req, res) => {
  const { id } = req.params;
  try {
    const sale = await prisma.sale.findUnique({
      where: { id },
      include: {
        customer: true,
        cashier: true,
        branch: true,
        items: {
          include: {
            product: { include: { category: true, brand: true } }
          }
        }
      }
    });

    if (!sale) return res.status(404).json({ error: "Receipt not found." });
    return res.json(sale);
  } catch (error) {
    return res.status(500).json({ error: "Failed to load sale receipt." });
  }
});

// Process Returns & Refund
router.post("/returns", protect, async (req, res) => {
  const { saleId, items } = req.body; // items: array of { productId, quantity, reason }

  if (!saleId || !items || items.length === 0) {
    return res.status(400).json({ error: "Missing refund parameters." });
  }

  try {
    const refundResult = await prisma.$transaction(async (tx) => {
      const sale = await tx.sale.findUnique({
        where: { id: saleId },
        include: { items: true, customer: true }
      });

      if (!sale) throw new Error("Original sale record not found.");

      let refundValue = 0;

      for (const item of items) {
        const originalItem = sale.items.find(si => si.productId === item.productId);
        if (!originalItem) throw new Error(`Product ${item.productId} was not part of this sale.`);

        if (originalItem.quantity < item.quantity) {
          throw new Error("Cannot return more quantity than originally purchased.");
        }

        // Calculate proportional refund amount
        const itemRefundPrice = (originalItem.totalPrice / originalItem.quantity) * item.quantity;
        refundValue += itemRefundPrice;

        // Restore stock to branch
        await tx.branchStock.update({
          where: { branchId_productId: { branchId: sale.branchId, productId: item.productId } },
          data: { quantity: { increment: item.quantity } }
        });

        // Restore aggregated stock
        await tx.product.update({
          where: { id: item.productId },
          data: { stockQuantity: { increment: item.quantity } }
        });

        // Log movement
        await tx.stockMovement.create({
          data: {
            productId: item.productId,
            quantity: item.quantity,
            type: "RETURN",
            branchId: sale.branchId,
            referenceId: saleId,
            notes: `Customer return: ${item.reason || "No reason provided"}`
          }
        });
      }

      // Adjust customer credit if purchased on credit or reduce paid amount
      if (sale.customerId && sale.paymentMethod === "CREDIT") {
        const customer = await tx.customer.findUnique({ where: { id: sale.customerId } });
        if (customer) {
          const newCreditBal = Math.max(0, customer.creditBalance - refundValue);
          await tx.customer.update({
            where: { id: sale.customerId },
            data: { creditBalance: newCreditBal }
          });
        }
      }

      // Log activity
      return { success: true, refundedAmount: refundValue };
    });

    return res.json(refundResult);
  } catch (error: any) {
    console.error(error);
    return res.status(400).json({ error: error.message || "Failed to process return." });
  }
});

export default router;
