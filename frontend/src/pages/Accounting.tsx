import React, { useState, useEffect } from "react";
import axios from "axios";
import { useStore } from "../store/useStore";
import {
  Plus,
  Coins,
  FileSpreadsheet,
  CheckCircle,
  Truck,
  TrendingUp,
  DollarSign
} from "lucide-react";

export default function Accounting() {
  const { branches, addNotification } = useStore();
  const [activeTab, setActiveTab] = useState<"EXPENSES" | "PURCHASES">("EXPENSES");
  
  const [expenses, setExpenses] = useState<any[]>([]);
  const [purchases, setPurchases] = useState<any[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);

  // Modals state
  const [expenseOpen, setExpenseOpen] = useState(false);
  const [purchaseOpen, setPurchaseOpen] = useState(false);
  const [receiveOpen, setReceiveOpen] = useState(false);
  
  const [selectedPurchase, setSelectedPurchase] = useState<any | null>(null);

  // Form states
  const [newExpense, setNewExpense] = useState({
    category: "RENT", amount: "", paymentMethod: "CASH", description: ""
  });

  const [newPurchase, setNewPurchase] = useState({
    supplierId: "",
    items: [] as any[]
  });
  
  const [newPurchaseItem, setNewPurchaseItem] = useState({
    productId: "", quantity: "", costPrice: ""
  });

  const [receiveBranchId, setReceiveBranchId] = useState("");

  const loadData = async () => {
    try {
      const [expRes, purRes, suppRes, prodRes] = await Promise.all([
        axios.get("/api/accounting/expenses"),
        axios.get("/api/accounting/purchases"),
        axios.get("/api/accounting/suppliers"),
        axios.get("/api/products")
      ]);
      setExpenses(expRes.data);
      setPurchases(purRes.data);
      setSuppliers(suppRes.data);
      setProducts(prodRes.data);
    } catch (err) {
      addNotification("Failed to load accounting ledgers.", "warning");
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleCreateExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newExpense.amount) {
      addNotification("Please specify the amount.", "warning");
      return;
    }
    try {
      await axios.post("/api/accounting/expenses", newExpense);
      addNotification("Expense logged successfully.", "success");
      setExpenseOpen(false);
      loadData();
      setNewExpense({ category: "RENT", amount: "", paymentMethod: "CASH", description: "" });
    } catch (err) {
      addNotification("Failed to log expense.", "warning");
    }
  };

  const handleAddPurchaseItem = () => {
    const { productId, quantity, costPrice } = newPurchaseItem;
    if (!productId || !quantity || !costPrice) return;

    const prod = products.find(p => p.id === productId);
    if (!prod) return;

    setNewPurchase({
      ...newPurchase,
      items: [...newPurchase.items, {
        productId,
        name: prod.name,
        sku: prod.sku,
        quantity: Number(quantity),
        costPrice: Number(costPrice)
      }]
    });

    setNewPurchaseItem({ productId: "", quantity: "", costPrice: "" });
  };

  const handleRemovePurchaseItem = (idx: number) => {
    setNewPurchase({
      ...newPurchase,
      items: newPurchase.items.filter((_, i) => i !== idx)
    });
  };

  const handleCreatePurchase = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPurchase.supplierId || newPurchase.items.length === 0) {
      addNotification("Please select a supplier and add at least one product.", "warning");
      return;
    }

    try {
      await axios.post("/api/accounting/purchases", newPurchase);
      addNotification("Purchase restock order created.", "success");
      setPurchaseOpen(false);
      loadData();
      setNewPurchase({ supplierId: "", items: [] });
    } catch (err) {
      addNotification("Failed to create restock order.", "warning");
    }
  };

  const handleOpenReceive = (purchase: any) => {
    setSelectedPurchase(purchase);
    if (branches.length > 0) {
      setReceiveBranchId(branches[0].id);
    }
    setReceiveOpen(true);
  };

  const handleReceiveConfirm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPurchase || !receiveBranchId) return;

    try {
      await axios.put(`/api/accounting/purchases/${selectedPurchase.id}/status`, {
        status: "RECEIVED",
        branchId: receiveBranchId
      });
      addNotification("Purchase order marked as RECEIVED. Inventory stock updated.", "success");
      setReceiveOpen(false);
      setSelectedPurchase(null);
      loadData();
    } catch (err: any) {
      const msg = err.response?.data?.error || "Failed to receive purchase items.";
      addNotification(msg, "warning");
    }
  };

  return (
    <div className="space-y-6 flex-1">
      
      {/* Header Tabs */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-card border border-border p-5 rounded-2xl">
        <div className="flex gap-2 border border-border bg-secondary p-1 rounded-xl">
          <button
            onClick={() => setActiveTab("EXPENSES")}
            className={`px-4 py-2 text-xs font-bold rounded-lg flex items-center gap-1.5 transition ${
              activeTab === "EXPENSES" ? "bg-primary text-white shadow" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Coins className="w-4 h-4" /> Operational Expenses
          </button>
          <button
            onClick={() => setActiveTab("PURCHASES")}
            className={`px-4 py-2 text-xs font-bold rounded-lg flex items-center gap-1.5 transition ${
              activeTab === "PURCHASES" ? "bg-primary text-white shadow" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Truck className="w-4 h-4" /> Purchases (Restocking)
          </button>
        </div>

        {activeTab === "EXPENSES" ? (
          <button
            onClick={() => setExpenseOpen(true)}
            className="bg-primary hover:bg-primary/95 text-white text-xs font-bold px-4 py-2.5 rounded-xl flex items-center gap-1.5 transition"
          >
            <Plus className="w-4 h-4" /> Log Expense
          </button>
        ) : (
          <button
            onClick={() => setPurchaseOpen(true)}
            className="bg-primary hover:bg-primary/95 text-white text-xs font-bold px-4 py-2.5 rounded-xl flex items-center gap-1.5 transition"
          >
            <Plus className="w-4 h-4" /> Restock Order
          </button>
        )}
      </div>

      {/* Main Table Panel */}
      <div className="bg-card border border-border rounded-2xl p-5 space-y-4">
        
        {/* Expenses view */}
        {activeTab === "EXPENSES" && (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-border text-muted-foreground font-semibold">
                  <th className="pb-3 pl-2">Expense Category</th>
                  <th className="pb-3">Date</th>
                  <th className="pb-3">Payment Method</th>
                  <th className="pb-3">Description</th>
                  <th className="pb-3 text-right pr-2">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {expenses.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-muted-foreground">
                      No expense records logged in ledger.
                    </td>
                  </tr>
                ) : (
                  expenses.map((exp) => (
                    <tr key={exp.id} className="hover:bg-secondary/20 transition">
                      <td className="py-4 pl-2 font-bold text-foreground uppercase tracking-wider">{exp.category}</td>
                      <td className="py-4 text-muted-foreground">{new Date(exp.date).toLocaleDateString()}</td>
                      <td className="py-4 text-foreground uppercase font-semibold">{exp.paymentMethod}</td>
                      <td className="py-4 text-muted-foreground truncate max-w-xs">{exp.description || "-"}</td>
                      <td className="py-4 text-right pr-2 font-extrabold text-red-400">${exp.amount}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* Purchases view */}
        {activeTab === "PURCHASES" && (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-border text-muted-foreground font-semibold">
                  <th className="pb-3 pl-2">Order Date</th>
                  <th className="pb-3">Supplier</th>
                  <th className="pb-3">Restock Items</th>
                  <th className="pb-3 text-right">Order Cost</th>
                  <th className="pb-3 text-center">Status</th>
                  <th className="pb-3 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {purchases.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-muted-foreground">
                      No purchase orders recorded.
                    </td>
                  </tr>
                ) : (
                  purchases.map((pur) => (
                    <tr key={pur.id} className="hover:bg-secondary/20 transition">
                      <td className="py-4 pl-2 text-muted-foreground">{new Date(pur.orderDate).toLocaleDateString()}</td>
                      <td className="py-4 font-semibold text-foreground">{pur.supplier.company}</td>
                      <td className="py-4">
                        <div className="flex flex-col text-[10px] text-muted-foreground max-w-xs truncate">
                          {pur.items.map((it: any, idx: number) => (
                            <span key={idx}>
                              {it.product.name} (x{it.quantity})
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="py-4 text-right font-black text-foreground">${pur.totalAmount}</td>
                      <td className="py-4 text-center">
                        <span className={`text-[10px] px-2 py-0.5 rounded font-black uppercase ${
                          pur.status === "RECEIVED" ? "bg-green-500/10 text-green-400" : "bg-amber-500/10 text-amber-400"
                        }`}>
                          {pur.status}
                        </span>
                      </td>
                      <td className="py-4 text-center">
                        {pur.status !== "RECEIVED" && (
                          <button
                            onClick={() => handleOpenReceive(pur)}
                            className="bg-primary hover:bg-primary/95 text-white text-[10px] font-bold px-3 py-1.5 rounded-lg transition"
                          >
                            Mark Received
                          </button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Log Expense Modal */}
      {expenseOpen && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/60 backdrop-blur-sm z-50 px-4">
          <div className="bg-card border border-border w-full max-w-sm p-6 rounded-2xl shadow-2xl relative">
            <h3 className="font-bold text-sm text-foreground mb-4">Log Storefront Expense</h3>
            <form onSubmit={handleCreateExpense} className="space-y-4">
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-muted-foreground uppercase">Category</label>
                <select
                  value={newExpense.category}
                  onChange={(e) => setNewExpense({ ...newExpense, category: e.target.value })}
                  className="w-full bg-secondary border border-border px-3 py-2 rounded text-xs focus:outline-none"
                >
                  <option value="RENT">Store Rent</option>
                  <option value="UTILITIES">Electricity & Internet</option>
                  <option value="SALARIES">Employee Salaries</option>
                  <option value="MARKETING">Social Media Ads</option>
                  <option value="OTHER">Other Miscellaneous</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-muted-foreground uppercase">Expense Amount ($) *</label>
                <input
                  type="number"
                  required
                  step="0.01"
                  value={newExpense.amount}
                  onChange={(e) => setNewExpense({ ...newExpense, amount: e.target.value })}
                  className="w-full bg-secondary border border-border px-3 py-2 rounded text-xs focus:outline-none"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-muted-foreground uppercase">Payment Method</label>
                <select
                  value={newExpense.paymentMethod}
                  onChange={(e) => setNewExpense({ ...newExpense, paymentMethod: e.target.value })}
                  className="w-full bg-secondary border border-border px-3 py-2 rounded text-xs focus:outline-none"
                >
                  <option value="CASH">Cash Drawer</option>
                  <option value="BANK_TRANSFER">Bank Wire</option>
                  <option value="CARD">Company Card</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-muted-foreground uppercase">Description / Notes</label>
                <input
                  type="text"
                  placeholder="e.g. Paid utility provider for June"
                  value={newExpense.description}
                  onChange={(e) => setNewExpense({ ...newExpense, description: e.target.value })}
                  className="w-full bg-secondary border border-border px-3 py-2 rounded text-xs focus:outline-none"
                />
              </div>

              <div className="flex gap-3 justify-end pt-4">
                <button
                  type="button"
                  onClick={() => setExpenseOpen(false)}
                  className="px-4 py-2 border border-border text-xs rounded hover:bg-secondary transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-primary text-white text-xs rounded hover:bg-primary/95 transition"
                >
                  Log Expense
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Place Purchase Order Modal */}
      {purchaseOpen && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/60 backdrop-blur-sm z-50 px-4 overflow-y-auto">
          <div className="bg-card border border-border w-full max-w-md p-6 rounded-2xl shadow-2xl relative my-8">
            <h3 className="font-bold text-sm text-foreground mb-4">Place Supplier Restock Order</h3>
            <form onSubmit={handleCreatePurchase} className="space-y-4">
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-muted-foreground uppercase">Select Supplier *</label>
                <select
                  required
                  value={newPurchase.supplierId}
                  onChange={(e) => setNewPurchase({ ...newPurchase, supplierId: e.target.value })}
                  className="w-full bg-secondary border border-border px-3 py-2 rounded text-xs focus:outline-none"
                >
                  <option value="">Choose supplier...</option>
                  {suppliers.map(s => <option key={s.id} value={s.id}>{s.company}</option>)}
                </select>
              </div>

              {/* Items in PO Drawer section */}
              <div className="space-y-2 border border-border p-3 rounded-xl bg-secondary/30 text-xs">
                <label className="font-bold text-[10px] text-muted-foreground uppercase">Restock Items Lines</label>
                <div className="space-y-1 max-h-24 overflow-y-auto">
                  {newPurchase.items.length === 0 ? (
                    <p className="text-muted-foreground italic text-[10px]">No products added to restock order.</p>
                  ) : (
                    newPurchase.items.map((it, idx) => (
                      <div key={idx} className="flex justify-between items-center bg-card p-1.5 rounded border border-border text-[10px]">
                        <span className="font-bold">{it.name}</span>
                        <div className="flex gap-3">
                          <span>Qty: {it.quantity}</span>
                          <span>Cost: ${it.costPrice}</span>
                          <button
                            type="button"
                            onClick={() => handleRemovePurchaseItem(idx)}
                            className="text-red-400 hover:text-red-300 font-bold"
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>

                {/* Inline item input selectors */}
                <div className="flex flex-col gap-2 pt-2 border-t border-border/50 text-[10px]">
                  <select
                    value={newPurchaseItem.productId}
                    onChange={(e) => setNewPurchaseItem({ ...newPurchaseItem, productId: e.target.value })}
                    className="bg-secondary border border-border px-2 py-1 rounded focus:outline-none"
                  >
                    <option value="">Choose product to restock...</option>
                    {products.map(p => <option key={p.id} value={p.id}>{p.name} ({p.sku})</option>)}
                  </select>
                  <div className="flex gap-2">
                    <input
                      type="number"
                      placeholder="Quantity"
                      value={newPurchaseItem.quantity}
                      onChange={(e) => setNewPurchaseItem({ ...newPurchaseItem, quantity: e.target.value })}
                      className="flex-1 bg-secondary border border-border px-2 py-1 rounded focus:outline-none"
                    />
                    <input
                      type="number"
                      placeholder="Cost Price"
                      value={newPurchaseItem.costPrice}
                      onChange={(e) => setNewPurchaseItem({ ...newPurchaseItem, costPrice: e.target.value })}
                      className="flex-1 bg-secondary border border-border px-2 py-1 rounded focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={handleAddPurchaseItem}
                      className="bg-primary text-white font-bold px-3 py-1 rounded hover:bg-primary/95"
                    >
                      Add Line
                    </button>
                  </div>
                </div>
              </div>

              <div className="flex gap-3 justify-end pt-4">
                <button
                  type="button"
                  onClick={() => setPurchaseOpen(false)}
                  className="px-4 py-2 border border-border text-xs rounded hover:bg-secondary transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-primary text-white text-xs rounded hover:bg-primary/95 transition"
                >
                  Place Order
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Receive Purchase Order Modal */}
      {receiveOpen && selectedPurchase && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/60 backdrop-blur-sm z-50 px-4">
          <div className="bg-card border border-border w-full max-w-sm p-6 rounded-2xl shadow-2xl relative">
            <h3 className="font-bold text-sm text-foreground mb-1">Receive Purchase Order items</h3>
            <p className="text-xs text-muted-foreground mb-4">Supplier: <strong>{selectedPurchase.supplier.company}</strong></p>
            
            <form onSubmit={handleReceiveConfirm} className="space-y-4">
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-muted-foreground uppercase">Target Branch Location *</label>
                <select
                  required
                  value={receiveBranchId}
                  onChange={(e) => setReceiveBranchId(e.target.value)}
                  className="w-full bg-secondary border border-border px-3 py-2 rounded text-xs focus:outline-none"
                >
                  {branches.map(b => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="bg-secondary/50 p-3 rounded-xl border border-border text-[11px] text-muted-foreground space-y-2">
                <p className="font-bold text-foreground">Items to add to branch stock:</p>
                <div className="space-y-1">
                  {selectedPurchase.items.map((it: any, idx: number) => (
                    <div key={idx} className="flex justify-between">
                      <span>{it.product.name}</span>
                      <span className="font-bold text-foreground">+{it.quantity} qty</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex gap-3 justify-end pt-4">
                <button
                  type="button"
                  onClick={() => { setReceiveOpen(false); setSelectedPurchase(null); }}
                  className="px-4 py-2 border border-border text-xs rounded hover:bg-secondary transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-primary text-white text-xs rounded hover:bg-primary/95 transition"
                >
                  Confirm & Receive
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
