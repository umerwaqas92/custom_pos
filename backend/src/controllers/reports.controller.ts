import { Router } from "express";
import prisma from "../utils/db";
import { protect, restrictTo } from "../middleware/auth";

const router = Router();

// Dashboard aggregates (OWNER, MANAGER)
router.get("/dashboard-stats", protect, restrictTo("OWNER", "MANAGER"), async (req, res) => {
  try {
    // Total stock count and low stock count
    const totalProducts = await prisma.product.count();
    const lowStockCount = await prisma.product.count({
      where: {
        stockQuantity: {
          lte: prisma.product.fields.minStock
        }
      }
    });

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    thirtyDaysAgo.setHours(0, 0, 0, 0);

    // Total sales and revenue aggregates (last 30 days)
    const salesAgg = await prisma.sale.aggregate({
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
    });

    // Expenses aggregates (last 30 days)
    const expensesAgg = await prisma.expense.aggregate({
      where: {
        date: {
          gte: thirtyDaysAgo
        }
      },
      _sum: {
        amount: true
      }
    });

    // Total customers count
    const totalCustomers = await prisma.customer.count();

    // Pending purchase orders
    const pendingPurchases = await prisma.purchaseOrder.count({
      where: {
        status: "PENDING"
      }
    });

    // Pending warranty claims
    const pendingWarranties = await prisma.warrantyClaim.count({
      where: {
        status: "PENDING"
      }
    });

    const revenue = salesAgg._sum.payableAmount || 0;
    const expenses = expensesAgg._sum.amount || 0;
    const profit = Math.max(0, revenue - expenses);

    return res.json({
      totalProducts,
      lowStockCount,
      totalSalesCount: salesAgg._count.id || 0,
      totalRevenue: revenue,
      totalExpenses: expenses,
      netProfit: profit,
      totalCustomers,
      pendingPurchases,
      pendingWarranties
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Failed to generate dashboard statistics." });
  }
});

// Charts data aggregates (OWNER, MANAGER)
router.get("/charts", protect, restrictTo("OWNER", "MANAGER"), async (req, res) => {
  try {
    // 1. Sales Trend (Last 30 days daily revenue)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    thirtyDaysAgo.setHours(0, 0, 0, 0);

    const sales = await prisma.sale.findMany({
      where: {
        saleDate: {
          gte: thirtyDaysAgo
        }
      },
      select: {
        saleDate: true,
        payableAmount: true
      }
    });

    // Group sales by day
    const trendMap: { [key: string]: number } = {};
    for (let i = 0; i < 30; i++) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const label = d.toISOString().split("T")[0];
      trendMap[label] = 0;
    }

    sales.forEach((s) => {
      const dayLabel = s.saleDate.toISOString().split("T")[0];
      if (trendMap[dayLabel] !== undefined) {
        trendMap[dayLabel] += s.payableAmount;
      }
    });

    const salesTrend = Object.keys(trendMap)
      .sort()
      .map(key => ({
        date: key,
        revenue: trendMap[key]
      }));

    // 2. Category Distribution
    const categoryDistribution = await prisma.product.groupBy({
      by: ["categoryId"],
      _count: {
        id: true
      }
    });

    const categories = await prisma.category.findMany();
    const categoryChartData = categoryDistribution.map((item) => {
      const catName = categories.find(c => c.id === item.categoryId)?.name || "Uncategorized";
      return {
        name: catName,
        value: item._count.id
      };
    });

    // 3. Brand distribution / Revenue
    const brandProducts = await prisma.product.findMany({
      include: { brand: true, saleItems: true }
    });

    const brandRevenueMap: { [key: string]: number } = {};
    brandProducts.forEach((p) => {
      const bName = p.brand?.name || "Generic";
      if (!brandRevenueMap[bName]) brandRevenueMap[bName] = 0;
      p.saleItems.forEach((si) => {
        brandRevenueMap[bName] += si.totalPrice;
      });
    });

    const brandChartData = Object.keys(brandRevenueMap).map(key => ({
      brand: key,
      revenue: brandRevenueMap[key]
    }));

    return res.json({
      salesTrend,
      categoryChartData,
      brandChartData
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Failed to generate charts datasets." });
  }
});

// Top Selling Products
router.get("/top-selling", protect, restrictTo("OWNER", "MANAGER"), async (req, res) => {
  try {
    const saleItems = await prisma.saleItem.findMany({
      include: {
        product: {
          include: { brand: true, category: true }
        }
      }
    });

    const productSalesMap: { [key: string]: { name: string; sku: string; brand: string; quantity: number; revenue: number } } = {};

    saleItems.forEach((si) => {
      const pId = si.productId;
      if (!productSalesMap[pId]) {
        productSalesMap[pId] = {
          name: si.product.name,
          sku: si.product.sku,
          brand: si.product.brand?.name || "Generic",
          quantity: 0,
          revenue: 0
        };
      }
      productSalesMap[pId].quantity += si.quantity;
      productSalesMap[pId].revenue += si.totalPrice;
    });

    const topSelling = Object.values(productSalesMap)
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, 5);

    return res.json(topSelling);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Failed to fetch top-selling products." });
  }
});

export default router;
