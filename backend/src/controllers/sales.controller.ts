import { Router, Response } from "express";
import prisma from "../utils/db";
import { protect, AuthenticatedRequest } from "../middleware/auth";
import { invalidateCache } from "../utils/cache";
import multer from "multer";
import path from "path";

const router = Router();

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, "../../public/uploads"));
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, file.fieldname + "-" + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    const filetypes = /jpeg|jpg|png|pdf/;
    const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = filetypes.test(file.mimetype);
    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error("Only images (jpeg, jpg, png) and PDF documents are allowed!"));
    }
  }
});

const roundMoney = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

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

  let branchId = req.body.branchId || req.user?.branchId;
  const cashierId = req.user?.id;

  if (!cashierId) {
    return res.status(400).json({ error: "Cashier session is required." });
  }

  // Validate the branch once and fall back to the authenticated branch if needed.
  if (branchId) {
    const branchExists = await prisma.branch.findUnique({
      where: { id: branchId },
      select: { id: true }
    });
    if (!branchExists) {
      branchId = req.user?.branchId || null;
    }
  }

  if (!branchId) {
    return res.status(400).json({ error: "Cashier session lacks a designated branch location." });
  }

  const activeBranch = await prisma.branch.findUnique({
    where: { id: branchId },
    select: { id: true }
  });
  if (!activeBranch) {
    return res.status(400).json({ error: "Designated branch location does not exist in database." });
  }

  const taxSettings = await prisma.systemSetting.findMany({
    where: { key: { in: ["gstEnabled", "gstRate"] } },
    select: { key: true, value: true }
  });
  const settingsMap = new Map(taxSettings.map((setting) => [setting.key, setting.value]));
  const gstEnabled = settingsMap.get("gstEnabled") === "true";
  const gstRate = gstEnabled ? parseFloat(settingsMap.get("gstRate") || "0") || 0 : 0;

  try {
    const normalizedPaidAmount = roundMoney(Number(paidAmount) || 0);
    const normalizedDiscountAmount = roundMoney(Number(discountAmount) || 0);

    const saleResult = await prisma.$transaction(async (tx) => {
      let subtotal = 0;
      let computedTaxAmount = 0;
      const productIds: string[] = Array.from(new Set(items.map((item: any) => String(item.productId))));
      const [products, branchStocks] = await Promise.all([
        tx.product.findMany({
          where: { id: { in: productIds } },
          select: {
            id: true,
            name: true,
            sellingPrice: true
          }
        }),
        tx.branchStock.findMany({
          where: {
            branchId,
            productId: { in: productIds }
          },
          select: {
            productId: true,
            quantity: true
          }
        })
      ]);

      const productMap = new Map(products.map((product) => [product.id, product]));
      const branchStockMap = new Map(branchStocks.map((stock) => [stock.productId, stock.quantity]));

      // 1. Validate stocks and compute prices
      const itemsToCreate: any[] = [];
      const movementsToCreate: any[] = [];

      for (const item of items) {
        const prod = productMap.get(item.productId);
        if (!prod) throw new Error(`Product not found: ${item.productId}`);

        // Check branch stock
        const currentBranchQty = branchStockMap.get(item.productId) || 0;
        if (currentBranchQty < item.quantity) {
          throw new Error(`Insufficient stock for product ${prod.name} at this branch.`);
        }

        const itemUnitPrice = prod.sellingPrice;
        const itemDiscount = item.discount || 0;
        const itemTax = gstRate;
        
        // Calculate item total
        const baseTotal = itemUnitPrice * item.quantity;
        const discValue = baseTotal * (itemDiscount / 100);
        const taxValue = roundMoney((baseTotal - discValue) * (itemTax / 100));
        const lineSubtotal = roundMoney(baseTotal - discValue);
        const itemTotal = roundMoney(lineSubtotal + taxValue);

        subtotal += lineSubtotal;
        computedTaxAmount += taxValue;

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

        // Prepare stock movement
        movementsToCreate.push({
          productId: item.productId,
          quantity: -item.quantity,
          type: "OUT",
          branchId,
          notes: `POS sale checkout`
        });
      }

      await Promise.all(
        items.map((item: any) =>
          Promise.all([
            tx.branchStock.update({
              where: { branchId_productId: { branchId, productId: item.productId } },
              data: { quantity: { decrement: item.quantity } }
            }),
            tx.product.update({
              where: { id: item.productId },
              data: { stockQuantity: { decrement: item.quantity } }
            })
          ])
        )
      );

      // Calculate final payable amount
      subtotal = roundMoney(subtotal);
      computedTaxAmount = roundMoney(computedTaxAmount);
      const payableAmount = roundMoney(Math.max(0, subtotal - normalizedDiscountAmount + computedTaxAmount));
      
      // Determine payment status
      let paymentStatus = "PAID";
      let debt = 0;
      const remainingAfterPayment = roundMoney(Math.max(0, payableAmount - normalizedPaidAmount));

      if (paymentMethod === "CREDIT") {
        if (!customerId) throw new Error("Customer profile is required for credit transactions.");
        debt = payableAmount;
        paymentStatus = "UNPAID";
      } else if (paymentMethod === "EMI") {
        if (!customerId) throw new Error("Customer profile is required for EMI transactions.");
        debt = remainingAfterPayment;
        paymentStatus = normalizedPaidAmount > 0 ? (remainingAfterPayment === 0 ? "PAID" : "PARTIAL") : "UNPAID";
      } else if (remainingAfterPayment > 0) {
        debt = remainingAfterPayment;
        paymentStatus = "PARTIAL";
      }

      // Check customer credit limits
      if (debt > 0 && customerId) {
        const customer = await tx.customer.findUnique({ where: { id: customerId } });
        if (!customer) throw new Error("Customer profile not found.");

        const projectedBalance = roundMoney(customer.creditBalance + debt);
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
          discountAmount: normalizedDiscountAmount,
          taxAmount: computedTaxAmount,
          payableAmount,
          paidAmount: normalizedPaidAmount,
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
      await tx.stockMovement.createMany({
        data: movementsToCreate.map((mv) => ({
          ...mv,
          referenceId: sale.id
        }))
      });

      return sale;
    });

    invalidateCache("reports:");
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
        items: { include: { product: true } },
        emiDetails: { include: { installments: true } },
        returns: {
          where: { status: "COMPLETED" },
          include: { items: true }
        }
      },
      orderBy: { saleDate: "desc" }
    });
    return res.json(sales);
  } catch (error: any) {
    console.error("Failed to load sales list:", error);
    return res.status(500).json({
      error: "Failed to load sales list.",
      detail: error?.message || String(error)
    });
  }
});

// Map bank account type for refund method
const refundMethodToAccountType: Record<string, string> = {
  CASH: "CASH",
  CARD: "BANK",
  MOBILE: "MOBILE_WALLET"
};

// List all completed returns (must be before /:id)
router.get("/returns", protect, async (req, res) => {
  const { branchId, saleId } = req.query;
  try {
    const where: any = { status: "COMPLETED" };
    if (saleId) where.saleId = String(saleId);
    if (branchId) where.sale = { branchId: String(branchId) };

    const returns = await prisma.saleReturn.findMany({
      where,
      include: {
        processedBy: { select: { id: true, name: true, username: true } },
        items: { include: { product: { select: { id: true, name: true, sku: true } } } },
        sale: {
          include: {
            customer: true,
            branch: true,
            cashier: { select: { id: true, name: true } }
          }
        }
      },
      orderBy: { returnDate: "desc" }
    });
    return res.json(returns);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Failed to load returns list." });
  }
});

// Get single return voucher
router.get("/returns/:returnId", protect, async (req, res) => {
  try {
    const saleReturn = await prisma.saleReturn.findUnique({
      where: { id: req.params.returnId },
      include: {
        processedBy: { select: { id: true, name: true, username: true } },
        items: { include: { product: true } },
        sale: {
          include: {
            customer: true,
            branch: true,
            cashier: { select: { id: true, name: true } },
            items: { include: { product: true } }
          }
        }
      }
    });
    if (!saleReturn) return res.status(404).json({ error: "Return record not found." });
    return res.json(saleReturn);
  } catch (error) {
    return res.status(500).json({ error: "Failed to load return detail." });
  }
});

// Sale return eligibility preview (returnable qty remaining per line)
router.get("/:id/returnable", protect, async (req, res) => {
  try {
    const sale = await prisma.sale.findUnique({
      where: { id: req.params.id },
      include: {
        customer: true,
        branch: true,
        cashier: { select: { id: true, name: true } },
        items: { include: { product: true } },
        returns: {
          where: { status: "COMPLETED" },
          include: { items: true }
        },
        emiDetails: { include: { installments: true } }
      }
    });
    if (!sale) return res.status(404).json({ error: "Sale not found." });

    const returnedByProduct = new Map<string, number>();
    let alreadyRefunded = 0;
    for (const ret of sale.returns) {
      alreadyRefunded += ret.refundAmount;
      for (const ri of ret.items) {
        returnedByProduct.set(ri.productId, (returnedByProduct.get(ri.productId) || 0) + ri.quantity);
      }
    }

    const itemsSum = sale.items.reduce((s, i) => s + i.totalPrice, 0) || 1;
    const lines = sale.items.map((item) => {
      const alreadyReturned = returnedByProduct.get(item.productId) || 0;
      const remainingQty = Math.max(0, item.quantity - alreadyReturned);
      const lineShareOfPayable = (item.totalPrice / itemsSum) * sale.payableAmount;
      const unitRefund = item.quantity > 0 ? lineShareOfPayable / item.quantity : 0;
      return {
        saleItemId: item.id,
        productId: item.productId,
        product: item.product,
        originalQty: item.quantity,
        alreadyReturned,
        remainingQty,
        unitPrice: item.unitPrice,
        unitRefund: roundMoney(unitRefund),
        lineTotal: item.totalPrice,
        serialNumber: item.serialNumber,
        imei: item.imei
      };
    });

    return res.json({
      sale: {
        id: sale.id,
        saleDate: sale.saleDate,
        payableAmount: sale.payableAmount,
        paidAmount: sale.paidAmount,
        paymentMethod: sale.paymentMethod,
        paymentStatus: sale.paymentStatus,
        returnStatus: sale.returnStatus,
        discountAmount: sale.discountAmount,
        taxAmount: sale.taxAmount,
        totalAmount: sale.totalAmount,
        customer: sale.customer,
        branch: sale.branch,
        cashier: sale.cashier,
        emiDetails: sale.emiDetails
      },
      alreadyRefunded: roundMoney(alreadyRefunded),
      maxRefundable: roundMoney(Math.max(0, sale.payableAmount - alreadyRefunded)),
      lines
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Failed to load returnable items." });
  }
});

// Process Returns & Refund
router.post("/returns", protect, async (req: AuthenticatedRequest, res: Response) => {
  const {
    saleId,
    items, // [{ saleItemId?, productId, quantity, reason? }]
    refundMethod, // CASH | CARD | MOBILE | CREDIT_ADJUST
    reason,
    notes
  } = req.body;

  if (!saleId || !items || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: "Missing refund parameters (saleId and items required)." });
  }

  const processedById = req.user?.id;
  if (!processedById) {
    return res.status(401).json({ error: "Authenticated staff session required." });
  }

  const allowedMethods = ["CASH", "CARD", "MOBILE", "CREDIT_ADJUST"];
  const method = String(refundMethod || "CASH").toUpperCase();
  if (!allowedMethods.includes(method)) {
    return res.status(400).json({ error: "Invalid refund method." });
  }

  try {
    const refundResult = await prisma.$transaction(async (tx) => {
      const sale = await tx.sale.findUnique({
        where: { id: saleId },
        include: {
          items: { include: { product: true } },
          customer: true,
          returns: {
            where: { status: "COMPLETED" },
            include: { items: true }
          },
          emiDetails: { include: { installments: true } }
        }
      });

      if (!sale) throw new Error("Original sale record not found.");
      if (sale.returnStatus === "FULL") throw new Error("This invoice has already been fully returned.");

      // Aggregate previously returned quantities per product
      const returnedByProduct = new Map<string, number>();
      let alreadyRefunded = 0;
      for (const ret of sale.returns) {
        alreadyRefunded += ret.refundAmount;
        for (const ri of ret.items) {
          returnedByProduct.set(ri.productId, (returnedByProduct.get(ri.productId) || 0) + ri.quantity);
        }
      }

      const itemsSum = sale.items.reduce((s, i) => s + i.totalPrice, 0) || 1;
      const returnItemsToCreate: {
        saleItemId: string | null;
        productId: string;
        quantity: number;
        unitRefund: number;
        totalRefund: number;
        reason: string | null;
      }[] = [];

      let refundValue = 0;

      for (const item of items) {
        const qty = Number(item.quantity);
        if (!item.productId || !Number.isFinite(qty) || qty <= 0) {
          throw new Error("Each return line needs a valid productId and quantity.");
        }

        const originalItem = sale.items.find(
          (si) => si.productId === item.productId || (item.saleItemId && si.id === item.saleItemId)
        );
        if (!originalItem) {
          throw new Error(`Product was not part of this sale.`);
        }

        const alreadyReturned = returnedByProduct.get(originalItem.productId) || 0;
        const remainingQty = originalItem.quantity - alreadyReturned;
        if (qty > remainingQty) {
          throw new Error(
            `Cannot return ${qty} of ${originalItem.product?.name || originalItem.productId}. Only ${remainingQty} remaining.`
          );
        }

        const lineShareOfPayable = (originalItem.totalPrice / itemsSum) * sale.payableAmount;
        const unitRefund = originalItem.quantity > 0 ? lineShareOfPayable / originalItem.quantity : 0;
        const lineRefund = roundMoney(unitRefund * qty);

        refundValue += lineRefund;
        returnedByProduct.set(originalItem.productId, alreadyReturned + qty);

        returnItemsToCreate.push({
          saleItemId: originalItem.id,
          productId: originalItem.productId,
          quantity: qty,
          unitRefund: roundMoney(unitRefund),
          totalRefund: lineRefund,
          reason: item.reason || reason || null
        });

        // Restore stock (upsert branch stock if missing)
        const branchStock = await tx.branchStock.findUnique({
          where: { branchId_productId: { branchId: sale.branchId, productId: originalItem.productId } }
        });
        if (branchStock) {
          await tx.branchStock.update({
            where: { branchId_productId: { branchId: sale.branchId, productId: originalItem.productId } },
            data: { quantity: { increment: qty } }
          });
        } else {
          await tx.branchStock.create({
            data: { branchId: sale.branchId, productId: originalItem.productId, quantity: qty }
          });
        }

        await tx.product.update({
          where: { id: originalItem.productId },
          data: { stockQuantity: { increment: qty } }
        });

        await tx.stockMovement.create({
          data: {
            productId: originalItem.productId,
            quantity: qty,
            type: "RETURN",
            branchId: sale.branchId,
            referenceId: saleId,
            notes: `Customer return: ${item.reason || reason || "No reason provided"}`
          }
        });
      }

      refundValue = roundMoney(refundValue);
      const maxRefundable = roundMoney(Math.max(0, sale.payableAmount - alreadyRefunded));
      if (refundValue > maxRefundable + 0.01) {
        throw new Error(`Refund amount exceeds remaining refundable balance (Rs. ${maxRefundable.toFixed(2)}).`);
      }

      // Credit still owed on this invoice (unpaid portion)
      const priorDebt = roundMoney(Math.max(0, sale.payableAmount - sale.paidAmount));
      // Portion of this return that clears unpaid balance first
      const creditPortion = roundMoney(Math.min(refundValue, priorDebt));
      const cashPortion = roundMoney(Math.max(0, refundValue - creditPortion));

      // Customer credit balance: reduce debt for unpaid portion; CREDIT_ADJUST can also cover cash portion
      if (sale.customerId && (creditPortion > 0 || method === "CREDIT_ADJUST")) {
        const creditReduce =
          method === "CREDIT_ADJUST" ? refundValue : creditPortion;
        if (creditReduce > 0) {
          const customer = await tx.customer.findUnique({ where: { id: sale.customerId } });
          if (customer) {
            await tx.customer.update({
              where: { id: sale.customerId },
              data: {
                creditBalance: Math.max(0, roundMoney(customer.creditBalance - creditReduce))
              }
            });
          }
        }
      }

      // Cash / card / mobile refund out of till or bank (only the paid portion)
      const cashOutAmount = method === "CREDIT_ADJUST" ? 0 : cashPortion;
      if (cashOutAmount > 0) {
        const accountType = refundMethodToAccountType[method] || "CASH";
        let bankAccount = await tx.bankAccount.findFirst({
          where: { type: accountType, isActive: true }
        });
        if (!bankAccount && accountType !== "CASH") {
          bankAccount = await tx.bankAccount.findFirst({
            where: { type: "CASH", isActive: true }
          });
        }
        if (bankAccount) {
          await tx.transaction.create({
            data: {
              bankAccountId: bankAccount.id,
              type: "EXPENSE",
              category: "SALE",
              amount: cashOutAmount,
              referenceType: "SALE",
              referenceId: saleId,
              description: `Refund for return on Invoice #${saleId.substring(0, 8)}`,
              branchId: sale.branchId,
              createdBy: processedById
            }
          });
          await tx.bankAccount.update({
            where: { id: bankAccount.id },
            data: { balance: { decrement: cashOutAmount } }
          });
        }
      }

      // Create return voucher
      const saleReturn = await tx.saleReturn.create({
        data: {
          saleId,
          processedById,
          refundAmount: refundValue,
          refundMethod: method,
          reason: reason || null,
          notes: notes || null,
          status: "COMPLETED",
          items: { create: returnItemsToCreate }
        },
        include: {
          items: { include: { product: true } },
          processedBy: { select: { id: true, name: true } },
          sale: {
            include: {
              customer: true,
              branch: true
            }
          }
        }
      });

      // Update return status on sale
      const allFullyReturned = sale.items.every((si) => {
        const retQty = returnedByProduct.get(si.productId) || 0;
        return retQty >= si.quantity;
      });
      const anyReturned = [...returnedByProduct.values()].some((q) => q > 0);
      const newReturnStatus = allFullyReturned ? "FULL" : anyReturned ? "PARTIAL" : "NONE";

      // Adjust paidAmount downward for cash refunded portion so history stays coherent
      const newPaidAmount = roundMoney(Math.max(0, sale.paidAmount - cashOutAmount));
      let newPaymentStatus = sale.paymentStatus;
      if (newReturnStatus === "FULL") {
        newPaymentStatus = "PAID"; // fully settled via return
      } else if (newPaidAmount <= 0 && priorDebt - creditPortion > 0) {
        newPaymentStatus = "UNPAID";
      } else if (newPaidAmount < sale.payableAmount - alreadyRefunded - refundValue) {
        newPaymentStatus = "PARTIAL";
      }

      await tx.sale.update({
        where: { id: saleId },
        data: {
          returnStatus: newReturnStatus,
          paidAmount: newPaidAmount,
          paymentStatus: newPaymentStatus,
          notes: sale.notes
            ? `${sale.notes}\n[Return ${saleReturn.id.substring(0, 8)}] Rs.${refundValue.toFixed(2)} via ${method}`
            : `[Return ${saleReturn.id.substring(0, 8)}] Rs.${refundValue.toFixed(2)} via ${method}`
        }
      });

      // Full return on EMI: cancel remaining unpaid installments
      if (newReturnStatus === "FULL" && sale.emiDetails) {
        await tx.emiInstallment.updateMany({
          where: { saleEmiId: sale.emiDetails.id, status: { not: "PAID" } },
          data: { status: "PAID", amountPaid: 0, paidDate: new Date() }
        });
        // Mark cancelled-style via COMPLETED after full return
        await tx.saleEmi.update({
          where: { id: sale.emiDetails.id },
          data: { status: "COMPLETED" }
        });
      }

      // Activity log
      await tx.activityLog.create({
        data: {
          userId: processedById,
          action: "SALE_RETURN",
          details: `Processed return Rs.${refundValue.toFixed(2)} on sale ${saleId.substring(0, 8)} via ${method}`
        }
      });

      return {
        ...saleReturn,
        cashRefunded: cashOutAmount,
        creditAdjusted: method === "CREDIT_ADJUST" ? refundValue : creditPortion
      };
    });

    invalidateCache("reports:");
    return res.status(201).json(refundResult);
  } catch (error: any) {
    console.error(error);
    return res.status(400).json({ error: error.message || "Failed to process return." });
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
        },
        emiDetails: { include: { installments: true } },
        returns: {
          where: { status: "COMPLETED" },
          include: {
            items: { include: { product: true } },
            processedBy: { select: { id: true, name: true } }
          },
          orderBy: { returnDate: "desc" }
        }
      }
    });

    if (!sale) return res.status(404).json({ error: "Receipt not found." });
    return res.json(sale);
  } catch (error) {
    return res.status(500).json({ error: "Failed to load sale receipt." });
  }
});

// Create EMI Agreement contract and installments schedule
router.post(
  "/:id/emi",
  protect,
  upload.fields([
    { name: "cnicFront", maxCount: 1 },
    { name: "cnicBack", maxCount: 1 },
    { name: "cheque", maxCount: 1 }
  ]),
  async (req: AuthenticatedRequest, res: Response) => {
    const { id } = req.params;
    const {
      guarantorName,
      guarantorPhone,
      guarantorAddress,
      months,
      interestRate,
      downPayment
    } = req.body;

    if (!guarantorName || !guarantorPhone || !guarantorAddress || !months || !downPayment) {
      return res.status(400).json({ error: "Missing guarantor or plan details." });
    }

    const files = req.files as { [fieldname: string]: Express.Multer.File[] };
    if (!files || !files.cnicFront || !files.cnicBack || !files.cheque) {
      return res.status(400).json({ error: "Please upload CNIC Front, CNIC Back, and Bank Cheque documents." });
    }

    const cnicFrontPath = `/uploads/${files.cnicFront[0].filename}`;
    const cnicBackPath = `/uploads/${files.cnicBack[0].filename}`;
    const chequePath = `/uploads/${files.cheque[0].filename}`;

    try {
      const parsedMonths = parseInt(months);
      const parsedInterest = parseFloat(interestRate || "0");
      const parsedDown = roundMoney(parseFloat(downPayment));

      if (![3, 6, 12].includes(parsedMonths)) {
        return res.status(400).json({ error: "EMI tenure must be 3, 6, or 12 months." });
      }
      if (Number.isNaN(parsedInterest) || parsedInterest < 0) {
        return res.status(400).json({ error: "Markup rate must be a valid non-negative number." });
      }
      if (Number.isNaN(parsedDown) || parsedDown < 0) {
        return res.status(400).json({ error: "Down payment must be a valid non-negative amount." });
      }

      const sale = await prisma.sale.findUnique({
        where: { id },
        include: {
          emiDetails: true,
          customer: true
        }
      });

      if (!sale) {
        return res.status(404).json({ error: "Sale transaction not found." });
      }
      if (sale.paymentMethod !== "EMI") {
        return res.status(400).json({ error: "This sale is not marked for EMI processing." });
      }
      if (sale.emiDetails) {
        return res.status(400).json({ error: "An EMI contract already exists for this sale." });
      }

      const markupAmount = roundMoney(sale.payableAmount * (parsedInterest / 100));
      const totalPrincipal = roundMoney(sale.payableAmount + markupAmount);
      if (parsedDown > totalPrincipal) {
        return res.status(400).json({ error: "Down payment cannot exceed the financed principal." });
      }
      const remainingBalance = roundMoney(totalPrincipal - parsedDown);
      const monthlyPayment = roundMoney(remainingBalance / parsedMonths);
      const updatedPaidAmount = roundMoney(sale.paidAmount + parsedDown);
      const updatedPaymentStatus =
        updatedPaidAmount >= totalPrincipal ? "PAID" : updatedPaidAmount > 0 ? "PARTIAL" : "UNPAID";
      const previousOutstanding = roundMoney(Math.max(0, sale.payableAmount - sale.paidAmount));
      const updatedOutstanding = roundMoney(Math.max(0, totalPrincipal - updatedPaidAmount));
      const creditBalanceDelta = roundMoney(updatedOutstanding - previousOutstanding);

      const installmentsToCreate: Array<{
        installmentNumber: number;
        dueDate: Date;
        amount: number;
        status: string;
      }> = [];
      const now = new Date();

      for (let i = 1; i <= parsedMonths; i++) {
        const dueDate = new Date();
        dueDate.setDate(now.getDate() + i * 30);

        installmentsToCreate.push({
          installmentNumber: i,
          dueDate,
          amount: monthlyPayment,
          status: "PENDING"
        });
      }

      const emiContract = await prisma.$transaction(async (tx) => {
        await tx.sale.update({
          where: { id },
          data: {
            payableAmount: totalPrincipal,
            paidAmount: updatedPaidAmount,
            paymentStatus: updatedPaymentStatus,
            notes: `${sale.notes || ""}\n[EMI Plan Activated: ${parsedMonths} months at ${parsedInterest}% markup]`
          }
        });

        if (sale.customerId && creditBalanceDelta !== 0) {
          await tx.customer.update({
            where: { id: sale.customerId },
            data: {
              creditBalance: { increment: creditBalanceDelta }
            }
          });
        }

        const createdContract = await tx.saleEmi.create({
          data: {
            saleId: id,
            guarantorName,
            guarantorPhone,
            guarantorAddress,
            cnicFrontPath,
            cnicBackPath,
            chequePath,
            months: parsedMonths,
            interestRate: parsedInterest,
            downPayment: parsedDown,
            totalPrincipal,
            monthlyPayment,
            status: updatedOutstanding === 0 ? "COMPLETED" : "ACTIVE",
            installments: {
              create: installmentsToCreate
            }
          },
          include: {
            installments: true
          }
        });

        if (parsedDown > 0) {
          const bankAccount = await tx.bankAccount.findFirst({
            where: { type: "CASH", isActive: true }
          });
          if (bankAccount) {
            await tx.transaction.create({
              data: {
                bankAccountId: bankAccount.id,
                type: "INCOME",
                category: "CREDIT_PAYMENT",
                amount: parsedDown,
                referenceType: "SALE",
                referenceId: id,
                description: `EMI Down Payment collected for Invoice #${id.substring(0,8)}`,
                branchId: sale.branchId
              }
            });
            await tx.bankAccount.update({
              where: { id: bankAccount.id },
              data: { balance: { increment: parsedDown } }
            });
          }
        }

        return createdContract;
      });

      invalidateCache("reports:");
      return res.status(201).json(emiContract);
    } catch (err: any) {
      console.error(err);
      return res.status(500).json({ error: "Failed to create monthly installment agreement." });
    }
  }
);

// Collect monthly installment payment
router.post(
  "/:id/installments/:installmentId/pay",
  protect,
  async (req: AuthenticatedRequest, res: Response) => {
    const { id, installmentId } = req.params;

    try {
      const installment = await prisma.emiInstallment.findUnique({
        where: { id: installmentId },
        include: { saleEmi: true }
      });

      if (!installment || installment.saleEmi.saleId !== id) {
        return res.status(404).json({ error: "Installment record not found." });
      }

      if (installment.status === "PAID") {
        return res.status(400).json({ error: "Installment is already fully paid." });
      }

      const sale = await prisma.sale.findUnique({
        where: { id },
        include: {
          customer: true,
          emiDetails: true
        }
      });
      if (!sale || !sale.emiDetails) {
        return res.status(404).json({ error: "Parent EMI sale record not found." });
      }
      const branchId = sale.branchId || null;

      const updatedInstallment = await prisma.$transaction(async (tx) => {
        const paidInstallment = await tx.emiInstallment.update({
          where: { id: installmentId },
          data: {
            status: "PAID",
            amountPaid: installment.amount,
            paidDate: new Date()
          }
        });

        const allInstallments = await tx.emiInstallment.findMany({
          where: { saleEmiId: installment.saleEmiId }
        });
        const allPaid = allInstallments.every((inst) => inst.status === "PAID");
        const updatedPaidAmount = roundMoney(sale.paidAmount + installment.amount);
        const updatedPaymentStatus = updatedPaidAmount >= sale.payableAmount ? "PAID" : "PARTIAL";

        await tx.sale.update({
          where: { id },
          data: {
            paidAmount: updatedPaidAmount,
            paymentStatus: updatedPaymentStatus
          }
        });

        if (sale.customerId) {
          await tx.customer.update({
            where: { id: sale.customerId },
            data: {
              creditBalance: { decrement: installment.amount }
            }
          });
        }

        await tx.saleEmi.update({
          where: { id: installment.saleEmiId },
          data: { status: allPaid ? "COMPLETED" : "ACTIVE" }
        });

        const bankAccount = await tx.bankAccount.findFirst({
          where: { type: "CASH", isActive: true }
        });
        if (bankAccount) {
          await tx.transaction.create({
            data: {
              bankAccountId: bankAccount.id,
              type: "INCOME",
              category: "CREDIT_PAYMENT",
              amount: installment.amount,
              referenceType: "SALE",
              referenceId: id,
              description: `EMI Installment #${installment.installmentNumber} payment collected for Invoice #${id.substring(0,8)}`,
              branchId
            }
          });
          await tx.bankAccount.update({
            where: { id: bankAccount.id },
            data: { balance: { increment: installment.amount } }
          });
        }

        return paidInstallment;
      });

      invalidateCache("reports:");
      return res.json(updatedInstallment);
    } catch (err: any) {
      console.error(err);
      return res.status(500).json({ error: "Failed to collect installment payment." });
    }
  }
);

export default router;
