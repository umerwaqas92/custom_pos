import React, { useState, useEffect, useMemo } from "react";
import axios from "axios";
import { useSearchParams } from "react-router-dom";
import { useStore } from "../store/useStore";
import PortalModal from "../components/PortalModal";
import CustomerStatementDialog from "../components/CustomerStatementDialog";
import {
  Plus,
  UserCheck,
  Building,
  DollarSign,
  Phone,
  Mail,
  Edit,
  Trash2,
  ChevronLeft,
  ChevronRight,
  ArrowUp,
  ArrowDown,
  RefreshCw
} from "lucide-react";

const PAGE_SIZE = 15;

export default function Contacts() {
  const { addNotification } = useStore();
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState<"CUSTOMERS" | "SUPPLIERS">("CUSTOMERS");
  const [customers, setCustomers] = useState<any[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);

  // Search
  const [search, setSearch] = useState("");

  // Sort state
  const [sortKey, setSortKey] = useState<string>("name");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  // Selection & pagination
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [currentPage, setCurrentPage] = useState(1);

  // Modals state
  const [custOpen, setCustOpen] = useState(false);
  const [suppOpen, setSuppOpen] = useState(false);
  const [repayOpen, setRepayOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editType, setEditType] = useState<"CUSTOMER" | "SUPPLIER" | null>(null);
  const [editId, setEditId] = useState("");
  const [selectedCust, setSelectedCust] = useState<any | null>(null);

  // Forms state
  const [newCust, setNewCust] = useState({
    name: "", phone: "", email: "", address: "", creditLimit: "10000000", notes: ""
  });

  const [newSupp, setNewSupp] = useState({
    company: "", contactPerson: "", phone: "", email: "", address: ""
  });

  const [editForm, setEditForm] = useState<any>({});

  const [repayment, setRepayment] = useState({
    amount: "", paymentMethod: "CASH", notes: ""
  });

  const [statementOpen, setStatementOpen] = useState(false);
  const [statementCustomerId, setStatementCustomerId] = useState<string | null>(null);

  const openCustomerStatement = (customerId: string) => {
    setStatementCustomerId(customerId);
    setStatementOpen(true);
  };

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

  // From Sales History: /contacts?tab=customers&q=Name — open Customers and search that person
  useEffect(() => {
    const tab = (searchParams.get("tab") || "").toLowerCase();
    const q = searchParams.get("q") || searchParams.get("search") || "";
    if (tab === "suppliers") setActiveTab("SUPPLIERS");
    else if (tab === "customers" || q) setActiveTab("CUSTOMERS");
    if (q) {
      setSearch(q);
      setCurrentPage(1);
    }
  }, [searchParams]);

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
      setNewCust({ name: "", phone: "", email: "", address: "", creditLimit: "10000000", notes: "" });
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

  const handleDelete = async (type: "CUSTOMER" | "SUPPLIER", id: string, name: string) => {
    if (!window.confirm(`Are you sure you want to delete ${type === "CUSTOMER" ? "customer" : "supplier"} "${name}"?`)) {
      return;
    }
    try {
      const endpoint = type === "CUSTOMER" ? `/api/accounting/customers/${id}` : `/api/accounting/suppliers/${id}`;
      await axios.delete(endpoint);
      addNotification(`${type === "CUSTOMER" ? "Customer" : "Supplier"} deleted successfully.`, "success");
      loadContacts();
    } catch (err: any) {
      const msg = err.response?.data?.error || "Failed to delete.";
      addNotification(msg, "warning");
    }
  };

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    if (!window.confirm(`Are you sure you want to delete ${selectedIds.size} selected items? This cannot be undone.`)) {
      return;
    }
    try {
      const endpoint = activeTab === "CUSTOMERS"
        ? "/api/accounting/customers/bulk-delete"
        : "/api/accounting/suppliers/bulk-delete";
      await axios.post(endpoint, { ids: Array.from(selectedIds) });
      addNotification(`${selectedIds.size} items deleted successfully.`, "success");
      setSelectedIds(new Set());
      setCurrentPage(1);
      loadContacts();
    } catch (err: any) {
      const msg = err.response?.data?.error || "Failed to delete items.";
      addNotification(msg, "warning");
    }
  };

  const handleOpenEdit = (type: "CUSTOMER" | "SUPPLIER", item: any) => {
    setEditType(type);
    setEditId(item.id);
    if (type === "CUSTOMER") {
      setEditForm({ name: item.name, phone: item.phone, email: item.email || "", address: item.address || "", creditLimit: String(item.creditLimit || ""), notes: item.notes || "" });
    } else {
      setEditForm({ company: item.company, contactPerson: item.contactPerson || "", phone: item.phone || "", email: item.email || "", address: item.address || "" });
    }
    setEditOpen(true);
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const endpoint = editType === "CUSTOMER" ? `/api/accounting/customers/${editId}` : `/api/accounting/suppliers/${editId}`;
      await axios.put(endpoint, editForm);
      addNotification(`${editType === "CUSTOMER" ? "Customer" : "Supplier"} updated successfully.`, "success");
      setEditOpen(false);
      loadContacts();
    } catch (err: any) {
      const msg = err.response?.data?.error || "Failed to update.";
      addNotification(msg, "warning");
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

  // Filter, sort, paginate customers
  const filteredCustomers = useMemo(() => {
    const result = customers.filter(c => c.name.toLowerCase().includes(search.toLowerCase()) || c.phone.includes(search));
    result.sort((a, b) => {
      let aVal: any, bVal: any;
      switch (sortKey) {
        case "name": aVal = a.name.toLowerCase(); bVal = b.name.toLowerCase(); break;
        case "phone": aVal = a.phone; bVal = b.phone; break;
        case "email": aVal = (a.email || "").toLowerCase(); bVal = (b.email || "").toLowerCase(); break;
        case "creditBalance": aVal = a.creditBalance; bVal = b.creditBalance; break;
        default: aVal = a.name.toLowerCase(); bVal = b.name.toLowerCase();
      }
      if (aVal < bVal) return sortDir === "asc" ? -1 : 1;
      if (aVal > bVal) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
    return result;
  }, [customers, search, sortKey, sortDir]);

  const filteredSuppliers = useMemo(() => {
    const result = suppliers.filter(s => s.company.toLowerCase().includes(search.toLowerCase()) || s.phone.includes(search));
    result.sort((a, b) => {
      let aVal: any, bVal: any;
      switch (sortKey) {
        case "company": aVal = a.company.toLowerCase(); bVal = b.company.toLowerCase(); break;
        case "contactPerson": aVal = (a.contactPerson || "").toLowerCase(); bVal = (b.contactPerson || "").toLowerCase(); break;
        case "phone": aVal = a.phone || ""; bVal = b.phone || ""; break;
        case "email": aVal = (a.email || "").toLowerCase(); bVal = (b.email || "").toLowerCase(); break;
        default: aVal = a.company.toLowerCase(); bVal = b.company.toLowerCase();
      }
      if (aVal < bVal) return sortDir === "asc" ? -1 : 1;
      if (aVal > bVal) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
    return result;
  }, [suppliers, search, sortKey, sortDir]);

  const activeData = activeTab === "CUSTOMERS" ? filteredCustomers : filteredSuppliers;
  const totalPages = Math.ceil(activeData.length / PAGE_SIZE);
  const paginatedData = activeData.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  useEffect(() => { setCurrentPage(1); setSelectedIds(new Set()); }, [search, activeTab, sortKey, sortDir]);

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
            <span className={`w-4 h-4 rounded flex items-center justify-center p-0.5 ${activeTab === "CUSTOMERS" ? "bg-white/20" : "bg-card/60"}`}>
              <img src="/icons/contacts/customers.png?v=1" alt="" className="w-full h-full object-contain" draggable={false} />
            </span>
            Customer Registry
          </button>
          <button
            onClick={() => { setActiveTab("SUPPLIERS"); setSearch(""); }}
            className={`px-4 py-2 text-xs font-bold rounded-lg flex items-center gap-1.5 transition ${
              activeTab === "SUPPLIERS" ? "bg-primary text-white shadow" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <span className={`w-4 h-4 rounded flex items-center justify-center p-0.5 ${activeTab === "SUPPLIERS" ? "bg-white/20" : "bg-card/60"}`}>
              <img src="/icons/contacts/suppliers.png?v=1" alt="" className="w-full h-full object-contain" draggable={false} />
            </span>
            Supplier Directory
          </button>
        </div>

        <div className="flex gap-2">
          {activeTab === "CUSTOMERS" ? (
            <button
              onClick={() => setCustOpen(true)}
              className="bg-primary hover:bg-primary/95 text-white text-xs font-bold px-4 py-2.5 rounded-xl flex items-center gap-1.5 transition"
            >
              <img src="/icons/contacts/add.png?v=1" alt="" className="w-4 h-4 object-contain brightness-0 invert" draggable={false} /> Add Customer
            </button>
          ) : (
            <button
              onClick={() => setSuppOpen(true)}
              className="bg-primary hover:bg-primary/95 text-white text-xs font-bold px-4 py-2.5 rounded-xl flex items-center gap-1.5 transition"
            >
              <img src="/icons/contacts/add.png?v=1" alt="" className="w-4 h-4 object-contain brightness-0 invert" draggable={false} /> Add Supplier
            </button>
          )}
          <button
            onClick={loadContacts}
            className="border border-border bg-secondary hover:bg-secondary/80 text-foreground text-xs font-bold px-3 py-2.5 rounded-xl flex items-center gap-1.5 transition"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Main Panel */}
      <div className="bg-card border border-border rounded-2xl p-5 space-y-4">

        {/* Search */}
        <div className="relative">
          <img src="/icons/contacts/search.png?v=1" alt="" className="w-4 h-4 object-contain absolute left-3 top-3 opacity-70" draggable={false} />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={`Search ${activeTab === "CUSTOMERS" ? "customers" : "suppliers"} by name or phone...`}
            className="w-full bg-secondary text-foreground text-sm border border-border pl-9 pr-4 py-2.5 rounded-xl focus:outline-none"
          />
        </div>

        {/* Bulk action bar */}
        {selectedIds.size > 0 && (
          <div className="flex items-center gap-3 bg-red-500/5 border border-red-500/20 rounded-xl px-4 py-2.5">
            <span className="text-xs font-bold text-red-400">{selectedIds.size} selected</span>
            <button
              onClick={handleBulkDelete}
              className="bg-red-500 hover:bg-red-600 text-white text-xs font-bold px-4 py-1.5 rounded-lg flex items-center gap-1 transition"
            >
              <img src="/icons/contacts/delete.png?v=1" alt="" className="w-3.5 h-3.5 object-contain brightness-0 invert" draggable={false} /> Delete Selected
            </button>
            <button
              onClick={() => setSelectedIds(new Set())}
              className="text-xs text-muted-foreground hover:text-foreground transition"
            >
              Clear Selection
            </button>
          </div>
        )}

        {/* Customer view */}
        {activeTab === "CUSTOMERS" && (
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
                  <SortHeader label="Customer Name" sortField="name" />
                  <SortHeader label="Phone" sortField="phone" />
                  <SortHeader label="Credit Balance" sortField="creditBalance" />
                  <th className="pb-3 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {paginatedData.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-muted-foreground">
                      No customers matching search parameters.
                    </td>
                  </tr>
                ) : (
                  paginatedData.map((c) => {
                    const fromHistory =
                      searchParams.get("id") === c.id ||
                      (search && c.name.toLowerCase() === search.trim().toLowerCase());
                    return (
                    <tr
                      key={c.id}
                      className={`hover:bg-secondary/20 transition ${
                        selectedIds.has(c.id) ? "bg-primary/5" : ""
                      } ${fromHistory ? "bg-primary/10 ring-1 ring-inset ring-primary/30" : ""}`}
                    >
                      <td className="py-4 pl-2">
                        <input
                          type="checkbox"
                          checked={selectedIds.has(c.id)}
                          onChange={() => toggleSelect(c.id)}
                          className="accent-primary cursor-pointer"
                        />
                      </td>
                      <td className="py-4 font-bold text-foreground">
                        <button
                          type="button"
                          onClick={() => openCustomerStatement(c.id)}
                          className="text-left text-primary hover:underline font-bold"
                          title="View all sales & payments"
                        >
                          {c.name}
                        </button>
                      </td>
                      <td className="py-4 text-muted-foreground">{c.phone}</td>
                      <td className="py-4 text-left font-black text-foreground">
                        <span className={c.creditBalance > 0 ? "text-amber-400" : "text-green-400"}>
                          Rs. {c.creditBalance}
                        </span>
                      </td>
                      <td className="py-4 text-center">
                        <div className="flex justify-center gap-2">
                          <button
                            type="button"
                            onClick={() => openCustomerStatement(c.id)}
                            className="bg-primary/10 hover:bg-primary/20 text-primary text-[10px] font-bold px-2.5 py-1.5 rounded-lg transition"
                            title="Sales & payments"
                          >
                            Statement
                          </button>
                          <button
                            onClick={() => handleOpenEdit("CUSTOMER", c)}
                            className="p-1 text-muted-foreground hover:text-primary transition"
                            title="Edit"
                          >
                            <img src="/icons/contacts/edit.png?v=1" alt="" className="w-4 h-4 object-contain" draggable={false} />
                          </button>
                          {c.creditBalance > 0 && (
                            <button
                              onClick={() => handleOpenRepay(c)}
                              className="bg-secondary border border-border hover:bg-secondary/80 text-[10px] font-bold px-3 py-1.5 rounded-lg transition inline-flex items-center gap-1"
                            >
                              <img src="/icons/contacts/payment.png?v=1" alt="" className="w-3.5 h-3.5 object-contain" draggable={false} />
                              Receive Payment
                            </button>
                          )}
                          <button
                            onClick={() => handleDelete("CUSTOMER", c.id, c.name)}
                            className="p-1 text-muted-foreground hover:text-destructive transition"
                            title="Delete"
                          >
                            <img src="/icons/contacts/delete.png?v=1" alt="" className="w-4 h-4 object-contain" draggable={false} />
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
        )}

        {/* Supplier view */}
        {activeTab === "SUPPLIERS" && (
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
                  <SortHeader label="Company Name" sortField="company" />
                  <SortHeader label="Contact Person" sortField="contactPerson" />
                  <SortHeader label="Phone" sortField="phone" />
                  <SortHeader label="Email" sortField="email" />
                  <th className="pb-3">Address</th>
                  <th className="pb-3 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {paginatedData.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-muted-foreground">
                      No suppliers matching search parameters.
                    </td>
                  </tr>
                ) : (
                  paginatedData.map((s) => (
                    <tr key={s.id} className={`hover:bg-secondary/20 transition ${selectedIds.has(s.id) ? "bg-primary/5" : ""}`}>
                      <td className="py-4 pl-2">
                        <input
                          type="checkbox"
                          checked={selectedIds.has(s.id)}
                          onChange={() => toggleSelect(s.id)}
                          className="accent-primary cursor-pointer"
                        />
                      </td>
                      <td className="py-4 font-bold text-foreground">{s.company}</td>
                      <td className="py-4 text-foreground">{s.contactPerson || "-"}</td>
                      <td className="py-4 text-muted-foreground">{s.phone || "-"}</td>
                      <td className="py-4 text-muted-foreground">{s.email || "-"}</td>
                      <td className="py-4 text-muted-foreground truncate max-w-xs">{s.address || "-"}</td>
                      <td className="py-4 text-center">
                        <div className="flex justify-center gap-2">
                          <button
                            onClick={() => handleOpenEdit("SUPPLIER", s)}
                            className="p-1 text-muted-foreground hover:text-primary transition"
                            title="Edit"
                          >
                            <img src="/icons/contacts/edit.png?v=1" alt="" className="w-4 h-4 object-contain" draggable={false} />
                          </button>
                          <button
                            onClick={() => handleDelete("SUPPLIER", s.id, s.company)}
                            className="p-1 text-muted-foreground hover:text-destructive transition"
                            title="Delete"
                          >
                            <img src="/icons/contacts/delete.png?v=1" alt="" className="w-4 h-4 object-contain" draggable={false} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between pt-3 border-t border-border">
            <span className="text-xs text-muted-foreground">
              Showing {((currentPage - 1) * PAGE_SIZE) + 1}-{Math.min(currentPage * PAGE_SIZE, activeData.length)} of {activeData.length}
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

      {/* Create Customer Modal */}
      <PortalModal isOpen={custOpen} onClose={() => setCustOpen(false)} backdropClass="bg-black/60 backdrop-blur-sm px-4">
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
      </PortalModal>

      {/* Create Supplier Modal */}
      <PortalModal isOpen={suppOpen} onClose={() => setSuppOpen(false)} backdropClass="bg-black/60 backdrop-blur-sm px-4">
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
      </PortalModal>

      {/* Edit Customer/Supplier Modal */}
      <PortalModal isOpen={editOpen && !!editType} onClose={() => { setEditOpen(false); setEditType(null); }} backdropClass="bg-black/60 backdrop-blur-sm px-4">
        <div className="bg-card border border-border w-full max-w-sm p-6 rounded-2xl shadow-2xl relative">
            <h3 className="font-bold text-sm text-foreground mb-4">Edit {editType === "CUSTOMER" ? "Customer" : "Supplier"}</h3>
            <form onSubmit={handleEditSubmit} className="space-y-4">
              {editType === "CUSTOMER" ? (
                <>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-muted-foreground uppercase">Name *</label>
                    <input type="text" required value={editForm.name || ""} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} className="w-full bg-secondary border border-border px-3 py-2 rounded text-xs focus:outline-none" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-muted-foreground uppercase">Phone *</label>
                    <input type="text" required value={editForm.phone || ""} onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })} className="w-full bg-secondary border border-border px-3 py-2 rounded text-xs focus:outline-none" />
                  </div>


                </>
              ) : (
                <>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-muted-foreground uppercase">Company *</label>
                    <input type="text" required value={editForm.company || ""} onChange={(e) => setEditForm({ ...editForm, company: e.target.value })} className="w-full bg-secondary border border-border px-3 py-2 rounded text-xs focus:outline-none" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-muted-foreground uppercase">Contact Person</label>
                    <input type="text" value={editForm.contactPerson || ""} onChange={(e) => setEditForm({ ...editForm, contactPerson: e.target.value })} className="w-full bg-secondary border border-border px-3 py-2 rounded text-xs focus:outline-none" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-muted-foreground uppercase">Phone</label>
                    <input type="text" value={editForm.phone || ""} onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })} className="w-full bg-secondary border border-border px-3 py-2 rounded text-xs focus:outline-none" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-muted-foreground uppercase">Email</label>
                    <input type="email" value={editForm.email || ""} onChange={(e) => setEditForm({ ...editForm, email: e.target.value })} className="w-full bg-secondary border border-border px-3 py-2 rounded text-xs focus:outline-none" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-muted-foreground uppercase">Address</label>
                    <input type="text" value={editForm.address || ""} onChange={(e) => setEditForm({ ...editForm, address: e.target.value })} className="w-full bg-secondary border border-border px-3 py-2 rounded text-xs focus:outline-none" />
                  </div>
                </>
              )}

              <div className="flex gap-3 justify-end pt-4">
                <button type="button" onClick={() => setEditOpen(false)} className="px-4 py-2 border border-border text-xs rounded hover:bg-secondary transition">Cancel</button>
                <button type="submit" className="px-4 py-2 bg-primary text-white text-xs rounded hover:bg-primary/95 transition">Save Changes</button>
              </div>
            </form>
          </div>
      </PortalModal>

      {/* Credit Repayment Modal */}
      {selectedCust && (
        <PortalModal isOpen={repayOpen && !!selectedCust} onClose={() => { setRepayOpen(false); setSelectedCust(null); }} backdropClass="bg-black/60 backdrop-blur-sm px-4">
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
                  <span>Rs. {selectedCust.creditBalance}</span>
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
        </PortalModal>
      )}

      <CustomerStatementDialog
        customerId={statementCustomerId}
        isOpen={statementOpen}
        onClose={() => {
          setStatementOpen(false);
          setStatementCustomerId(null);
        }}
      />
    </div>
  );
}
