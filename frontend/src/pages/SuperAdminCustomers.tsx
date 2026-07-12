import React, { useState, useEffect } from "react";
import axios from "axios";
import { useStore } from "../store/useStore";
import { Users, RefreshCw, Search, Phone, Award, CreditCard } from "lucide-react";

const money = (n: number | undefined) =>
  `Rs. ${Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

export default function SuperAdminCustomers() {
  const { addNotification } = useStore();
  const [customers, setCustomers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const fetchCustomers = async () => {
    setLoading(true);
    try {
      const res = await axios.get("/api/accounting/customers");
      setCustomers(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      addNotification("Failed to fetch customers.", "warning");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCustomers();
  }, []);

  const filtered = customers.filter((c) => {
    const q = search.toLowerCase();
    return (
      c.name?.toLowerCase().includes(q) ||
      c.phone?.toLowerCase().includes(q) ||
      c.email?.toLowerCase().includes(q)
    );
  });

  const totalCredit = filtered.reduce((sum, c) => sum + (c.creditBalance || 0), 0);
  const totalPoints = filtered.reduce((sum, c) => sum + (c.rewardPoints || 0), 0);

  return (
    <div className="space-y-6 flex-1">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="space-y-1">
          <h1 className="text-xl font-black text-foreground tracking-tight flex items-center gap-2">
            <span className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center p-1.5">
              <Users className="w-4 h-4 text-primary" />
            </span>
            Platform Customers
          </h1>
          <p className="text-xs text-muted-foreground">
            All registered customers across the platform.
          </p>
        </div>
        <button
          onClick={fetchCustomers}
          disabled={loading}
          className="bg-secondary border border-border hover:bg-secondary/80 text-foreground text-xs font-bold px-3 py-2.5 rounded-xl flex items-center gap-1.5 transition disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} /> Refresh
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-card border border-indigo-500/20 p-5 rounded-2xl">
          <div className="flex items-center gap-2 text-indigo-400 mb-1">
            <Users className="w-4 h-4" />
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Total Customers</p>
          </div>
          <h3 className="text-2xl font-extrabold text-foreground">{customers.length}</h3>
          <p className="text-[11px] text-muted-foreground">Registered shoppers</p>
        </div>
        <div className="bg-card border border-amber-500/20 p-5 rounded-2xl">
          <div className="flex items-center gap-2 text-amber-400 mb-1">
            <CreditCard className="w-4 h-4" />
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Outstanding Credit</p>
          </div>
          <h3 className="text-2xl font-extrabold text-foreground">{money(totalCredit)}</h3>
          <p className="text-[11px] text-muted-foreground">Total credit balance</p>
        </div>
        <div className="bg-card border border-emerald-500/20 p-5 rounded-2xl">
          <div className="flex items-center gap-2 text-emerald-400 mb-1">
            <Award className="w-4 h-4" />
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Reward Points</p>
          </div>
          <h3 className="text-2xl font-extrabold text-foreground">{totalPoints.toLocaleString()}</h3>
          <p className="text-[11px] text-muted-foreground">Total loyalty points</p>
        </div>
      </div>

      {/* Search */}
      <div className="flex items-center gap-3 bg-card border border-border px-4 py-3 rounded-2xl max-w-md">
        <Search className="w-4 h-4 text-muted-foreground" />
        <input
          type="text"
          placeholder="Search customers by name, phone or email..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="bg-transparent border-0 outline-none text-xs text-foreground placeholder-muted-foreground w-full"
        />
      </div>

      {/* Customers table */}
      <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-sm">
        {loading ? (
          <div className="py-20 flex flex-col items-center gap-2">
            <span className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
            <p className="text-xs text-muted-foreground font-medium">Loading customers...</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-border bg-secondary/40 text-[10px] uppercase tracking-wider text-muted-foreground select-none">
                  <th className="px-5 py-4 font-bold">Name</th>
                  <th className="px-5 py-4 font-bold">Phone</th>
                  <th className="px-5 py-4 font-bold">Email</th>
                  <th className="px-5 py-4 font-bold text-right">Credit Balance</th>
                  <th className="px-5 py-4 font-bold text-right">Reward Points</th>
                  <th className="px-5 py-4 font-bold text-right">Joined</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {filtered.map((c) => (
                  <tr key={c.id} className="hover:bg-secondary/20 transition-colors">
                    <td className="px-5 py-4 font-semibold text-foreground">{c.name}</td>
                    <td className="px-5 py-4 text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Phone className="w-3 h-3" />
                        {c.phone || "—"}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-muted-foreground">{c.email || "—"}</td>
                    <td className="px-5 py-4 text-right font-bold">
                      {c.creditBalance > 0 ? (
                        <span className="text-amber-400">{money(c.creditBalance)}</span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-5 py-4 text-right text-muted-foreground">
                      {c.rewardPoints > 0 ? c.rewardPoints.toLocaleString() : "—"}
                    </td>
                    <td className="px-5 py-4 text-right text-muted-foreground whitespace-nowrap">
                      {new Date(c.createdAt).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-16 text-center text-muted-foreground font-medium">
                      No customers found matching your search.
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
