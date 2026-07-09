import React, { useState, useEffect } from "react";
import axios from "axios";
import { useStore } from "../store/useStore";
import {
  Plus,
  UserCheck,
  Building,
  DollarSign,
  Phone,
  Mail,
  Coins
} from "lucide-react";

export default function Contacts() {
  const { addNotification } = useStore();
  const [activeTab, setActiveTab] = useState<"CUSTOMERS" | "SUPPLIERS">("CUSTOMERS");
  const [customers, setCustomers] = useState<any[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  
  // Search
  const [search, setSearch] = useState("");

  // Modals state
  const [custOpen, setCustOpen] = useState(false);
  const [suppOpen, setSuppOpen] = useState(false);
  const [repayOpen, setRepayOpen] = useState(false);
  const [selectedCust, setSelectedCust] = useState<any | null>(null);

  // Forms state
  const [newCust, setNewCust] = useState({
    name: "", phone: "", email: "", address: "", creditLimit: "500", notes: ""
  });

  const [newSupp, setNewSupp] = useState({
    company: "", contactPerson: "", phone: "", email: "", address: ""
  });

  const [repayment, setRepayment] = useState({
    amount: "", paymentMethod: "CASH", notes: ""
  });

  const loadContacts = async () => {
    try {
      const [custRes, suppRes] = await Promise.all([
        axios.get("/api/accounting/customers"),
        axios.get("/api/accounting/suppliers")
      ]);
      setCustomers(custRes.data);
      setSuppliers(suppRes.data);
    } catch (err) {
      addNotification("Failed to load contacts list.", "warning");
    }
  };

  useEffect(() => {
    loadContacts();
  }, []);

  const handleCreateCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCust.name || !newCust.phone) {
      addNotification("Name and Phone are required.", "warning");
      return;
    }
    try {
      await axios.post("/api/accounting/customers", newCust);
      addNotification("Customer profile created.", "success");
      setCustOpen(false);
      loadContacts();
      setNewCust({ name: "", phone: "", email: "", address: "", creditLimit: "500", notes: "" });
    } catch (err: any) {
      const msg = err.response?.data?.error || "Failed to create customer.";
      addNotification(msg, "warning");
    }
  };

  const handleCreateSupplier = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSupp.company) {
      addNotification("Company name is required.", "warning");
      return;
    }
    try {
      await axios.post("/api/accounting/suppliers", newSupp);
      addNotification("Supplier profile created.", "success");
      setSuppOpen(false);
      loadContacts();
      setNewSupp({ company: "", contactPerson: "", phone: "", email: "", address: "" });
    } catch (err) {
      addNotification("Failed to create supplier.", "warning");
    }
  };

  const handleOpenRepay = (cust: any) => {
    setSelectedCust(cust);
    setRepayment({ amount: cust.creditBalance.toString(), paymentMethod: "CASH", notes: "" });
    setRepayOpen(true);
  };

  const handleRepaySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCust || !repayment.amount) return;

    try {
      await axios.post(`/api/accounting/customers/${selectedCust.id}/repay`, repayment);
      addNotification("Repayment processed successfully.", "success");
      setRepayOpen(false);
      setSelectedCust(null);
      loadContacts();
    } catch (err) {
      addNotification("Failed to process repayment.", "warning");
    }
  };

  return (
    <div className="space-y-6 flex-1">
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-card border border-border p-5 rounded-2xl">
        <div className="flex gap-2 border border-border bg-secondary p-1 rounded-xl">
          <button
            onClick={() => { setActiveTab("CUSTOMERS"); setSearch(""); }}
            className={`px-4 py-2 text-xs font-bold rounded-lg flex items-center gap-1.5 transition ${
              activeTab === "CUSTOMERS" ? "bg-primary text-white shadow" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <UserCheck className="w-4 h-4" /> Customer Registry
          </button>
          <button
            onClick={() => { setActiveTab("SUPPLIERS"); setSearch(""); }}
            className={`px-4 py-2 text-xs font-bold rounded-lg flex items-center gap-1.5 transition ${
              activeTab === "SUPPLIERS" ? "bg-primary text-white shadow" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Building className="w-4 h-4" /> Supplier Directory
          </button>
        </div>

        {activeTab === "CUSTOMERS" ? (
          <button
            onClick={() => setCustOpen(true)}
            className="bg-primary hover:bg-primary/95 text-white text-xs font-bold px-4 py-2.5 rounded-xl flex items-center gap-1.5 transition"
          >
            <Plus className="w-4 h-4" /> Add Customer
          </button>
        ) : (
          <button
            onClick={() => setSuppOpen(true)}
            className="bg-primary hover:bg-primary/95 text-white text-xs font-bold px-4 py-2.5 rounded-xl flex items-center gap-1.5 transition"
          >
            <Plus className="w-4 h-4" /> Add Supplier
          </button>
        )}
      </div>

      {/* Main Panel */}
      <div className="bg-card border border-border rounded-2xl p-5 space-y-4">
        
        {/* Search */}
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={`Search ${activeTab === "CUSTOMERS" ? "customers" : "suppliers"} by name or phone...`}
          className="w-full bg-secondary text-foreground text-sm border border-border px-4 py-2.5 rounded-xl focus:outline-none"
        />

        {/* Customer view */}
        {activeTab === "CUSTOMERS" && (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-border text-muted-foreground font-semibold">
                  <th className="pb-3 pl-2">Customer Name</th>
                  <th className="pb-3">Phone</th>
                  <th className="pb-3">Email</th>
                  <th className="pb-3 text-center">Reward Points</th>
                  <th className="pb-3 text-right">Credit Balance</th>
                  <th className="pb-3 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {customers
                  .filter(c => c.name.toLowerCase().includes(search.toLowerCase()) || c.phone.includes(search))
                  .map((c) => (
                    <tr key={c.id} className="hover:bg-secondary/20 transition">
                      <td className="py-4 pl-2 font-bold text-foreground">{c.name}</td>
                      <td className="py-4 text-muted-foreground">{c.phone}</td>
                      <td className="py-4 text-muted-foreground">{c.email || "-"}</td>
                      <td className="py-4 text-center font-bold text-indigo-400">
                        <span className="flex items-center justify-center gap-1">
                          <Coins className="w-3.5 h-3.5" /> {c.rewardPoints}
                        </span>
                      </td>
                      <td className="py-4 text-right font-black text-foreground">
                        <span className={c.creditBalance > 0 ? "text-amber-400" : "text-green-400"}>
                          ${c.creditBalance}
                        </span>
                      </td>
                      <td className="py-4 text-center">
                        {c.creditBalance > 0 && (
                          <button
                            onClick={() => handleOpenRepay(c)}
                            className="bg-secondary border border-border hover:bg-secondary/80 text-[10px] font-bold px-3 py-1.5 rounded-lg transition"
                          >
                            Receive Payment
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Supplier view */}
        {activeTab === "SUPPLIERS" && (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-border text-muted-foreground font-semibold">
                  <th className="pb-3 pl-2">Company Name</th>
                  <th className="pb-3">Contact Person</th>
                  <th className="pb-3">Phone</th>
                  <th className="pb-3">Email</th>
                  <th className="pb-3">Address</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {suppliers
                  .filter(s => s.company.toLowerCase().includes(search.toLowerCase()) || s.phone.includes(search))
                  .map((s) => (
                    <tr key={s.id} className="hover:bg-secondary/20 transition">
                      <td className="py-4 pl-2 font-bold text-foreground">{s.company}</td>
                      <td className="py-4 text-foreground">{s.contactPerson || "-"}</td>
                      <td className="py-4 text-muted-foreground">{s.phone || "-"}</td>
                      <td className="py-4 text-muted-foreground">{s.email || "-"}</td>
                      <td className="py-4 text-muted-foreground truncate max-w-xs">{s.address || "-"}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Create Customer Modal */}
      {custOpen && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/60 backdrop-blur-sm z-50 px-4">
          <div className="bg-card border border-border w-full max-w-sm p-6 rounded-2xl shadow-2xl relative">
            <h3 className="font-bold text-sm text-foreground mb-4">Add Customer Profile</h3>
            <form onSubmit={handleCreateCustomer} className="space-y-4">
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-muted-foreground uppercase">Customer Name *</label>
                <input
                  type="text"
                  required
                  value={newCust.name}
                  onChange={(e) => setNewCust({ ...newCust, name: e.target.value })}
                  className="w-full bg-secondary border border-border px-3 py-2 rounded text-xs focus:outline-none"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-muted-foreground uppercase">Phone Number *</label>
                <input
                  type="text"
                  required
                  value={newCust.phone}
                  onChange={(e) => setNewCust({ ...newCust, phone: e.target.value })}
                  className="w-full bg-secondary border border-border px-3 py-2 rounded text-xs focus:outline-none"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-muted-foreground uppercase">Email Address</label>
                <input
                  type="email"
                  value={newCust.email}
                  onChange={(e) => setNewCust({ ...newCust, email: e.target.value })}
                  className="w-full bg-secondary border border-border px-3 py-2 rounded text-xs focus:outline-none"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-muted-foreground uppercase">Credit Limit ($)</label>
                <input
                  type="number"
                  value={newCust.creditLimit}
                  onChange={(e) => setNewCust({ ...newCust, creditLimit: e.target.value })}
                  className="w-full bg-secondary border border-border px-3 py-2 rounded text-xs focus:outline-none"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-muted-foreground uppercase">Delivery Address</label>
                <input
                  type="text"
                  value={newCust.address}
                  onChange={(e) => setNewCust({ ...newCust, address: e.target.value })}
                  className="w-full bg-secondary border border-border px-3 py-2 rounded text-xs focus:outline-none"
                />
              </div>

              <div className="flex gap-3 justify-end pt-4">
                <button
                  type="button"
                  onClick={() => setCustOpen(false)}
                  className="px-4 py-2 border border-border text-xs rounded hover:bg-secondary transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-primary text-white text-xs rounded hover:bg-primary/95 transition"
                >
                  Save Customer
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Create Supplier Modal */}
      {suppOpen && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/60 backdrop-blur-sm z-50 px-4">
          <div className="bg-card border border-border w-full max-w-sm p-6 rounded-2xl shadow-2xl relative">
            <h3 className="font-bold text-sm text-foreground mb-4">Add Supplier Profile</h3>
            <form onSubmit={handleCreateSupplier} className="space-y-4">
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-muted-foreground uppercase">Company Name *</label>
                <input
                  type="text"
                  required
                  value={newSupp.company}
                  onChange={(e) => setNewSupp({ ...newSupp, company: e.target.value })}
                  className="w-full bg-secondary border border-border px-3 py-2 rounded text-xs focus:outline-none"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-muted-foreground uppercase">Contact Person</label>
                <input
                  type="text"
                  value={newSupp.contactPerson}
                  onChange={(e) => setNewSupp({ ...newSupp, contactPerson: e.target.value })}
                  className="w-full bg-secondary border border-border px-3 py-2 rounded text-xs focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-muted-foreground uppercase">Phone</label>
                  <input
                    type="text"
                    value={newSupp.phone}
                    onChange={(e) => setNewSupp({ ...newSupp, phone: e.target.value })}
                    className="w-full bg-secondary border border-border px-3 py-2 rounded text-xs focus:outline-none"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-muted-foreground uppercase">Email</label>
                  <input
                    type="email"
                    value={newSupp.email}
                    onChange={(e) => setNewSupp({ ...newSupp, email: e.target.value })}
                    className="w-full bg-secondary border border-border px-3 py-2 rounded text-xs focus:outline-none"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-muted-foreground uppercase">Office Address</label>
                <input
                  type="text"
                  value={newSupp.address}
                  onChange={(e) => setNewSupp({ ...newSupp, address: e.target.value })}
                  className="w-full bg-secondary border border-border px-3 py-2 rounded text-xs focus:outline-none"
                />
              </div>

              <div className="flex gap-3 justify-end pt-4">
                <button
                  type="button"
                  onClick={() => setSuppOpen(false)}
                  className="px-4 py-2 border border-border text-xs rounded hover:bg-secondary transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-primary text-white text-xs rounded hover:bg-primary/95 transition"
                >
                  Save Supplier
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Credit Repayment Modal */}
      {repayOpen && selectedCust && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/60 backdrop-blur-sm z-50 px-4">
          <div className="bg-card border border-border w-full max-w-sm p-6 rounded-2xl shadow-2xl relative">
            <h3 className="font-bold text-sm text-foreground mb-1">Receive Credit Repayment</h3>
            <p className="text-xs text-muted-foreground mb-4">Customer: <strong>{selectedCust.name}</strong></p>
            <form onSubmit={handleRepaySubmit} className="space-y-4">
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-muted-foreground uppercase">Repayment Amount ($) *</label>
                <input
                  type="number"
                  required
                  step="0.01"
                  value={repayment.amount}
                  onChange={(e) => setRepayment({ ...repayment, amount: e.target.value })}
                  className="w-full bg-secondary border border-border px-3 py-2 rounded text-xs focus:outline-none"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-muted-foreground uppercase">Payment Method *</label>
                <select
                  required
                  value={repayment.paymentMethod}
                  onChange={(e) => setRepayment({ ...repayment, paymentMethod: e.target.value })}
                  className="w-full bg-secondary border border-border px-3 py-2 rounded text-xs focus:outline-none"
                >
                  <option value="CASH">Cash payment</option>
                  <option value="CARD">Debit/Credit Card</option>
                  <option value="MOBILE">Mobile Money Transfer</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-muted-foreground uppercase">Transaction Details / Notes</label>
                <input
                  type="text"
                  placeholder="e.g. June account partial settlement"
                  value={repayment.notes}
                  onChange={(e) => setRepayment({ ...repayment, notes: e.target.value })}
                  className="w-full bg-secondary border border-border px-3 py-2 rounded text-xs focus:outline-none"
                />
              </div>

              <div className="bg-secondary/50 p-3 rounded-xl border border-border text-[11px] text-muted-foreground">
                <div className="flex justify-between font-bold text-foreground">
                  <span>Current Outstanding Balance:</span>
                  <span>${selectedCust.creditBalance}</span>
                </div>
              </div>

              <div className="flex gap-3 justify-end pt-4">
                <button
                  type="button"
                  onClick={() => { setRepayOpen(false); setSelectedCust(null); }}
                  className="px-4 py-2 border border-border text-xs rounded hover:bg-secondary transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-primary text-white text-xs rounded hover:bg-primary/95 transition"
                >
                  Confirm Payment
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
