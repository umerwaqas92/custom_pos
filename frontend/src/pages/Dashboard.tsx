import React, { useState, useEffect } from "react";
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
  Legend
} from "recharts";
import {
  TrendingUp,
  DollarSign,
  AlertTriangle,
  FileCheck,
  TrendingDown,
  Sparkles,
  ShoppingBag,
  Package2,
  Users
} from "lucide-react";

interface Stats {
  totalProducts: number;
  lowStockCount: number;
  totalSalesCount: number;
  totalRevenue: number;
  totalExpenses: number;
  netProfit: number;
  totalCustomers: number;
  pendingPurchases: number;
  pendingWarranties: number;
}

interface ChartData {
  salesTrend: { date: string; revenue: number }[];
  categoryChartData: { name: string; value: number }[];
  brandChartData: { brand: string; revenue: number }[];
}

const COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#06b6d4"];

export default function Dashboard() {
  const { addNotification } = useStore();
  const [stats, setStats] = useState<Stats | null>(null);
  const [charts, setCharts] = useState<ChartData | null>(null);
  const [topProducts, setTopProducts] = useState<any[]>([]);
  const [lowStockList, setLowStockList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchDashboardData = async () => {
      setLoading(true);
      try {
        const [statsRes, chartsRes, topRes, alertRes] = await Promise.all([
          axios.get("/api/reports/dashboard-stats"),
          axios.get("/api/reports/charts"),
          axios.get("/api/reports/top-selling"),
          axios.get("/api/inventory/alerts")
        ]);

        setStats(statsRes.data);
        setCharts(chartsRes.data);
        setTopProducts(topRes.data);
        setLowStockList(alertRes.data);
      } catch (err) {
        console.error(err);
        addNotification("Failed to fetch dashboard metrics.", "warning");
      } finally {
        setLoading(false);
      }
    };

    fetchDashboardData();
  }, [addNotification]);

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
      title: "30-Day Revenue",
      value: `Rs. ${stats?.totalRevenue.toLocaleString()}`,
      description: "Aggregated gross sales",
      icon: DollarSign,
      color: "bg-blue-500/10 text-blue-400 border-blue-500/20"
    },
    {
      title: "30-Day Net Profit",
      value: `Rs. ${stats?.netProfit.toLocaleString()}`,
      description: "Gross revenue minus expenses",
      icon: TrendingUp,
      color: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
    },
    {
      title: "30-Day Expenses",
      value: `Rs. ${stats?.totalExpenses.toLocaleString()}`,
      description: "Operating costs logged",
      icon: TrendingDown,
      color: "bg-rose-500/10 text-rose-400 border-rose-500/20"
    },
    {
      title: "Registered Customers",
      value: stats?.totalCustomers || 0,
      description: "Profiles in database",
      icon: Users,
      color: "bg-indigo-500/10 text-indigo-400 border-indigo-500/20"
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
            <span className="text-xs font-bold uppercase tracking-wider"> Electronics Dashboard</span>
          </div>
          <h1 className="text-2xl font-black tracking-tight text-foreground">Welcome to the Dashboard</h1>
          <p className="text-sm text-muted-foreground">Monitor inventory levels, track cashier checkouts, and view technical operations.</p>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((card, idx) => {
          const Icon = card.icon;
          return (
            <div key={idx} className={`bg-card border p-6 rounded-2xl flex items-center justify-between ${card.color}`}>
              <div className="space-y-1">
                <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{card.title}</p>
                <h3 className="text-3xl font-extrabold tracking-tight text-foreground">{card.value}</h3>
                <p className="text-xs text-muted-foreground">{card.description}</p>
              </div>
              <div className="p-3 bg-secondary rounded-xl">
                <Icon className="w-6 h-6" />
              </div>
            </div>
          );
        })}
      </div>

      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Sales Trend (Area Chart) */}
        <div className="lg:col-span-2 bg-card border border-border p-6 rounded-2xl flex flex-col justify-between h-96">
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp className="w-5 h-5 text-primary" />
            <h3 className="font-bold text-sm text-foreground">Sales Trend (Last 30 Days)</h3>
          </div>
          <div className="flex-1 w-full min-h-0">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={charts?.salesTrend || []} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorRev" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="date" stroke="#6b7280" fontSize={11} tickLine={false} />
                <YAxis stroke="#6b7280" fontSize={11} tickLine={false} />
                <Tooltip
                  contentStyle={{ backgroundColor: "hsl(var(--card))", borderColor: "hsl(var(--border))" }}
                  labelStyle={{ color: "#9ca3af" }}
                />
                <Area type="monotone" dataKey="revenue" stroke="#3b82f6" strokeWidth={2} fillOpacity={1} fill="url(#colorRev)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Categories Share (Pie Chart) */}
        <div className="bg-card border border-border p-6 rounded-2xl flex flex-col justify-between h-96">
          <div className="flex items-center gap-2 mb-2">
            <ShoppingBag className="w-5 h-5 text-indigo-400" />
            <h3 className="font-bold text-sm text-foreground">Categories Share</h3>
          </div>
          <div className="flex-1 w-full min-h-0 flex items-center justify-center">
            {charts?.categoryChartData && charts.categoryChartData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={charts.categoryChartData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={80}
                    paddingAngle={3}
                    dataKey="value"
                  >
                    {charts.categoryChartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{ backgroundColor: "hsl(var(--card))", borderColor: "hsl(var(--border))" }}
                  />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-xs text-muted-foreground">No inventory records.</p>
            )}
          </div>
          {/* Legend Labels */}
          <div className="flex flex-wrap gap-2 justify-center mt-2 max-h-20 overflow-y-auto">
            {charts?.categoryChartData.map((entry, index) => (
              <div key={index} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: COLORS[index % COLORS.length] }} />
                <span>{entry.name}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Details Lists (Low Stock + Brand sales) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Low Stock Alerts */}
        <div className="bg-card border border-border p-6 rounded-2xl flex flex-col">
          <div className="flex items-center gap-2 mb-4">
            <AlertTriangle className="w-5 h-5 text-amber-500" />
            <h3 className="font-bold text-sm text-foreground">Low Stock Alerts</h3>
          </div>
          <div className="overflow-x-auto flex-1">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-border text-muted-foreground font-semibold">
                  <th className="pb-3">Product Name</th>
                  <th className="pb-3">SKU</th>
                  <th className="pb-3 text-center">Available Stock</th>
                  <th className="pb-3 text-center">Min Threshold</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {lowStockList.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="py-4 text-center text-muted-foreground">
                      All products exceed minimum stock levels!
                    </td>
                  </tr>
                ) : (
                  lowStockList.map((prod) => (
                    <tr key={prod.id} className="hover:bg-secondary/30 transition">
                      <td className="py-3 font-semibold text-foreground">{prod.name}</td>
                      <td className="py-3 text-muted-foreground">{prod.sku}</td>
                      <td className="py-3 text-center font-bold text-red-400">{prod.stockQuantity}</td>
                      <td className="py-3 text-center text-muted-foreground">{prod.minStock}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Top Products / Brand Revenues */}
        <div className="bg-card border border-border p-6 rounded-2xl flex flex-col justify-between h-96">
          <div className="flex items-center gap-2 mb-4">
            <FileCheck className="w-5 h-5 text-green-400" />
            <h3 className="font-bold text-sm text-foreground">Top-Selling Products (30 Days)</h3>
          </div>
          <div className="flex-1 w-full min-h-0">
            {topProducts.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-10">No POS transactions registered yet.</p>
            ) : (
              <div className="space-y-4">
                {topProducts.map((p, idx) => (
                  <div key={idx} className="flex items-center justify-between p-3 bg-secondary/50 rounded-xl border border-border">
                    <div className="flex items-center gap-3">
                      <span className="w-6 h-6 rounded bg-primary/20 text-primary flex items-center justify-center font-bold text-xs">
                        {idx + 1}
                      </span>
                      <div>
                        <p className="text-xs font-semibold text-foreground">{p.name}</p>
                        <p className="text-[10px] text-muted-foreground">{p.sku} | Brand: {p.brand}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-xs font-bold text-foreground">Rs. {p.revenue.toLocaleString()}</p>
                      <p className="text-[10px] text-muted-foreground">{p.quantity} units sold</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
