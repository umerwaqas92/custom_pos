import { Router } from "express";
import prisma from "../utils/db";
import { protect, restrictTo } from "../middleware/auth";
import { withCache } from "../utils/cache";

const router = Router();

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

export default router;
