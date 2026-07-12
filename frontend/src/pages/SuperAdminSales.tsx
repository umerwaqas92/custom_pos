import React, { useState, useEffect } from "react";
import axios from "axios";
import { useStore } from "../store/useStore";
import { Receipt, RefreshCw, Search, DollarSign, TrendingUp, TrendingDown } from "lucide-react";

const money = (n: number | undefined) =>
  `Rs. ${Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

export default function SuperAdminSales() {
  const { addNotification } = useStore();
  const [sales, setSales] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const fetchSales = async () => {
    setLoading(true);
    try {
      const res = await axios.get("/api/sales");
      setSales(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      addNotification("Failed to fetch sales.", "warning");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSales();
  }, []);

  const filtered = sales.filter((s) => {
    const q = search.toLowerCase();
    return (
      s.id?.toLowerCase().includes(q) ||
      s.customer?.name?.toLowerCase().includes(q) ||
      s.cashier?.name?.toLowerCase().includes(q) ||
      s.branch?.name?.toLowerCase().includes(q) ||
      s.paymentMethod?.toLowerCase().includes(q)
    );
  });

  const totalRevenue = filtered.reduce((sum, s) => sum + (s.payableAmount || 0), 0);
  const totalSales = filtered.length;

  return (
    <div className="space-y-6 flex-1">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="space-y-1">
          <h1 className="text-xl font-black text-foreground tracking-tight flex items-center gap-2">
            <span className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center p-1.5">
              <Receipt className="w-4 h-4 text-primary" />
            </span>
            Platform Sales
          </h1>
          <p className="text-xs text-muted-foreground">
            All sales across every branch on the platform.
          </p>
        </div>
        <button
          onClick={fetchSales}
          disabled={loading}
          className="bg-secondary border border-border hover:bg-secondary/80 text-foreground text-xs font-bold px-3 py-2.5 rounded-xl flex items-center gap-1.5 transition disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} /> Refresh
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-card border border-sky-500/20 p-5 rounded-2xl">
          <div className="flex items-center gap-2 text-sky-400 mb-1">
            <Receipt className="w-4 h-4" />
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Total Sales</p>
          </div>
          <h3 className="text-2xl font-extrabold text-foreground">{totalSales}</h3>
          <p className="text-[11px] text-muted-foreground">Across all branches</p>
        </div>
        <div className="bg-card border border-emerald-500/20 p-5 rounded-2xl">
          <div className="flex items-center gap-2 text-emerald-400 mb-1">
            <DollarSign className="w-4 h-4" />
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Total Revenue</p>
          </div>
          <h3 className="text-2xl font-extrabold text-foreground">{money(totalRevenue)}</h3>
          <p className="text-[11px] text-muted-foreground">Sum of all payable amounts</p>
        </div>
        <div className="bg-card border border-amber-500/20 p-5 rounded-2xl">
          <div className="flex items-center gap-2 text-amber-400 mb-1">
            <TrendingUp className="w-4 h-4" />
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Average Sale</p>
          </div>
          <h3 className="text-2xl font-extrabold text-foreground">{money(totalSales ? totalRevenue / totalSales : 0)}</h3>
          <p className="text-[11px] text-muted-foreground">Per invoice average</p>
        </div>
      </div>

      {/* Search */}
      <div className="flex items-center gap-3 bg-card border border-border px-4 py-3 rounded-2xl max-w-md">
        <Search className="w-4 h-4 text-muted-foreground" />
        <input
          type="text"
          placeholder="Search by invoice, customer, cashier, branch..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="bg-transparent border-0 outline-none text-xs text-foreground placeholder-muted-foreground w-full"
        />
      </div>

      {/* Sales table */}
      <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-sm">
        {loading ? (
          <div className="py-20 flex flex-col items-center gap-2">
            <span className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
            <p className="text-xs text-muted-foreground font-medium">Loading sales...</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-border bg-secondary/40 text-[10px] uppercase tracking-wider text-muted-foreground select-none">
                  <th className="px-5 py-4 font-bold">Invoice</th>
                  <th className="px-5 py-4 font-bold">Customer</th>
                  <th className="px-5 py-4 font-bold">Cashier</th>
                  <th className="px-5 py-4 font-bold">Branch</th>
                  <th className="px-5 py-4 font-bold">Items</th>
                  <th className="px-5 py-4 font-bold">Payment</th>
                  <th className="px-5 py-4 font-bold text-right">Amount</th>
                  <th className="px-5 py-4 font-bold text-right">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {filtered.map((s) => (
                  <tr key={s.id} className="hover:bg-secondary/20 transition-colors">
                    <td className="px-5 py-4 font-mono text-[10px] text-muted-foreground">
                      {s.id.substring(0, 8)}
                    </td>
                    <td className="px-5 py-4 font-semibold text-foreground">
                      {s.customer?.name || <span className="italic text-muted-foreground">Walk-in</span>}
                    </td>
                    <td className="px-5 py-4 text-muted-foreground">{s.cashier?.name || "—"}</td>
                    <td className="px-5 py-4 text-muted-foreground">{s.branch?.name || "—"}</td>
                    <td className="px-5 py-4 text-muted-foreground">{s.items?.length || 0}</td>
                    <td className="px-5 py-4">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-lg ${
                        s.paymentStatus === "PAID"
                          ? "bg-emerald-500/15 text-emerald-400"
                          : s.paymentStatus === "PARTIAL"
                          ? "bg-amber-500/15 text-amber-400"
                          : "bg-rose-500/15 text-rose-400"
                      }`}>
                        {s.paymentMethod} · {s.paymentStatus}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-right font-extrabold text-foreground">{money(s.payableAmount)}</td>
                    <td className="px-5 py-4 text-right text-muted-foreground whitespace-nowrap">
                      {new Date(s.saleDate).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={8} className="py-16 text-center text-muted-foreground font-medium">
                      No sales found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
