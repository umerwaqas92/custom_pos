"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const db_1 = __importDefault(require("../utils/db"));
const auth_1 = require("../middleware/auth");
const cache_1 = require("../utils/cache");
const ExcelJS = require("exceljs");
const PDFDocument = require("pdfkit");
const router = (0, express_1.Router)();
const LOW_STOCK_THRESHOLD = 3;
// ==================== DASHBOARD REPORT WIDGETS ====================
// Dashboard aggregates (OWNER, MANAGER)
router.get("/dashboard-stats", auth_1.protect, (0, auth_1.restrictTo)("OWNER", "MANAGER", "SUPER_ADMIN"), async (req, res) => {
    try {
        const branchId = req.query.branchId ? String(req.query.branchId) : "";
        const cacheKey = `reports:dashboard-stats:${branchId || "all"}`;
        const cached = await (0, cache_1.withCache)(cacheKey, 10000, async () => {
            const now = new Date();
            const startOfToday = new Date(now);
            startOfToday.setHours(0, 0, 0, 0);
            const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
            startOfMonth.setHours(0, 0, 0, 0);
            const thirtyDaysAgo = new Date();
            thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
            thirtyDaysAgo.setHours(0, 0, 0, 0);
            const [productsForStock, branchStockGroups, todaySalesAgg, monthSalesAgg, monthExpensesAgg, last30SalesAgg, last30ExpensesAgg, totalCustomers, cashAccounts, recentSales, recentCustomers] = await Promise.all([
                db_1.default.product.findMany({
                    select: { id: true, minStock: true, stockQuantity: true }
                }),
                // Real sellable qty lives on BranchStock (product.stockQuantity is often stale)
                db_1.default.branchStock.groupBy({
                    by: ["productId"],
                    where: branchId ? { branchId } : undefined,
                    _sum: { quantity: true }
                }),
                db_1.default.sale.aggregate({
                    where: {
                        saleDate: { gte: startOfToday },
                        ...(branchId ? { branchId } : {})
                    },
                    _sum: { payableAmount: true },
                    _count: { id: true }
                }),
                db_1.default.sale.aggregate({
                    where: {
                        saleDate: { gte: startOfMonth },
                        ...(branchId ? { branchId } : {})
                    },
                    _sum: { payableAmount: true },
                    _count: { id: true }
                }),
                db_1.default.expense.aggregate({
                    where: { date: { gte: startOfMonth } },
                    _sum: { amount: true }
                }),
                db_1.default.sale.aggregate({
                    where: {
                        saleDate: { gte: thirtyDaysAgo },
                        ...(branchId ? { branchId } : {})
                    },
                    _sum: { payableAmount: true },
                    _count: { id: true }
                }),
                db_1.default.expense.aggregate({
                    where: { date: { gte: thirtyDaysAgo } },
                    _sum: { amount: true }
                }),
                db_1.default.customer.count(),
                db_1.default.bankAccount.findMany({
                    where: { isActive: true },
                    select: { type: true, balance: true, name: true }
                }),
                db_1.default.sale.findMany({
                    take: 8,
                    orderBy: { saleDate: "desc" },
                    where: branchId ? { branchId } : undefined,
                    select: {
                        id: true,
                        saleDate: true,
                        payableAmount: true,
                        paidAmount: true,
                        paymentMethod: true,
                        paymentStatus: true,
                        returnStatus: true,
                        branch: { select: { id: true, name: true } },
                        customer: { select: { id: true, name: true, phone: true } },
                        cashier: { select: { name: true } },
                        _count: { select: { items: true } }
                    }
                }),
                db_1.default.customer.findMany({
                    take: 8,
                    orderBy: { createdAt: "desc" },
                    select: {
                        id: true,
                        name: true,
                        phone: true,
                        email: true,
                        creditBalance: true,
                        rewardPoints: true,
                        createdAt: true
                    }
                })
            ]);
            // Map productId -> available qty for selected branch (or all branches summed)
            const branchQtyByProduct = new Map(branchStockGroups.map((row) => [row.productId, row._sum.quantity || 0]));
            let totalUnitsInStock = 0;
            let lowStockCount = 0;
            let outOfStockCount = 0;
            for (const product of productsForStock) {
                // When filtering by branch: missing branch row = 0 available at that shop
                // When all branches: missing any branch stock rows → fall back to product field
                let qty;
                if (branchId) {
                    qty = branchQtyByProduct.get(product.id) ?? 0;
                }
                else if (branchQtyByProduct.has(product.id)) {
                    qty = branchQtyByProduct.get(product.id) || 0;
                }
                else {
                    qty = product.stockQuantity || 0;
                }
                totalUnitsInStock += qty;
                // Same rule as Inventory page low-stock filter: qty <= 3
                if (qty <= LOW_STOCK_THRESHOLD) {
                    lowStockCount += 1;
                }
                if (qty <= 0) {
                    outOfStockCount += 1;
                }
            }
            const totalProducts = productsForStock.length;
            const todaySales = todaySalesAgg._sum.payableAmount || 0;
            const monthlySales = monthSalesAgg._sum.payableAmount || 0;
            const monthlyExpenses = monthExpensesAgg._sum.amount || 0;
            const monthlyProfit = monthlySales - monthlyExpenses;
            const totalRevenue = last30SalesAgg._sum.payableAmount || 0;
            const totalExpenses = last30ExpensesAgg._sum.amount || 0;
            const netProfit = totalRevenue - totalExpenses;
            const cashBalance = cashAccounts
                .filter((a) => a.type === "CASH")
                .reduce((s, a) => s + (a.balance || 0), 0);
            const bankBalance = cashAccounts
                .filter((a) => a.type === "BANK")
                .reduce((s, a) => s + (a.balance || 0), 0);
            const walletBalance = cashAccounts
                .filter((a) => a.type === "MOBILE_WALLET")
                .reduce((s, a) => s + (a.balance || 0), 0);
            const totalBalance = cashAccounts.reduce((s, a) => s + (a.balance || 0), 0);
            return {
                // KPIs
                todaySales,
                todaySalesCount: todaySalesAgg._count.id || 0,
                monthlySales,
                monthlySalesCount: monthSalesAgg._count.id || 0,
                monthlyExpenses,
                monthlyProfit,
                // legacy / 30-day
                totalProducts,
                totalUnitsInStock,
                lowStockCount,
                outOfStockCount,
                totalSalesCount: last30SalesAgg._count.id || 0,
                totalRevenue,
                totalExpenses,
                netProfit,
                totalCustomers,
                cashBalance,
                bankBalance,
                walletBalance,
                totalBalance,
                // feeds
                recentSales,
                recentCustomers
            };
        });
        return res.json(cached);
    }
    catch (error) {
        console.error(error);
        return res.status(500).json({ error: "Failed to generate dashboard statistics." });
    }
});
// Charts data aggregates (OWNER, MANAGER)
router.get("/charts", auth_1.protect, (0, auth_1.restrictTo)("OWNER", "MANAGER"), async (req, res) => {
    try {
        const cached = await (0, cache_1.withCache)("reports:charts", 30000, async () => {
            const thirtyDaysAgo = new Date();
            thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
            thirtyDaysAgo.setHours(0, 0, 0, 0);
            const [sales, expenses, saleItems] = await Promise.all([
                db_1.default.sale.findMany({
                    where: { saleDate: { gte: thirtyDaysAgo } },
                    select: { saleDate: true, payableAmount: true }
                }),
                db_1.default.expense.findMany({
                    where: { date: { gte: thirtyDaysAgo } },
                    select: { date: true, amount: true }
                }),
                db_1.default.saleItem.findMany({
                    where: { sale: { saleDate: { gte: thirtyDaysAgo } } },
                    select: {
                        totalPrice: true,
                        product: {
                            select: {
                                category: { select: { name: true } },
                                brand: { select: { name: true } }
                            }
                        }
                    }
                })
            ]);
            const revenueMap = {};
            const expenseMap = {};
            for (let i = 0; i < 30; i++) {
                const d = new Date();
                d.setDate(d.getDate() - i);
                const key = d.toISOString().split("T")[0];
                revenueMap[key] = 0;
                expenseMap[key] = 0;
            }
            for (const sale of sales) {
                const dayLabel = sale.saleDate.toISOString().split("T")[0];
                if (revenueMap[dayLabel] !== undefined) {
                    revenueMap[dayLabel] += sale.payableAmount;
                }
            }
            for (const exp of expenses) {
                const dayLabel = exp.date.toISOString().split("T")[0];
                if (expenseMap[dayLabel] !== undefined) {
                    expenseMap[dayLabel] += exp.amount;
                }
            }
            const salesTrend = Object.keys(revenueMap)
                .sort()
                .map((date) => ({
                date: date.slice(5), // MM-DD for chart axis
                fullDate: date,
                revenue: Math.round((revenueMap[date] + Number.EPSILON) * 100) / 100
            }));
            // Daily revenue alias (same series, clearer name for UI)
            const dailyRevenue = salesTrend;
            const profitTrend = Object.keys(revenueMap)
                .sort()
                .map((date) => {
                const revenue = revenueMap[date];
                const expense = expenseMap[date] || 0;
                return {
                    date: date.slice(5),
                    fullDate: date,
                    revenue: Math.round((revenue + Number.EPSILON) * 100) / 100,
                    expenses: Math.round((expense + Number.EPSILON) * 100) / 100,
                    profit: Math.round((revenue - expense + Number.EPSILON) * 100) / 100
                };
            });
            // Best categories / brands by sales revenue (last 30 days)
            const categoryRevenueMap = new Map();
            const brandRevenueMap = new Map();
            for (const row of saleItems) {
                const cat = row.product?.category?.name || "Uncategorized";
                const brand = row.product?.brand?.name || "Generic";
                categoryRevenueMap.set(cat, (categoryRevenueMap.get(cat) || 0) + (row.totalPrice || 0));
                brandRevenueMap.set(brand, (brandRevenueMap.get(brand) || 0) + (row.totalPrice || 0));
            }
            const categoryChartData = Array.from(categoryRevenueMap.entries())
                .map(([name, value]) => ({ name, value: Math.round((value + Number.EPSILON) * 100) / 100 }))
                .sort((a, b) => b.value - a.value)
                .slice(0, 8);
            const brandChartData = Array.from(brandRevenueMap.entries())
                .map(([brand, revenue]) => ({
                brand,
                revenue: Math.round((revenue + Number.EPSILON) * 100) / 100
            }))
                .sort((a, b) => b.revenue - a.revenue)
                .slice(0, 8);
            return { salesTrend, dailyRevenue, profitTrend, categoryChartData, brandChartData };
        });
        return res.json({
            ...cached
        });
    }
    catch (error) {
        console.error(error);
        return res.status(500).json({ error: "Failed to generate charts datasets." });
    }
});
// Top Selling Products
router.get("/top-selling", auth_1.protect, (0, auth_1.restrictTo)("OWNER", "MANAGER"), async (req, res) => {
    try {
        const cached = await (0, cache_1.withCache)("reports:top-selling", 30000, async () => {
            const totals = await db_1.default.saleItem.groupBy({
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
                ? await db_1.default.product.findMany({
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
    }
    catch (error) {
        console.error(error);
        return res.status(500).json({ error: "Failed to fetch top-selling products." });
    }
});
// ==================== CORE REPORT GENERATION ENGINE ====================
// Data Compiler Helper
async function compileReportData(type, filters) {
    const { startDate, endDate, branchId } = filters;
    const dateFilter = {};
    if (startDate)
        dateFilter.gte = new Date(startDate);
    if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        dateFilter.lte = end;
    }
    const branchFilter = {};
    if (branchId) {
        branchFilter.branchId = branchId;
    }
    switch (type) {
        case "sales-daily": {
            const sales = await db_1.default.sale.findMany({
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
            const sales = await db_1.default.sale.findMany({
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
            const monthlyMap = new Map();
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
            const sales = await db_1.default.sale.findMany({
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
            const yearlyMap = new Map();
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
                db_1.default.sale.aggregate({
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
                db_1.default.expense.aggregate({
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
            const stocks = await db_1.default.branchStock.findMany({
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
            if (branchId) {
                const branchStocks = await db_1.default.branchStock.findMany({
                    where: { branchId },
                    include: {
                        branch: true,
                        product: {
                            include: {
                                category: true,
                                brand: true
                            }
                        }
                    }
                });
                return branchStocks
                    .filter((st) => st.quantity <= LOW_STOCK_THRESHOLD)
                    .map(st => ({
                    sku: st.product.sku,
                    productName: st.product.name,
                    category: st.product.category?.name || "N/A",
                    brand: st.product.brand?.name || "N/A",
                    location: st.branch.name,
                    stockLimit: LOW_STOCK_THRESHOLD,
                    currentStock: st.quantity
                }));
            }
            const products = await db_1.default.product.findMany({
                where: {
                    stockQuantity: {
                        lte: LOW_STOCK_THRESHOLD
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
                stockLimit: LOW_STOCK_THRESHOLD,
                currentStock: p.stockQuantity
            }));
        }
        case "best-selling": {
            const items = await db_1.default.saleItem.groupBy({
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
            const products = await db_1.default.product.findMany({
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
            const items = await db_1.default.saleItem.groupBy({
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
            const products = await db_1.default.product.findMany({
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
            const items = await db_1.default.saleItem.findMany({
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
            const bMap = new Map();
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
            const items = await db_1.default.saleItem.findMany({
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
            const cMap = new Map();
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
            const suppliers = await db_1.default.supplier.findMany({
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
            const customers = await db_1.default.customer.findMany({
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
            const techs = await db_1.default.user.findMany({
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
            const claims = await db_1.default.warrantyClaim.findMany({
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
router.get("/query/:type", auth_1.protect, (0, auth_1.restrictTo)("OWNER", "MANAGER"), async (req, res) => {
    const { type } = req.params;
    const { startDate, endDate, branchId } = req.query;
    try {
        const data = await compileReportData(type, {
            startDate: startDate,
            endDate: endDate,
            branchId: branchId
        });
        return res.json(data);
    }
    catch (error) {
        console.error(`Failed to generate report type ${type}:`, error);
        return res.status(500).json({ error: error.message || "Failed to load report data." });
    }
});
// CSV Converter Helper
function convertToCSV(data) {
    if (data.length === 0)
        return "";
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
router.get("/export/:type/:format", auth_1.protect, (0, auth_1.restrictTo)("OWNER", "MANAGER"), async (req, res) => {
    const { type, format } = req.params;
    const { startDate, endDate, branchId } = req.query;
    try {
        const data = await compileReportData(type, {
            startDate: startDate,
            endDate: endDate,
            branchId: branchId
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
            }
            else {
                doc.text("No data matches the selected filters.", { align: "center" });
            }
            doc.end();
            return;
        }
        return res.status(400).json({ error: "Unsupported export format." });
    }
    catch (error) {
        console.error(`Failed to export report ${type} as ${format}:`, error);
        return res.status(500).json({ error: error.message || "Failed to generate report export." });
    }
});
exports.default = router;
