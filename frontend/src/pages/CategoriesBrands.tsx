import React, { useState, useEffect } from "react";
import axios from "axios";
import { useStore } from "../store/useStore";
import {
  Plus,
  FolderOpen,
  Tag,
  Grid,
  CheckCircle,
  FileSpreadsheet
} from "lucide-react";

export default function CategoriesBrands() {
  const { addNotification } = useStore();
  const [activeTab, setActiveTab] = useState<"CATEGORIES" | "BRANDS">("CATEGORIES");
  const [categories, setCategories] = useState<any[]>([]);
  const [brands, setBrands] = useState<any[]>([]);

  // Search filter
  const [search, setSearch] = useState("");

  // Modals state
  const [catOpen, setCatOpen] = useState(false);
  const [brandOpen, setBrandOpen] = useState(false);

  // Forms state
  const [newCategoryName, setNewCategoryName] = useState("");
  const [newBrandName, setNewBrandName] = useState("");

  const loadData = async () => {
    try {
      const [catRes, brandRes] = await Promise.all([
        axios.get("/api/products/categories"),
        axios.get("/api/products/brands")
      ]);
      setCategories(catRes.data);
      setBrands(brandRes.data);
    } catch (err) {
      addNotification("Failed to load catalog options.", "warning");
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleCreateCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCategoryName.trim()) {
      addNotification("Category name cannot be empty.", "warning");
      return;
    }

    try {
      await axios.post("/api/products/categories", { name: newCategoryName });
      addNotification(`Category "${newCategoryName}" created successfully!`, "success");
      setCatOpen(false);
      setNewCategoryName("");
      loadData();
    } catch (err: any) {
      const msg = err.response?.data?.error || "Failed to create category.";
      addNotification(msg, "warning");
    }
  };

  const handleCreateBrand = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newBrandName.trim()) {
      addNotification("Brand name cannot be empty.", "warning");
      return;
    }

    try {
      await axios.post("/api/products/brands", { name: newBrandName });
      addNotification(`Brand "${newBrandName}" created successfully!`, "success");
      setBrandOpen(false);
      setNewBrandName("");
      loadData();
    } catch (err: any) {
      const msg = err.response?.data?.error || "Failed to create brand.";
      addNotification(msg, "warning");
    }
  };

  return (
    <div className="space-y-6 flex-1">
      
      {/* Header Tabs */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-card border border-border p-5 rounded-2xl">
        <div className="flex gap-2 border border-border bg-secondary p-1 rounded-xl">
          <button
            onClick={() => { setActiveTab("CATEGORIES"); setSearch(""); }}
            className={`px-4 py-2 text-xs font-bold rounded-lg flex items-center gap-1.5 transition ${
              activeTab === "CATEGORIES" ? "bg-primary text-white shadow" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Grid className="w-4 h-4" /> Product Categories
          </button>
          <button
            onClick={() => { setActiveTab("BRANDS"); setSearch(""); }}
            className={`px-4 py-2 text-xs font-bold rounded-lg flex items-center gap-1.5 transition ${
              activeTab === "BRANDS" ? "bg-primary text-white shadow" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Tag className="w-4 h-4" /> Product Brands
          </button>
        </div>

        {activeTab === "CATEGORIES" ? (
          <button
            onClick={() => setCatOpen(true)}
            className="bg-primary hover:bg-primary/95 text-white text-xs font-bold px-4 py-2.5 rounded-xl flex items-center gap-1.5 transition"
          >
            <Plus className="w-4 h-4" /> Add Category
          </button>
        ) : (
          <button
            onClick={() => setBrandOpen(true)}
            className="bg-primary hover:bg-primary/95 text-white text-xs font-bold px-4 py-2.5 rounded-xl flex items-center gap-1.5 transition"
          >
            <Plus className="w-4 h-4" /> Add Brand
          </button>
        )}
      </div>

      {/* Grid Content */}
      <div className="bg-card border border-border rounded-2xl p-5 space-y-4">
        
        {/* Search */}
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={`Search active ${activeTab === "CATEGORIES" ? "categories" : "brands"}...`}
          className="w-full bg-secondary text-foreground text-sm border border-border px-4 py-2.5 rounded-xl focus:outline-none"
        />

        {/* Categories Tab table */}
        {activeTab === "CATEGORIES" && (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-border text-muted-foreground font-semibold">
                  <th className="pb-3 pl-2">Category ID Reference</th>
                  <th className="pb-3">Category Name</th>
                  <th className="pb-3">Created Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {categories
                  .filter(cat => cat.name.toLowerCase().includes(search.toLowerCase()))
                  .map((cat) => (
                    <tr key={cat.id} className="hover:bg-secondary/20 transition">
                      <td className="py-4 pl-2 text-muted-foreground font-mono">{cat.id}</td>
                      <td className="py-4 font-bold text-foreground">{cat.name}</td>
                      <td className="py-4 text-muted-foreground">{new Date(cat.createdAt).toLocaleDateString()}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Brands Tab table */}
        {activeTab === "BRANDS" && (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-border text-muted-foreground font-semibold">
                  <th className="pb-3 pl-2">Brand ID Reference</th>
                  <th className="pb-3">Brand Name</th>
                  <th className="pb-3">Created Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {brands
                  .filter(br => br.name.toLowerCase().includes(search.toLowerCase()))
                  .map((br) => (
                    <tr key={br.id} className="hover:bg-secondary/20 transition">
                      <td className="py-4 pl-2 text-muted-foreground font-mono">{br.id}</td>
                      <td className="py-4 font-bold text-foreground">{br.name}</td>
                      <td className="py-4 text-muted-foreground">{new Date(br.createdAt).toLocaleDateString()}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add Category Dialog Modal */}
      {catOpen && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/60 backdrop-blur-sm z-50 px-4">
          <div className="bg-card border border-border w-full max-w-sm p-6 rounded-2xl shadow-2xl relative">
            <h3 className="font-bold text-sm text-foreground mb-4">Add Product Category</h3>
            <form onSubmit={handleCreateCategory} className="space-y-4">
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-muted-foreground uppercase">Category Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Smart Watches, Audio Cables"
                  value={newCategoryName}
                  onChange={(e) => setNewCategoryName(e.target.value)}
                  className="w-full bg-secondary border border-border px-3 py-2 rounded text-xs focus:outline-none"
                />
              </div>

              <div className="flex gap-3 justify-end pt-4">
                <button
                  type="button"
                  onClick={() => setCatOpen(false)}
                  className="px-4 py-2 border border-border text-xs rounded hover:bg-secondary transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-primary text-white text-xs rounded hover:bg-primary/95 transition"
                >
                  Save Category
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Brand Dialog Modal */}
      {brandOpen && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/60 backdrop-blur-sm z-50 px-4">
          <div className="bg-card border border-border w-full max-w-sm p-6 rounded-2xl shadow-2xl relative">
            <h3 className="font-bold text-sm text-foreground mb-4">Add Product Brand</h3>
            <form onSubmit={handleCreateBrand} className="space-y-4">
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-muted-foreground uppercase">Brand Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Sony, Huawei, JBL"
                  value={newBrandName}
                  onChange={(e) => setNewBrandName(e.target.value)}
                  className="w-full bg-secondary border border-border px-3 py-2 rounded text-xs focus:outline-none"
                />
              </div>

              <div className="flex gap-3 justify-end pt-4">
                <button
                  type="button"
                  onClick={() => setBrandOpen(false)}
                  className="px-4 py-2 border border-border text-xs rounded hover:bg-secondary transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-primary text-white text-xs rounded hover:bg-primary/95 transition"
                >
                  Save Brand
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
