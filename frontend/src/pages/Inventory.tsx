import React, { useState, useEffect, useMemo } from "react";
import axios from "axios";
import { useStore } from "../store/useStore";
import PortalModal from "../components/PortalModal";
import {
  Plus,
  ArrowRightLeft,
  Settings,
  AlertCircle,
  History,
  CheckCircle,
  FileSpreadsheet,
  Edit,
  Trash2,
  ChevronLeft,
  ChevronRight,
  ArrowUp,
  ArrowDown,
  RefreshCw
} from "lucide-react";

const PAGE_SIZE = 15;
const LOW_STOCK_THRESHOLD = 3;

/** Available qty for UI — branch stock is source of truth (product.stockQuantity can be stale). */
function getAvailableQty(p: any, branchId: string | null | undefined): number {
  if (branchId) {
    return p.branchStocks?.find((bs: any) => bs.branchId === branchId)?.quantity ?? 0;
  }
  if (p.branchStocks?.length) {
    return p.branchStocks.reduce((sum: number, bs: any) => sum + (bs.quantity || 0), 0);
  }
  return p.stockQuantity || 0;
}

export default function Inventory() {
  const { selectedBranchId, branches, addNotification, checkLowStock } = useStore();
  const [products, setProducts] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [brands, setBrands] = useState<any[]>([]);
  const [movements, setMovements] = useState<any[]>([]);

  // Search / filter states
  const [search, setSearch] = useState("");
  const [selectedCat, setSelectedCat] = useState("");
  const [selectedBrand, setSelectedBrand] = useState("");
  const [lowStockOnly, setLowStockOnly] = useState(false);

  // Sort state
  const [sortKey, setSortKey] = useState<string>("name");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  // Selection & pagination
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [currentPage, setCurrentPage] = useState(1);

  // Modals state
  const [addOpen, setAddOpen] = useState(false);
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);

  // Edit states & actions
  const [editProductId, setEditProductId] = useState("");
  const [editProduct, setEditProduct] = useState({
    name: "", sku: "", barcode: "", categoryId: "", brandId: "",
    model: "", purchasePrice: "", sellingPrice: "", warrantyMonths: "12",
    minStock: "5", type: "SINGLE", description: ""
  });

  const handleOpenEdit = (p: any) => {
    setEditProductId(p.id);
    setEditProduct({
      name: p.name || "",
      sku: p.sku || "",
      barcode: p.barcode || "",
      categoryId: p.categoryId || "",
      brandId: p.brandId || "",
      model: p.model || "",
      purchasePrice: String(p.purchasePrice || ""),
      sellingPrice: String(p.sellingPrice || ""),
      warrantyMonths: String(p.warrantyMonths || "12"),
      minStock: String(p.minStock || "5"),
      type: p.type || "SINGLE",
      description: p.description || ""
    });
    setEditOpen(true);
  };

  const handleEditProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    const { name, sku, purchasePrice, sellingPrice } = editProduct;

    if (!name || !sku || !purchasePrice || !sellingPrice) {
      addNotification("Please fill in all required fields.", "warning");
      return;
    }

    try {
      await axios.put(`/api/products/${editProductId}`, {
        ...editProduct,
        purchasePrice: Number(purchasePrice),
        sellingPrice: Number(sellingPrice),
        warrantyMonths: Number(editProduct.warrantyMonths),
        minStock: Number(editProduct.minStock)
      });
      addNotification("Product updated successfully.", "success");
      setEditOpen(false);
      loadInventory();
    } catch (err: any) {
      const msg = err.response?.data?.error || "Failed to update product.";
      addNotification(msg, "warning");
    }
  };

  const handleDeleteProduct = async (id: string, name: string) => {
    if (!window.confirm(`Are you sure you want to delete "${name}"? This will delete all branch stocks and stock movements associated with it.`)) {
      return;
    }

    try {
      await axios.delete(`/api/products/${id}`);
      addNotification("Product deleted successfully.", "success");
      loadInventory();
    } catch (err: any) {
      const msg = err.response?.data?.error || "Failed to delete product.";
      addNotification(msg, "warning");
    }
  };

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    if (!window.confirm(`Are you sure you want to delete ${selectedIds.size} selected products? This cannot be undone.`)) {
      return;
    }
    try {
      await axios.post("/api/products/bulk-delete", { ids: Array.from(selectedIds) });
      addNotification(`${selectedIds.size} products deleted successfully.`, "success");
      setSelectedIds(new Set());
      setCurrentPage(1);
      loadInventory();
    } catch (err: any) {
      const msg = err.response?.data?.error || "Failed to delete products.";
      addNotification(msg, "warning");
    }
  };

  const toggleSelectAll = (visibleProducts: any[]) => {
    const visibleIds = new Set(visibleProducts.map(p => p.id));
    const allSelected = visibleProducts.every(p => selectedIds.has(p.id));
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

  // Form states
  const [newProduct, setNewProduct] = useState({
    name: "", sku: "", barcode: "", categoryId: "", brandId: "",
    model: "", purchasePrice: "", sellingPrice: "", warrantyMonths: "12",
    minStock: "5", type: "SINGLE", description: ""
  });

  const [adjustment, setAdjustment] = useState({
    productId: "", branchId: "", quantity: "", reason: ""
  });

  const [transfer, setTransfer] = useState({
    productId: "", fromBranchId: "", toBranchId: "", quantity: "", notes: ""
  });

  // Fetch data
  const loadInventory = async () => {
    try {
      const [prodRes, catRes, brandRes] = await Promise.all([
        axios.get("/api/products", {
          params: {
            branchId: selectedBranchId || undefined
          }
        }),
        axios.get("/api/products/categories"),
        axios.get("/api/products/brands")
      ]);
      setProducts(prodRes.data);
      setCategories(catRes.data);
      setBrands(brandRes.data);
    } catch (err) {
      addNotification("Failed to load inventory records.", "warning");
    }
  };

  useEffect(() => {
    loadInventory();
  }, [selectedBranchId]);

  const loadMovements = async () => {
    try {
      const res = await axios.get("/api/inventory/movements");
      setMovements(res.data);
      setHistoryOpen(true);
    } catch (err) {
      addNotification("Failed to load historical movements.", "warning");
    }
  };

  // Create Product Submit
  const handleAddProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    const { name, sku, purchasePrice, sellingPrice } = newProduct;

    if (!name || !sku || !purchasePrice || !sellingPrice) {
      addNotification("Please fill in all required fields.", "warning");
      return;
    }

    try {
      await axios.post("/api/products", newProduct);
      addNotification("Product created successfully in catalog.", "success");
      setAddOpen(false);
      loadInventory();
      setNewProduct({
        name: "", sku: "", barcode: "", categoryId: "", brandId: "",
        model: "", purchasePrice: "", sellingPrice: "", warrantyMonths: "12",
        minStock: "5", type: "SINGLE", description: ""
      });
    } catch (err: any) {
      const msg = err.response?.data?.error || "Failed to create product.";
      addNotification(msg, "warning");
    }
  };

  // Adjust stock Submit
  const handleAdjustStock = async (e: React.FormEvent) => {
    e.preventDefault();
    const { productId, branchId, quantity, reason } = adjustment;
    if (!productId || !branchId || !quantity) {
      addNotification("Please select a product, branch, and quantity.", "warning");
      return;
    }
    try {
      await axios.post("/api/inventory/adjust", {
        productId, branchId, quantity: Number(quantity), reason
      });
      addNotification("Stock adjusted successfully.", "success");
      setAdjustOpen(false);
      loadInventory();
      checkLowStock();
      setAdjustment({ productId: "", branchId: "", quantity: "", reason: "" });
    } catch (err: any) {
      const msg = err.response?.data?.error || "Failed to adjust stock.";
      addNotification(msg, "warning");
    }
  };

  // Transfer stock Submit
  const handleTransferStock = async (e: React.FormEvent) => {
    e.preventDefault();
    const { productId, fromBranchId, toBranchId, quantity, notes } = transfer;
    if (!productId || !fromBranchId || !toBranchId || !quantity) {
      addNotification("Please complete all transfer details.", "warning");
      return;
    }
    if (fromBranchId === toBranchId) {
      addNotification("Source and destination branches must be different.", "warning");
      return;
    }
    try {
      await axios.post("/api/inventory/transfer", {
        productId, fromBranchId, toBranchId, quantity: Number(quantity), notes
      });
      addNotification("Inventory transferred successfully.", "success");
      setTransferOpen(false);
      loadInventory();
      checkLowStock();
      setTransfer({ productId: "", fromBranchId: "", toBranchId: "", quantity: "", notes: "" });
    } catch (err: any) {
      const msg = err.response?.data?.error || "Transfer failed.";
      addNotification(msg, "warning");
    }
  };

  // Filter products list
  const filteredProducts = useMemo(() => {
    const result = products.filter((p) => {
      const branchQty = getAvailableQty(p, selectedBranchId);
      const matchesSearch =
        p.name.toLowerCase().includes(search.toLowerCase()) ||
        p.sku.toLowerCase().includes(search.toLowerCase()) ||
        (p.barcode && p.barcode.includes(search));

      const matchesCat = !selectedCat || p.categoryId === selectedCat;
      const matchesBrand = !selectedBrand || p.brandId === selectedBrand;

      const matchesLowStock = !lowStockOnly || branchQty <= LOW_STOCK_THRESHOLD;

      return matchesSearch && matchesCat && matchesBrand && matchesLowStock;
    });

    result.sort((a, b) => {
      let aVal: any, bVal: any;
      switch (sortKey) {
        case "name": aVal = a.name.toLowerCase(); bVal = b.name.toLowerCase(); break;
        case "sku": aVal = a.sku.toLowerCase(); bVal = b.sku.toLowerCase(); break;
        case "brand": aVal = (a.brand?.name || "").toLowerCase(); bVal = (b.brand?.name || "").toLowerCase(); break;
        case "category": aVal = (a.category?.name || "").toLowerCase(); bVal = (b.category?.name || "").toLowerCase(); break;
        case "purchasePrice": aVal = a.purchasePrice; bVal = b.purchasePrice; break;
        case "sellingPrice": aVal = a.sellingPrice; bVal = b.sellingPrice; break;
        case "stock":
          aVal = getAvailableQty(a, selectedBranchId);
          bVal = getAvailableQty(b, selectedBranchId);
          break;
        default: aVal = a.name.toLowerCase(); bVal = b.name.toLowerCase();
      }
      if (aVal < bVal) return sortDir === "asc" ? -1 : 1;
      if (aVal > bVal) return sortDir === "asc" ? 1 : -1;
      return 0;
    });

    return result;
  }, [products, search, selectedCat, selectedBrand, lowStockOnly, sortKey, sortDir, selectedBranchId]);

  const totalPages = Math.ceil(filteredProducts.length / PAGE_SIZE);
  const paginatedProducts = filteredProducts.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE
  );

  // Reset page when filters change
  useEffect(() => { setCurrentPage(1); }, [search, selectedCat, selectedBrand, lowStockOnly, sortKey, sortDir]);

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
      
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-card border border-border p-5 rounded-2xl">
        <div>
          <h1 className="text-xl font-black tracking-tight text-foreground flex items-center gap-2">
            <span className="w-8 h-8 rounded-xl bg-primary/10 p-1 ring-1 ring-primary/15 flex items-center justify-center">
              <img src="/icons/inventory/header.png?v=1" alt="" className="w-full h-full object-contain" draggable={false} />
            </span>
            Catalog & Stock Control
          </h1>
          <p className="text-xs text-muted-foreground">Manage active product listings, stock levels, and store logistics.</p>
        </div>

        {/* Action Widgets */}
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => setAddOpen(true)}
            className="bg-primary hover:bg-primary/95 text-white text-xs font-bold px-4 py-2.5 rounded-xl flex items-center gap-1.5 transition"
          >
            <img src="/icons/inventory/add.png?v=1" alt="" className="w-4 h-4 object-contain brightness-0 invert" draggable={false} /> Add Product
          </button>
          
          <button
            onClick={() => setAdjustOpen(true)}
            className="border border-border bg-secondary hover:bg-secondary/80 text-foreground text-xs font-bold px-4 py-2.5 rounded-xl flex items-center gap-1.5 transition"
          >
            <img src="/icons/inventory/adjust.png?v=1" alt="" className="w-4 h-4 object-contain" draggable={false} /> Stock Adjust
          </button>

          <button
            onClick={() => setTransferOpen(true)}
            className="border border-border bg-secondary hover:bg-secondary/80 text-foreground text-xs font-bold px-4 py-2.5 rounded-xl flex items-center gap-1.5 transition"
          >
            <img src="/icons/inventory/transfer.png?v=1" alt="" className="w-4 h-4 object-contain" draggable={false} /> Stock Transfer
          </button>

          <button
            onClick={loadMovements}
            className="border border-border bg-secondary hover:bg-secondary/80 text-foreground text-xs font-bold px-4 py-2.5 rounded-xl flex items-center gap-1.5 transition"
          >
            <img src="/icons/inventory/movements.png?v=1" alt="" className="w-4 h-4 object-contain" draggable={false} /> Movements Logs
          </button>

          <button
            onClick={loadInventory}
            className="border border-border bg-secondary hover:bg-secondary/80 text-foreground text-xs font-bold px-4 py-2.5 rounded-xl flex items-center gap-1.5 transition"
          >
            <RefreshCw className="w-4 h-4" /> Refresh
          </button>
        </div>
      </div>

      {/* Filters & Table */}
      <div className="bg-card border border-border rounded-2xl p-5 space-y-4">

        {/* Filter controls */}
        <div className="flex flex-col md:flex-row gap-3">
          <div className="flex-1 relative">
            <img src="/icons/inventory/search.png?v=1" alt="" className="w-4 h-4 object-contain absolute left-3 top-3 opacity-70" draggable={false} />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search SKU, name, or barcode..."
              className="w-full bg-secondary text-foreground text-sm border border-border pl-9 pr-4 py-2.5 rounded-xl focus:outline-none"
            />
          </div>

          <select
            value={selectedCat}
            onChange={(e) => setSelectedCat(e.target.value)}
            className="bg-secondary text-foreground text-sm border border-border px-3 py-2.5 rounded-xl focus:outline-none"
          >
            <option value="">All Categories</option>
            {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>

          <select
            value={selectedBrand}
            onChange={(e) => setSelectedBrand(e.target.value)}
            className="bg-secondary text-foreground text-sm border border-border px-3 py-2.5 rounded-xl focus:outline-none"
          >
            <option value="">All Brands</option>
            {brands.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>

          <button
            onClick={() => setLowStockOnly(!lowStockOnly)}
            className={`text-xs font-bold px-4 py-2.5 rounded-xl flex items-center gap-1.5 transition border ${
              lowStockOnly
                ? "bg-red-500/10 text-red-400 border-red-500/30"
                : "bg-secondary text-foreground border-border hover:bg-secondary/80"
            }`}
          >
            <img src="/icons/inventory/low-stock.png?v=1" alt="" className="w-4 h-4 object-contain" draggable={false} /> Low Stock
          </button>
        </div>

        {/* Bulk action bar */}
        {selectedIds.size > 0 && (
          <div className="flex items-center gap-3 bg-red-500/5 border border-red-500/20 rounded-xl px-4 py-2.5">
            <span className="text-xs font-bold text-red-400">{selectedIds.size} selected</span>
            <button
              onClick={handleBulkDelete}
              className="bg-red-500 hover:bg-red-600 text-white text-xs font-bold px-4 py-1.5 rounded-lg flex items-center gap-1 transition"
            >
              <img src="/icons/inventory/delete.png?v=1" alt="" className="w-3.5 h-3.5 object-contain brightness-0 invert" draggable={false} /> Delete Selected
            </button>
            <button
              onClick={() => setSelectedIds(new Set())}
              className="text-xs text-muted-foreground hover:text-foreground transition"
            >
              Clear Selection
            </button>
          </div>
        )}

        {/* Table view */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-border text-muted-foreground font-semibold">
                <th className="pb-3 pl-2 w-10">
                  <input
                    type="checkbox"
                    checked={paginatedProducts.length > 0 && paginatedProducts.every(p => selectedIds.has(p.id))}
                    onChange={() => toggleSelectAll(paginatedProducts)}
                    className="accent-primary cursor-pointer"
                  />
                </th>
                <SortHeader label="Product Name" sortField="name" />
                <SortHeader label="SKU" sortField="sku" />
                <SortHeader label="Brand" sortField="brand" />
                <SortHeader label="Category" sortField="category" />
                <SortHeader label="Cost Price" sortField="purchasePrice" />
                <SortHeader label="Retail Price" sortField="sellingPrice" />
                <SortHeader label="Total Stock" sortField="stock" />
                <th className="pb-3 text-center">Location Levels</th>
                <th className="pb-3 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {paginatedProducts.length === 0 ? (
                <tr>
                  <td colSpan={10} className="py-8 text-center text-muted-foreground">
                    No products matching search parameters.
                  </td>
                </tr>
              ) : (
                paginatedProducts.map((p) => {
                  const branchQty = getAvailableQty(p, selectedBranchId);
                  const isLow = branchQty <= LOW_STOCK_THRESHOLD;
                  return (
                    <tr key={p.id} className={`hover:bg-secondary/20 transition ${selectedIds.has(p.id) ? "bg-primary/5" : ""}`}>
                      <td className="py-4 pl-2">
                        <input
                          type="checkbox"
                          checked={selectedIds.has(p.id)}
                          onChange={() => toggleSelect(p.id)}
                          className="accent-primary cursor-pointer"
                        />
                      </td>
                      <td className="py-4 font-bold text-foreground max-w-xs truncate">{p.name}</td>
                      <td className="py-4 text-muted-foreground">{p.sku}</td>
                      <td className="py-4 text-foreground">{p.brand?.name || "-"}</td>
                      <td className="py-4 text-foreground">{p.category?.name || "-"}</td>
                      <td className="py-4 text-right text-muted-foreground">Rs. {p.purchasePrice}</td>
                      <td className="py-4 text-right font-semibold text-foreground">Rs. {p.sellingPrice}</td>
                      <td className="py-4 text-center">
                        <span className={`font-bold px-2 py-0.5 rounded ${
                          isLow ? "bg-red-500/10 text-red-400" : "bg-green-500/10 text-green-400"
                        }`}>
                          {branchQty} qty
                        </span>
                      </td>
                      <td className="py-4 text-center">
                        <div className="flex flex-col gap-0.5 text-[10px] text-muted-foreground">
                          {p.branchStocks?.map((bs: any) => (
                            <span key={bs.id}>
                              {bs.branch.name}: <strong>{bs.quantity}</strong>
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="py-4 text-center">
                        <div className="flex justify-center gap-2">
                          <button
                            onClick={() => handleOpenEdit(p)}
                            className="p-1 text-muted-foreground hover:text-primary transition"
                            title="Edit"
                          >
                            <img src="/icons/inventory/edit.png?v=1" alt="" className="w-4 h-4 object-contain" draggable={false} />
                          </button>
                          <button
                            onClick={() => handleDeleteProduct(p.id, p.name)}
                            className="p-1 text-muted-foreground hover:text-destructive transition"
                            title="Delete"
                          >
                            <img src="/icons/inventory/delete.png?v=1" alt="" className="w-4 h-4 object-contain" draggable={false} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between pt-3 border-t border-border">
            <span className="text-xs text-muted-foreground">
              Showing {((currentPage - 1) * PAGE_SIZE) + 1}-{Math.min(currentPage * PAGE_SIZE, filteredProducts.length)} of {filteredProducts.length}
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

      {/* Add Product Dialog Modal */}
      <PortalModal isOpen={addOpen} onClose={() => setAddOpen(false)} backdropClass="bg-black/60 backdrop-blur-sm px-4 overflow-y-auto">
        <div className="bg-card border border-border w-full max-w-lg p-6 rounded-2xl shadow-2xl relative my-8">
            <h3 className="text-base font-bold text-foreground mb-4">Add New Catalog Product</h3>
            <form onSubmit={handleAddProduct} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-muted-foreground uppercase">Product Name *</label>
                  <input
                    type="text"
                    required
                    value={newProduct.name}
                    onChange={(e) => setNewProduct({ ...newProduct, name: e.target.value })}
                    className="w-full bg-secondary border border-border px-3 py-2 rounded text-xs focus:outline-none"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-muted-foreground uppercase">SKU Code *</label>
                  <input
                    type="text"
                    required
                    value={newProduct.sku}
                    onChange={(e) => setNewProduct({ ...newProduct, sku: e.target.value })}
                    placeholder="e.g. AP-IP15PM"
                    className="w-full bg-secondary border border-border px-3 py-2 rounded text-xs focus:outline-none"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-muted-foreground uppercase">Barcode (EAN/UPC)</label>
                  <input
                    type="text"
                    value={newProduct.barcode}
                    onChange={(e) => setNewProduct({ ...newProduct, barcode: e.target.value })}
                    className="w-full bg-secondary border border-border px-3 py-2 rounded text-xs focus:outline-none"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-muted-foreground uppercase">Category</label>
                  <select
                    value={newProduct.categoryId}
                    onChange={(e) => setNewProduct({ ...newProduct, categoryId: e.target.value })}
                    className="w-full bg-secondary border border-border px-3 py-2 rounded text-xs focus:outline-none"
                  >
                    <option value="">Select Category</option>
                    {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-muted-foreground uppercase">Brand</label>
                  <select
                    value={newProduct.brandId}
                    onChange={(e) => setNewProduct({ ...newProduct, brandId: e.target.value })}
                    className="w-full bg-secondary border border-border px-3 py-2 rounded text-xs focus:outline-none"
                  >
                    <option value="">Select Brand</option>
                    {brands.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-muted-foreground uppercase">Model / Part No.</label>
                  <input
                    type="text"
                    value={newProduct.model}
                    onChange={(e) => setNewProduct({ ...newProduct, model: e.target.value })}
                    className="w-full bg-secondary border border-border px-3 py-2 rounded text-xs focus:outline-none"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-muted-foreground uppercase">Purchase Price *</label>
                  <input
                    type="number"
                    required
                    value={newProduct.purchasePrice}
                    onChange={(e) => setNewProduct({ ...newProduct, purchasePrice: e.target.value })}
                    className="w-full bg-secondary border border-border px-3 py-2 rounded text-xs focus:outline-none"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-muted-foreground uppercase">Selling Price *</label>
                  <input
                    type="number"
                    required
                    value={newProduct.sellingPrice}
                    onChange={(e) => setNewProduct({ ...newProduct, sellingPrice: e.target.value })}
                    className="w-full bg-secondary border border-border px-3 py-2 rounded text-xs focus:outline-none"
                  />
                </div>
              </div>

              <div className="flex gap-3 justify-end pt-4">
                <button
                  type="button"
                  onClick={() => setAddOpen(false)}
                  className="px-4 py-2 border border-border text-xs rounded hover:bg-secondary transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-primary text-white text-xs rounded hover:bg-primary/95 transition"
                >
                  Save Product
                </button>
              </div>
            </form>
          </div>
      </PortalModal>

      {/* Edit Product Dialog Modal */}
      <PortalModal isOpen={editOpen} onClose={() => setEditOpen(false)} backdropClass="bg-black/60 backdrop-blur-sm px-4 overflow-y-auto">
        <div className="bg-card border border-border w-full max-w-lg p-6 rounded-2xl shadow-2xl relative my-8">
            <h3 className="text-base font-bold text-foreground mb-4">Edit Catalog Product</h3>
            <form onSubmit={handleEditProduct} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-muted-foreground uppercase">Product Name *</label>
                  <input
                    type="text"
                    required
                    value={editProduct.name}
                    onChange={(e) => setEditProduct({ ...editProduct, name: e.target.value })}
                    className="w-full bg-secondary border border-border px-3 py-2 rounded text-xs focus:outline-none"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-muted-foreground uppercase">SKU Code *</label>
                  <input
                    type="text"
                    required
                    value={editProduct.sku}
                    onChange={(e) => setEditProduct({ ...editProduct, sku: e.target.value })}
                    className="w-full bg-secondary border border-border px-3 py-2 rounded text-xs focus:outline-none"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-muted-foreground uppercase">Barcode (EAN/UPC)</label>
                  <input
                    type="text"
                    value={editProduct.barcode}
                    onChange={(e) => setEditProduct({ ...editProduct, barcode: e.target.value })}
                    className="w-full bg-secondary border border-border px-3 py-2 rounded text-xs focus:outline-none"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-muted-foreground uppercase">Product Model</label>
                  <input
                    type="text"
                    value={editProduct.model}
                    onChange={(e) => setEditProduct({ ...editProduct, model: e.target.value })}
                    placeholder="e.g. iPhone 15 Pro, XPS 15"
                    className="w-full bg-secondary border border-border px-3 py-2 rounded text-xs focus:outline-none"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-muted-foreground uppercase">Category</label>
                  <select
                    value={editProduct.categoryId}
                    onChange={(e) => setEditProduct({ ...editProduct, categoryId: e.target.value })}
                    className="w-full bg-secondary border border-border px-3 py-2 rounded text-xs focus:outline-none"
                  >
                    <option value="">Choose category...</option>
                    {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-muted-foreground uppercase">Brand</label>
                  <select
                    value={editProduct.brandId}
                    onChange={(e) => setEditProduct({ ...editProduct, brandId: e.target.value })}
                    className="w-full bg-secondary border border-border px-3 py-2 rounded text-xs focus:outline-none"
                  >
                    <option value="">Choose brand...</option>
                    {brands.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-muted-foreground uppercase">Purchase Cost (Rs.) *</label>
                  <input
                    type="number"
                    required
                    step="0.01"
                    value={editProduct.purchasePrice}
                    onChange={(e) => setEditProduct({ ...editProduct, purchasePrice: e.target.value })}
                    className="w-full bg-secondary border border-border px-3 py-2 rounded text-xs focus:outline-none"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-muted-foreground uppercase">Selling Price (Rs.) *</label>
                  <input
                    type="number"
                    required
                    step="0.01"
                    value={editProduct.sellingPrice}
                    onChange={(e) => setEditProduct({ ...editProduct, sellingPrice: e.target.value })}
                    className="w-full bg-secondary border border-border px-3 py-2 rounded text-xs focus:outline-none"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-muted-foreground uppercase">Warranty (Months)</label>
                  <input
                    type="number"
                    value={editProduct.warrantyMonths}
                    onChange={(e) => setEditProduct({ ...editProduct, warrantyMonths: e.target.value })}
                    className="w-full bg-secondary border border-border px-3 py-2 rounded text-xs focus:outline-none"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-muted-foreground uppercase">Min Alert Stock Level</label>
                  <input
                    type="number"
                    value={editProduct.minStock}
                    onChange={(e) => setEditProduct({ ...editProduct, minStock: e.target.value })}
                    className="w-full bg-secondary border border-border px-3 py-2 rounded text-xs focus:outline-none"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-muted-foreground uppercase">Product Type</label>
                <select
                  value={editProduct.type}
                  onChange={(e) => setEditProduct({ ...editProduct, type: e.target.value })}
                  className="w-full bg-secondary border border-border px-3 py-2 rounded text-xs focus:outline-none"
                >
                  <option value="SINGLE">Standard Electronics Item</option>
                  <option value="VARIABLE">Variable Option Product</option>
                  <option value="BUNDLE">Restocked Bundle Package</option>
                  <option value="ACCESSORY">Shop Accessories Line</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-muted-foreground uppercase">Product Description</label>
                <textarea
                  value={editProduct.description}
                  onChange={(e) => setEditProduct({ ...editProduct, description: e.target.value })}
                  className="w-full bg-secondary border border-border px-3 py-2 rounded text-xs focus:outline-none h-16 resize-none"
                />
              </div>

              <div className="flex gap-3 justify-end pt-4">
                <button
                  type="button"
                  onClick={() => setEditOpen(false)}
                  className="px-4 py-2 border border-border text-xs rounded hover:bg-secondary transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-primary text-white text-xs rounded hover:bg-primary/95 transition"
                >
                  Save Product
                </button>
              </div>
            </form>
          </div>
      </PortalModal>

      {/* Stock Adjustment Modal */}
      <PortalModal isOpen={adjustOpen} onClose={() => setAdjustOpen(false)} backdropClass="bg-black/60 backdrop-blur-sm px-4">
        <div className="bg-card border border-border w-full max-w-sm p-6 rounded-2xl shadow-2xl relative">
            <h3 className="font-bold text-sm text-foreground mb-4">Manual Inventory Adjustment</h3>
            <form onSubmit={handleAdjustStock} className="space-y-4">
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-muted-foreground uppercase">Select Product</label>
                <select
                  value={adjustment.productId}
                  onChange={(e) => setAdjustment({ ...adjustment, productId: e.target.value })}
                  className="w-full bg-secondary border border-border px-3 py-2 rounded text-xs focus:outline-none"
                >
                  <option value="">Choose product...</option>
                  {products.map(p => <option key={p.id} value={p.id}>{p.name} ({p.sku})</option>)}
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-muted-foreground uppercase">Select Target Branch Location</label>
                <select
                  value={adjustment.branchId}
                  onChange={(e) => setAdjustment({ ...adjustment, branchId: e.target.value })}
                  className="w-full bg-secondary border border-border px-3 py-2 rounded text-xs focus:outline-none"
                >
                  <option value="">Choose branch...</option>
                  {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-muted-foreground uppercase">Quantity Change (+/-)</label>
                <input
                  type="number"
                  placeholder="e.g. 5 for Stock-in, -2 for Damaged"
                  value={adjustment.quantity}
                  onChange={(e) => setAdjustment({ ...adjustment, quantity: e.target.value })}
                  className="w-full bg-secondary border border-border px-3 py-2 rounded text-xs focus:outline-none"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-muted-foreground uppercase">Reason / Notes</label>
                <input
                  type="text"
                  placeholder="e.g. Damaged during shipment, local store purchase"
                  value={adjustment.reason}
                  onChange={(e) => setAdjustment({ ...adjustment, reason: e.target.value })}
                  className="w-full bg-secondary border border-border px-3 py-2 rounded text-xs focus:outline-none"
                />
              </div>

              <div className="flex gap-3 justify-end pt-4">
                <button
                  type="button"
                  onClick={() => setAdjustOpen(false)}
                  className="px-4 py-2 border border-border text-xs rounded hover:bg-secondary transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-primary text-white text-xs rounded hover:bg-primary/95 transition"
                >
                  Save Adjustment
                </button>
              </div>
            </form>
          </div>
      </PortalModal>

      {/* Stock Transfer Modal */}
      <PortalModal isOpen={transferOpen} onClose={() => setTransferOpen(false)} backdropClass="bg-black/60 backdrop-blur-sm px-4">
        <div className="bg-card border border-border w-full max-w-sm p-6 rounded-2xl shadow-2xl relative">
            <h3 className="font-bold text-sm text-foreground mb-4">Branch Stock Transfer</h3>
            <form onSubmit={handleTransferStock} className="space-y-4">
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-muted-foreground uppercase">Select Product</label>
                <select
                  value={transfer.productId}
                  onChange={(e) => setTransfer({ ...transfer, productId: e.target.value })}
                  className="w-full bg-secondary border border-border px-3 py-2 rounded text-xs focus:outline-none"
                >
                  <option value="">Choose product...</option>
                  {products.map(p => <option key={p.id} value={p.id}>{p.name} ({p.sku})</option>)}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-muted-foreground uppercase">Source Location</label>
                  <select
                    value={transfer.fromBranchId}
                    onChange={(e) => setTransfer({ ...transfer, fromBranchId: e.target.value })}
                    className="w-full bg-secondary border border-border px-3 py-2 rounded text-xs focus:outline-none"
                  >
                    <option value="">From...</option>
                    {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-muted-foreground uppercase">Destination</label>
                  <select
                    value={transfer.toBranchId}
                    onChange={(e) => setTransfer({ ...transfer, toBranchId: e.target.value })}
                    className="w-full bg-secondary border border-border px-3 py-2 rounded text-xs focus:outline-none"
                  >
                    <option value="">To...</option>
                    {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </select>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-muted-foreground uppercase">Quantity</label>
                <input
                  type="number"
                  placeholder="Quantity to transfer"
                  value={transfer.quantity}
                  onChange={(e) => setTransfer({ ...transfer, quantity: e.target.value })}
                  className="w-full bg-secondary border border-border px-3 py-2 rounded text-xs focus:outline-none"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-muted-foreground uppercase">Reference Details</label>
                <input
                  type="text"
                  placeholder="e.g. Van replenishment"
                  value={transfer.notes}
                  onChange={(e) => setTransfer({ ...transfer, notes: e.target.value })}
                  className="w-full bg-secondary border border-border px-3 py-2 rounded text-xs focus:outline-none"
                />
              </div>

              <div className="flex gap-3 justify-end pt-4">
                <button
                  type="button"
                  onClick={() => setTransferOpen(false)}
                  className="px-4 py-2 border border-border text-xs rounded hover:bg-secondary transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-primary text-white text-xs rounded hover:bg-primary/95 transition"
                >
                  Execute Transfer
                </button>
              </div>
            </form>
          </div>
      </PortalModal>

      {/* Movement History Log Modal */}
      <PortalModal isOpen={historyOpen} onClose={() => setHistoryOpen(false)} backdropClass="bg-black/60 backdrop-blur-sm px-4">
        <div className="bg-card border border-border w-full max-w-xl p-6 rounded-2xl shadow-2xl relative h-[500px] flex flex-col justify-between">
            <h3 className="font-bold text-sm text-foreground mb-3">Inventory Movement History</h3>
            
            <div className="flex-1 overflow-y-auto space-y-2 pr-1">
              {movements.length === 0 ? (
                <p className="text-center text-xs text-muted-foreground py-16">No stock movements registered in logs.</p>
              ) : (
                movements.map((m) => (
                  <div key={m.id} className="p-3 bg-secondary/50 border border-border rounded-xl flex items-center justify-between text-xs">
                    <div>
                      <p className="font-bold text-foreground">{m.product.name}</p>
                      <p className="text-[10px] text-muted-foreground">SKU: {m.product.sku} | Details: {m.notes}</p>
                      <span className="text-[9px] text-muted-foreground">{new Date(m.createdAt).toLocaleString()}</span>
                    </div>
                    <div className="text-right">
                      <span className={`font-black text-sm px-2 py-0.5 rounded ${
                        m.quantity > 0 ? "text-green-400 bg-green-500/10" : "text-red-400 bg-red-500/10"
                      }`}>
                        {m.quantity > 0 ? `+${m.quantity}` : m.quantity}
                      </span>
                      <p className="text-[9px] text-muted-foreground mt-1 uppercase font-semibold">{m.type}</p>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="flex justify-end pt-4">
              <button
                onClick={() => setHistoryOpen(false)}
                className="px-5 py-2 bg-secondary border border-border text-xs rounded-xl text-foreground font-semibold hover:bg-secondary/80 transition"
              >
                Close Logs
              </button>
            </div>
          </div>
      </PortalModal>
    </div>
  );
}
