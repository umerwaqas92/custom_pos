import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import axios from "axios";
import { useStore } from "../store/useStore";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  Legend,
  ComposedChart,
  Line
} from "recharts";
import {
  TrendingUp,
  DollarSign,
  AlertTriangle,
  TrendingDown,
  Sparkles,
  ShoppingBag,
  Package2,
  Users,
  RefreshCw,
  Calendar,
  Wallet,
  Receipt,
  Award,
  Banknote,
  ChevronRight
} from "lucide-react";

const LOW_STOCK_THRESHOLD = 3;

interface Stats {
  todaySales: number;
  todaySalesCount: number;
  monthlySales: number;
  monthlySalesCount: number;
  monthlyExpenses: number;
  monthlyProfit: number;
  totalProducts: number;
  totalUnitsInStock: number;
  lowStockCount: number;
  outOfStockCount: number;
  totalSalesCount: number;
  totalRevenue: number;
  totalExpenses: number;
  netProfit: number;
  totalCustomers: number;
  cashBalance: number;
  bankBalance: number;
  walletBalance: number;
  totalBalance: number;
  recentSales: any[];
  recentCustomers: any[];
}

interface ChartData {
  salesTrend: { date: string; fullDate?: string; revenue: number }[];
  dailyRevenue: { date: string; fullDate?: string; revenue: number }[];
  profitTrend: { date: string; fullDate?: string; revenue: number; expenses: number; profit: number }[];
  categoryChartData: { name: string; value: number }[];
  brandChartData: { brand: string; revenue: number }[];
}

const COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#06b6d4", "#84cc16"];

const money = (n: number | undefined) =>
  `Rs. ${Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

export default function Dashboard() {
  const { addNotification, branches, selectedBranchId, user } = useStore();
  const [stats, setStats] = useState<Stats | null>(null);
  const [charts, setCharts] = useState<ChartData | null>(null);
  const [topProducts, setTopProducts] = useState<any[]>([]);
  const [lowStockList, setLowStockList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Super Admin specific state
  const [allBranches, setAllBranches] = useState<any[]>([]);
  const [allUsers, setAllUsers] = useState<any[]>([]);
  const [allProducts, setAllProducts] = useState<any[]>([]);

  const fetchDashboardData = async () => {
    setLoading(true);
    try {
      const branchParams = selectedBranchId ? { branchId: selectedBranchId } : {};
      const opts = { params: branchParams, timeout: 20000 };

      if (user?.role === "SUPER_ADMIN") {
        const [statsRes, branchesRes, usersRes, productsRes] = await Promise.all([
          axios.get("/api/reports/dashboard-stats", opts),
          axios.get("/api/auth/branches"),
          axios.get("/api/auth/users"),
          axios.get("/api/products")
        ]);
        setStats(statsRes.data && typeof statsRes.data === "object" ? statsRes.data : null);
        setAllBranches(Array.isArray(branchesRes.data) ? branchesRes.data : []);
        setAllUsers(Array.isArray(usersRes.data) ? usersRes.data : []);
        setAllProducts(Array.isArray(productsRes.data) ? productsRes.data : []);
      } else {
        const [statsRes, chartsRes, topRes, alertRes] = await Promise.all([
          axios.get("/api/reports/dashboard-stats", opts),
          axios.get("/api/reports/charts", { timeout: 20000 }),
          axios.get("/api/reports/top-selling", { timeout: 20000 }),
          axios.get("/api/inventory/alerts", opts)
        ]);

        const chartsData = chartsRes.data && typeof chartsRes.data === "object" ? chartsRes.data : {};
        setStats(statsRes.data && typeof statsRes.data === "object" ? statsRes.data : null);
        setCharts({
          salesTrend: Array.isArray(chartsData.salesTrend) ? chartsData.salesTrend : [],
          dailyRevenue: Array.isArray(chartsData.dailyRevenue) ? chartsData.dailyRevenue : [],
          profitTrend: Array.isArray(chartsData.profitTrend) ? chartsData.profitTrend : [],
          categoryChartData: Array.isArray(chartsData.categoryChartData) ? chartsData.categoryChartData : [],
          brandChartData: Array.isArray(chartsData.brandChartData) ? chartsData.brandChartData : []
        });
        setTopProducts(Array.isArray(topRes.data) ? topRes.data : []);
        setLowStockList(Array.isArray(alertRes.data) ? alertRes.data : []);
      }
    } catch (err) {
      console.error(err);
      setStats({
        todaySales: 0,
        todaySalesCount: 0,
        monthlySales: 0,
        monthlySalesCount: 0,
        monthlyExpenses: 0,
        monthlyProfit: 0,
        totalProducts: 0,
        totalUnitsInStock: 0,
        lowStockCount: 0,
        outOfStockCount: 0,
        totalSalesCount: 0,
        totalRevenue: 0,
        totalExpenses: 0,
        netProfit: 0,
        totalCustomers: 0,
        cashBalance: 0,
        bankBalance: 0,
        walletBalance: 0,
        totalBalance: 0,
        recentSales: [],
        recentCustomers: []
      });
      setCharts({
        salesTrend: [],
        dailyRevenue: [],
        profitTrend: [],
        categoryChartData: [],
        brandChartData: []
      });
      setTopProducts([]);
      setLowStockList([]);
      addNotification("Failed to fetch dashboard metrics.", "warning");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
  }, [addNotification, selectedBranchId, user]);

  const activeBranch = branches.find((b) => b.id === selectedBranchId);
  const displayName = activeBranch?.name || "Dashboard";

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="flex flex-col items-center gap-2">
          <span className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-muted-foreground font-medium">Assembling statistics...</p>
        </div>
      </div>
    );
  }

  const statCards = [
    {
      title: "Today's Sales",
      value: money(stats?.todaySales),
      description: `${stats?.todaySalesCount || 0} invoices today`,
      icon: Calendar,
      iconSrc: "/icons/dashboard/today-sales.png",
      color: "bg-sky-500/10 text-sky-400 border-sky-500/20",
      iconBg: "bg-sky-500/15 ring-sky-500/25",
      to: "/sales-history"
    },
    {
      title: "Monthly Sales",
      value: money(stats?.monthlySales),
      description: `${stats?.monthlySalesCount || 0} invoices this month`,
      icon: DollarSign,
      iconSrc: "/icons/dashboard/monthly-sales.png",
      color: "bg-blue-500/10 text-blue-400 border-blue-500/20",
      iconBg: "bg-blue-500/15 ring-blue-500/25",
      to: "/sales-history"
    },
    {
      title: "Monthly Profit",
      value: money(stats?.monthlyProfit),
      description: "Sales − expenses (this month)",
      icon: TrendingUp,
      iconSrc: "/icons/dashboard/monthly-profit.png",
      color: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
      iconBg: "bg-emerald-500/15 ring-emerald-500/25",
      to: "/accounting"
    },
    {
      title: "Monthly Expenses",
      value: money(stats?.monthlyExpenses),
      description: "Operating costs this month",
      icon: TrendingDown,
      iconSrc: "/icons/dashboard/monthly-expenses.png",
      color: "bg-rose-500/10 text-rose-400 border-rose-500/20",
      iconBg: "bg-rose-500/15 ring-rose-500/25",
      to: "/accounting"
    },
    {
      title: "Cash Balance",
      value: money(stats?.cashBalance),
      description: `All accounts: ${money(stats?.totalBalance)}`,
      icon: Banknote,
      iconSrc: "/icons/dashboard/cash-balance.png",
      color: "bg-amber-500/10 text-amber-400 border-amber-500/20",
      iconBg: "bg-amber-500/15 ring-amber-500/25",
      to: "/accounting"
    },
    {
      title: "Products in Stock",
      value: stats?.totalProducts || 0,
      description: `${(stats?.totalUnitsInStock || 0).toLocaleString()} total units`,
      icon: Package2,
      iconSrc: "/icons/dashboard/products-stock.png",
      color: "bg-indigo-500/10 text-indigo-400 border-indigo-500/20",
      iconBg: "bg-indigo-500/15 ring-indigo-500/25",
      to: "/inventory"
    },
    {
      title: "Low Stock",
      value: stats?.lowStockCount || 0,
      description: `Qty ≤ ${LOW_STOCK_THRESHOLD} (branch stock)`,
      icon: AlertTriangle,
      iconSrc: "/icons/dashboard/low-stock.png",
      color: "bg-orange-500/10 text-orange-400 border-orange-500/20",
      iconBg: "bg-orange-500/15 ring-orange-500/25",
      to: "/inventory"
    }
  ];

  const stripCards = [
    {
      title: "30-Day Revenue",
      value: money(stats?.totalRevenue),
      to: "/sales-history",
      iconSrc: "/icons/dashboard/monthly-sales.png",
      iconBg: "bg-blue-500/15 ring-blue-500/25"
    },
    {
      title: "30-Day Profit",
      value: money(stats?.netProfit),
      to: "/sales-history",
      accent: "text-emerald-400",
      iconSrc: "/icons/dashboard/monthly-profit.png",
      iconBg: "bg-emerald-500/15 ring-emerald-500/25"
    },
    {
      title: "Bank Balance",
      value: money(stats?.bankBalance),
      to: "/accounting",
      iconSrc: "/icons/dashboard/bank-balance.png",
      iconBg: "bg-teal-500/15 ring-teal-500/25"
    },
    {
      title: "Wallet + Customers",
      value: `${money(stats?.walletBalance)} · ${stats?.totalCustomers || 0} cust.`,
      to: "/contacts",
      iconSrc: "/icons/dashboard/cash-balance.png",
      iconBg: "bg-amber-500/15 ring-amber-500/25"
    }
  ];

  const renderSuperAdminDashboard = () => {
    const adminStatCards = [
      {
        title: "Total Shop Branches",
        value: allBranches.length,
        description: "Registered locations",
        icon: ShoppingBag,
        color: "bg-sky-500/10 text-sky-400 border-sky-500/20",
        iconBg: "bg-sky-500/15 ring-sky-500/25"
      },
      {
        title: "Total Platform Users",
        value: allUsers.length,
        description: "Staff & Owner accounts",
        icon: Users,
        color: "bg-blue-500/10 text-blue-400 border-blue-500/20",
        iconBg: "bg-blue-500/15 ring-blue-500/25"
      },
      {
        title: "Total System Products",
        value: allProducts.length,
        description: "SKUs across all branches",
        icon: Package2,
        color: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
        iconBg: "bg-emerald-500/15 ring-emerald-500/25"
      },
      {
        title: "Total Platform Customers",
        value: stats?.totalCustomers || 0,
        description: "Registered shoppers",
        icon: Award,
        color: "bg-amber-500/10 text-amber-400 border-amber-500/20",
        iconBg: "bg-amber-500/15 ring-amber-500/25"
      }
    ];

    const salesStatCards = [
      {
        title: "Today's Sales",
        value: money(stats?.todaySales),
        description: `${stats?.todaySalesCount || 0} invoices today`,
        icon: DollarSign,
        color: "bg-sky-500/10 text-sky-400 border-sky-500/20",
        iconBg: "bg-sky-500/15 ring-sky-500/25"
      },
      {
        title: "Monthly Sales",
        value: money(stats?.monthlySales),
        description: `${stats?.monthlySalesCount || 0} invoices this month`,
        icon: TrendingUp,
        color: "bg-blue-500/10 text-blue-400 border-blue-500/20",
        iconBg: "bg-blue-500/15 ring-blue-500/25"
      },
      {
        title: "30-Day Revenue",
        value: money(stats?.totalRevenue),
        description: `${stats?.totalSalesCount || 0} total invoices`,
        icon: Receipt,
        color: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
        iconBg: "bg-emerald-500/15 ring-emerald-500/25"
      },
      {
        title: "30-Day Net Profit",
        value: money(stats?.netProfit),
        description: "Revenue − expenses",
        icon: TrendingDown,
        color: stats && stats.netProfit >= 0 ? "bg-green-500/10 text-green-400 border-green-500/20" : "bg-rose-500/10 text-rose-400 border-rose-500/20",
        iconBg: "bg-primary/15 ring-primary/25"
      }
    ];

    return (
      <div className="space-y-6 flex-1">
        {/* Welcome banner */}
        <div className="bg-card border border-border p-6 rounded-2xl flex items-center justify-between relative overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 bg-primary/5 rounded-full blur-3xl pointer-events-none" />
          <div className="space-y-1 relative z-10">
            <div className="flex items-center gap-2 text-primary">
              <Sparkles className="w-5 h-5" />
              <span className="text-xs font-bold uppercase tracking-wider">Super Admin Console</span>
            </div>
            <h1 className="text-2xl font-black tracking-tight text-foreground">Global Platform Overview</h1>
            <p className="text-sm text-muted-foreground">
              Platform-wide sales, customers, registered shop branches, users, and catalog items.
            </p>
          </div>
          <button
            onClick={fetchDashboardData}
            disabled={loading}
            className="bg-secondary border border-border hover:bg-secondary/80 text-foreground text-xs font-bold px-3 py-2 rounded-xl flex items-center gap-1.5 transition disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} /> Refresh
          </button>
        </div>

        {/* Platform stats grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {adminStatCards.map((card, idx) => {
            const Icon = card.icon;
            return (
              <div
                key={idx}
                className={`bg-card border p-5 rounded-2xl flex items-center justify-between ${card.color}`}
              >
                <div className="space-y-1 min-w-0">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                    {card.title}
                  </p>
                  <h3 className="text-2xl font-extrabold tracking-tight text-foreground truncate">{card.value}</h3>
                  <p className="text-[11px] text-muted-foreground truncate">{card.description}</p>
                </div>
                <div
                  className={`shrink-0 ml-2 w-12 h-12 rounded-xl overflow-hidden flex items-center justify-center p-2 ring-1 ${card.iconBg}`}
                >
                  <Icon className="w-5 h-5" />
                </div>
              </div>
            );
          })}
        </div>

        {/* Sales stats grid */}
        <div>
          <h2 className="text-sm font-bold text-foreground mb-3 flex items-center gap-2">
            <DollarSign className="w-4 h-4 text-primary" />
            Platform Sales Overview
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            {salesStatCards.map((card, idx) => {
              const Icon = card.icon;
              return (
                <div
                  key={idx}
                  className={`bg-card border p-5 rounded-2xl flex items-center justify-between ${card.color}`}
                >
                  <div className="space-y-1 min-w-0">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                      {card.title}
                    </p>
                    <h3 className="text-2xl font-extrabold tracking-tight text-foreground truncate">{card.value}</h3>
                    <p className="text-[11px] text-muted-foreground truncate">{card.description}</p>
                  </div>
                  <div
                    className={`shrink-0 ml-2 w-12 h-12 rounded-xl overflow-hidden flex items-center justify-center p-2 ring-1 ${card.iconBg}`}
                  >
                    <Icon className="w-5 h-5" />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Recent Sales + Recent Customers */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-card border border-border p-6 rounded-2xl">
            <div className="flex items-center gap-2 mb-4">
              <Receipt className="w-5 h-5 text-primary" />
              <h3 className="font-bold text-sm text-foreground flex-1">Recent Sales (All Branches)</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-border text-muted-foreground font-semibold">
                    <th className="pb-3 pl-1">Invoice</th>
                    <th className="pb-3">Customer</th>
                    <th className="pb-3">Branch</th>
                    <th className="pb-3">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {!stats?.recentSales?.length ? (
                    <tr>
                      <td colSpan={4} className="py-8 text-center text-muted-foreground">No sales yet.</td>
                    </tr>
                  ) : (
                    stats.recentSales.map((s: any) => (
                      <tr key={s.id} className="hover:bg-secondary/30 transition">
                        <td className="py-3 pl-1 font-mono text-muted-foreground">{s.id.substring(0, 8)}</td>
                        <td className="py-3 font-semibold text-foreground">
                          {s.customer?.name || <span className="italic text-muted-foreground">Walk-in</span>}
                        </td>
                        <td className="py-3 text-muted-foreground">{(s as any).branch?.name || "—"}</td>
                        <td className="py-3 font-black text-foreground">{money(s.payableAmount)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="bg-card border border-border p-6 rounded-2xl">
            <div className="flex items-center gap-2 mb-4">
              <Users className="w-5 h-5 text-indigo-400" />
              <h3 className="font-bold text-sm text-foreground flex-1">Recent Customers</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-border text-muted-foreground font-semibold">
                    <th className="pb-3 pl-1">Name</th>
                    <th className="pb-3">Phone</th>
                    <th className="pb-3 text-right">Credit</th>
                    <th className="pb-3 text-right">Joined</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {!stats?.recentCustomers?.length ? (
                    <tr>
                      <td colSpan={4} className="py-8 text-center text-muted-foreground">No customers yet.</td>
                    </tr>
                  ) : (
                    stats.recentCustomers.map((c: any) => (
                      <tr key={c.id} className="hover:bg-secondary/30 transition">
                        <td className="py-3 pl-1 font-semibold text-foreground">{c.name}</td>
                        <td className="py-3 text-muted-foreground">{c.phone || "—"}</td>
                        <td className="py-3 text-right font-bold text-foreground">
                          {c.creditBalance > 0 ? money(c.creditBalance) : "—"}
                        </td>
                        <td className="py-3 text-right text-muted-foreground whitespace-nowrap">
                          {new Date(c.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const chartTooltipStyle = {
    backgroundColor: "hsl(var(--card))",
    borderColor: "hsl(var(--border))",
    borderRadius: 12,
    fontSize: 12
  };

  if (user?.role === "SUPER_ADMIN") {
    return renderSuperAdminDashboard();
  }

  return (
    <div className="space-y-6 flex-1">
      {/* Welcome banner */}
      <div className="bg-card border border-border p-6 rounded-2xl flex items-center justify-between relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-primary/5 rounded-full blur-3xl pointer-events-none" />
        <div className="space-y-1 relative z-10">
          <div className="flex items-center gap-2 text-primary">
            <Sparkles className="w-5 h-5" />
            <span className="text-xs font-bold uppercase tracking-wider">{displayName} Dashboard</span>
          </div>
          <h1 className="text-2xl font-black tracking-tight text-foreground">Business Overview</h1>
          <p className="text-sm text-muted-foreground">
            Today, month-to-date sales, stock health, cash, and performance trends.
          </p>
        </div>
        <button
          onClick={fetchDashboardData}
          disabled={loading}
          className="bg-secondary border border-border hover:bg-secondary/80 text-foreground text-xs font-bold px-3 py-2 rounded-xl flex items-center gap-1.5 transition disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} /> Refresh
        </button>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {statCards.map((card, idx) => {
          const Icon = card.icon;
          return (
            <Link
              key={idx}
              to={card.to}
              className={`bg-card border p-5 rounded-2xl flex items-center justify-between ${card.color} hover:shadow-md hover:scale-[1.01] active:scale-[0.99] transition cursor-pointer group`}
            >
              <div className="space-y-1 min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                  {card.title}
                  <ChevronRight className="w-3 h-3 opacity-0 group-hover:opacity-70 transition" />
                </p>
                <h3 className="text-2xl font-extrabold tracking-tight text-foreground truncate">{card.value}</h3>
                <p className="text-[11px] text-muted-foreground truncate">{card.description}</p>
              </div>
              <div
                className={`shrink-0 ml-2 w-14 h-14 rounded-2xl overflow-hidden flex items-center justify-center p-2 group-hover:scale-105 transition ring-1 ${card.iconBg}`}
              >
                {card.iconSrc ? (
                  <img
                    src={`${card.iconSrc}?v=4`}
                    alt={card.title}
                    className="w-full h-full object-contain"
                    draggable={false}
                  />
                ) : (
                  <Icon className="w-6 h-6" />
                )}
              </div>
            </Link>
          );
        })}
      </div>

      {/* Secondary strip: 30d + balances */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {stripCards.map((card) => (
          <Link
            key={card.title}
            to={card.to}
            className="bg-card border border-border rounded-xl px-4 py-3 hover:bg-secondary/40 hover:border-primary/30 transition cursor-pointer group flex items-center gap-3"
          >
            {card.iconSrc && (
              <div
                className={`w-10 h-10 rounded-xl overflow-hidden shrink-0 flex items-center justify-center p-1.5 ring-1 ${card.iconBg || "bg-primary/10 ring-primary/20"}`}
              >
                <img src={`${card.iconSrc}?v=4`} alt={card.title} className="w-full h-full object-contain" draggable={false} />
              </div>
            )}
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-bold uppercase text-muted-foreground flex items-center gap-1">
                {card.title}
                <ChevronRight className="w-3 h-3 opacity-0 group-hover:opacity-70 transition" />
              </p>
              <p className={`text-sm font-black mt-0.5 truncate ${card.accent || "text-foreground"}`}>{card.value}</p>
            </div>
          </Link>
        ))}
      </div>

      {/* Charts row 1: Sales trend + Daily revenue bar */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-card border border-border p-6 rounded-2xl flex flex-col h-96">
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp className="w-5 h-5 text-primary" />
            <h3 className="font-bold text-sm text-foreground flex-1">Sales Trend (30 Days)</h3>
          </div>
          <div className="flex-1 w-full min-h-0">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={charts?.salesTrend || []} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorRev" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(128,128,128,0.12)" />
                <XAxis dataKey="date" stroke="#6b7280" fontSize={10} tickLine={false} interval="preserveStartEnd" />
                <YAxis stroke="#6b7280" fontSize={10} tickLine={false} />
                <Tooltip contentStyle={chartTooltipStyle} />
                <Area type="monotone" dataKey="revenue" name="Revenue" stroke="#3b82f6" strokeWidth={2} fill="url(#colorRev)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <Link to="/sales-history" className="bg-card border border-border p-6 rounded-2xl flex flex-col h-96 hover:border-primary/40 hover:shadow-md transition cursor-pointer group">
          <div className="flex items-center gap-2 mb-4">
            <Receipt className="w-5 h-5 text-sky-400" />
            <h3 className="font-bold text-sm text-foreground flex-1">Daily Revenue (30 Days)</h3>
            <ChevronRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition" />
          </div>
          <div className="flex-1 w-full min-h-0">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={charts?.dailyRevenue || charts?.salesTrend || []} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(128,128,128,0.12)" />
                <XAxis dataKey="date" stroke="#6b7280" fontSize={10} tickLine={false} interval="preserveStartEnd" />
                <YAxis stroke="#6b7280" fontSize={10} tickLine={false} />
                <Tooltip contentStyle={chartTooltipStyle} />
                <Bar dataKey="revenue" name="Revenue" fill="#0ea5e9" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Link>
      </div>

      {/* Charts row 2: Profit + Categories + Brands */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Link to="/accounting" className="bg-card border border-border p-6 rounded-2xl flex flex-col h-96 hover:border-primary/40 hover:shadow-md transition cursor-pointer group">
          <div className="flex items-center gap-2 mb-4">
            <Wallet className="w-5 h-5 text-emerald-400" />
            <h3 className="font-bold text-sm text-foreground flex-1">Profit Trend</h3>
            <ChevronRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition" />
          </div>
          <div className="flex-1 w-full min-h-0">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={charts?.profitTrend || []} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(128,128,128,0.12)" />
                <XAxis dataKey="date" stroke="#6b7280" fontSize={10} tickLine={false} interval="preserveStartEnd" />
                <YAxis stroke="#6b7280" fontSize={10} tickLine={false} />
                <Tooltip contentStyle={chartTooltipStyle} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="expenses" name="Expenses" fill="#f43f5e" opacity={0.7} radius={[2, 2, 0, 0]} />
                <Line type="monotone" dataKey="profit" name="Profit" stroke="#10b981" strokeWidth={2} dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </Link>

        <Link to="/categories-brands" className="bg-card border border-border p-6 rounded-2xl flex flex-col h-96 hover:border-primary/40 hover:shadow-md transition cursor-pointer group">
          <div className="flex items-center gap-2 mb-2">
            <ShoppingBag className="w-5 h-5 text-indigo-400" />
            <h3 className="font-bold text-sm text-foreground flex-1">Best Categories</h3>
            <ChevronRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition" />
          </div>
          <p className="text-[10px] text-muted-foreground mb-2">By sales revenue · last 30 days</p>
          <div className="flex-1 w-full min-h-0 flex items-center justify-center">
            {charts?.categoryChartData && charts.categoryChartData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={charts.categoryChartData}
                    cx="50%"
                    cy="50%"
                    innerRadius={55}
                    outerRadius={80}
                    paddingAngle={3}
                    dataKey="value"
                    nameKey="name"
                  >
                    {charts.categoryChartData.map((_, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={chartTooltipStyle} formatter={(v: number) => money(v)} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-xs text-muted-foreground">No sales by category yet.</p>
            )}
          </div>
          <div className="flex flex-wrap gap-2 justify-center mt-1 max-h-16 overflow-y-auto">
            {charts?.categoryChartData?.map((entry, index) => (
              <div key={index} className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: COLORS[index % COLORS.length] }} />
                <span>{entry.name}</span>
              </div>
            ))}
          </div>
        </Link>

        <Link to="/categories-brands" className="bg-card border border-border p-6 rounded-2xl flex flex-col h-96 hover:border-primary/40 hover:shadow-md transition cursor-pointer group">
          <div className="flex items-center gap-2 mb-2">
            <Award className="w-5 h-5 text-violet-400" />
            <h3 className="font-bold text-sm text-foreground flex-1">Best Brands</h3>
            <ChevronRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition" />
          </div>
          <p className="text-[10px] text-muted-foreground mb-2">By sales revenue · last 30 days</p>
          <div className="flex-1 w-full min-h-0">
            {charts?.brandChartData && charts.brandChartData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={charts.brandChartData}
                  layout="vertical"
                  margin={{ top: 5, right: 16, left: 8, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="rgba(128,128,128,0.12)" />
                  <XAxis type="number" stroke="#6b7280" fontSize={10} tickLine={false} />
                  <YAxis type="category" dataKey="brand" width={70} stroke="#6b7280" fontSize={10} tickLine={false} />
                  <Tooltip contentStyle={chartTooltipStyle} formatter={(v: number) => money(v)} />
                  <Bar dataKey="revenue" name="Revenue" fill="#8b5cf6" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-xs text-muted-foreground text-center py-10">No brand sales yet.</p>
            )}
          </div>
        </Link>
      </div>

      {/* Lists: Top products + Low stock */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Link to="/sales-history" className="bg-card border border-border p-6 rounded-2xl flex flex-col hover:border-primary/40 hover:shadow-md transition cursor-pointer group">
          <div className="flex items-center gap-2 mb-4">
            <Award className="w-5 h-5 text-green-400" />
            <h3 className="font-bold text-sm text-foreground flex-1">Top-Selling Products</h3>
            <ChevronRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition" />
          </div>
          <div className="space-y-3">
            {topProducts.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-8">No sales yet.</p>
            ) : (
              topProducts.map((p, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between p-3 bg-secondary/50 rounded-xl border border-border"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="w-6 h-6 rounded bg-primary/20 text-primary flex items-center justify-center font-bold text-xs shrink-0">
                      {idx + 1}
                    </span>
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-foreground truncate">{p.name}</p>
                      <p className="text-[10px] text-muted-foreground truncate">
                        {p.sku} · {p.brand}
                      </p>
                    </div>
                  </div>
                  <div className="text-right shrink-0 ml-2">
                    <p className="text-xs font-bold text-foreground">{money(p.revenue)}</p>
                    <p className="text-[10px] text-muted-foreground">{p.quantity} units</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </Link>

        <Link to="/inventory" className="bg-card border border-border p-6 rounded-2xl flex flex-col hover:border-primary/40 hover:shadow-md transition cursor-pointer group">
          <div className="flex items-center gap-2 mb-4">
            <AlertTriangle className="w-5 h-5 text-amber-500" />
            <h3 className="font-bold text-sm text-foreground flex-1">Low / Critical Stock</h3>
            <ChevronRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition" />
          </div>
          <div className="overflow-x-auto flex-1">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-border text-muted-foreground font-semibold">
                  <th className="pb-3">Product</th>
                  <th className="pb-3">SKU</th>
                  <th className="pb-3 text-center">Stock</th>
                  <th className="pb-3 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {lowStockList.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="py-8 text-center text-muted-foreground">
                      All products are above the low-stock threshold.
                    </td>
                  </tr>
                ) : (
                  lowStockList.slice(0, 10).map((prod) => {
                    const out = prod.status === "OUT" || (prod.stockQuantity || 0) <= 0;
                    return (
                      <tr key={prod.id} className="hover:bg-secondary/30 transition">
                        <td className="py-3 font-semibold text-foreground">{prod.name}</td>
                        <td className="py-3 text-muted-foreground">{prod.sku}</td>
                        <td className={`py-3 text-center font-bold ${out ? "text-red-400" : "text-amber-400"}`}>
                          {prod.stockQuantity}
                        </td>
                        <td className="py-3 text-center">
                          <span
                            className={`text-[10px] font-bold px-2 py-0.5 rounded-lg ${
                              out ? "bg-red-500/15 text-red-400" : "bg-amber-500/15 text-amber-400"
                            }`}
                          >
                            {out ? "Out" : "Low"}
                          </span>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </Link>
      </div>

      {/* Recent sales + recent customers */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Link to="/sales-history" className="bg-card border border-border p-6 rounded-2xl hover:border-primary/40 hover:shadow-md transition cursor-pointer group block">
          <div className="flex items-center gap-2 mb-4">
            <Receipt className="w-5 h-5 text-primary" />
            <h3 className="font-bold text-sm text-foreground flex-1">Recent Sales</h3>
            <ChevronRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition" />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-border text-muted-foreground font-semibold">
                  <th className="pb-3 pl-1">Invoice</th>
                  <th className="pb-3">Customer</th>
                  <th className="pb-3">When</th>
                  <th className="pb-3 text-right">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {!stats?.recentSales?.length ? (
                  <tr>
                    <td colSpan={4} className="py-8 text-center text-muted-foreground">
                      No sales yet.
                    </td>
                  </tr>
                ) : (
                  stats.recentSales.map((s) => (
                    <tr key={s.id} className="hover:bg-secondary/30 transition">
                      <td className="py-3 pl-1 font-mono text-muted-foreground">{s.id.substring(0, 8)}</td>
                      <td className="py-3 font-semibold text-foreground">
                        {s.customer?.name || <span className="italic text-muted-foreground">Walk-in</span>}
                      </td>
                      <td className="py-3 text-muted-foreground whitespace-nowrap">
                        {new Date(s.saleDate).toLocaleString(undefined, {
                          month: "short",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit"
                        })}
                      </td>
                      <td className="py-3 text-right font-black text-foreground">{money(s.payableAmount)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Link>

        <Link to="/contacts" className="bg-card border border-border p-6 rounded-2xl hover:border-primary/40 hover:shadow-md transition cursor-pointer group block">
          <div className="flex items-center gap-2 mb-4">
            <Users className="w-5 h-5 text-indigo-400" />
            <h3 className="font-bold text-sm text-foreground flex-1">Recent Customers</h3>
            <ChevronRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition" />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-border text-muted-foreground font-semibold">
                  <th className="pb-3 pl-1">Name</th>
                  <th className="pb-3">Phone</th>
                  <th className="pb-3 text-right">Credit</th>
                  <th className="pb-3 text-right">Joined</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {!stats?.recentCustomers?.length ? (
                  <tr>
                    <td colSpan={4} className="py-8 text-center text-muted-foreground">
                      No customers yet.
                    </td>
                  </tr>
                ) : (
                  stats.recentCustomers.map((c) => (
                    <tr key={c.id} className="hover:bg-secondary/30 transition">
                      <td className="py-3 pl-1 font-semibold text-foreground">{c.name}</td>
                      <td className="py-3 text-muted-foreground">{c.phone || "—"}</td>
                      <td className="py-3 text-right font-bold text-foreground">
                        {c.creditBalance > 0 ? money(c.creditBalance) : "—"}
                      </td>
                      <td className="py-3 text-right text-muted-foreground whitespace-nowrap">
                        {new Date(c.createdAt).toLocaleDateString(undefined, {
                          month: "short",
                          day: "numeric"
                        })}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Link>
      </div>
    </div>
  );
}
