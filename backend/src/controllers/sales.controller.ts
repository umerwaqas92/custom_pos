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
        const taxValue = (baseTotal - discValue) * (itemTax / 100);
        const lineSubtotal = baseTotal - discValue;
        const itemTotal = lineSubtotal + taxValue;

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
      const payableAmount = Math.max(0, subtotal - (discountAmount || 0) + computedTaxAmount);
      
      // Determine payment status
      let paymentStatus = "PAID";
      let debt = 0;

      if (paymentMethod === "CREDIT") {
        if (!customerId) throw new Error("Customer profile is required for credit transactions.");
        debt = payableAmount;
        paymentStatus = "UNPAID";
      } else if (paymentMethod === "EMI") {
        if (!customerId) throw new Error("Customer profile is required for EMI transactions.");
        debt = Math.max(0, payableAmount - paidAmount);
        paymentStatus = paidAmount > 0 ? "PARTIAL" : "UNPAID";
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
          taxAmount: computedTaxAmount,
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
        emiDetails: { include: { installments: true } }
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
        },
        emiDetails: { include: { installments: true } }
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

    invalidateCache("reports:");
    return res.json(refundResult);
  } catch (error: any) {
    console.error(error);
    return res.status(400).json({ error: error.message || "Failed to process return." });
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
      const parsedDown = parseFloat(downPayment);

      const sale = await prisma.sale.findUnique({
        where: { id }
      });

      if (!sale) {
        return res.status(404).json({ error: "Sale transaction not found." });
      }

      const markupAmount = sale.payableAmount * (parsedInterest / 100);
      const totalPrincipal = sale.payableAmount + markupAmount;
      const remainingBalance = totalPrincipal - parsedDown;
      const monthlyPayment = remainingBalance / parsedMonths;

      // Update total sale price with interest rate markup
      await prisma.sale.update({
        where: { id },
        data: {
          payableAmount: totalPrincipal,
          notes: `${sale.notes || ""}\n[EMI Plan Activated: ${parsedMonths} months at ${parsedInterest}% markup]`
        }
      });

      // Generate schedule
      const installmentsToCreate = [];
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

      const emiContract = await prisma.saleEmi.create({
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
          status: "ACTIVE",
          installments: {
            create: installmentsToCreate
          }
        },
        include: {
          installments: true
        }
      });

      // Log Down Payment in bank transactions
      if (parsedDown > 0) {
        const bankAccount = await prisma.bankAccount.findFirst({
          where: { type: "CASH", isActive: true }
        });
        if (bankAccount) {
          await prisma.transaction.create({
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
          await prisma.bankAccount.update({
            where: { id: bankAccount.id },
            data: { balance: { increment: parsedDown } }
          });
        }
      }

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

      const updatedInstallment = await prisma.emiInstallment.update({
        where: { id: installmentId },
        data: {
          status: "PAID",
          amountPaid: installment.amount,
          paidDate: new Date()
        }
      });

      const allInstallments = await prisma.emiInstallment.findMany({
        where: { saleEmiId: installment.saleEmiId }
      });

      const allPaid = allInstallments.every((inst) => inst.status === "PAID");

      if (allPaid) {
        await prisma.saleEmi.update({
          where: { id: installment.saleEmiId },
          data: { status: "COMPLETED" }
        });

        await prisma.sale.update({
          where: { id },
          data: { paymentStatus: "PAID" }
        });
      } else {
        await prisma.sale.update({
          where: { id },
          data: { paymentStatus: "PARTIAL" }
        });
      }

      const sale = await prisma.sale.findUnique({ where: { id } });
      const branchId = sale?.branchId || null;

      const bankAccount = await prisma.bankAccount.findFirst({
        where: { type: "CASH", isActive: true }
      });
      if (bankAccount) {
        await prisma.transaction.create({
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
        await prisma.bankAccount.update({
          where: { id: bankAccount.id },
          data: { balance: { increment: installment.amount } }
        });
      }

      invalidateCache("reports:");
      return res.json(updatedInstallment);
    } catch (err: any) {
      console.error(err);
      return res.status(500).json({ error: "Failed to collect installment payment." });
    }
  }
);

export default router;
