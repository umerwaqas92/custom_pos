import React, { useState, useEffect } from "react";
import axios from "axios";
import { useStore } from "../store/useStore";
import { Search, ShoppingBag, RefreshCw } from "lucide-react";

export default function SuperAdminBranches() {
  const { addNotification } = useStore();
  const [branches, setBranches] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const fetchBranches = async () => {
    setLoading(true);
    try {
      const res = await axios.get("/api/auth/branches");
      setBranches(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      addNotification("Failed to fetch branches.", "warning");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBranches();
  }, []);

  const filteredBranches = branches.filter((b) => {
    const s = search.toLowerCase();
    return (
      b.name?.toLowerCase().includes(s) ||
      b.address?.toLowerCase().includes(s) ||
      b.phone?.toLowerCase().includes(s) ||
      b.id?.toLowerCase().includes(s)
    );
  });

  return (
    <div className="space-y-6 flex-1">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="space-y-1">
          <h1 className="text-xl font-black text-foreground tracking-tight flex items-center gap-2">
            <span className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center p-1.5">
              <ShoppingBag className="w-4 h-4 text-primary" />
            </span>
            Shop Branches
          </h1>
          <p className="text-xs text-muted-foreground">
            View all registered retail stores and branches across the platform.
          </p>
        </div>
        <button
          onClick={fetchBranches}
          disabled={loading}
          className="bg-secondary border border-border hover:bg-secondary/80 text-foreground text-xs font-bold px-3 py-2.5 rounded-xl flex items-center gap-1.5 transition disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} /> Refresh
        </button>
      </div>

      {/* Search Bar */}
      <div className="flex items-center gap-3 bg-card border border-border px-4 py-3 rounded-2xl max-w-md">
        <Search className="w-4 h-4 text-muted-foreground" />
        <input
          type="text"
          placeholder="Search branches by name, address or phone..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="bg-transparent border-0 outline-none text-xs text-foreground placeholder-muted-foreground w-full"
        />
      </div>

      {/* Main Table Card */}
      <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-sm">
        {loading ? (
          <div className="py-20 flex flex-col items-center gap-2">
            <span className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
            <p className="text-xs text-muted-foreground font-medium">Retrieving branches...</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-border bg-secondary/40 text-[10px] uppercase tracking-wider text-muted-foreground select-none">
                  <th className="px-5 py-4 font-bold">Branch Name</th>
                  <th className="px-5 py-4 font-bold">Address</th>
                  <th className="px-5 py-4 font-bold">Phone Number</th>
                  <th className="px-5 py-4 font-bold">Date Created</th>
                  <th className="px-5 py-4 font-bold">ID Reference</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {filteredBranches.map((b) => (
                  <tr key={b.id} className="hover:bg-secondary/20 transition-colors">
                    <td className="px-5 py-4 font-extrabold text-foreground">{b.name}</td>
                    <td className="px-5 py-4 text-muted-foreground">{b.address || "—"}</td>
                    <td className="px-5 py-4 text-muted-foreground">{b.phone || "—"}</td>
                    <td className="px-5 py-4 text-muted-foreground">
                      {b.createdAt ? new Date(b.createdAt).toLocaleDateString() : "—"}
                    </td>
                    <td className="px-5 py-4 font-mono text-[10px] text-muted-foreground select-all">{b.id}</td>
                  </tr>
                ))}
                {filteredBranches.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-16 text-center text-muted-foreground font-medium">
                      No branches found matching your search.
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
