import React, { useState, useEffect } from "react";
import axios from "axios";
import { useStore } from "../store/useStore";
import { Search, Package, RefreshCw } from "lucide-react";

export default function SuperAdminProducts() {
  const { addNotification } = useStore();
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const fetchProducts = async () => {
    setLoading(true);
    try {
      const res = await axios.get("/api/products");
      setProducts(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      addNotification("Failed to fetch products.", "warning");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProducts();
  }, []);

  const filteredProducts = products.filter((p) => {
    const s = search.toLowerCase();
    return (
      p.sku?.toLowerCase().includes(s) ||
      p.name?.toLowerCase().includes(s) ||
      p.cat_name?.toLowerCase().includes(s) ||
      p.brand_name?.toLowerCase().includes(s)
    );
  });

  const money = (n: number | undefined) =>
    `Rs. ${Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

  return (
    <div className="space-y-6 flex-1">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="space-y-1">
          <h1 className="text-xl font-black text-foreground tracking-tight flex items-center gap-2">
            <span className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center p-1.5">
              <Package className="w-4 h-4 text-primary" />
            </span>
            All Products
          </h1>
          <p className="text-xs text-muted-foreground">
            View all products and SKUs in the catalog database across all tenant shops.
          </p>
        </div>
        <button
          onClick={fetchProducts}
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
          placeholder="Search products by SKU, name, brand..."
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
            <p className="text-xs text-muted-foreground font-medium">Retrieving products...</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-border bg-secondary/40 text-[10px] uppercase tracking-wider text-muted-foreground select-none">
                  <th className="px-5 py-4 font-bold">SKU</th>
                  <th className="px-5 py-4 font-bold">Product Name</th>
                  <th className="px-5 py-4 font-bold">Category / Brand</th>
                  <th className="px-5 py-4 font-bold">Purchase Price</th>
                  <th className="px-5 py-4 font-bold">Selling Price</th>
                  <th className="px-5 py-4 font-bold">Stock Qty</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {filteredProducts.map((p) => (
                  <tr key={p.id} className="hover:bg-secondary/20 transition-colors">
                    <td className="px-5 py-4 font-mono font-bold text-foreground">{p.sku}</td>
                    <td className="px-5 py-4 text-foreground">{p.name}</td>
                    <td className="px-5 py-4 text-muted-foreground">
                      {p.cat_name || "—"} / {p.brand_name || "—"}
                    </td>
                    <td className="px-5 py-4 font-semibold text-muted-foreground">{money(p.purchasePrice)}</td>
                    <td className="px-5 py-4 font-extrabold text-foreground">{money(p.sellingPrice)}</td>
                    <td className="px-5 py-4">
                      <span className={`font-bold ${p.stockQuantity <= p.minStock ? "text-red-400" : "text-foreground"}`}>
                        {p.stockQuantity}
                      </span>
                    </td>
                  </tr>
                ))}
                {filteredProducts.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-16 text-center text-muted-foreground font-medium">
                      No products found matching your search.
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
