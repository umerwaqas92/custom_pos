import React, { useState, useEffect } from "react";
import axios from "axios";
import { useStore } from "../store/useStore";
import PortalModal from "../components/PortalModal";
import {
  Plus,
  Coins,
  Truck,
  Wallet,
  ArrowRightLeft,
  BarChart3,
  CalendarCheck,
  TrendingUp,
  TrendingDown,
  Landmark,
  CircleDollarSign,
  AlertTriangle,
  Search,
  X,
  ChevronDown,
  ArrowUpRight,
  ArrowDownRight,
  RefreshCw
} from "lucide-react";

type Tab = "EXPENSES" | "PURCHASES" | "BANKS" | "CASHBOOK" | "PNL" | "DAILY_CLOSING";

export default function Accounting() {
  const { branches, addNotification } = useStore();
  const [activeTab, setActiveTab] = useState<Tab>("EXPENSES");

  // Shared data
  const [expenses, setExpenses] = useState<any[]>([]);
  const [purchases, setPurchases] = useState<any[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);

  // Bank Accounts
  const [bankAccounts, setBankAccounts] = useState<any[]>([]);
  const [bankModalOpen, setBankModalOpen] = useState(false);
  const [newBank, setNewBank] = useState({ name: "", type: "BANK", accountNumber: "", bankName: "", notes: "" });

  // Cash Book / Transactions
  const [transactions, setTransactions] = useState<any[]>([]);
  const [txFilter, setTxFilter] = useState({ bankAccountId: "", type: "", startDate: "", endDate: "" });
  const [txModalOpen, setTxModalOpen] = useState(false);
  const [transferModalOpen, setTransferModalOpen] = useState(false);
  const [newTx, setNewTx] = useState({ bankAccountId: "", type: "EXPENSE", category: "ADJUSTMENT", amount: "", description: "" });
  const [newTransfer, setNewTransfer] = useState({ fromAccountId: "", toAccountId: "", amount: "", description: "" });

  // Profit & Loss
  const [pnLData, setPnLData] = useState<any>(null);
  const [pnlStartDate, setPnlStartDate] = useState("");
  const [pnlEndDate, setPnlEndDate] = useState("");

  // Daily Closing
  const [dailyClosings, setDailyClosings] = useState<any[]>([]);
  const [closingPreview, setClosingPreview] = useState<any>(null);
  const [closingModalOpen, setClosingModalOpen] = useState(false);
  const [closingForm, setClosingForm] = useState({ closingDate: "", branchId: "", openingBalance: "0", cashIn: "0", cashOut: "0", actualBalance: "", notes: "" });

  // Purchase states (existing)
  const [expenseOpen, setExpenseOpen] = useState(false);
  const [purchaseOpen, setPurchaseOpen] = useState(false);
  const [receiveOpen, setReceiveOpen] = useState(false);
  const [selectedPurchase, setSelectedPurchase] = useState<any | null>(null);
  const [newExpense, setNewExpense] = useState({ category: "RENT", amount: "", paymentMethod: "CASH", description: "" });
  const [newPurchase, setNewPurchase] = useState({ supplierId: "", items: [] as any[] });
  const [newPurchaseItem, setNewPurchaseItem] = useState({ productId: "", quantity: "", costPrice: "" });
  const [receiveBranchId, setReceiveBranchId] = useState("");

  const loadData = async () => {
    try {
      const [expRes, purRes, suppRes, prodRes] = await Promise.all([
        axios.get("/api/accounting/expenses"),
        axios.get("/api/accounting/purchases"),
        axios.get("/api/accounting/suppliers"),
        axios.get("/api/products", {
          params: {
            lite: 1
          }
        })
      ]);
      setExpenses(expRes.data);
      setPurchases(purRes.data);
      setSuppliers(suppRes.data);
      setProducts(prodRes.data);
    } catch (err) {
      addNotification("Failed to load accounting ledgers.", "warning");
    }
  };

  const loadBankAccounts = async () => {
    try {
      const res = await axios.get("/api/accounting/bank-accounts");
      setBankAccounts(res.data);
    } catch (err) {
      addNotification("Failed to load bank accounts.", "warning");
    }
  };

  const loadTransactions = async () => {
    try {
      const params: any = {};
      if (txFilter.bankAccountId) params.bankAccountId = txFilter.bankAccountId;
      if (txFilter.type) params.type = txFilter.type;
      if (txFilter.startDate) params.startDate = txFilter.startDate;
      if (txFilter.endDate) params.endDate = txFilter.endDate;
      const res = await axios.get("/api/accounting/transactions", { params });
      setTransactions(res.data);
    } catch (err) {
      addNotification("Failed to load transactions.", "warning");
    }
  };

  const loadPnL = async () => {
    try {
      const params: any = {};
      if (pnlStartDate) params.startDate = pnlStartDate;
      if (pnlEndDate) params.endDate = pnlEndDate;
      const res = await axios.get("/api/accounting/profit-loss", { params });
      setPnLData(res.data);
    } catch (err) {
      addNotification("Failed to load P&L report.", "warning");
    }
  };

  const loadDailyClosings = async () => {
    try {
      const res = await axios.get("/api/accounting/daily-closings");
      setDailyClosings(res.data);
    } catch (err) {
      addNotification("Failed to load daily closings.", "warning");
    }
  };

  const loadClosingPreview = async (date?: string, branchId?: string) => {
    try {
      const params: any = {};
      const targetDate = date !== undefined ? date : closingForm.closingDate;
      const targetBranch = branchId !== undefined ? branchId : closingForm.branchId;

      if (targetDate) params.date = targetDate;
      if (targetBranch) params.branchId = targetBranch;

      const res = await axios.get("/api/accounting/daily-closings/preview", { params });
      setClosingPreview(res.data);
      setClosingForm(f => ({
        ...f,
        closingDate: targetDate,
        branchId: targetBranch,
        openingBalance: String(res.data.openingBalance)
      }));
    } catch (err) {
      // silently fail on preview
    }
  };

  const handleRefresh = () => {
    loadData();
    if (activeTab === "BANKS" || activeTab === "CASHBOOK") loadBankAccounts();
    if (activeTab === "CASHBOOK") loadTransactions();
    if (activeTab === "PNL") loadPnL();
    if (activeTab === "DAILY_CLOSING") loadDailyClosings();
  };

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (activeTab === "BANKS" || activeTab === "CASHBOOK") loadBankAccounts();
    if (activeTab === "CASHBOOK") loadTransactions();
    if (activeTab === "PNL") loadPnL();
    if (activeTab === "DAILY_CLOSING") loadDailyClosings();
  }, [activeTab]);

  // ---- Bank Account Handlers ----
  const handleCreateBank = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newBank.name) return addNotification("Account name is required.", "warning");
    try {
      await axios.post("/api/accounting/bank-accounts", newBank);
      addNotification("Bank account created.", "success");
      setBankModalOpen(false);
      setNewBank({ name: "", type: "BANK", accountNumber: "", bankName: "", notes: "" });
      loadBankAccounts();
    } catch (err) {
      addNotification("Failed to create bank account.", "warning");
    }
  };

  // ---- Transaction Handlers ----
  const handleCreateTransaction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTx.bankAccountId || !newTx.amount) return addNotification("Account and amount required.", "warning");
    try {
      await axios.post("/api/accounting/transactions", newTx);
      addNotification("Transaction recorded.", "success");
      setTxModalOpen(false);
      setNewTx({ bankAccountId: "", type: "EXPENSE", category: "ADJUSTMENT", amount: "", description: "" });
      loadTransactions();
      loadBankAccounts();
    } catch (err: any) {
      addNotification(err.response?.data?.error || "Failed.", "warning");
    }
  };

  const handleTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTransfer.fromAccountId || !newTransfer.toAccountId || !newTransfer.amount) {
      return addNotification("All fields required.", "warning");
    }
    try {
      await axios.post("/api/accounting/transactions/transfer", newTransfer);
      addNotification("Transfer completed.", "success");
      setTransferModalOpen(false);
      setNewTransfer({ fromAccountId: "", toAccountId: "", amount: "", description: "" });
      loadTransactions();
      loadBankAccounts();
    } catch (err: any) {
      addNotification(err.response?.data?.error || "Transfer failed.", "warning");
    }
  };

  // ---- Daily Closing Handler ----
  const handleCreateClosing = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!closingForm.actualBalance) return addNotification("Actual balance is required.", "warning");
    try {
      await axios.post("/api/accounting/daily-closings", closingForm);
      addNotification("Day closed successfully.", "success");
      setClosingModalOpen(false);
      setClosingForm({ closingDate: "", branchId: "", openingBalance: "0", cashIn: "0", cashOut: "0", actualBalance: "", notes: "" });
      setClosingPreview(null);
      loadDailyClosings();
    } catch (err: any) {
      addNotification(err.response?.data?.error || "Failed.", "warning");
    }
  };

  // ---- Existing Purchase Handlers ----
  const handleCreateExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newExpense.amount) { addNotification("Please specify the amount.", "warning"); return; }
    try {
      await axios.post("/api/accounting/expenses", newExpense);
      addNotification("Expense logged successfully.", "success");
      setExpenseOpen(false);
      loadData();
      setNewExpense({ category: "RENT", amount: "", paymentMethod: "CASH", description: "" });
    } catch (err) { addNotification("Failed to log expense.", "warning"); }
  };

  const handleAddPurchaseItem = () => {
    const { productId, quantity, costPrice } = newPurchaseItem;
    if (!productId || !quantity || !costPrice) return;
    const prod = products.find(p => p.id === productId);
    if (!prod) return;
    setNewPurchase({ ...newPurchase, items: [...newPurchase.items, { productId, name: prod.name, sku: prod.sku, quantity: Number(quantity), costPrice: Number(costPrice) }] });
    setNewPurchaseItem({ productId: "", quantity: "", costPrice: "" });
  };

  const handleRemovePurchaseItem = (idx: number) => {
    setNewPurchase({ ...newPurchase, items: newPurchase.items.filter((_, i) => i !== idx) });
  };

  const handleCreatePurchase = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPurchase.supplierId || newPurchase.items.length === 0) { addNotification("Supplier and items required.", "warning"); return; }
    try {
      await axios.post("/api/accounting/purchases", newPurchase);
      addNotification("Purchase order created.", "success");
      setPurchaseOpen(false);
      loadData();
      setNewPurchase({ supplierId: "", items: [] });
    } catch (err) { addNotification("Failed to create order.", "warning"); }
  };

  const handleOpenReceive = (purchase: any) => {
    setSelectedPurchase(purchase);
    if (branches.length > 0) setReceiveBranchId(branches[0].id);
    setReceiveOpen(true);
  };

  const handleReceiveConfirm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPurchase || !receiveBranchId) return;
    try {
      await axios.put(`/api/accounting/purchases/${selectedPurchase.id}/status`, { status: "RECEIVED", branchId: receiveBranchId });
      addNotification("Items received. Stock updated.", "success");
      setReceiveOpen(false);
      setSelectedPurchase(null);
      loadData();
    } catch (err: any) {
      addNotification(err.response?.data?.error || "Failed.", "warning");
    }
  };

  const tabs: { key: Tab; label: string; icon: React.ReactNode }[] = [
    { key: "EXPENSES", label: "Expenses", icon: <Coins className="w-4 h-4" /> },
    { key: "PURCHASES", label: "Purchases", icon: <Truck className="w-4 h-4" /> },
    { key: "BANKS", label: "Bank Accounts", icon: <Landmark className="w-4 h-4" /> },
    { key: "CASHBOOK", label: "Cash Book", icon: <CircleDollarSign className="w-4 h-4" /> },
    { key: "PNL", label: "Profit & Loss", icon: <BarChart3 className="w-4 h-4" /> },
    { key: "DAILY_CLOSING", label: "Daily Closing", icon: <CalendarCheck className="w-4 h-4" /> },
  ];

  return (
    <div className="space-y-6 flex-1">

      {/* Header Tabs */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-card border border-border p-5 rounded-2xl">
        <div className="flex gap-1 border border-border bg-secondary p-1 rounded-xl flex-wrap">
          {tabs.map(t => (
            <button
              key={t.key}
              onClick={() => setActiveTab(t.key)}
              className={`px-3 py-2 text-[11px] font-bold rounded-lg flex items-center gap-1.5 transition ${
                activeTab === t.key ? "bg-primary text-white shadow" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {t.icon} {t.label}
            </button>
          ))}
        </div>

        {activeTab === "EXPENSES" && (
          <button onClick={() => setExpenseOpen(true)} className="bg-primary hover:bg-primary/95 text-white text-xs font-bold px-4 py-2.5 rounded-xl flex items-center gap-1.5 transition">
            <Plus className="w-4 h-4" /> Log Expense
          </button>
        )}
        {activeTab === "PURCHASES" && (
          <button onClick={() => setPurchaseOpen(true)} className="bg-primary hover:bg-primary/95 text-white text-xs font-bold px-4 py-2.5 rounded-xl flex items-center gap-1.5 transition">
            <Plus className="w-4 h-4" /> Restock Order
          </button>
        )}
        {activeTab === "BANKS" && (
          <button onClick={() => setBankModalOpen(true)} className="bg-primary hover:bg-primary/95 text-white text-xs font-bold px-4 py-2.5 rounded-xl flex items-center gap-1.5 transition">
            <Plus className="w-4 h-4" /> Add Account
          </button>
        )}
        {activeTab === "CASHBOOK" && (
          <div className="flex gap-2">
            <button onClick={() => setTransferModalOpen(true)} className="bg-secondary hover:bg-secondary/80 text-foreground border border-border text-xs font-bold px-4 py-2.5 rounded-xl flex items-center gap-1.5 transition">
              <ArrowRightLeft className="w-4 h-4" /> Transfer
            </button>
            <button onClick={() => setTxModalOpen(true)} className="bg-primary hover:bg-primary/95 text-white text-xs font-bold px-4 py-2.5 rounded-xl flex items-center gap-1.5 transition">
              <Plus className="w-4 h-4" /> Record Transaction
            </button>
            <button
              onClick={handleRefresh}
              className="border border-border bg-secondary hover:bg-secondary/80 text-foreground text-xs font-bold px-3 py-2.5 rounded-xl flex items-center gap-1.5 transition"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        )}
        {activeTab === "DAILY_CLOSING" && (
          <div className="flex gap-2">
            <button onClick={() => {
              const today = new Date().toISOString().split("T")[0];
              setClosingForm(f => ({ ...f, closingDate: today, branchId: "" }));
              setClosingModalOpen(true);
              loadClosingPreview(today, "");
            }} className="bg-primary hover:bg-primary/95 text-white text-xs font-bold px-4 py-2.5 rounded-xl flex items-center gap-1.5 transition">
              <Plus className="w-4 h-4" /> Close Today
            </button>
            <button
              onClick={handleRefresh}
              className="border border-border bg-secondary hover:bg-secondary/80 text-foreground text-xs font-bold px-3 py-2.5 rounded-xl flex items-center gap-1.5 transition"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        )}
        {activeTab !== "DAILY_CLOSING" && activeTab !== "CASHBOOK" && (
          <button
            onClick={handleRefresh}
            className="border border-border bg-secondary hover:bg-secondary/80 text-foreground text-xs font-bold px-3 py-2.5 rounded-xl flex items-center gap-1.5 transition"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* ========== EXPENSES TAB ========== */}
      {activeTab === "EXPENSES" && (
        <div className="bg-card border border-border rounded-2xl p-5">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-border text-muted-foreground font-semibold">
                  <th className="pb-3 pl-2">Category</th>
                  <th className="pb-3">Date</th>
                  <th className="pb-3">Payment Method</th>
                  <th className="pb-3">Description</th>
                  <th className="pb-3 text-right pr-2">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {expenses.length === 0 ? (
                  <tr><td colSpan={5} className="py-8 text-center text-muted-foreground">No expenses logged.</td></tr>
                ) : expenses.map(exp => (
                  <tr key={exp.id} className="hover:bg-secondary/20 transition">
                    <td className="py-4 pl-2 font-bold text-foreground uppercase tracking-wider">{exp.category}</td>
                    <td className="py-4 text-muted-foreground">{new Date(exp.date).toLocaleDateString()}</td>
                    <td className="py-4 text-foreground uppercase font-semibold">{exp.paymentMethod}</td>
                    <td className="py-4 text-muted-foreground truncate max-w-xs">{exp.description || "-"}</td>
                    <td className="py-4 text-right pr-2 font-extrabold text-red-400">Rs. {exp.amount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ========== PURCHASES TAB ========== */}
      {activeTab === "PURCHASES" && (
        <div className="bg-card border border-border rounded-2xl p-5">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-border text-muted-foreground font-semibold">
                  <th className="pb-3 pl-2">Order Date</th>
                  <th className="pb-3">Supplier</th>
                  <th className="pb-3">Items</th>
                  <th className="pb-3 text-right">Cost</th>
                  <th className="pb-3 text-center">Status</th>
                  <th className="pb-3 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {purchases.length === 0 ? (
                  <tr><td colSpan={6} className="py-8 text-center text-muted-foreground">No purchase orders.</td></tr>
                ) : purchases.map(pur => (
                  <tr key={pur.id} className="hover:bg-secondary/20 transition">
                    <td className="py-4 pl-2 text-muted-foreground">{new Date(pur.orderDate).toLocaleDateString()}</td>
                    <td className="py-4 font-semibold text-foreground">{pur.supplier.company}</td>
                    <td className="py-4 text-[10px] text-muted-foreground max-w-xs">
                      {pur.items.map((it: any, idx: number) => <span key={idx} className="block">{it.product.name} (x{it.quantity})</span>)}
                    </td>
                    <td className="py-4 text-right font-black text-foreground">Rs. {pur.totalAmount}</td>
                    <td className="py-4 text-center">
                      <span className={`text-[10px] px-2 py-0.5 rounded font-black uppercase ${pur.status === "RECEIVED" ? "bg-green-500/10 text-green-400" : "bg-amber-500/10 text-amber-400"}`}>{pur.status}</span>
                    </td>
                    <td className="py-4 text-center">
                      {pur.status !== "RECEIVED" && (
                        <button onClick={() => handleOpenReceive(pur)} className="bg-primary hover:bg-primary/95 text-white text-[10px] font-bold px-3 py-1.5 rounded-lg transition">Mark Received</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ========== BANK ACCOUNTS TAB ========== */}
      {activeTab === "BANKS" && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {bankAccounts.length === 0 ? (
              <div className="col-span-full bg-card border border-border rounded-2xl p-8 text-center text-muted-foreground">
                No bank accounts configured. Add your first account.
              </div>
            ) : bankAccounts.map(acc => (
              <div key={acc.id} className="bg-card border border-border rounded-2xl p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                      acc.type === "CASH" ? "bg-green-500/10 text-green-400" :
                      acc.type === "MOBILE_WALLET" ? "bg-blue-500/10 text-blue-400" :
                      "bg-purple-500/10 text-purple-400"
                    }`}>
                      {acc.type === "CASH" ? <Coins className="w-5 h-5" /> :
                       acc.type === "MOBILE_WALLET" ? <CircleDollarSign className="w-5 h-5" /> :
                       <Landmark className="w-5 h-5" />}
                    </div>
                    <div>
                      <p className="font-bold text-sm text-foreground">{acc.name}</p>
                      <p className="text-[10px] text-muted-foreground uppercase">{acc.type.replace("_", " ")}</p>
                    </div>
                  </div>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${acc.isActive ? "bg-green-500/10 text-green-400" : "bg-red-500/10 text-red-400"}`}>
                    {acc.isActive ? "Active" : "Inactive"}
                  </span>
                </div>
                {acc.bankName && <p className="text-[11px] text-muted-foreground">{acc.bankName} {acc.accountNumber ? `• ${acc.accountNumber}` : ""}</p>}
                <div className="border-t border-border pt-3">
                  <p className="text-[10px] text-muted-foreground uppercase font-bold">Current Balance</p>
                  <p className="text-xl font-black text-foreground">Rs. {acc.balance.toLocaleString()}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ========== CASH BOOK TAB ========== */}
      {activeTab === "CASHBOOK" && (
        <div className="space-y-4">
          {/* Filters */}
          <div className="bg-card border border-border rounded-2xl p-4 flex flex-wrap gap-3 items-end">
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-muted-foreground uppercase">Account</label>
              <select value={txFilter.bankAccountId} onChange={e => setTxFilter({ ...txFilter, bankAccountId: e.target.value })} className="bg-secondary border border-border px-3 py-2 rounded text-xs focus:outline-none">
                <option value="">All Accounts</option>
                {bankAccounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-muted-foreground uppercase">Type</label>
              <select value={txFilter.type} onChange={e => setTxFilter({ ...txFilter, type: e.target.value })} className="bg-secondary border border-border px-3 py-2 rounded text-xs focus:outline-none">
                <option value="">All Types</option>
                <option value="INCOME">Income</option>
                <option value="EXPENSE">Expense</option>
                <option value="TRANSFER">Transfer</option>
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-muted-foreground uppercase">From</label>
              <input type="date" value={txFilter.startDate} onChange={e => setTxFilter({ ...txFilter, startDate: e.target.value })} className="bg-secondary border border-border px-3 py-2 rounded text-xs focus:outline-none" />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-muted-foreground uppercase">To</label>
              <input type="date" value={txFilter.endDate} onChange={e => setTxFilter({ ...txFilter, endDate: e.target.value })} className="bg-secondary border border-border px-3 py-2 rounded text-xs focus:outline-none" />
            </div>
            <button onClick={loadTransactions} className="bg-primary hover:bg-primary/95 text-white text-xs font-bold px-4 py-2 rounded-xl transition flex items-center gap-1">
              <Search className="w-3.5 h-3.5" /> Filter
            </button>
          </div>

          {/* Transaction Table */}
          <div className="bg-card border border-border rounded-2xl p-5">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-border text-muted-foreground font-semibold">
                    <th className="pb-3 pl-2">Date</th>
                    <th className="pb-3">Account</th>
                    <th className="pb-3">Type</th>
                    <th className="pb-3">Category</th>
                    <th className="pb-3">Description</th>
                    <th className="pb-3 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {transactions.length === 0 ? (
                    <tr><td colSpan={6} className="py-8 text-center text-muted-foreground">No transactions recorded.</td></tr>
                  ) : transactions.map(tx => (
                    <tr key={tx.id} className="hover:bg-secondary/20 transition">
                      <td className="py-3 pl-2 text-muted-foreground">{new Date(tx.createdAt).toLocaleDateString()}</td>
                      <td className="py-3 font-semibold text-foreground">{tx.bankAccount?.name}</td>
                      <td className="py-3">
                        <span className={`inline-flex items-center gap-1 text-[10px] font-bold uppercase px-2 py-0.5 rounded ${
                          tx.type === "INCOME" ? "bg-green-500/10 text-green-400" :
                          tx.type === "EXPENSE" ? "bg-red-500/10 text-red-400" :
                          "bg-blue-500/10 text-blue-400"
                        }`}>
                          {tx.type === "INCOME" ? <ArrowUpRight className="w-3 h-3" /> : tx.type === "EXPENSE" ? <ArrowDownRight className="w-3 h-3" /> : <ArrowRightLeft className="w-3 h-3" />}
                          {tx.type}
                        </span>
                      </td>
                      <td className="py-3 text-muted-foreground uppercase">{tx.category}</td>
                      <td className="py-3 text-muted-foreground truncate max-w-xs">{tx.description || "-"}</td>
                      <td className={`py-3 text-right font-black ${tx.type === "INCOME" ? "text-green-400" : tx.type === "EXPENSE" ? "text-red-400" : "text-foreground"}`}>
                        {tx.type === "EXPENSE" ? "-" : "+"} Rs. {tx.amount.toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ========== PROFIT & LOSS TAB ========== */}
      {activeTab === "PNL" && (
        <div className="space-y-4">
          {/* Date Range Picker */}
          <div className="bg-card border border-border rounded-2xl p-4 flex flex-wrap gap-3 items-end">
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-muted-foreground uppercase">Start Date</label>
              <input type="date" value={pnlStartDate} onChange={e => setPnlStartDate(e.target.value)} className="bg-secondary border border-border px-3 py-2 rounded text-xs focus:outline-none" />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-muted-foreground uppercase">End Date</label>
              <input type="date" value={pnlEndDate} onChange={e => setPnlEndDate(e.target.value)} className="bg-secondary border border-border px-3 py-2 rounded text-xs focus:outline-none" />
            </div>
            <button onClick={loadPnL} className="bg-primary hover:bg-primary/95 text-white text-xs font-bold px-4 py-2 rounded-xl transition flex items-center gap-1">
              <Search className="w-3.5 h-3.5" /> Generate
            </button>
          </div>

          {pnLData && (
            <>
              {/* Summary Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-card border border-border rounded-2xl p-5">
                  <p className="text-[10px] font-bold text-muted-foreground uppercase">Gross Revenue</p>
                  <p className="text-2xl font-black text-foreground mt-1">Rs. {pnLData.revenue.grossRevenue.toLocaleString()}</p>
                  <p className="text-[10px] text-muted-foreground mt-1">{pnLData.revenue.totalSales} sales</p>
                </div>
                <div className="bg-card border border-border rounded-2xl p-5">
                  <p className="text-[10px] font-bold text-muted-foreground uppercase">Cost of Goods Sold</p>
                  <p className="text-2xl font-black text-red-400 mt-1">Rs. {pnLData.cogs.totalCOGS.toLocaleString()}</p>
                  <p className="text-[10px] text-muted-foreground mt-1">Gross margin: {pnLData.cogs.grossMargin}%</p>
                </div>
                <div className="bg-card border border-border rounded-2xl p-5">
                  <p className="text-[10px] font-bold text-muted-foreground uppercase">Total Expenses</p>
                  <p className="text-2xl font-black text-red-400 mt-1">Rs. {pnLData.expenses.totalExpenses.toLocaleString()}</p>
                </div>
                <div className={`border rounded-2xl p-5 ${pnLData.netProfit >= 0 ? "bg-green-500/5 border-green-500/20" : "bg-red-500/5 border-red-500/20"}`}>
                  <p className="text-[10px] font-bold text-muted-foreground uppercase">Net Profit</p>
                  <p className={`text-2xl font-black mt-1 ${pnLData.netProfit >= 0 ? "text-green-400" : "text-red-400"}`}>
                    Rs. {pnLData.netProfit.toLocaleString()}
                  </p>
                  <p className="text-[10px] text-muted-foreground mt-1">Margin: {pnLData.netMargin}%</p>
                </div>
              </div>

              {/* Detailed Breakdown */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* Revenue Breakdown */}
                <div className="bg-card border border-border rounded-2xl p-5 space-y-3">
                  <h3 className="font-bold text-sm text-foreground flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-green-400" /> Revenue Breakdown
                  </h3>
                  <div className="space-y-2 text-xs">
                    <div className="flex justify-between"><span className="text-muted-foreground">Total Sales</span><span className="font-bold">Rs. {pnLData.revenue.grossRevenue.toLocaleString()}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Tax Collected</span><span className="font-bold">Rs. {pnLData.revenue.taxCollected.toLocaleString()}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Discounts Given</span><span className="font-bold text-red-400">-Rs. {pnLData.revenue.discountsGiven.toLocaleString()}</span></div>
                    <div className="border-t border-border pt-2 flex justify-between font-bold"><span>Gross Profit</span><span className="text-green-400">Rs. {pnLData.cogs.grossProfit.toLocaleString()}</span></div>
                  </div>
                </div>

                {/* Expenses Breakdown */}
                <div className="bg-card border border-border rounded-2xl p-5 space-y-3">
                  <h3 className="font-bold text-sm text-foreground flex items-center gap-2">
                    <TrendingDown className="w-4 h-4 text-red-400" /> Expenses by Category
                  </h3>
                  <div className="space-y-2 text-xs">
                    {Object.keys(pnLData.expenses.byCategory).length === 0 ? (
                      <p className="text-muted-foreground italic">No expenses in this period.</p>
                    ) : (
                      Object.entries(pnLData.expenses.byCategory).map(([cat, amt]: [string, any]) => (
                        <div key={cat} className="flex justify-between">
                          <span className="text-muted-foreground uppercase">{cat}</span>
                          <span className="font-bold text-red-400">-Rs. {amt.toLocaleString()}</span>
                        </div>
                      ))
                    )}
                    <div className="border-t border-border pt-2 flex justify-between font-bold">
                      <span>Total Expenses</span>
                      <span className="text-red-400">Rs. {pnLData.expenses.totalExpenses.toLocaleString()}</span>
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}

          {!pnLData && (
            <div className="bg-card border border-border rounded-2xl p-12 text-center text-muted-foreground">
              Select a date range and click Generate to view the Profit & Loss report.
            </div>
          )}
        </div>
      )}

      {/* ========== DAILY CLOSING TAB ========== */}
      {activeTab === "DAILY_CLOSING" && (
        <div className="space-y-4">
          {dailyClosings.length === 0 ? (
            <div className="bg-card border border-border rounded-2xl p-12 text-center text-muted-foreground">
              No daily closings recorded yet. Click "Close Today" to perform your first closing.
            </div>
          ) : (
            <div className="bg-card border border-border rounded-2xl p-5">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-border text-muted-foreground font-semibold">
                      <th className="pb-3 pl-2">Date</th>
                      <th className="pb-3">Opening</th>
                      <th className="pb-3">Sales</th>
                      <th className="pb-3">Expenses</th>
                      <th className="pb-3">Cash In</th>
                      <th className="pb-3">Cash Out</th>
                      <th className="pb-3 text-right">Expected</th>
                      <th className="pb-3 text-right">Actual</th>
                      <th className="pb-3 text-right">Variance</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/50">
                    {dailyClosings.map(c => (
                      <tr key={c.id} className="hover:bg-secondary/20 transition">
                        <td className="py-4 pl-2 font-bold text-foreground">{new Date(c.closingDate).toLocaleDateString()}</td>
                        <td className="py-4 text-muted-foreground">Rs. {c.openingBalance.toLocaleString()}</td>
                        <td className="py-4 text-green-400 font-semibold">Rs. {c.totalSales.toLocaleString()}</td>
                        <td className="py-4 text-red-400 font-semibold">Rs. {c.totalExpenses.toLocaleString()}</td>
                        <td className="py-4 text-green-400">Rs. {c.cashIn.toLocaleString()}</td>
                        <td className="py-4 text-red-400">Rs. {c.cashOut.toLocaleString()}</td>
                        <td className="py-4 text-right font-bold">Rs. {c.expectedBalance.toLocaleString()}</td>
                        <td className="py-4 text-right font-black">Rs. {c.actualBalance.toLocaleString()}</td>
                        <td className="py-4 text-right">
                          <span className={`font-black ${c.variance >= 0 ? "text-green-400" : "text-red-400"}`}>
                            {c.variance >= 0 ? "+" : ""} Rs. {c.variance.toLocaleString()}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ========== MODALS ========== */}

      {/* Log Expense Modal */}
      <PortalModal isOpen={expenseOpen} onClose={() => setExpenseOpen(false)} backdropClass="bg-black/60 backdrop-blur-sm px-4">
        <div className="bg-card border border-border w-full max-w-sm p-6 rounded-2xl shadow-2xl relative">
            <h3 className="font-bold text-sm text-foreground mb-4">Log Storefront Expense</h3>
            <form onSubmit={handleCreateExpense} className="space-y-4">
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-muted-foreground uppercase">Category</label>
                <select value={newExpense.category} onChange={e => setNewExpense({ ...newExpense, category: e.target.value })} className="w-full bg-secondary border border-border px-3 py-2 rounded text-xs focus:outline-none">
                  <option value="RENT">Store Rent</option>
                  <option value="UTILITIES">Electricity & Internet</option>
                  <option value="SALARIES">Employee Salaries</option>
                  <option value="MARKETING">Social Media Ads</option>
                  <option value="OTHER">Other Miscellaneous</option>
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-muted-foreground uppercase">Amount (Rs.) *</label>
                <input type="number" required step="0.01" value={newExpense.amount} onChange={e => setNewExpense({ ...newExpense, amount: e.target.value })} className="w-full bg-secondary border border-border px-3 py-2 rounded text-xs focus:outline-none" />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-muted-foreground uppercase">Payment Method</label>
                <select value={newExpense.paymentMethod} onChange={e => setNewExpense({ ...newExpense, paymentMethod: e.target.value })} className="w-full bg-secondary border border-border px-3 py-2 rounded text-xs focus:outline-none">
                  <option value="CASH">Cash Drawer</option>
                  <option value="BANK_TRANSFER">Bank Wire</option>
                  <option value="CARD">Company Card</option>
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-muted-foreground uppercase">Description</label>
                <input type="text" value={newExpense.description} onChange={e => setNewExpense({ ...newExpense, description: e.target.value })} className="w-full bg-secondary border border-border px-3 py-2 rounded text-xs focus:outline-none" />
              </div>
              <div className="flex gap-3 justify-end pt-4">
                <button type="button" onClick={() => setExpenseOpen(false)} className="px-4 py-2 border border-border text-xs rounded hover:bg-secondary transition">Cancel</button>
                <button type="submit" className="px-4 py-2 bg-primary text-white text-xs rounded hover:bg-primary/95 transition">Log Expense</button>
              </div>
            </form>
          </div>
      </PortalModal>

      {/* Place Purchase Order Modal */}
      <PortalModal isOpen={purchaseOpen} onClose={() => setPurchaseOpen(false)} backdropClass="bg-black/60 backdrop-blur-sm px-4 overflow-y-auto">
        <div className="bg-card border border-border w-full max-w-md p-6 rounded-2xl shadow-2xl relative my-8">
            <h3 className="font-bold text-sm text-foreground mb-4">Place Supplier Restock Order</h3>
            <form onSubmit={handleCreatePurchase} className="space-y-4">
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-muted-foreground uppercase">Select Supplier *</label>
                <select required value={newPurchase.supplierId} onChange={e => setNewPurchase({ ...newPurchase, supplierId: e.target.value })} className="w-full bg-secondary border border-border px-3 py-2 rounded text-xs focus:outline-none">
                  <option value="">Choose supplier...</option>
                  {suppliers.map(s => <option key={s.id} value={s.id}>{s.company}</option>)}
                </select>
              </div>
              <div className="space-y-2 border border-border p-3 rounded-xl bg-secondary/30 text-xs">
                <label className="font-bold text-[10px] text-muted-foreground uppercase">Restock Items</label>
                <div className="space-y-1 max-h-24 overflow-y-auto">
                  {newPurchase.items.length === 0 ? (
                    <p className="text-muted-foreground italic text-[10px]">No products added.</p>
                  ) : newPurchase.items.map((it, idx) => (
                    <div key={idx} className="flex justify-between items-center bg-card p-1.5 rounded border border-border text-[10px]">
                      <span className="font-bold">{it.name}</span>
                      <div className="flex gap-3">
                        <span>Qty: {it.quantity}</span>
                        <span>Rs. {it.costPrice}</span>
                        <button type="button" onClick={() => handleRemovePurchaseItem(idx)} className="text-red-400 hover:text-red-300 font-bold">Remove</button>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="flex flex-col gap-2 pt-2 border-t border-border/50 text-[10px]">
                  <select value={newPurchaseItem.productId} onChange={e => setNewPurchaseItem({ ...newPurchaseItem, productId: e.target.value })} className="bg-secondary border border-border px-2 py-1 rounded focus:outline-none">
                    <option value="">Choose product...</option>
                    {products.map(p => <option key={p.id} value={p.id}>{p.name} ({p.sku})</option>)}
                  </select>
                  <div className="flex gap-2">
                    <input type="number" placeholder="Qty" value={newPurchaseItem.quantity} onChange={e => setNewPurchaseItem({ ...newPurchaseItem, quantity: e.target.value })} className="flex-1 bg-secondary border border-border px-2 py-1 rounded focus:outline-none" />
                    <input type="number" placeholder="Cost" value={newPurchaseItem.costPrice} onChange={e => setNewPurchaseItem({ ...newPurchaseItem, costPrice: e.target.value })} className="flex-1 bg-secondary border border-border px-2 py-1 rounded focus:outline-none" />
                    <button type="button" onClick={handleAddPurchaseItem} className="bg-primary text-white font-bold px-3 py-1 rounded hover:bg-primary/95">Add</button>
                  </div>
                </div>
              </div>
              <div className="flex gap-3 justify-end pt-4">
                <button type="button" onClick={() => setPurchaseOpen(false)} className="px-4 py-2 border border-border text-xs rounded hover:bg-secondary transition">Cancel</button>
                <button type="submit" className="px-4 py-2 bg-primary text-white text-xs rounded hover:bg-primary/95 transition">Place Order</button>
              </div>
            </form>
          </div>
      </PortalModal>

      {/* Receive Purchase Order Modal */}
      {selectedPurchase && (
        <PortalModal isOpen={receiveOpen && !!selectedPurchase} onClose={() => { setReceiveOpen(false); setSelectedPurchase(null); }} backdropClass="bg-black/60 backdrop-blur-sm px-4">
          <div className="bg-card border border-border w-full max-w-sm p-6 rounded-2xl shadow-2xl relative">
            <h3 className="font-bold text-sm text-foreground mb-1">Receive Purchase Order</h3>
            <p className="text-xs text-muted-foreground mb-4">Supplier: <strong>{selectedPurchase.supplier.company}</strong></p>
            <form onSubmit={handleReceiveConfirm} className="space-y-4">
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-muted-foreground uppercase">Target Branch *</label>
                <select required value={receiveBranchId} onChange={e => setReceiveBranchId(e.target.value)} className="w-full bg-secondary border border-border px-3 py-2 rounded text-xs focus:outline-none">
                  {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </div>
              <div className="bg-secondary/50 p-3 rounded-xl border border-border text-[11px] text-muted-foreground space-y-2">
                <p className="font-bold text-foreground">Items to add:</p>
                {selectedPurchase.items.map((it: any, idx: number) => (
                  <div key={idx} className="flex justify-between"><span>{it.product.name}</span><span className="font-bold text-foreground">+{it.quantity}</span></div>
                ))}
              </div>
              <div className="flex gap-3 justify-end pt-4">
                <button type="button" onClick={() => { setReceiveOpen(false); setSelectedPurchase(null); }} className="px-4 py-2 border border-border text-xs rounded hover:bg-secondary transition">Cancel</button>
                <button type="submit" className="px-4 py-2 bg-primary text-white text-xs rounded hover:bg-primary/95 transition">Confirm</button>
              </div>
            </form>
          </div>
        </PortalModal>
      )}

      {/* Create Bank Account Modal */}
      <PortalModal isOpen={bankModalOpen} onClose={() => setBankModalOpen(false)} backdropClass="bg-black/60 backdrop-blur-sm px-4">
        <div className="bg-card border border-border w-full max-w-sm p-6 rounded-2xl shadow-2xl relative">
            <h3 className="font-bold text-sm text-foreground mb-4">Add Bank Account</h3>
            <form onSubmit={handleCreateBank} className="space-y-4">
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-muted-foreground uppercase">Account Name *</label>
                <input type="text" required value={newBank.name} onChange={e => setNewBank({ ...newBank, name: e.target.value })} placeholder="e.g. HBL Main Account" className="w-full bg-secondary border border-border px-3 py-2 rounded text-xs focus:outline-none" />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-muted-foreground uppercase">Account Type *</label>
                <select value={newBank.type} onChange={e => setNewBank({ ...newBank, type: e.target.value })} className="w-full bg-secondary border border-border px-3 py-2 rounded text-xs focus:outline-none">
                  <option value="BANK">Bank Account</option>
                  <option value="CASH">Cash Drawer</option>
                  <option value="MOBILE_WALLET">Mobile Wallet</option>
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-muted-foreground uppercase">Bank Name</label>
                <input type="text" value={newBank.bankName} onChange={e => setNewBank({ ...newBank, bankName: e.target.value })} placeholder="e.g. HBL, Meezan" className="w-full bg-secondary border border-border px-3 py-2 rounded text-xs focus:outline-none" />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-muted-foreground uppercase">Account Number</label>
                <input type="text" value={newBank.accountNumber} onChange={e => setNewBank({ ...newBank, accountNumber: e.target.value })} className="w-full bg-secondary border border-border px-3 py-2 rounded text-xs focus:outline-none" />
              </div>
              <div className="flex gap-3 justify-end pt-4">
                <button type="button" onClick={() => setBankModalOpen(false)} className="px-4 py-2 border border-border text-xs rounded hover:bg-secondary transition">Cancel</button>
                <button type="submit" className="px-4 py-2 bg-primary text-white text-xs rounded hover:bg-primary/95 transition">Create Account</button>
              </div>
            </form>
          </div>
      </PortalModal>

      {/* Record Transaction Modal */}
      <PortalModal isOpen={txModalOpen} onClose={() => setTxModalOpen(false)} backdropClass="bg-black/60 backdrop-blur-sm px-4">
        <div className="bg-card border border-border w-full max-w-sm p-6 rounded-2xl shadow-2xl relative">
            <h3 className="font-bold text-sm text-foreground mb-4">Record Transaction</h3>
            <form onSubmit={handleCreateTransaction} className="space-y-4">
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-muted-foreground uppercase">Account *</label>
                <select required value={newTx.bankAccountId} onChange={e => setNewTx({ ...newTx, bankAccountId: e.target.value })} className="w-full bg-secondary border border-border px-3 py-2 rounded text-xs focus:outline-none">
                  <option value="">Select account...</option>
                  {bankAccounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-muted-foreground uppercase">Type *</label>
                <select value={newTx.type} onChange={e => setNewTx({ ...newTx, type: e.target.value })} className="w-full bg-secondary border border-border px-3 py-2 rounded text-xs focus:outline-none">
                  <option value="INCOME">Income (Money In)</option>
                  <option value="EXPENSE">Expense (Money Out)</option>
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-muted-foreground uppercase">Category</label>
                <select value={newTx.category} onChange={e => setNewTx({ ...newTx, category: e.target.value })} className="w-full bg-secondary border border-border px-3 py-2 rounded text-xs focus:outline-none">
                  <option value="ADJUSTMENT">Manual Adjustment</option>
                  <option value="SALE">Sale Income</option>
                  <option value="EXPENSE">Expense Payment</option>
                  <option value="PURCHASE">Purchase Payment</option>
                  <option value="CREDIT_PAYMENT">Credit Collection</option>
                  <option value="SUPPLIER_PAYMENT">Supplier Payment</option>
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-muted-foreground uppercase">Amount (Rs.) *</label>
                <input type="number" required step="0.01" value={newTx.amount} onChange={e => setNewTx({ ...newTx, amount: e.target.value })} className="w-full bg-secondary border border-border px-3 py-2 rounded text-xs focus:outline-none" />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-muted-foreground uppercase">Description</label>
                <input type="text" value={newTx.description} onChange={e => setNewTx({ ...newTx, description: e.target.value })} className="w-full bg-secondary border border-border px-3 py-2 rounded text-xs focus:outline-none" />
              </div>
              <div className="flex gap-3 justify-end pt-4">
                <button type="button" onClick={() => setTxModalOpen(false)} className="px-4 py-2 border border-border text-xs rounded hover:bg-secondary transition">Cancel</button>
                <button type="submit" className="px-4 py-2 bg-primary text-white text-xs rounded hover:bg-primary/95 transition">Record</button>
              </div>
            </form>
          </div>
      </PortalModal>

      {/* Transfer Funds Modal */}
      <PortalModal isOpen={transferModalOpen} onClose={() => setTransferModalOpen(false)} backdropClass="bg-black/60 backdrop-blur-sm px-4">
        <div className="bg-card border border-border w-full max-w-sm p-6 rounded-2xl shadow-2xl relative">
            <h3 className="font-bold text-sm text-foreground mb-4 flex items-center gap-2"><ArrowRightLeft className="w-4 h-4" /> Transfer Funds</h3>
            <form onSubmit={handleTransfer} className="space-y-4">
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-muted-foreground uppercase">From Account *</label>
                <select required value={newTransfer.fromAccountId} onChange={e => setNewTransfer({ ...newTransfer, fromAccountId: e.target.value })} className="w-full bg-secondary border border-border px-3 py-2 rounded text-xs focus:outline-none">
                  <option value="">Select source...</option>
                  {bankAccounts.filter(a => a.isActive).map(a => <option key={a.id} value={a.id}>{a.name} (Rs. {a.balance.toLocaleString()})</option>)}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-muted-foreground uppercase">To Account *</label>
                <select required value={newTransfer.toAccountId} onChange={e => setNewTransfer({ ...newTransfer, toAccountId: e.target.value })} className="w-full bg-secondary border border-border px-3 py-2 rounded text-xs focus:outline-none">
                  <option value="">Select destination...</option>
                  {bankAccounts.filter(a => a.isActive && a.id !== newTransfer.fromAccountId).map(a => <option key={a.id} value={a.id}>{a.name} (Rs. {a.balance.toLocaleString()})</option>)}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-muted-foreground uppercase">Amount (Rs.) *</label>
                <input type="number" required step="0.01" value={newTransfer.amount} onChange={e => setNewTransfer({ ...newTransfer, amount: e.target.value })} className="w-full bg-secondary border border-border px-3 py-2 rounded text-xs focus:outline-none" />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-muted-foreground uppercase">Description</label>
                <input type="text" value={newTransfer.description} onChange={e => setNewTransfer({ ...newTransfer, description: e.target.value })} className="w-full bg-secondary border border-border px-3 py-2 rounded text-xs focus:outline-none" />
              </div>
              <div className="flex gap-3 justify-end pt-4">
                <button type="button" onClick={() => setTransferModalOpen(false)} className="px-4 py-2 border border-border text-xs rounded hover:bg-secondary transition">Cancel</button>
                <button type="submit" className="px-4 py-2 bg-primary text-white text-xs rounded hover:bg-primary/95 transition">Transfer</button>
              </div>
            </form>
          </div>
      </PortalModal>

      {/* Daily Closing Modal */}
      <PortalModal isOpen={closingModalOpen} onClose={() => { setClosingModalOpen(false); setClosingPreview(null); }} backdropClass="bg-black/60 backdrop-blur-sm px-4">
        <div className="bg-card border border-border w-full max-w-md p-6 rounded-2xl shadow-2xl relative">
            <h3 className="font-bold text-sm text-foreground mb-4 flex items-center gap-2"><CalendarCheck className="w-4 h-4" /> Daily Closing</h3>
            <form onSubmit={handleCreateClosing} className="space-y-4">
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-muted-foreground uppercase">Closing Date</label>
                <input type="date" value={closingForm.closingDate} onChange={e => loadClosingPreview(e.target.value, closingForm.branchId)} className="w-full bg-secondary border border-border px-3 py-2 rounded text-xs focus:outline-none" />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-muted-foreground uppercase">Branch (optional)</label>
                <select value={closingForm.branchId} onChange={e => loadClosingPreview(closingForm.closingDate, e.target.value)} className="w-full bg-secondary border border-border px-3 py-2 rounded text-xs focus:outline-none">
                  <option value="">All Branches</option>
                  {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </div>

              {closingPreview && (
                <div className="bg-secondary/50 p-4 rounded-xl border border-border space-y-2 text-xs">
                  <div className="flex justify-between"><span className="text-muted-foreground">Opening Balance</span><span className="font-bold">Rs. {closingPreview.openingBalance.toLocaleString()}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Today's Sales ({closingPreview.totalSalesCount} txns)</span><span className="font-bold text-green-400">+Rs. {closingPreview.totalSales.toLocaleString()}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Today's Expenses</span><span className="font-bold text-red-400">-Rs. {closingPreview.totalExpenses.toLocaleString()}</span></div>
                </div>
              )}

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-muted-foreground uppercase">Opening Balance (Rs.)</label>
                <input type="number" step="0.01" value={closingForm.openingBalance} onChange={e => setClosingForm({ ...closingForm, openingBalance: e.target.value })} className="w-full bg-secondary border border-border px-3 py-2 rounded text-xs focus:outline-none" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-muted-foreground uppercase">Cash In (Rs.)</label>
                  <input type="number" step="0.01" value={closingForm.cashIn} onChange={e => setClosingForm({ ...closingForm, cashIn: e.target.value })} className="w-full bg-secondary border border-border px-3 py-2 rounded text-xs focus:outline-none" />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-muted-foreground uppercase">Cash Out (Rs.)</label>
                  <input type="number" step="0.01" value={closingForm.cashOut} onChange={e => setClosingForm({ ...closingForm, cashOut: e.target.value })} className="w-full bg-secondary border border-border px-3 py-2 rounded text-xs focus:outline-none" />
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-muted-foreground uppercase">Actual Physical Count (Rs.) *</label>
                <input type="number" required step="0.01" value={closingForm.actualBalance} onChange={e => setClosingForm({ ...closingForm, actualBalance: e.target.value })} className="w-full bg-secondary border border-border px-3 py-2 rounded text-xs focus:outline-none" placeholder="Count your cash drawer" />
              </div>

              {closingPreview && closingForm.actualBalance && (
                <div className={`p-3 rounded-xl border text-xs font-bold ${
                  Number(closingForm.actualBalance) - (Number(closingForm.openingBalance || 0) + closingPreview.totalSales + Number(closingForm.cashIn || 0) - closingPreview.totalExpenses - Number(closingForm.cashOut || 0)) >= 0
                    ? "bg-green-500/10 border-green-500/20 text-green-400"
                    : "bg-red-500/10 border-red-500/20 text-red-400"
                }`}>
                  Variance: Rs. {(Number(closingForm.actualBalance) - (Number(closingForm.openingBalance || 0) + closingPreview.totalSales + Number(closingForm.cashIn || 0) - closingPreview.totalExpenses - Number(closingForm.cashOut || 0))).toLocaleString()}
                  {Number(closingForm.actualBalance) - (Number(closingForm.openingBalance || 0) + closingPreview.totalSales + Number(closingForm.cashIn || 0) - closingPreview.totalExpenses - Number(closingForm.cashOut || 0)) < 0 ? " (SHORT)" : " (OVER)"}
                </div>
              )}

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-muted-foreground uppercase">Notes</label>
                <input type="text" value={closingForm.notes} onChange={e => setClosingForm({ ...closingForm, notes: e.target.value })} className="w-full bg-secondary border border-border px-3 py-2 rounded text-xs focus:outline-none" placeholder="Optional notes" />
              </div>

              <div className="flex gap-3 justify-end pt-4">
                <button type="button" onClick={() => { setClosingModalOpen(false); setClosingPreview(null); }} className="px-4 py-2 border border-border text-xs rounded hover:bg-secondary transition">Cancel</button>
                <button type="submit" className="px-4 py-2 bg-primary text-white text-xs rounded hover:bg-primary/95 transition">Close Day</button>
              </div>
            </form>
          </div>
      </PortalModal>

    </div>
  );
}
