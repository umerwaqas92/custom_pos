import React, { useState, useEffect, useMemo } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import { useStore } from "../store/useStore";
import PortalModal from "../components/PortalModal";
import {
  Search,
  Calendar,
  Eye,
  RefreshCw,
  X,
  CheckCircle,
  Receipt,
  FileText,
  Undo2,
  AlertTriangle
} from "lucide-react";

type ReturnLine = {
  saleItemId: string;
  productId: string;
  product: { id: string; name: string; sku?: string };
  originalQty: number;
  alreadyReturned: number;
  remainingQty: number;
  unitPrice: number;
  unitRefund: number;
  lineTotal: number;
  serialNumber?: string | null;
  imei?: string | null;
};

type ReturnablePreview = {
  sale: any;
  alreadyRefunded: number;
  maxRefundable: number;
  lines: ReturnLine[];
};

const REFUND_METHODS = [
  { id: "CASH", label: "Cash" },
  { id: "CARD", label: "Bank / Card" },
  { id: "MOBILE", label: "Mobile Wallet" },
  { id: "CREDIT_ADJUST", label: "Credit Adjust" }
];

export default function SalesHistory() {
  const { addNotification, selectedBranchId } = useStore();
  const navigate = useNavigate();
  const [tab, setTab] = useState<"sales" | "returns">("sales");
  const [sales, setSales] = useState<any[]>([]);
  const [returns, setReturns] = useState<any[]>([]);

  /** Go to Contacts and search this customer (statement dialog lives on Contacts only) */
  const openCustomerInContacts = (customer: { id?: string; name?: string } | null | undefined) => {
    if (!customer?.name) return;
    const params = new URLSearchParams();
    params.set("tab", "customers");
    params.set("q", customer.name);
    if (customer.id) params.set("id", customer.id);
    navigate(`/contacts?${params.toString()}`);
  };
  const [branches, setBranches] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  // Filters
  const [search, setSearch] = useState("");
  const [returnSearch, setReturnSearch] = useState("");
  const [selectedBranch, setSelectedBranch] = useState(selectedBranchId || "ALL");
  const [selectedCustomer, setSelectedCustomer] = useState("ALL");
  /** Year filter: "ALL" or "2026" */
  const [selectedYear, setSelectedYear] = useState(String(new Date().getFullYear()));
  /** Month filter: "ALL" or "01"…"12" */
  const [selectedMonth, setSelectedMonth] = useState("ALL");

  // Receipt
  const [activeSale, setActiveSale] = useState<any | null>(null);
  const [receiptOpen, setReceiptOpen] = useState(false);

  // Return dialog — tick items only (full remaining qty, no count steppers)
  const [returnOpen, setReturnOpen] = useState(false);
  const [preview, setPreview] = useState<ReturnablePreview | null>(null);
  const [selectedProductIds, setSelectedProductIds] = useState<Set<string>>(new Set());
  const [refundMethod, setRefundMethod] = useState("CASH");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Return voucher detail
  const [activeReturn, setActiveReturn] = useState<any | null>(null);
  const [returnDetailOpen, setReturnDetailOpen] = useState(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const [salesRes, branchRes, custRes] = await Promise.all([
        axios.get("/api/sales"),
        axios.get("/api/auth/branches"),
        axios.get("/api/accounting/customers")
      ]);
      setSales(Array.isArray(salesRes.data) ? salesRes.data : []);
      setBranches(Array.isArray(branchRes.data) ? branchRes.data : []);
      setCustomers(Array.isArray(custRes.data) ? custRes.data : []);
    } catch {
      setSales([]);
      setBranches([]);
      setCustomers([]);
      addNotification("Failed to load sales history records.", "warning");
    } finally {
      setLoading(false);
    }
  };

  const loadReturns = async () => {
    setLoading(true);
    try {
      const res = await axios.get("/api/sales/returns");
      setReturns(Array.isArray(res.data) ? res.data : []);
    } catch {
      setReturns([]);
      addNotification("Failed to load return history.", "warning");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (tab === "sales") loadData();
    else loadReturns();
  }, [tab]);

  const handleOpenReceipt = async (saleId: string) => {
    try {
      const res = await axios.get(`/api/sales/${saleId}`);
      setActiveSale(res.data);
      setReceiptOpen(true);
    } catch {
      addNotification("Failed to load invoice receipt detail.", "warning");
    }
  };

  const openReturnDialog = async (saleId: string) => {
    try {
      const res = await axios.get(`/api/sales/${saleId}/returnable`);
      const data: ReturnablePreview = res.data;
      const returnable = (Array.isArray(data?.lines) ? data.lines : []).filter((l) => l.remainingQty > 0);
      if (returnable.length === 0) {
        addNotification("Nothing left to return on this invoice.", "warning");
        return;
      }
      // Default: select all returnable lines
      setSelectedProductIds(new Set(returnable.map((l) => l.productId)));
      setPreview(data);
      setRefundMethod(
        data.sale.paymentMethod === "CREDIT" || data.sale.paymentMethod === "EMI"
          ? "CREDIT_ADJUST"
          : data.sale.paymentMethod === "CARD"
            ? "CARD"
            : data.sale.paymentMethod === "MOBILE"
              ? "MOBILE"
              : "CASH"
      );
      setReason("");
      setReceiptOpen(false);
      setReturnOpen(true);
    } catch (err: any) {
      addNotification(err.response?.data?.error || "Failed to open return.", "warning");
    }
  };

  const toggleLine = (productId: string) => {
    setSelectedProductIds((prev) => {
      const next = new Set(prev);
      if (next.has(productId)) next.delete(productId);
      else next.add(productId);
      return next;
    });
  };

  const toggleAll = () => {
    if (!preview) return;
    const returnable = (Array.isArray(preview.lines) ? preview.lines : []).filter((l) => l.remainingQty > 0);
    if (selectedProductIds.size === returnable.length) {
      setSelectedProductIds(new Set());
    } else {
      setSelectedProductIds(new Set(returnable.map((l) => l.productId)));
    }
  };

  const estimatedRefund = useMemo(() => {
    if (!preview) return 0;
    return preview.lines.reduce((sum, line) => {
      if (!selectedProductIds.has(line.productId) || line.remainingQty <= 0) return sum;
      return sum + line.unitRefund * line.remainingQty;
    }, 0);
  }, [preview, selectedProductIds]);

  const handleSubmitReturn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!preview) return;

    // Return full remaining qty for every ticked line — no manual count
    const items = preview.lines
      .filter((l) => selectedProductIds.has(l.productId) && l.remainingQty > 0)
      .map((l) => ({
        saleItemId: l.saleItemId,
        productId: l.productId,
        quantity: l.remainingQty,
        reason: reason || undefined
      }));

    if (items.length === 0) {
      addNotification("Select at least one item to return.", "warning");
      return;
    }

    setSubmitting(true);
    try {
      const res = await axios.post("/api/sales/returns", {
        saleId: preview.sale.id,
        items,
        refundMethod,
        reason: reason || undefined
      });
      addNotification(
        `Return processed — refund Rs. ${Number(res.data.refundAmount).toLocaleString(undefined, { minimumFractionDigits: 2 })}`,
        "success"
      );
      setReturnOpen(false);
      setPreview(null);
      loadData();
      loadReturns();
    } catch (err: any) {
      addNotification(err.response?.data?.error || "Failed to process return.", "warning");
    } finally {
      setSubmitting(false);
    }
  };

  const openReturnDetail = async (returnId: string) => {
    try {
      const res = await axios.get(`/api/sales/returns/${returnId}`);
      setActiveReturn(res.data);
      setReturnDetailOpen(true);
    } catch {
      addNotification("Failed to load return voucher.", "warning");
    }
  };

  const downloadPdf = () => {
    if (!activeSale) return;
    const element = document.getElementById("printable-receipt");
    if (!element) return;

    addNotification("Generating PDF Receipt, please wait...", "info");

    const opt = {
      margin: 0.4,
      filename: `Invoice_Receipt_${activeSale.id.substring(0, 8)}.pdf`,
      image: { type: "jpeg", quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true, letterRendering: true },
      jsPDF: { unit: "in", format: "letter", orientation: "portrait" }
    };

    const execute = () => {
      // @ts-ignore
      const html2pdf = window.html2pdf;
      if (html2pdf) {
        const oldStyle = element.style.cssText;
        element.style.display = "block";
        element.style.backgroundColor = "#ffffff";
        element.style.color = "#000000";
        element.style.padding = "24px";

        html2pdf()
          .set(opt)
          .from(element)
          .save()
          .then(() => {
            element.style.cssText = oldStyle;
            addNotification("PDF downloaded successfully!", "success");
          })
          .catch((err: any) => {
            console.error(err);
            element.style.cssText = oldStyle;
            addNotification("Failed to generate PDF.", "error");
          });
      }
    };

    // @ts-ignore
    if (!window.html2pdf) {
      const script = document.createElement("script");
      script.src = "https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js";
      script.onload = execute;
      document.body.appendChild(script);
    } else {
      execute();
    }
  };

  const handlePrint = () => {
    const receiptEl = document.getElementById("printable-receipt");
    if (!receiptEl) return;

    let iframe = document.getElementById("receipt-print-iframe") as HTMLIFrameElement;
    if (iframe) iframe.remove();

    iframe = document.createElement("iframe");
    iframe.id = "receipt-print-iframe";
    iframe.style.position = "fixed";
    iframe.style.right = "0";
    iframe.style.bottom = "0";
    iframe.style.width = "0";
    iframe.style.height = "0";
    iframe.style.border = "none";
    document.body.appendChild(iframe);

    const doc = iframe.contentDocument || iframe.contentWindow?.document;
    if (!doc) return;

    const styles = document.querySelectorAll("link[rel='stylesheet'], style");
    styles.forEach((s) => {
      doc.head.appendChild(s.cloneNode(true));
    });

    const content = receiptEl.innerHTML;

    doc.open();
    doc.write(`
      <html>
        <head><title>Receipt</title></head>
        <body style="background: white; color: black; font-family: monospace; padding: 10px; margin: 0;">
          <div class="space-y-4">${content}</div>
          <script>
            window.focus();
            setTimeout(() => {
              window.print();
              setTimeout(() => {
                window.parent.document.getElementById("receipt-print-iframe")?.remove();
              }, 1000);
            }, 250);
          </script>
        </body>
      </html>
    `);
    doc.close();
  };

  const MONTH_LABELS = [
    { value: "01", short: "Jan", full: "January" },
    { value: "02", short: "Feb", full: "February" },
    { value: "03", short: "Mar", full: "March" },
    { value: "04", short: "Apr", full: "April" },
    { value: "05", short: "May", full: "May" },
    { value: "06", short: "Jun", full: "June" },
    { value: "07", short: "Jul", full: "July" },
    { value: "08", short: "Aug", full: "August" },
    { value: "09", short: "Sep", full: "September" },
    { value: "10", short: "Oct", full: "October" },
    { value: "11", short: "Nov", full: "November" },
    { value: "12", short: "Dec", full: "December" },
  ];

  /** Years that appear in sales data (newest first) */
  const yearOptions = useMemo(() => {
    const yearsSet = new Set<number>();
    sales.forEach((s) => {
      const d = new Date(s.saleDate);
      if (isNaN(d.getTime())) return;
      const y = d.getFullYear();
      // Ignore far-future typo years (e.g. one bad 2027 import)
      if (y > new Date().getFullYear() + 1) return;
      yearsSet.add(y);
    });
    yearsSet.add(new Date().getFullYear());
    return Array.from(yearsSet).sort((a, b) => b - a);
  }, [sales]);

  /** Months that have sales in the selected year (for chip highlight counts) */
  const monthsWithSales = useMemo(() => {
    const counts = new Map<string, number>();
    sales.forEach((s) => {
      const d = new Date(s.saleDate);
      if (isNaN(d.getTime())) return;
      if (selectedYear !== "ALL" && String(d.getFullYear()) !== selectedYear) return;
      const key = String(d.getMonth() + 1).padStart(2, "0");
      counts.set(key, (counts.get(key) || 0) + 1);
    });
    return counts;
  }, [sales, selectedYear]);

  const filteredSales = (Array.isArray(sales) ? sales : []).filter((s) => {
    const matchesSearch =
      s.id.toLowerCase().includes(search.toLowerCase()) ||
      (s.customer?.name && s.customer.name.toLowerCase().includes(search.toLowerCase()));

    const matchesBranch = selectedBranch === "ALL" || s.branchId === selectedBranch;
    const matchesCustomer = selectedCustomer === "ALL" || s.customerId === selectedCustomer;

    const saleDate = new Date(s.saleDate);

    // Year / month filters (preferred when set)
    let matchesMonthYear = true;
    if (!isNaN(saleDate.getTime())) {
      if (selectedYear !== "ALL" && String(saleDate.getFullYear()) !== selectedYear) {
        matchesMonthYear = false;
      }
      if (selectedMonth !== "ALL") {
        const m = String(saleDate.getMonth() + 1).padStart(2, "0");
        if (m !== selectedMonth) matchesMonthYear = false;
      }
    }

    return matchesSearch && matchesBranch && matchesCustomer && matchesMonthYear;
  });

  const paymentMethodNames: Record<string, string> = {
    CASH: "Cash",
    CARD: "Bank",
    MOBILE: "Wallet",
    CREDIT: "Credit",
    EMI: "EMI Installment"
  };

  const money = (n: number) =>
    `Rs. ${Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const returnableLines = (Array.isArray(preview?.lines) ? preview!.lines : []).filter((l) => l.remainingQty > 0);

  const filteredReturns = useMemo(() => {
    const q = returnSearch.toLowerCase().trim();
    if (!q) return returns;
    return (Array.isArray(returns) ? returns : []).filter((r) => {
      return (
        r.id.toLowerCase().includes(q) ||
        r.saleId.toLowerCase().includes(q) ||
        (r.sale?.customer?.name || "").toLowerCase().includes(q) ||
        (r.processedBy?.name || "").toLowerCase().includes(q) ||
        (r.refundMethod || "").toLowerCase().includes(q) ||
        (r.reason || "").toLowerCase().includes(q)
      );
    });
  }, [returns, returnSearch]);

  const refundMethodNames: Record<string, string> = {
    CASH: "Cash",
    CARD: "Bank / Card",
    MOBILE: "Mobile Wallet",
    CREDIT_ADJUST: "Credit Adjust"
  };

  return (
    <div className="space-y-6 flex-1">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-card border border-border p-5 rounded-2xl">
        <div className="space-y-1">
          <h2 className="text-lg font-black text-foreground tracking-tight flex items-center gap-2">
            <span className="w-8 h-8 rounded-xl bg-primary/10 p-1 ring-1 ring-primary/15 flex items-center justify-center">
              <img src="/icons/sales-history/header.png?v=1" alt="" className="w-full h-full object-contain" draggable={false} />
            </span>
            Sales Transaction Log
          </h2>
          <p className="text-xs text-muted-foreground">
            Search invoices, print receipts, and process returns & refunds from here.
          </p>
        </div>
        <button
          onClick={() => (tab === "sales" ? loadData() : loadReturns())}
          className="bg-secondary border border-border hover:bg-secondary/80 text-foreground text-xs font-bold px-3 py-2 rounded-xl flex items-center gap-1.5 transition"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} /> Refresh List
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 bg-card border border-border p-1.5 rounded-2xl w-fit">
        <button
          onClick={() => setTab("sales")}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${
            tab === "sales" ? "bg-primary text-white" : "text-muted-foreground hover:bg-secondary"
          }`}
        >
          <span className={`w-4 h-4 rounded flex items-center justify-center p-0.5 ${tab === "sales" ? "bg-white/20" : "bg-secondary"}`}>
            <img src="/icons/sales-history/invoices.png?v=1" alt="" className="w-full h-full object-contain" draggable={false} />
          </span>
          Sales Invoices
        </button>
        <button
          onClick={() => setTab("returns")}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${
            tab === "returns" ? "bg-primary text-white" : "text-muted-foreground hover:bg-secondary"
          }`}
        >
          <span className={`w-4 h-4 rounded flex items-center justify-center p-0.5 ${tab === "returns" ? "bg-white/20" : "bg-secondary"}`}>
            <img src="/icons/sales-history/returns.png?v=1" alt="" className="w-full h-full object-contain" draggable={false} />
          </span>
          Return History
        </button>
      </div>

      {tab === "sales" ? (
      <>
      <div className="bg-card border border-border rounded-2xl p-5 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3">
          <div className="relative sm:col-span-2 lg:col-span-1 xl:col-span-1">
            <img src="/icons/sales-history/search.png?v=1" alt="" className="w-4 h-4 absolute left-3 top-3.5 object-contain opacity-70" draggable={false} />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by invoice ID, customer..."
              className="w-full bg-secondary text-foreground text-xs border border-border pl-9 pr-4 py-3 rounded-xl focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          <div className="flex items-center gap-2 bg-secondary/50 border border-border p-2.5 rounded-xl">
            <span className="text-[10px] font-bold uppercase text-muted-foreground pl-1.5">Branch:</span>
            <select
              value={selectedBranch}
              onChange={(e) => setSelectedBranch(e.target.value)}
              className="flex-1 bg-transparent text-xs text-foreground focus:outline-none cursor-pointer"
            >
              <option value="ALL">All Branches</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2 bg-secondary/50 border border-border p-2.5 rounded-xl">
            <span className="text-[10px] font-bold uppercase text-muted-foreground pl-1.5">Customer:</span>
            <select
              value={selectedCustomer}
              onChange={(e) => setSelectedCustomer(e.target.value)}
              className="flex-1 bg-transparent text-xs text-foreground focus:outline-none cursor-pointer"
            >
              <option value="ALL">All Profiles</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2 bg-secondary/50 border border-border p-2.5 rounded-xl">
            <Calendar className="w-3.5 h-3.5 text-muted-foreground ml-1.5" />
            <span className="text-[10px] font-bold uppercase text-muted-foreground">Year:</span>
            <select
              value={selectedYear}
              onChange={(e) => {
                setSelectedYear(e.target.value);
              }}
              className="flex-1 bg-transparent text-xs text-foreground focus:outline-none cursor-pointer"
            >
              <option value="ALL">All years</option>
              {yearOptions.map((y) => (
                <option key={y} value={String(y)}>
                  {y}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2 bg-secondary/50 border border-border p-2.5 rounded-xl">
            <span className="text-[10px] font-bold uppercase text-muted-foreground pl-1.5">Month:</span>
            <select
              value={selectedMonth}
              onChange={(e) => {
                setSelectedMonth(e.target.value);
              }}
              className="flex-1 bg-transparent text-xs text-foreground focus:outline-none cursor-pointer"
            >
              <option value="ALL">All months</option>
              {MONTH_LABELS.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.full}
                  {monthsWithSales.has(m.value) ? ` (${monthsWithSales.get(m.value)})` : ""}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Quick month chips */}
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] font-bold uppercase text-muted-foreground tracking-wider">
              Quick month
              {selectedYear !== "ALL" ? ` · ${selectedYear}` : " · all years"}
            </span>
            {(selectedMonth !== "ALL" || selectedYear !== "ALL") && (
              <button
                type="button"
                onClick={() => {
                  setSelectedMonth("ALL");
                  setSelectedYear("ALL");
                }}
                className="text-[10px] font-bold text-primary hover:underline"
              >
                Clear date filters
              </button>
            )}
          </div>
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => {
                setSelectedMonth("ALL");
              }}
              className={`px-3 py-1.5 rounded-lg text-[11px] font-bold transition border ${
                selectedMonth === "ALL"
                  ? "bg-primary text-white border-primary"
                  : "bg-secondary border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              All
            </button>
            {MONTH_LABELS.map((m) => {
              const count = monthsWithSales.get(m.value) || 0;
              const active = selectedMonth === m.value;
              return (
                <button
                  key={m.value}
                  type="button"
                  onClick={() => {
                    // Month only — do NOT auto-switch year (was forcing 2027)
                    setSelectedMonth(m.value);
                  }}
                  className={`px-3 py-1.5 rounded-lg text-[11px] font-bold transition border min-w-[3rem] ${
                    active
                      ? "bg-primary text-white border-primary"
                      : count > 0
                        ? "bg-secondary border-border text-foreground hover:border-primary/40"
                        : "bg-secondary/40 border-border/60 text-muted-foreground/60 hover:text-muted-foreground"
                  }`}
                  title={count > 0 ? `${m.full}: ${count} sales` : `${m.full}: no sales`}
                >
                  {m.short}
                  {count > 0 && (
                    <span className={`ml-1 text-[9px] ${active ? "text-white/80" : "text-muted-foreground"}`}>
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>


      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-card border border-border rounded-2xl p-5 flex flex-col justify-between">
          <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Total Sales Sum</span>
          <span className="text-lg font-black text-foreground mt-1">
            Rs.{" "}
            {filteredSales
              .reduce((acc, curr) => acc + curr.payableAmount, 0)
              .toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </span>
        </div>
        <div className="bg-card border border-border rounded-2xl p-5 flex flex-col justify-between">
          <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Total Orders Count</span>
          <span className="text-lg font-black text-foreground mt-1">{filteredSales.length} Invoices</span>
        </div>
        <div className="bg-card border border-border rounded-2xl p-5 flex flex-col justify-between">
          <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Average Sale Value</span>
          <span className="text-lg font-black text-foreground mt-1">
            Rs.{" "}
            {(filteredSales.length > 0
              ? filteredSales.reduce((acc, curr) => acc + curr.payableAmount, 0) / filteredSales.length
              : 0
            ).toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </span>
        </div>
      </div>

      <div className="bg-card border border-border rounded-2xl p-5">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-border text-muted-foreground font-semibold">
                <th className="pb-3 pl-2">Invoice ID</th>
                <th className="pb-3">Sale Date</th>
                <th className="pb-3 font-semibold">Customer Profile</th>
                <th className="pb-3 text-center">Payment Method</th>
                <th className="pb-3 text-right">Grand Total</th>
                <th className="pb-3 text-center">Return</th>
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
                      {s.customer ? (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            openCustomerInContacts(s.customer);
                          }}
                          className="text-left text-primary hover:underline font-semibold"
                          title="Open customer in Contacts"
                        >
                          {s.customer.name}
                        </button>
                      ) : (
                        <span className="text-muted-foreground italic">Walk-in Customer</span>
                      )}
                    </td>
                    <td className="py-4 text-center">
                      <span className="bg-secondary px-2 py-0.5 rounded font-black text-[10px]">
                        {paymentMethodNames[s.paymentMethod] || s.paymentMethod}
                      </span>
                    </td>
                    <td className="py-4 text-right font-black text-foreground">
                      Rs. {s.payableAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </td>
                    <td className="py-4 text-center">
                      {s.returnStatus === "FULL" ? (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-lg bg-rose-500/15 text-rose-400">
                          Full
                        </span>
                      ) : s.returnStatus === "PARTIAL" ? (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-lg bg-amber-500/15 text-amber-400">
                          Partial
                        </span>
                      ) : (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-lg bg-secondary text-muted-foreground">
                          —
                        </span>
                      )}
                    </td>
                    <td className="py-4 text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        <button
                          onClick={() => handleOpenReceipt(s.id)}
                          className="bg-primary/10 hover:bg-primary/20 text-primary text-[10px] font-bold px-2.5 py-1.5 rounded-lg flex items-center gap-1 transition"
                        >
                          <img src="/icons/sales-history/details.png?v=1" alt="" className="w-3.5 h-3.5 object-contain" draggable={false} /> Details
                        </button>
                        {s.returnStatus !== "FULL" && (
                          <button
                            onClick={() => openReturnDialog(s.id)}
                            className="bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 text-[10px] font-bold px-2.5 py-1.5 rounded-lg flex items-center gap-1 transition"
                            title="Process return & refund"
                          >
                            <img src="/icons/sales-history/return-action.png?v=1" alt="" className="w-3.5 h-3.5 object-contain" draggable={false} /> Return
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
      </>
      ) : (
      <>
      {/* Return history filters + summary */}
      <div className="bg-card border border-border rounded-2xl p-4">
        <div className="relative">
          <img src="/icons/sales-history/search.png?v=1" alt="" className="w-4 h-4 absolute left-3 top-3.5 object-contain opacity-70" draggable={false} />
          <input
            type="text"
            value={returnSearch}
            onChange={(e) => setReturnSearch(e.target.value)}
            placeholder="Search return ID, invoice, customer, staff, reason..."
            className="w-full bg-secondary text-foreground text-xs border border-border pl-9 pr-4 py-3 rounded-xl focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-card border border-border rounded-2xl p-5">
          <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Returns Count</span>
          <p className="text-lg font-black text-foreground mt-1">{filteredReturns.length}</p>
        </div>
        <div className="bg-card border border-border rounded-2xl p-5">
          <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Total Refunded</span>
          <p className="text-lg font-black text-rose-400 mt-1">
            {money(filteredReturns.reduce((a, r) => a + (r.refundAmount || 0), 0))}
          </p>
        </div>
        <div className="bg-card border border-border rounded-2xl p-5">
          <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Items Returned</span>
          <p className="text-lg font-black text-foreground mt-1">
            {filteredReturns.reduce(
              (a, r) => a + (r.items || []).reduce((b: number, i: any) => b + (i.quantity || 0), 0),
              0
            )}
          </p>
        </div>
      </div>

      <div className="bg-card border border-border rounded-2xl p-5">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-border text-muted-foreground font-semibold">
                <th className="pb-3 pl-2">Return ID</th>
                <th className="pb-3">Date</th>
                <th className="pb-3">Invoice</th>
                <th className="pb-3">Customer</th>
                <th className="pb-3">Staff</th>
                <th className="pb-3 text-center">Method</th>
                <th className="pb-3">Reason</th>
                <th className="pb-3 text-right">Refund</th>
                <th className="pb-3 text-center">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {filteredReturns.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-10 text-center text-muted-foreground">
                    {loading ? "Loading return history..." : "No returns recorded yet."}
                  </td>
                </tr>
              ) : (
                filteredReturns.map((r) => (
                  <tr key={r.id} className="hover:bg-secondary/20 transition">
                    <td className="py-4 pl-2 font-mono text-muted-foreground">{r.id.substring(0, 8)}</td>
                    <td className="py-4 text-muted-foreground">{new Date(r.returnDate).toLocaleString()}</td>
                    <td className="py-4 font-mono text-foreground">{r.saleId?.substring(0, 8)}</td>
                    <td className="py-4 font-semibold text-foreground">
                      {r.sale?.customer ? (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            openCustomerInContacts(r.sale.customer);
                          }}
                          className="text-left text-primary hover:underline font-semibold"
                          title="Open customer in Contacts"
                        >
                          {r.sale.customer.name}
                        </button>
                      ) : (
                        <span className="italic text-muted-foreground">Walk-in</span>
                      )}
                    </td>
                    <td className="py-4 text-foreground">{r.processedBy?.name || "—"}</td>
                    <td className="py-4 text-center">
                      <span className="bg-secondary px-2 py-0.5 rounded font-black text-[10px]">
                        {refundMethodNames[r.refundMethod] || r.refundMethod}
                      </span>
                    </td>
                    <td className="py-4 text-muted-foreground max-w-[140px] truncate">
                      {r.reason || "—"}
                    </td>
                    <td className="py-4 text-right font-black text-rose-400">{money(r.refundAmount)}</td>
                    <td className="py-4 text-center">
                      <button
                        onClick={() => openReturnDetail(r.id)}
                        className="bg-primary/10 hover:bg-primary/20 text-primary text-[10px] font-bold px-2.5 py-1.5 rounded-lg inline-flex items-center gap-1 transition"
                      >
                        <img src="/icons/sales-history/details.png?v=1" alt="" className="w-3.5 h-3.5 object-contain" draggable={false} /> View
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
      </>
      )}

      {/* Invoice Receipt Modal */}
      {activeSale && (
        <PortalModal
          isOpen={receiptOpen && !!activeSale}
          onClose={() => {
            setReceiptOpen(false);
            setActiveSale(null);
          }}
        >
          <div className="bg-card border border-border w-full max-w-sm p-6 rounded-2xl shadow-2xl space-y-6 my-8 relative">
            <button
              onClick={() => setReceiptOpen(false)}
              className="absolute top-4 right-4 text-muted-foreground hover:text-foreground transition"
              title="Close Dialog"
            >
              <X className="w-4 h-4" />
            </button>
            <div className="text-center space-y-1">
              <CheckCircle className="w-12 h-12 text-green-400 mx-auto" />
              <h3 className="text-lg font-black tracking-tight text-foreground">Invoice Voucher Details</h3>
              <p className="text-xs text-muted-foreground">Invoice reference: {activeSale.id.substring(0, 8)}</p>
            </div>

            <div id="printable-receipt" className="bg-secondary/30 p-4 border border-dashed border-border rounded-xl text-xs space-y-4">
              <div className="text-center border-b border-border pb-3">
                <h4 className="font-extrabold text-foreground tracking-widest uppercase">
                  {activeSale.branch?.name || " ELECTRONICS"}
                </h4>
                {activeSale.branch?.address && (
                  <p className="text-[9px] text-muted-foreground mt-0.5">{activeSale.branch.address}</p>
                )}
                {activeSale.branch?.phone && (
                  <p className="text-[9px] text-muted-foreground">{activeSale.branch.phone}</p>
                )}
                <p className="text-[10px] text-muted-foreground mt-1">Invoice Receipt Slip</p>
                <p className="text-[9px] text-muted-foreground mt-1">
                  Date: {new Date(activeSale.saleDate).toLocaleString()}
                </p>
                <p className="text-[9px] text-muted-foreground">Cashier: {activeSale.cashier?.name}</p>
              </div>

              <div className="space-y-2">
                {activeSale.items.map((item: any) => (
                  <div key={item.id} className="flex justify-between items-start">
                    <div>
                      <p className="font-semibold text-foreground">{item.product.name}</p>
                      <p className="text-[9px] text-muted-foreground">
                        Qty: {item.quantity} @ Rs. {item.unitPrice}
                      </p>
                      {(item.serialNumber || item.imei) && (
                        <p className="text-[9px] text-primary/80 font-bold mt-0.5">
                          {item.serialNumber && `S/N: ${item.serialNumber}`}
                          {item.serialNumber && item.imei && " | "}
                          {item.imei && `IMEI: ${item.imei}`}
                        </p>
                      )}
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
                  <span>
                    Total Paid ({paymentMethodNames[activeSale.paymentMethod] || activeSale.paymentMethod}):
                  </span>
                  <span>Rs. {activeSale.paidAmount.toFixed(2)}</span>
                </div>
              </div>

              {activeSale.customer && (
                <div className="bg-secondary/60 p-2 rounded text-[10px] text-muted-foreground">
                  <p>
                    Customer:{" "}
                    <button
                      type="button"
                      onClick={() => openCustomerInContacts(activeSale.customer)}
                      className="font-bold text-primary hover:underline"
                      title="Open customer in Contacts"
                    >
                      {activeSale.customer.name}
                    </button>
                  </p>
                  {activeSale.paymentMethod === "EMI" ? (
                    <p>
                      Financed Balance:{" "}
                      <strong>Rs. {Math.max(0, activeSale.payableAmount - activeSale.paidAmount).toFixed(2)}</strong>
                    </p>
                  ) : activeSale.paymentMethod === "CREDIT" ? (
                    <p>
                      Outstanding on Invoice:{" "}
                      <strong>Rs. {Math.max(0, activeSale.payableAmount - activeSale.paidAmount).toFixed(2)}</strong>
                    </p>
                  ) : null}
                </div>
              )}

              {activeSale.returns?.length > 0 && (
                <div className="border-t border-border pt-3 space-y-2">
                  <p className="text-[10px] font-bold uppercase text-rose-400">Returns on this invoice</p>
                  {activeSale.returns.map((r: any) => (
                    <div key={r.id} className="text-[10px] flex justify-between text-muted-foreground">
                      <span>
                        {new Date(r.returnDate).toLocaleDateString()} · {r.refundMethod}
                      </span>
                      <span className="font-bold text-rose-400">-{money(r.refundAmount)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex flex-col gap-2">
              <div className="flex gap-3">
                <button
                  onClick={handlePrint}
                  className="flex-1 border border-border hover:bg-secondary text-foreground text-xs font-bold py-2.5 rounded-xl flex items-center justify-center gap-1.5 transition cursor-pointer"
                >
                  <img src="/icons/sales-history/print.png?v=1" alt="" className="w-4 h-4 object-contain" draggable={false} />
                  Print Slip
                </button>
                <button
                  onClick={downloadPdf}
                  className="flex-1 border border-border hover:bg-secondary text-foreground text-xs font-bold py-2.5 rounded-xl flex items-center justify-center gap-1.5 transition cursor-pointer"
                >
                  <img src="/icons/sales-history/pdf.png?v=1" alt="" className="w-4 h-4 object-contain" draggable={false} />
                  Download PDF
                </button>
              </div>
              {activeSale.returnStatus !== "FULL" && (
                <button
                  onClick={() => openReturnDialog(activeSale.id)}
                  className="w-full bg-rose-500/15 hover:bg-rose-500/25 text-rose-400 text-xs font-bold py-2.5 rounded-xl transition flex items-center justify-center gap-1.5"
                >
                  <img src="/icons/sales-history/return-action.png?v=1" alt="" className="w-4 h-4 object-contain" draggable={false} /> Process Return & Refund
                </button>
              )}
              <button
                onClick={() => {
                  setReceiptOpen(false);
                  setActiveSale(null);
                }}
                className="w-full bg-primary hover:bg-primary/95 text-white text-xs font-bold py-2.5 rounded-xl transition cursor-pointer text-center"
              >
                Dismiss Window
              </button>
            </div>
          </div>
        </PortalModal>
      )}

      {/* Return dialog — tick items only */}
      <PortalModal
        isOpen={returnOpen && !!preview}
        onClose={() => {
          if (!submitting) {
            setReturnOpen(false);
            setPreview(null);
          }
        }}
      >
        {preview && (
          <div className="bg-card border border-border w-full max-w-lg p-6 rounded-2xl shadow-2xl space-y-5 my-8 relative max-h-[90vh] overflow-y-auto">
            <button
              type="button"
              disabled={submitting}
              onClick={() => {
                setReturnOpen(false);
                setPreview(null);
              }}
              className="absolute top-4 right-4 text-muted-foreground hover:text-foreground transition"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="space-y-1 pr-8">
              <h3 className="text-lg font-black text-foreground flex items-center gap-2">
                <span className="w-6 h-6 rounded-lg bg-rose-500/15 p-0.5 ring-1 ring-rose-500/25 flex items-center justify-center">
                  <img src="/icons/sales-history/return-action.png?v=1" alt="" className="w-full h-full object-contain" draggable={false} />
                </span>
                Return & Refund
              </h3>
              <p className="text-xs text-muted-foreground">
                Invoice <span className="font-mono text-foreground">{preview.sale.id.substring(0, 8)}</span>
                {" · "}
                {preview.sale.customer?.name || "Walk-in"}
              </p>
              <p className="text-[11px] text-muted-foreground">
                Tick items to return. Each selected line is refunded for its full remaining quantity.
              </p>
            </div>

            {preview.alreadyRefunded > 0 && (
              <div className="flex items-start gap-2 bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs rounded-xl p-3">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>
                  Already refunded {money(preview.alreadyRefunded)}. Remaining up to{" "}
                  <strong>{money(preview.maxRefundable)}</strong>.
                </span>
              </div>
            )}

            <form onSubmit={handleSubmitReturn} className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Items</p>
                <button
                  type="button"
                  onClick={toggleAll}
                  className="text-[10px] font-bold text-primary hover:underline"
                >
                  {selectedProductIds.size === returnableLines.length ? "Deselect all" : "Select all"}
                </button>
              </div>

              <div className="border border-border rounded-xl divide-y divide-border overflow-hidden">
                {returnableLines.map((line) => {
                  const checked = selectedProductIds.has(line.productId);
                  const lineRefund = line.unitRefund * line.remainingQty;
                  return (
                    <label
                      key={line.saleItemId}
                      className={`flex items-center gap-3 p-3 cursor-pointer transition ${
                        checked ? "bg-primary/5" : "hover:bg-secondary/30"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleLine(line.productId)}
                        className="w-4 h-4 rounded border-border accent-primary shrink-0"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-foreground truncate">{line.product.name}</p>
                        <p className="text-[10px] text-muted-foreground">
                          Qty {line.remainingQty}
                          {line.alreadyReturned > 0 && ` (${line.alreadyReturned} already returned)`}
                          {(line.serialNumber || line.imei) && (
                            <>
                              {" · "}
                              {line.serialNumber && `S/N ${line.serialNumber}`}
                              {line.serialNumber && line.imei && " · "}
                              {line.imei && `IMEI ${line.imei}`}
                            </>
                          )}
                        </p>
                      </div>
                      <span className="text-xs font-black text-foreground shrink-0">{money(lineRefund)}</span>
                    </label>
                  );
                })}
              </div>

              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-2">
                  Refund method
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {REFUND_METHODS.map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => setRefundMethod(m.id)}
                      className={`px-3 py-2.5 rounded-xl border text-xs font-bold transition ${
                        refundMethod === m.id
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border bg-secondary/40 text-muted-foreground hover:border-primary/40"
                      }`}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5">
                  Reason (optional)
                </label>
                <input
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="e.g. Defective, wrong item, customer change of mind"
                  className="w-full bg-secondary border border-border rounded-xl px-3 py-2.5 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>

              <div className="bg-secondary/40 border border-border rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <p className="text-[10px] font-bold uppercase text-muted-foreground">Refund total</p>
                  <p className="text-xl font-black text-rose-400">{money(estimatedRefund)}</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">Stock restored · till / credit adjusted</p>
                </div>
                <button
                  type="submit"
                  disabled={submitting || estimatedRefund <= 0}
                  className="bg-primary hover:bg-primary/95 text-white text-xs font-bold px-5 py-3 rounded-xl disabled:opacity-50 flex items-center justify-center gap-2 min-w-[150px]"
                >
                  {submitting ? (
                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <>
                      <CheckCircle className="w-4 h-4" /> Confirm Return
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        )}
      </PortalModal>

      {/* Return voucher detail */}
      <PortalModal
        isOpen={returnDetailOpen && !!activeReturn}
        onClose={() => {
          setReturnDetailOpen(false);
          setActiveReturn(null);
        }}
      >
        {activeReturn && (
          <div className="bg-card border border-border w-full max-w-md p-6 rounded-2xl shadow-2xl space-y-5 my-8 relative">
            <button
              onClick={() => {
                setReturnDetailOpen(false);
                setActiveReturn(null);
              }}
              className="absolute top-4 right-4 text-muted-foreground hover:text-foreground"
            >
              <X className="w-4 h-4" />
            </button>
            <div className="text-center space-y-1">
              <img src="/icons/sales-history/returns.png?v=1" alt="" className="w-12 h-12 object-contain mx-auto" draggable={false} />
              <h3 className="text-lg font-black text-foreground">Return Voucher</h3>
              <p className="text-xs text-muted-foreground font-mono">{activeReturn.id.substring(0, 8)}</p>
            </div>

            <div className="bg-secondary/30 border border-dashed border-border rounded-xl p-4 text-xs space-y-3">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Date</span>
                <span className="font-semibold">{new Date(activeReturn.returnDate).toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Invoice</span>
                <span className="font-mono font-semibold">{activeReturn.saleId?.substring(0, 8)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Customer</span>
                <span className="font-semibold">{activeReturn.sale?.customer?.name || "Walk-in"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Processed by</span>
                <span className="font-semibold">{activeReturn.processedBy?.name || "—"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Method</span>
                <span className="font-bold">
                  {refundMethodNames[activeReturn.refundMethod] || activeReturn.refundMethod}
                </span>
              </div>
              {activeReturn.reason && (
                <div className="flex justify-between gap-4">
                  <span className="text-muted-foreground shrink-0">Reason</span>
                  <span className="font-semibold text-right">{activeReturn.reason}</span>
                </div>
              )}

              <div className="border-t border-border pt-3 space-y-2">
                {(activeReturn.items || []).map((item: any) => (
                  <div key={item.id} className="flex justify-between items-start">
                    <div>
                      <p className="font-semibold text-foreground">{item.product?.name || "Product"}</p>
                      <p className="text-[10px] text-muted-foreground">Qty: {item.quantity}</p>
                    </div>
                    <span className="font-bold">{money(item.totalRefund)}</span>
                  </div>
                ))}
              </div>

              <div className="border-t border-border pt-3 flex justify-between font-black text-sm">
                <span>Total Refund</span>
                <span className="text-rose-400">{money(activeReturn.refundAmount)}</span>
              </div>
            </div>

            <button
              onClick={() => {
                setReturnDetailOpen(false);
                setActiveReturn(null);
              }}
              className="w-full bg-primary text-white text-xs font-bold py-2.5 rounded-xl"
            >
              Close
            </button>
          </div>
        )}
      </PortalModal>
    </div>
  );
}
