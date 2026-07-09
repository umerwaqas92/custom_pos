import { Router } from "express";
import prisma from "../utils/db";
import { protect, restrictTo } from "../middleware/auth";
import { withCache, invalidateCache } from "../utils/cache";
import path from "path";
import fs from "fs";

const ExcelJS = require("exceljs");
const PDFDocument = require("pdfkit");

const router = Router();

// ==================== DASHBOARD REPORT WIDGETS ====================

// Dashboard aggregates (OWNER, MANAGER)
router.get("/dashboard-stats", protect, restrictTo("OWNER", "MANAGER"), async (req, res) => {
  try {
    const cached = await withCache("reports:dashboard-stats", 10000, async () => {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      thirtyDaysAgo.setHours(0, 0, 0, 0);

      const [
        totalProducts,
        lowStockCount,
        salesAgg,
        expensesAgg,
        totalCustomers,
        pendingPurchases,
        pendingWarranties
      ] = await Promise.all([
        prisma.product.count(),
        prisma.product.count({
          where: {
            stockQuantity: {
              lte: prisma.product.fields.minStock
            }
          }
        }),
        prisma.sale.aggregate({
          where: {
            saleDate: {
              gte: thirtyDaysAgo
            }
          },
          _sum: {
            payableAmount: true,
            discountAmount: true,
            taxAmount: true
          },
          _count: {
            id: true
          }
        }),
        prisma.expense.aggregate({
          where: {
            date: {
              gte: thirtyDaysAgo
            }
          },
          _sum: {
            amount: true
          }
        }),
        prisma.customer.count(),
        prisma.purchaseOrder.count({
          where: {
            status: "PENDING"
          }
        }),
        prisma.warrantyClaim.count({
          where: {
            status: "PENDING"
          }
        })
      ]);

      const revenue = salesAgg._sum.payableAmount || 0;
      const expenses = expensesAgg._sum.amount || 0;
      const profit = Math.max(0, revenue - expenses);

      return {
        totalProducts,
        lowStockCount,
        totalSalesCount: salesAgg._count.id || 0,
        totalRevenue: revenue,
        totalExpenses: expenses,
        netProfit: profit,
        totalCustomers,
        pendingPurchases,
        pendingWarranties
      };
    });

    return res.json(cached);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Failed to generate dashboard statistics." });
  }
});

// Charts data aggregates (OWNER, MANAGER)
router.get("/charts", protect, restrictTo("OWNER", "MANAGER"), async (req, res) => {
  try {
    const cached = await withCache("reports:charts", 30000, async () => {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      thirtyDaysAgo.setHours(0, 0, 0, 0);

      const [sales, categoryDistribution, categories, saleItemRevenue] = await Promise.all([
        prisma.sale.findMany({
          where: {
            saleDate: {
              gte: thirtyDaysAgo
            }
          },
          select: {
            saleDate: true,
            payableAmount: true
          }
        }),
        prisma.product.groupBy({
          by: ["categoryId"],
          _count: {
            id: true
          }
        }),
        prisma.category.findMany({
          select: {
            id: true,
            name: true
          }
        }),
        prisma.saleItem.groupBy({
          by: ["productId"],
          _sum: {
            totalPrice: true
          }
        })
      ]);

      const trendMap: Record<string, number> = {};
      for (let i = 0; i < 30; i++) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        trendMap[d.toISOString().split("T")[0]] = 0;
      }

      for (const sale of sales) {
        const dayLabel = sale.saleDate.toISOString().split("T")[0];
        if (trendMap[dayLabel] !== undefined) {
          trendMap[dayLabel] += sale.payableAmount;
        }
      }

      const salesTrend = Object.keys(trendMap)
        .sort()
        .map((date) => ({
          date,
          revenue: trendMap[date]
        }));

      const categoriesById = new Map(categories.map((category) => [category.id, category.name]));
      const categoryChartData = categoryDistribution.map((item) => ({
        name: categoriesById.get(item.categoryId || "") || "Uncategorized",
        value: item._count.id
      }));

      const productIds = saleItemRevenue.map((row) => row.productId);
      const products = productIds.length
        ? await prisma.product.findMany({
            where: {
              id: { in: productIds }
            },
            select: {
              id: true,
              brand: {
                select: {
                  name: true
                }
              }
            }
          })
        : [];

      const brandByProductId = new Map(products.map((product) => [product.id, product.brand?.name || "Generic"]));
      const brandRevenueMap = new Map<string, number>();
      for (const row of saleItemRevenue) {
        const brandName = brandByProductId.get(row.productId) || "Generic";
        brandRevenueMap.set(brandName, (brandRevenueMap.get(brandName) || 0) + (row._sum.totalPrice || 0));
      }

      const brandChartData = Array.from(brandRevenueMap.entries()).map(([brand, revenue]) => ({
        brand,
        revenue
      }));

      return { salesTrend, categoryChartData, brandChartData };
    });

    return res.json({
      ...cached
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Failed to generate charts datasets." });
  }
});

// Top Selling Products
router.get("/top-selling", protect, restrictTo("OWNER", "MANAGER"), async (req, res) => {
  try {
    const cached = await withCache("reports:top-selling", 30000, async () => {
      const totals = await prisma.saleItem.groupBy({
        by: ["productId"],
        _sum: {
          quantity: true,
          totalPrice: true
        }
      });

      const topRows = totals
        .sort((a, b) => (b._sum.quantity || 0) - (a._sum.quantity || 0))
        .slice(0, 5);

      const products = topRows.length
        ? await prisma.product.findMany({
            where: {
              id: { in: topRows.map((row) => row.productId) }
            },
            select: {
              id: true,
              name: true,
              sku: true,
              brand: {
                select: {
                  name: true
                }
              }
            }
          })
        : [];

      const productMap = new Map(products.map((product) => [product.id, product]));
      return topRows.map((row) => {
        const product = productMap.get(row.productId);
        return {
          name: product?.name || "Unknown",
          sku: product?.sku || "",
          brand: product?.brand?.name || "Generic",
          quantity: row._sum.quantity || 0,
          revenue: row._sum.totalPrice || 0
        };
      });
    });

    return res.json(cached);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Failed to fetch top-selling products." });
  }
});

// ==================== CORE REPORT GENERATION ENGINE ====================

// Data Compiler Helper
async function compileReportData(type: string, filters: { startDate?: string; endDate?: string; branchId?: string }) {
  const { startDate, endDate, branchId } = filters;
  
  const dateFilter: any = {};
  if (startDate) dateFilter.gte = new Date(startDate);
  if (endDate) {
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);
    dateFilter.lte = end;
  }

  const branchFilter: any = {};
  if (branchId) {
    branchFilter.branchId = branchId;
  }

  switch (type) {
    case "sales-daily": {
      const sales = await prisma.sale.findMany({
        where: {
          saleDate: Object.keys(dateFilter).length ? dateFilter : undefined,
          ...branchFilter
        },
        include: {
          customer: true,
          branch: true,
          cashier: true
        },
        orderBy: { saleDate: "desc" }
      });

      return sales.map(s => ({
        invoiceRef: s.id.substring(0, 8),
        date: s.saleDate.toISOString().split("T")[0],
        customer: s.customer?.name || "Walk-in Customer",
        branch: s.branch?.name || "Main",
        method: s.paymentMethod,
        subtotal: s.totalAmount,
        discount: s.discountAmount,
        tax: s.taxAmount,
        grandTotal: s.payableAmount
      }));
    }

    case "sales-monthly": {
      const sales = await prisma.sale.findMany({
        where: {
          saleDate: Object.keys(dateFilter).length ? dateFilter : undefined,
          ...branchFilter
        },
        select: {
          saleDate: true,
          payableAmount: true,
          totalAmount: true,
          discountAmount: true,
          taxAmount: true
        }
      });

      const monthlyMap = new Map<string, any>();
      for (const s of sales) {
        const monthKey = s.saleDate.toISOString().substring(0, 7); // YYYY-MM
        if (!monthlyMap.has(monthKey)) {
          monthlyMap.set(monthKey, { month: monthKey, salesCount: 0, subtotal: 0, discount: 0, tax: 0, revenue: 0 });
        }
        const data = monthlyMap.get(monthKey);
        data.salesCount += 1;
        data.subtotal += s.totalAmount;
        data.discount += s.discountAmount;
        data.tax += s.taxAmount;
        data.revenue += s.payableAmount;
      }

      return Array.from(monthlyMap.values()).sort((a, b) => b.month.localeCompare(a.month));
    }

    case "sales-annual": {
      const sales = await prisma.sale.findMany({
        where: {
          saleDate: Object.keys(dateFilter).length ? dateFilter : undefined,
          ...branchFilter
        },
        select: {
          saleDate: true,
          payableAmount: true,
          totalAmount: true,
          discountAmount: true,
          taxAmount: true
        }
      });

      const yearlyMap = new Map<string, any>();
      for (const s of sales) {
        const yearKey = s.saleDate.getFullYear().toString();
        if (!yearlyMap.has(yearKey)) {
          yearlyMap.set(yearKey, { year: yearKey, salesCount: 0, subtotal: 0, discount: 0, tax: 0, revenue: 0 });
        }
        const data = yearlyMap.get(yearKey);
        data.salesCount += 1;
        data.subtotal += s.totalAmount;
        data.discount += s.discountAmount;
        data.tax += s.taxAmount;
        data.revenue += s.payableAmount;
      }

      return Array.from(yearlyMap.values()).sort((a, b) => b.year.localeCompare(a.year));
    }

    case "profit-loss": {
      const [sales, expenses] = await Promise.all([
        prisma.sale.aggregate({
          where: {
            saleDate: Object.keys(dateFilter).length ? dateFilter : undefined,
            ...branchFilter
          },
          _sum: {
            payableAmount: true,
            totalAmount: true,
            discountAmount: true,
            taxAmount: true
          },
          _count: true
        }),
        prisma.expense.aggregate({
          where: {
            date: Object.keys(dateFilter).length ? dateFilter : undefined,
            ...branchFilter
          },
          _sum: {
            amount: true
          },
          _count: true
        })
      ]);

      const revenue = sales._sum.payableAmount || 0;
      const totalExpenses = expenses._sum.amount || 0;
      const netProfit = revenue - totalExpenses;

      return [
        { reportItem: "Revenue (POS Sales)", transactionCount: sales._count, amount: revenue },
        { reportItem: "Expenses (Wages/Rent/Other)", transactionCount: expenses._count, amount: totalExpenses },
        { reportItem: "Net Profit / Loss Summary", transactionCount: "-", amount: netProfit }
      ];
    }

    case "inventory-value": {
      const stocks = await prisma.branchStock.findMany({
        where: branchId ? { branchId } : undefined,
        include: {
          product: {
            include: {
              category: true,
              brand: true
            }
          },
          branch: true
        }
      });

      return stocks.map(st => {
        const cost = st.product.wholesalePrice || 0;
        const sell = st.product.sellingPrice;
        const qty = st.quantity;
        return {
          sku: st.product.sku,
          productName: st.product.name,
          category: st.product.category?.name || "Uncategorized",
          brand: st.product.brand?.name || "Generic",
          location: st.branch.name,
          stockQty: qty,
          unitCost: cost,
          unitRetail: sell,
          totalCostValue: qty * cost,
          totalRetailValue: qty * sell,
          projectedProfit: (qty * sell) - (qty * cost)
        };
      });
    }

    case "low-stock": {
      const products = await prisma.product.findMany({
        where: {
          stockQuantity: {
            lte: prisma.product.fields.minStock
          }
        },
        include: {
          category: true,
          brand: true
        }
      });

      return products.map(p => ({
        sku: p.sku,
        productName: p.name,
        category: p.category?.name || "N/A",
        brand: p.brand?.name || "N/A",
        stockLimit: p.minStock,
        currentStock: p.stockQuantity
      }));
    }

    case "best-selling": {
      const items = await prisma.saleItem.groupBy({
        by: ["productId"],
        where: {
          sale: {
            saleDate: Object.keys(dateFilter).length ? dateFilter : undefined,
            ...branchFilter
          }
        },
        _sum: {
          quantity: true,
          totalPrice: true
        }
      });

      const sorted = items
        .sort((a, b) => (b._sum.quantity || 0) - (a._sum.quantity || 0))
        .slice(0, 15);

      const products = await prisma.product.findMany({
        where: { id: { in: sorted.map(i => i.productId) } },
        include: { category: true, brand: true }
      });

      const pMap = new Map(products.map(p => [p.id, p]));

      return sorted.map(row => {
        const p = pMap.get(row.productId);
        return {
          sku: p?.sku || "",
          productName: p?.name || "Unknown",
          category: p?.category?.name || "N/A",
          brand: p?.brand?.name || "N/A",
          itemsSold: row._sum.quantity || 0,
          revenueGenerated: row._sum.totalPrice || 0
        };
      });
    }

    case "slow-moving": {
      const items = await prisma.saleItem.groupBy({
        by: ["productId"],
        where: {
          sale: {
            saleDate: Object.keys(dateFilter).length ? dateFilter : undefined,
            ...branchFilter
          }
        },
        _sum: {
          quantity: true
        }
      });

      const soldMap = new Map(items.map(i => [i.productId, i._sum.quantity || 0]));
      const products = await prisma.product.findMany({
        include: { category: true, brand: true }
      });

      return products
        .map(p => ({
          sku: p.sku,
          productName: p.name,
          category: p.category?.name || "N/A",
          brand: p.brand?.name || "N/A",
          currentStock: p.stockQuantity,
          totalSold: soldMap.get(p.id) || 0
        }))
        .sort((a, b) => a.totalSold - b.totalSold)
        .slice(0, 20);
    }

    case "brand-share": {
      const items = await prisma.saleItem.findMany({
        where: {
          sale: {
            saleDate: Object.keys(dateFilter).length ? dateFilter : undefined,
            ...branchFilter
          }
        },
        include: {
          product: {
            include: {
              brand: true
            }
          }
        }
      });

      const bMap = new Map<string, any>();
      for (const item of items) {
        const name = item.product.brand?.name || "Generic";
        if (!bMap.has(name)) {
          bMap.set(name, { brand: name, quantitySold: 0, totalSalesValue: 0 });
        }
        const data = bMap.get(name);
        data.quantitySold += item.quantity;
        data.totalSalesValue += item.totalPrice;
      }

      return Array.from(bMap.values()).sort((a, b) => b.totalSalesValue - a.totalSalesValue);
    }

    case "category-share": {
      const items = await prisma.saleItem.findMany({
        where: {
          sale: {
            saleDate: Object.keys(dateFilter).length ? dateFilter : undefined,
            ...branchFilter
          }
        },
        include: {
          product: {
            include: {
              category: true
            }
          }
        }
      });

      const cMap = new Map<string, any>();
      for (const item of items) {
        const name = item.product.category?.name || "Uncategorized";
        if (!cMap.has(name)) {
          cMap.set(name, { category: name, quantitySold: 0, totalSalesValue: 0 });
        }
        const data = cMap.get(name);
        data.quantitySold += item.quantity;
        data.totalSalesValue += item.totalPrice;
      }

      return Array.from(cMap.values()).sort((a, b) => b.totalSalesValue - a.totalSalesValue);
    }

    case "supplier-summary": {
      const suppliers = await prisma.supplier.findMany({
        include: {
          purchases: {
            where: {
              orderDate: Object.keys(dateFilter).length ? dateFilter : undefined
            }
          }
        }
      });

      return suppliers.map(s => {
        const purchaseVolume = s.purchases.reduce((acc, p) => acc + p.totalAmount, 0);
        return {
          supplier: s.company,
          contactPerson: s.contactPerson || "N/A",
          phone: s.phone || "N/A",
          ordersCount: s.purchases.length,
          totalPurchasedValue: purchaseVolume
        };
      }).sort((a, b) => b.totalPurchasedValue - a.totalPurchasedValue);
    }

    case "customer-summary": {
      const customers = await prisma.customer.findMany({
        include: {
          sales: {
            where: {
              saleDate: Object.keys(dateFilter).length ? dateFilter : undefined
            }
          }
        }
      });

      return customers.map(c => {
        const purchaseVolume = c.sales.reduce((acc, s) => acc + s.payableAmount, 0);
        return {
          customerName: c.name,
          phone: c.phone,
          loyaltyPoints: c.rewardPoints,
          salesCount: c.sales.length,
          totalPurchaseVolume: purchaseVolume,
          outstandingBalance: c.creditBalance
        };
      }).sort((a, b) => b.totalPurchaseVolume - a.totalPurchaseVolume);
    }

    case "technician-performance": {
      const techs = await prisma.user.findMany({
        where: { role: "TECHNICIAN" },
        include: {
          repairJobs: {
            where: {
              createdAt: Object.keys(dateFilter).length ? dateFilter : undefined
            }
          }
        }
      });

      return techs.map(u => {
        const completed = u.repairJobs.filter(j => j.status === "DELIVERED" || j.status === "READY");
        const pending = u.repairJobs.filter(j => j.status !== "DELIVERED" && j.status !== "READY");
        const totalEstimated = completed.reduce((acc, j) => acc + (j.repairCost + j.serviceCharge), 0);
        return {
          technician: u.name,
          username: u.username,
          completedCount: completed.length,
          pendingCount: pending.length,
          revenueGenerated: totalEstimated
        };
      }).sort((a, b) => b.revenueGenerated - a.revenueGenerated);
    }

    case "warranty-summary": {
      const claims = await prisma.warrantyClaim.findMany({
        where: {
          createdAt: Object.keys(dateFilter).length ? dateFilter : undefined
        },
        include: {
          sale: {
            include: {
              customer: true,
              items: {
                include: {
                  product: true
                }
              }
            }
          }
        },
        orderBy: { createdAt: "desc" }
      });

      return claims.map(c => {
        const matchingItem = c.sale.items.find(item => item.productId === c.productId);
        return {
          claimId: c.id.substring(0, 8),
          customerName: c.sale.customer?.name || "Walk-in Customer",
          productName: matchingItem?.product?.name || "Unknown Product",
          sku: matchingItem?.product?.sku || "N/A",
          notes: c.notes || "No details set",
          claimStatus: c.status,
          createdDate: c.createdAt.toISOString().split("T")[0]
        };
      });
    }

    default:
      throw new Error(`Invalid report type: ${type}`);
  }
}

// Fetch JSON Report Data
router.get("/query/:type", protect, restrictTo("OWNER", "MANAGER"), async (req, res) => {
  const { type } = req.params;
  const { startDate, endDate, branchId } = req.query;

  try {
    const data = await compileReportData(type, {
      startDate: startDate as string,
      endDate: endDate as string,
      branchId: branchId as string
    });
    return res.json(data);
  } catch (error: any) {
    console.error(`Failed to generate report type ${type}:`, error);
    return res.status(500).json({ error: error.message || "Failed to load report data." });
  }
});

// CSV Converter Helper
function convertToCSV(data: any[]) {
  if (data.length === 0) return "";
  const headers = Object.keys(data[0]);
  const csvRows = [headers.join(",")];
  
  for (const row of data) {
    const values = headers.map(header => {
      const val = row[header];
      const escaped = ('' + val).replace(/"/g, '\\"');
      return `"${escaped}"`;
    });
    csvRows.push(values.join(","));
  }
  return csvRows.join("\n");
}

// Export Streaming Route
router.get("/export/:type/:format", protect, restrictTo("OWNER", "MANAGER"), async (req, res) => {
  const { type, format } = req.params;
  const { startDate, endDate, branchId } = req.query;

  try {
    const data = await compileReportData(type, {
      startDate: startDate as string,
      endDate: endDate as string,
      branchId: branchId as string
    });

    if (format === "csv") {
      const csv = convertToCSV(data);
      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", `attachment; filename="${type}-report.csv"`);
      return res.send(csv);
    }

    if (format === "excel") {
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet("Report Sheet");
      
      if (data.length > 0) {
        const headers = Object.keys(data[0]);
        worksheet.columns = headers.map(h => ({ header: h.toUpperCase(), key: h, width: 22 }));
        worksheet.addRows(data);
        
        // Formatted Headers
        worksheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
        worksheet.getRow(1).fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FF3B82F6" }
        };
      }
      
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.setHeader("Content-Disposition", `attachment; filename="${type}-report.xlsx"`);
      await workbook.xlsx.write(res);
      return res.end();
    }

    if (format === "pdf") {
      const doc = new PDFDocument({ margin: 30, size: "A4" });
      
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="${type}-report.pdf"`);
      doc.pipe(res);

      // Document Header
      doc.fillColor("#1E3A8A").fontSize(20).text(`${type.toUpperCase().replace("-", " ")} REPORT`, { align: "center" });
      doc.fontSize(10).fillColor("#4B5563").text(`Generated on: ${new Date().toLocaleString()}`, { align: "center" });
      doc.moveDown(2);

      if (startDate || endDate || branchId) {
        doc.fontSize(9).text(`Filters - Date: ${startDate || "ALL"} to ${endDate || "ALL"} | Branch: ${branchId || "ALL"}`);
        doc.moveDown(1);
      }

      if (data.length > 0) {
        const headers = Object.keys(data[0]).slice(0, 6); // Fit first 6 columns
        let startY = doc.y;
        let startX = 30;
        const colWidth = 535 / headers.length;

        // Draw Table Header
        doc.fillColor("#FFFFFF");
        doc.rect(startX, startY, 535, 20).fill("#3B82F6");
        doc.fillColor("#FFFFFF").fontSize(8).font("Helvetica-Bold");
        
        headers.forEach((h, i) => {
          doc.text(h.toUpperCase(), startX + (i * colWidth) + 5, startY + 6, { width: colWidth - 10, lineBreak: false });
        });

        doc.moveDown(1);
        doc.font("Helvetica").fillColor("#1F2937");

        let rowY = startY + 20;
        data.forEach((row, rowIndex) => {
          if (rowY > 750) {
            doc.addPage();
            rowY = 50;
            
            // Header on new page
            doc.fillColor("#FFFFFF");
            doc.rect(startX, rowY, 535, 20).fill("#3B82F6");
            doc.fillColor("#FFFFFF").fontSize(8).font("Helvetica-Bold");
            headers.forEach((h, i) => {
              doc.text(h.toUpperCase(), startX + (i * colWidth) + 5, rowY + 6, { width: colWidth - 10, lineBreak: false });
            });
            doc.font("Helvetica").fillColor("#1F2937");
            rowY += 20;
          }

          if (rowIndex % 2 === 1) {
            doc.fillColor("#F3F4F6");
            doc.rect(startX, rowY, 535, 18).fill();
            doc.fillColor("#1F2937");
          }

          headers.forEach((h, i) => {
            const val = row[h];
            const text = typeof val === "number" ? val.toFixed(2) : String(val);
            doc.text(text, startX + (i * colWidth) + 5, rowY + 5, { width: colWidth - 10, lineBreak: false });
          });

          rowY += 18;
        });
      } else {
        doc.text("No data matches the selected filters.", { align: "center" });
      }

      doc.end();
      return;
    }

    return res.status(400).json({ error: "Unsupported export format." });
  } catch (error: any) {
    console.error(`Failed to export report ${type} as ${format}:`, error);
    return res.status(500).json({ error: error.message || "Failed to generate report export." });
  }
});

export default router;
