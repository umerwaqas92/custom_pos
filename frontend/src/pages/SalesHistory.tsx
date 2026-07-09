import React, { useState, useEffect } from "react";
import axios from "axios";
import { useStore } from "../store/useStore";
import {
  Search,
  Calendar,
  Filter,
  Eye,
  RefreshCw,
  X,
  CheckCircle,
  Receipt,
  FileText
} from "lucide-react";

export default function SalesHistory() {
  const { addNotification } = useStore();
  const [sales, setSales] = useState<any[]>([]);
  const [branches, setBranches] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  
  // Filters state
  const [search, setSearch] = useState("");
  const [selectedBranch, setSelectedBranch] = useState("ALL");
  const [selectedCustomer, setSelectedCustomer] = useState("ALL");
  
  // Selected sale for receipt display
  const [activeSale, setActiveSale] = useState<any | null>(null);
  const [receiptOpen, setReceiptOpen] = useState(false);

  const loadData = async () => {
    try {
      const [salesRes, branchRes, custRes] = await Promise.all([
        axios.get("/api/sales"),
        axios.get("/api/auth/branches"),
        axios.get("/api/accounting/customers")
      ]);
      setSales(salesRes.data);
      setBranches(branchRes.data);
      setCustomers(custRes.data);
    } catch (err) {
      addNotification("Failed to load sales history records.", "warning");
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleOpenReceipt = async (saleId: string) => {
    try {
      const res = await axios.get(`/api/sales/${saleId}`);
      setActiveSale(res.data);
      setReceiptOpen(true);
    } catch (err) {
      addNotification("Failed to load invoice receipt detail.", "warning");
    }
  };

  const filteredSales = sales.filter((s) => {
    const matchesSearch =
      s.id.toLowerCase().includes(search.toLowerCase()) ||
      (s.customer?.name && s.customer.name.toLowerCase().includes(search.toLowerCase())) ||
      (s.cashier?.name && s.cashier.name.toLowerCase().includes(search.toLowerCase()));

    const matchesBranch = selectedBranch === "ALL" || s.branchId === selectedBranch;
    const matchesCustomer = selectedCustomer === "ALL" || s.customerId === selectedCustomer;

    return matchesSearch && matchesBranch && matchesCustomer;
  });

  const paymentMethodNames: Record<string, string> = {
    CASH: "Cash",
    CARD: "Bank",
    MOBILE: "Wallet",
    CREDIT: "Credit"
  };

  return (
    <div className="space-y-6 flex-1">
      {/* Header Tabs */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-card border border-border p-5 rounded-2xl">
        <div className="space-y-1">
          <h2 className="text-lg font-black text-foreground tracking-tight flex items-center gap-2">
            <FileText className="w-5 h-5 text-primary" /> Sales Transaction Log
          </h2>
          <p className="text-xs text-muted-foreground">Search and review completed store invoices and checkout histories.</p>
        </div>
        <button
          onClick={loadData}
          className="bg-secondary border border-border hover:bg-secondary/80 text-foreground text-xs font-bold px-3 py-2 rounded-xl flex items-center gap-1.5 transition"
        >
          <RefreshCw className="w-4 h-4" /> Refresh List
        </button>
      </div>

      {/* Filters and Search Bar */}
      <div className="bg-card border border-border rounded-2xl p-5 grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-3.5 text-muted-foreground" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by invoice ID, customer, cashier..."
            className="w-full bg-secondary text-foreground text-xs border border-border pl-9 pr-4 py-3 rounded-xl focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>

        <div className="flex items-center gap-2 bg-secondary/50 border border-border p-2.5 rounded-xl">
          <span className="text-[10px] font-bold uppercase text-muted-foreground pl-1.5">Branch Location:</span>
          <select
            value={selectedBranch}
            onChange={(e) => setSelectedBranch(e.target.value)}
            className="flex-1 bg-transparent text-xs text-foreground focus:outline-none cursor-pointer"
          >
            <option value="ALL">All Branches</option>
            {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </div>

        <div className="flex items-center gap-2 bg-secondary/50 border border-border p-2.5 rounded-xl">
          <span className="text-[10px] font-bold uppercase text-muted-foreground pl-1.5">Customer profile:</span>
          <select
            value={selectedCustomer}
            onChange={(e) => setSelectedCustomer(e.target.value)}
            className="flex-1 bg-transparent text-xs text-foreground focus:outline-none cursor-pointer"
          >
            <option value="ALL">All Profiles</option>
            {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
      </div>

      {/* Main Table */}
      <div className="bg-card border border-border rounded-2xl p-5">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-border text-muted-foreground font-semibold">
                <th className="pb-3 pl-2">Invoice ID</th>
                <th className="pb-3">Sale Date</th>
                <th className="pb-3">Customer Profile</th>
                <th className="pb-3">Cashier</th>
                <th className="pb-3 text-center">Payment Method</th>
                <th className="pb-3 text-right">Grand Total</th>
                <th className="pb-3 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {filteredSales.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-muted-foreground">
                    No sales matching filters or transactions logged yet.
                  </td>
                </tr>
              ) : (
                filteredSales.map((s) => (
                  <tr key={s.id} className="hover:bg-secondary/20 transition">
                    <td className="py-4 pl-2 font-mono text-muted-foreground truncate max-w-[120px]">{s.id}</td>
                    <td className="py-4 text-muted-foreground">{new Date(s.saleDate).toLocaleString()}</td>
                    <td className="py-4 font-semibold text-foreground">
                      {s.customer ? s.customer.name : <span className="text-muted-foreground italic">Walk-in Customer</span>}
                    </td>
                    <td className="py-4 text-foreground">{s.cashier?.name || "-"}</td>
                    <td className="py-4 text-center">
                      <span className="bg-secondary px-2 py-0.5 rounded font-black text-[10px]">
                        {paymentMethodNames[s.paymentMethod] || s.paymentMethod}
                      </span>
                    </td>
                    <td className="py-4 text-right font-black text-foreground">
                      Rs. {s.payableAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </td>
                    <td className="py-4 text-center">
                      <button
                        onClick={() => handleOpenReceipt(s.id)}
                        className="bg-primary/10 hover:bg-primary/20 text-primary text-[10px] font-bold px-2.5 py-1.5 rounded-lg flex items-center gap-1 mx-auto transition"
                      >
                        <Eye className="w-3.5 h-3.5" /> Details
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Invoice Receipt Modal */}
      {receiptOpen && activeSale && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/75 backdrop-blur-sm z-50 px-4 overflow-y-auto">
          <div className="bg-card border border-border w-full max-w-sm p-6 rounded-2xl shadow-2xl space-y-6 my-8">
            <div className="text-center space-y-1">
              <CheckCircle className="w-12 h-12 text-green-400 mx-auto" />
              <h3 className="text-lg font-black tracking-tight text-foreground">Invoice Voucher Details</h3>
              <p className="text-xs text-muted-foreground">Invoice reference: {activeSale.id.substring(0, 8)}</p>
            </div>

            {/* Receipt layout */}
            <div id="printable-receipt" className="bg-secondary/30 p-4 border border-dashed border-border rounded-xl text-xs space-y-4">
              <div className="text-center border-b border-border pb-3">
                <h4 className="font-extrabold text-foreground tracking-widest uppercase">ANTIGRAVITY POS</h4>
                <p className="text-[10px] text-muted-foreground">Invoice Receipt Slip</p>
                <p className="text-[9px] text-muted-foreground mt-1">Date: {new Date(activeSale.saleDate).toLocaleString()}</p>
                <p className="text-[9px] text-muted-foreground">Cashier: {activeSale.cashier?.name}</p>
                <p className="text-[9px] text-muted-foreground">Location: {activeSale.branch?.name}</p>
              </div>

              <div className="space-y-2">
                {activeSale.items.map((item: any) => (
                  <div key={item.id} className="flex justify-between items-start">
                    <div>
                      <p className="font-semibold text-foreground">{item.product.name}</p>
                      <p className="text-[9px] text-muted-foreground">
                        Qty: {item.quantity} @ Rs. {item.unitPrice} {item.serialNumber && `(S/N: ${item.serialNumber})`}
                      </p>
                    </div>
                    <span className="font-bold text-foreground">Rs. {item.totalPrice.toFixed(2)}</span>
                  </div>
                ))}
              </div>

              <div className="border-t border-border pt-3 space-y-1 text-[11px]">
                <div className="flex justify-between text-muted-foreground">
                  <span>Subtotal:</span>
                  <span>Rs. {activeSale.totalAmount.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-muted-foreground">
                  <span>Discount:</span>
                  <span>-Rs. {activeSale.discountAmount.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-muted-foreground">
                  <span>Sales Tax ({activeSale.items[0]?.tax || 0}%):</span>
                  <span>+Rs. {activeSale.taxAmount.toFixed(2)}</span>
                </div>
                <div className="flex justify-between font-black text-foreground text-xs pt-1 border-t border-border/40">
                  <span>Total Paid ({paymentMethodNames[activeSale.paymentMethod] || activeSale.paymentMethod}):</span>
                  <span>Rs. {activeSale.paidAmount.toFixed(2)}</span>
                </div>
              </div>

              {activeSale.customer && (
                <div className="bg-secondary/60 p-2 rounded text-[10px] text-muted-foreground">
                  <p>Customer: <strong>{activeSale.customer.name}</strong></p>
                  <p>Repayment Balance: <strong>Rs. {activeSale.customer.creditBalance}</strong></p>
                </div>
              )}
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => window.print()}
                className="flex-1 border border-border hover:bg-secondary text-foreground text-xs font-bold py-2.5 rounded-xl flex items-center justify-center gap-1.5 transition"
              >
                <Receipt className="w-4 h-4" />
                Print Slip
              </button>
              <button
                onClick={() => { setReceiptOpen(false); setActiveSale(null); }}
                className="flex-1 bg-primary hover:bg-primary/95 text-white text-xs font-bold py-2.5 rounded-xl transition"
              >
                Dismiss Window
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
