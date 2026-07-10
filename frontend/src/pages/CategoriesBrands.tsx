import React, { useState, useEffect, useMemo } from "react";
import axios from "axios";
import { useStore } from "../store/useStore";
import PortalModal from "../components/PortalModal";
import {
  Plus,
  Tag,
  Grid,
  Edit,
  Trash2,
  ChevronLeft,
  ChevronRight,
  ArrowUp,
  ArrowDown,
  RefreshCw
} from "lucide-react";

const PAGE_SIZE = 15;

export default function CategoriesBrands() {
  const { addNotification } = useStore();
  const [activeTab, setActiveTab] = useState<"CATEGORIES" | "BRANDS">("CATEGORIES");
  const [categories, setCategories] = useState<any[]>([]);
  const [brands, setBrands] = useState<any[]>([]);

  // Search filter
  const [search, setSearch] = useState("");

  // Sort state
  const [sortKey, setSortKey] = useState<string>("name");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  // Selection & pagination
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [currentPage, setCurrentPage] = useState(1);

  // Modals state
  const [catOpen, setCatOpen] = useState(false);
  const [brandOpen, setBrandOpen] = useState(false);

  // Forms state
  const [newCategoryName, setNewCategoryName] = useState("");
  const [newBrandName, setNewBrandName] = useState("");

  // Edit State
  const [editOpen, setEditOpen] = useState(false);
  const [editType, setEditType] = useState<"CATEGORY" | "BRAND" | null>(null);
  const [editId, setEditId] = useState("");
  const [editName, setEditName] = useState("");

  const handleOpenEdit = (type: "CATEGORY" | "BRAND", id: string, name: string) => {
    setEditType(type);
    setEditId(id);
    setEditName(name);
    setEditOpen(true);
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editName.trim()) return;

    try {
      const endpoint = editType === "CATEGORY" ? `/api/products/categories/${editId}` : `/api/products/brands/${editId}`;
      await axios.put(endpoint, { name: editName });
      addNotification(`${editType === "CATEGORY" ? "Category" : "Brand"} updated successfully.`, "success");
      setEditOpen(false);
      loadData();
    } catch (err: any) {
      addNotification("Failed to update item.", "warning");
    }
  };

  const handleDelete = async (type: "CATEGORY" | "BRAND", id: string, name: string) => {
    if (!window.confirm(`Are you sure you want to delete ${type === "CATEGORY" ? "category" : "brand"} "${name}"? Products using it will set to unassigned.`)) {
      return;
    }

    try {
      const endpoint = type === "CATEGORY" ? `/api/products/categories/${id}` : `/api/products/brands/${id}`;
      await axios.delete(endpoint);
      addNotification(`${type === "CATEGORY" ? "Category" : "Brand"} deleted successfully.`, "success");
      loadData();
    } catch (err) {
      addNotification("Failed to delete item.", "warning");
    }
  };

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    if (!window.confirm(`Are you sure you want to delete ${selectedIds.size} selected items? This cannot be undone.`)) {
      return;
    }
    try {
      const endpoint = activeTab === "CATEGORIES"
        ? "/api/products/categories/bulk-delete"
        : "/api/products/brands/bulk-delete";
      await axios.post(endpoint, { ids: Array.from(selectedIds) });
      addNotification(`${selectedIds.size} items deleted successfully.`, "success");
      setSelectedIds(new Set());
      setCurrentPage(1);
      loadData();
    } catch (err: any) {
      const msg = err.response?.data?.error || "Failed to delete items.";
      addNotification(msg, "warning");
    }
  };

  const toggleSelectAll = (visibleItems: any[]) => {
    const visibleIds = new Set(visibleItems.map(i => i.id));
    const allSelected = visibleItems.every(i => selectedIds.has(i.id));
    if (allSelected) {
      setSelectedIds(prev => {
        const next = new Set(prev);
        visibleIds.forEach(id => next.delete(id));
        return next;
      });
    } else {
      setSelectedIds(prev => {
        const next = new Set(prev);
        visibleIds.forEach(id => next.add(id));
        return next;
      });
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

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

  // Sort & filter logic
  const activeData = activeTab === "CATEGORIES" ? categories : brands;

  const filteredData = useMemo(() => {
    const result = activeData.filter(item => item.name.toLowerCase().includes(search.toLowerCase()));
    result.sort((a, b) => {
      let aVal: any, bVal: any;
      switch (sortKey) {
        case "name": aVal = a.name.toLowerCase(); bVal = b.name.toLowerCase(); break;
        case "date": aVal = new Date(a.createdAt).getTime(); bVal = new Date(b.createdAt).getTime(); break;
        default: aVal = a.name.toLowerCase(); bVal = b.name.toLowerCase();
      }
      if (aVal < bVal) return sortDir === "asc" ? -1 : 1;
      if (aVal > bVal) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
    return result;
  }, [activeData, search, sortKey, sortDir]);

  const totalPages = Math.ceil(filteredData.length / PAGE_SIZE);
  const paginatedData = filteredData.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  useEffect(() => { setCurrentPage(1); setSelectedIds(new Set()); }, [search, activeTab, sortKey, sortDir]);

  const toggleSort = (key: string) => {
    if (sortKey === key) {
      setSortDir(d => d === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const SortHeader = ({ label, sortField }: { label: string; sortField: string }) => {
    const active = sortKey === sortField;
    return (
      <th
        className="pb-3 cursor-pointer select-none hover:text-foreground transition"
        onClick={() => toggleSort(sortField)}
      >
        <span className="flex items-center gap-1">
          {label}
          {active ? (
            sortDir === "asc" ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />
          ) : (
            <span className="w-3 h-3" />
          )}
        </span>
      </th>
    );
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

        <div className="flex gap-2">
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
          <button
            onClick={loadData}
            className="border border-border bg-secondary hover:bg-secondary/80 text-foreground text-xs font-bold px-3 py-2.5 rounded-xl flex items-center gap-1.5 transition"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
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

        {/* Bulk action bar */}
        {selectedIds.size > 0 && (
          <div className="flex items-center gap-3 bg-red-500/5 border border-red-500/20 rounded-xl px-4 py-2.5">
            <span className="text-xs font-bold text-red-400">{selectedIds.size} selected</span>
            <button
              onClick={handleBulkDelete}
              className="bg-red-500 hover:bg-red-600 text-white text-xs font-bold px-4 py-1.5 rounded-lg flex items-center gap-1 transition"
            >
              <Trash2 className="w-3.5 h-3.5" /> Delete Selected
            </button>
            <button
              onClick={() => setSelectedIds(new Set())}
              className="text-xs text-muted-foreground hover:text-foreground transition"
            >
              Clear Selection
            </button>
          </div>
        )}

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-border text-muted-foreground font-semibold">
                <th className="pb-3 pl-2 w-10">
                  <input
                    type="checkbox"
                    checked={paginatedData.length > 0 && paginatedData.every(i => selectedIds.has(i.id))}
                    onChange={() => toggleSelectAll(paginatedData)}
                    className="accent-primary cursor-pointer"
                  />
                </th>
                <th className="pb-3 text-muted-foreground" style={{ minWidth: 260 }}>ID Reference</th>
                <SortHeader label={activeTab === "CATEGORIES" ? "Category Name" : "Brand Name"} sortField="name" />
                <SortHeader label="Created Date" sortField="date" />
                <th className="pb-3 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {paginatedData.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-muted-foreground">
                    No items matching search parameters.
                  </td>
                </tr>
              ) : (
                paginatedData.map((item) => (
                  <tr key={item.id} className={`hover:bg-secondary/20 transition ${selectedIds.has(item.id) ? "bg-primary/5" : ""}`}>
                    <td className="py-4 pl-2">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(item.id)}
                        onChange={() => toggleSelect(item.id)}
                        className="accent-primary cursor-pointer"
                      />
                    </td>
                    <td className="py-4 text-muted-foreground font-mono">{item.id}</td>
                    <td className="py-4 font-bold text-foreground">{item.name}</td>
                    <td className="py-4 text-muted-foreground">{new Date(item.createdAt).toLocaleDateString()}</td>
                    <td className="py-4 text-center">
                      <div className="flex justify-center gap-2">
                        <button
                          onClick={() => handleOpenEdit(activeTab === "CATEGORIES" ? "CATEGORY" : "BRAND", item.id, item.name)}
                          className="p-1 text-muted-foreground hover:text-primary transition"
                          title="Edit"
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(activeTab === "CATEGORIES" ? "CATEGORY" : "BRAND", item.id, item.name)}
                          className="p-1 text-muted-foreground hover:text-destructive transition"
                          title="Delete"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between pt-3 border-t border-border">
            <span className="text-xs text-muted-foreground">
              Showing {((currentPage - 1) * PAGE_SIZE) + 1}-{Math.min(currentPage * PAGE_SIZE, filteredData.length)} of {filteredData.length}
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="p-1.5 rounded-lg border border-border bg-secondary hover:bg-secondary/80 disabled:opacity-40 disabled:cursor-not-allowed transition"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              {Array.from({ length: totalPages }, (_, i) => i + 1)
                .filter(page => page === 1 || page === totalPages || Math.abs(page - currentPage) <= 1)
                .reduce<(number | string)[]>((acc, page, i, arr) => {
                  if (i > 0 && page - (arr[i - 1] as number) > 1) acc.push("...");
                  acc.push(page);
                  return acc;
                }, [])
                .map((page, i) =>
                  typeof page === "string" ? (
                    <span key={`dots-${i}`} className="text-xs text-muted-foreground px-1">...</span>
                  ) : (
                    <button
                      key={page}
                      onClick={() => setCurrentPage(page)}
                      className={`px-3 py-1 text-xs rounded-lg font-bold transition ${
                        currentPage === page
                          ? "bg-primary text-white"
                          : "bg-secondary text-foreground hover:bg-secondary/80"
                      }`}
                    >
                      {page}
                    </button>
                  )
                )}
              <button
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="p-1.5 rounded-lg border border-border bg-secondary hover:bg-secondary/80 disabled:opacity-40 disabled:cursor-not-allowed transition"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Add Category Dialog Modal */}
      <PortalModal isOpen={catOpen} onClose={() => setCatOpen(false)} backdropClass="bg-black/60 backdrop-blur-sm px-4">
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
      </PortalModal>

      {/* Add Brand Dialog Modal */}
      <PortalModal isOpen={brandOpen} onClose={() => setBrandOpen(false)} backdropClass="bg-black/60 backdrop-blur-sm px-4">
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
      </PortalModal>

      {/* Edit Category/Brand Dialog Modal */}
      <PortalModal isOpen={editOpen} onClose={() => { setEditOpen(false); setEditType(null); }} backdropClass="bg-black/60 backdrop-blur-sm px-4">
        <div className="bg-card border border-border w-full max-w-sm p-6 rounded-2xl shadow-2xl relative">
            <h3 className="font-bold text-sm text-foreground mb-4">Edit {editType === "CATEGORY" ? "Category" : "Brand"}</h3>
            <form onSubmit={handleEditSubmit} className="space-y-4">
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-muted-foreground uppercase">{editType === "CATEGORY" ? "Category Name" : "Brand Name"} *</label>
                <input
                  type="text"
                  required
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full bg-secondary border border-border px-3 py-2 rounded text-xs focus:outline-none"
                />
              </div>

              <div className="flex gap-3 justify-end pt-4">
                <button
                  type="button"
                  onClick={() => { setEditOpen(false); setEditType(null); }}
                  className="px-4 py-2 border border-border text-xs rounded hover:bg-secondary transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-primary text-white text-xs rounded hover:bg-primary/95 transition"
                >
                  Save Changes
                </button>
              </div>
            </form>
          </div>
      </PortalModal>
    </div>
  );
}
