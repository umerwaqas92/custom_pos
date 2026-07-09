import React, { useState, useEffect } from "react";
import axios from "axios";
import { useStore } from "../store/useStore";
import {
  CreditCard,
  User,
  Phone,
  MapPin,
  Upload,
  Calendar,
  Search,
  Eye,
  CheckCircle,
  FileText,
  AlertCircle,
  X,
  DollarSign,
  TrendingUp,
  Receipt
} from "lucide-react";

export default function Installments() {
  const { addNotification } = useStore();
  const [loading, setLoading] = useState(false);
  const [sales, setSales] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");

  // Agreement Modal States
  const [selectedSale, setSelectedSale] = useState<any | null>(null);
  const [guarantorName, setGuarantorName] = useState("");
  const [guarantorPhone, setGuarantorPhone] = useState("");
  const [guarantorAddress, setGuarantorAddress] = useState("");
  const [emiMonths, setEmiMonths] = useState(3);
  const [interestRate, setInterestRate] = useState("10");
  const [downPayment, setDownPayment] = useState("");
  const [cnicFrontFile, setCnicFrontFile] = useState<File | null>(null);
  const [cnicBackFile, setCnicBackFile] = useState<File | null>(null);
  const [chequeFile, setChequeFile] = useState<File | null>(null);

  // Previews/Contract Details Modal
  const [activeContract, setActiveContract] = useState<any | null>(null);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const uploadsBaseUrl = axios.defaults.baseURL || "";

  const fetchSales = async () => {
    setLoading(true);
    try {
      const res = await axios.get("/api/sales");
      setSales(res.data);
    } catch (err) {
      console.error(err);
      addNotification("Failed to load transactions list.", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSales();
  }, []);

  // Filter Sales based on active tab and search
  const pendingEmiSales = sales.filter(
    (s) => s.paymentMethod === "EMI" && !s.emiDetails
  );

  const getCurrentMonthStatus = (emi: any) => {
    if (!emi) return "PAID";
    if (emi.status === "COMPLETED") return "PAID";

    const sorted = [...emi.installments].sort((a: any, b: any) => a.installmentNumber - b.installmentNumber);
    const firstUnpaid = sorted.find((inst: any) => inst.status === "PENDING");
    if (!firstUnpaid) return "PAID";

    const dueDate = new Date(firstUnpaid.dueDate);
    const now = new Date();
    const diffTime = dueDate.getTime() - now.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays <= 30) {
      return "PENDING";
    }
    return "PAID";
  };

  const activeEmiContracts = sales.filter((s) => s.emiDetails);

  const filteredActiveContracts = activeEmiContracts
    .filter((s) => {
      const custName = s.customer?.name || "Walk-in";
      const guarantor = s.emiDetails?.guarantorName || "";
      const matchesSearch =
        custName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        guarantor.toLowerCase().includes(searchQuery.toLowerCase()) ||
        s.id.toLowerCase().includes(searchQuery.toLowerCase());

      const matchesStatus =
        statusFilter === "ALL" || s.emiDetails?.status === statusFilter;

      return matchesSearch && matchesStatus;
    })
    .sort((a, b) => {
      const statusA = getCurrentMonthStatus(a.emiDetails);
      const statusB = getCurrentMonthStatus(b.emiDetails);

      if (statusA === "PENDING" && statusB === "PAID") return -1;
      if (statusA === "PAID" && statusB === "PENDING") return 1;

      return new Date(b.saleDate).getTime() - new Date(a.saleDate).getTime();
    });

  const getMarkupRate = (months: number) => {
    if (months === 3) return 5; // 5%
    if (months === 6) return 10; // 10%
    if (months === 12) return 15; // 15%
    return 0;
  };

  const handleActivateContract = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSale) return;

    if (!guarantorName || !guarantorPhone || !guarantorAddress) {
      addNotification("Please fill in all guarantor details.", "warning");
      return;
    }

    if (!cnicFrontFile || !cnicBackFile || !chequeFile) {
      addNotification("Please upload all required document scans.", "warning");
      return;
    }

    const parsedDown = parseFloat(downPayment || "0");
    if (isNaN(parsedDown) || parsedDown < 0) {
      addNotification("Please enter a valid down payment amount.", "warning");
      return;
    }

    setLoading(true);
    const formData = new FormData();
    formData.append("guarantorName", guarantorName);
    formData.append("guarantorPhone", guarantorPhone);
    formData.append("guarantorAddress", guarantorAddress);
    formData.append("months", String(emiMonths));
    formData.append("interestRate", String(parseFloat(interestRate || "0")));
    formData.append("downPayment", String(parsedDown));
    formData.append("cnicFront", cnicFrontFile);
    formData.append("cnicBack", cnicBackFile);
    formData.append("cheque", chequeFile);

    try {
      await axios.post(`/api/sales/${selectedSale.id}/emi`, formData, {
        headers: { "Content-Type": "multipart/form-data" }
      });
      addNotification("Installment agreement contract activated successfully!", "success");
      setSelectedSale(null);
      // Reset forms
      setGuarantorName("");
      setGuarantorPhone("");
      setGuarantorAddress("");
      setEmiMonths(3);
      setInterestRate("10");
      setDownPayment("");
      setCnicFrontFile(null);
      setCnicBackFile(null);
      setChequeFile(null);
      fetchSales();
    } catch (err: any) {
      console.error(err);
      addNotification(err.response?.data?.error || "Failed to create installment contract.", "error");
    } finally {
      setLoading(false);
    }
  };

  const handlePayInstallment = async (saleId: string, installmentId: string) => {
    setLoading(true);
    try {
      await axios.post(`/api/sales/${saleId}/installments/${installmentId}/pay`);
      addNotification("Installment payment collected successfully!", "success");
      
      // Update local state for contract details popup
      const res = await axios.get("/api/sales");
      setSales(res.data);
      const updatedContract = res.data.find((s: any) => s.id === saleId);
      if (updatedContract) {
        setActiveContract(updatedContract);
      }
    } catch (err: any) {
      console.error(err);
      addNotification(err.response?.data?.error || "Failed to collect payment.", "error");
    } finally {
      setLoading(false);
    }
  };

  // Math Calculations for live preview
  const originalAmount = selectedSale?.payableAmount || 0;
  const markupRate = parseFloat(interestRate || "0");
  const markupAdded = originalAmount * (markupRate / 100);
  const totalPrincipal = originalAmount + markupAdded;
  const parsedDown = parseFloat(downPayment || "0");
  const remainingBal = Math.max(0, totalPrincipal - (isNaN(parsedDown) ? 0 : parsedDown));
  const monthlyPayment = remainingBal / emiMonths;

  const downloadPdf = () => {
    if (!activeContract) return;
    const element = document.getElementById("printable-receipt");
    if (!element) return;

    addNotification("Generating PDF Statement, please wait...", "info");

    const opt = {
      margin: 0.4,
      filename: `EMI_Plan_Statement_${activeContract.id.substring(0, 8)}.pdf`,
      image: { type: "jpeg", quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true, letterRendering: true },
      jsPDF: { unit: "in", format: "letter", orientation: "portrait" }
    };

    const execute = () => {
      // @ts-ignore
      const html2pdf = window.html2pdf;
      if (html2pdf) {
        element.style.display = "block";
        html2pdf()
          .set(opt)
          .from(element)
          .save()
          .then(() => {
            element.style.display = "none";
            addNotification("PDF downloaded successfully!", "success");
          })
          .catch((err: any) => {
            console.error(err);
            element.style.display = "none";
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

  return (
    <div className="space-y-6 flex-1 flex flex-col h-full min-h-0 overflow-hidden">
      
      {/* Header section */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-foreground flex items-center gap-2">
            <CreditCard className="w-6 h-6 text-primary" /> Installments Manager
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Underwrite active credit agreements, process CNIC identity records, and collect installment payments.
          </p>
        </div>
      </div>

      {/* Pending Contracts Section (Only visible if there are pending drafts) */}
      {pendingEmiSales.length > 0 && (
        <div className="bg-card border border-border rounded-2xl p-4 flex flex-col max-h-[220px] min-h-0 space-y-2">
          <div className="flex items-center justify-between border-b border-border pb-1">
            <h3 className="font-bold text-xs text-foreground uppercase tracking-wider flex items-center gap-1.5 text-amber-500">
              <AlertCircle className="w-4 h-4" /> Pending EMI Contracts ({pendingEmiSales.length})
            </h3>
            <span className="text-[10px] text-muted-foreground font-bold">Needs CNIC/Cheque Upload & Guarantor Details</span>
          </div>

          <div className="flex-1 overflow-y-auto pr-1 min-h-0">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-border text-muted-foreground font-semibold">
                  <th className="pb-2 pl-2">Invoice Ref</th>
                  <th className="pb-2">Date</th>
                  <th className="pb-2">Customer Name</th>
                  <th className="pb-2 text-right">Items Price</th>
                  <th className="pb-2 text-right pr-2">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {pendingEmiSales.map((sale) => (
                  <tr key={sale.id} className="hover:bg-secondary/20 transition">
                    <td className="py-2 pl-2 font-mono font-bold text-foreground">
                      #{sale.id.substring(0, 8)}
                    </td>
                    <td className="py-2 text-muted-foreground">
                      {new Date(sale.saleDate).toLocaleDateString()}
                    </td>
                    <td className="py-2 font-semibold text-foreground">
                      {sale.customer?.name || "Walk-in"}
                    </td>
                    <td className="py-2 text-right font-extrabold text-foreground">
                      Rs. {sale.payableAmount.toFixed(2)}
                    </td>
                    <td className="py-2 text-right pr-2">
                      <button
                        onClick={() => setSelectedSale(sale)}
                        className="bg-amber-500 hover:bg-amber-600 text-black px-2.5 py-1 rounded-lg text-[10px] font-black ml-auto flex items-center gap-1 shadow cursor-pointer"
                      >
                        Configure EMI
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Active Accounts Section */}
      <div className="flex-1 flex flex-col min-h-0 bg-card border border-border rounded-2xl p-4 space-y-4">
        <div className="flex items-center justify-between border-b border-border pb-2">
          <h3 className="font-bold text-xs text-foreground uppercase tracking-wider flex items-center gap-1.5 text-primary">
            <CreditCard className="w-4 h-4" /> Active Installment Accounts ({activeEmiContracts.length})
          </h3>
          <span className="text-[10px] text-muted-foreground font-bold">Monthly Repayments Schedule & Audits</span>
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex-1 relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search by customer, guarantor, or sale invoice..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 text-xs bg-secondary border border-border rounded-xl focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="bg-secondary text-xs border border-border rounded-xl px-3 py-2 focus:outline-none font-bold"
          >
            <option value="ALL">All Statuses</option>
            <option value="ACTIVE">Active Agreements</option>
            <option value="COMPLETED">Completed Agreements</option>
          </select>
        </div>

        <div className="flex-1 overflow-y-auto pr-1 min-h-0 font-medium">
          {loading && sales.length === 0 ? (
            <div className="py-20 text-center text-xs text-muted-foreground">Loading accounts...</div>
          ) : filteredActiveContracts.length === 0 ? (
            <div className="py-20 text-center text-xs text-muted-foreground flex flex-col items-center justify-center space-y-2">
              <CreditCard className="w-10 h-10 opacity-20" />
              <p>No active installment accounts found.</p>
            </div>
          ) : (
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-border text-muted-foreground font-semibold">
                  <th className="pb-3 pl-2">Invoice Ref</th>
                  <th className="pb-3">Customer</th>
                  <th className="pb-3">Guarantor</th>
                  <th className="pb-3 text-center">Tenure</th>
                  <th className="pb-3 text-right">Monthly Payment</th>
                  <th className="pb-3 text-right">Remaining Principal</th>
                  <th className="pb-3 text-center">Month Status</th>
                  <th className="pb-3 text-center">Status</th>
                  <th className="pb-3 text-right pr-2">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {filteredActiveContracts.map((sale) => {
                  const emi = sale.emiDetails;
                  const paidInstallments = emi.installments.filter((i: any) => i.status === "PAID").length;
                  const totalRemaining = emi.totalPrincipal - emi.downPayment - emi.installments
                    .filter((i: any) => i.status === "PAID")
                    .reduce((sum: number, i: any) => sum + i.amount, 0);

                  const monthStatus = getCurrentMonthStatus(emi);

                  return (
                    <tr key={sale.id} className="hover:bg-secondary/20 transition">
                      <td className="py-3 pl-2 font-mono font-bold text-foreground">
                        #{sale.id.substring(0, 8)}
                      </td>
                      <td className="py-3 font-semibold text-foreground">
                        {sale.customer?.name || "Walk-in"}
                      </td>
                      <td className="py-3 text-muted-foreground">{emi.guarantorName}</td>
                      <td className="py-3 text-center text-muted-foreground font-bold">
                        {paidInstallments} / {emi.months} months
                      </td>
                      <td className="py-3 text-right font-bold text-foreground">
                        Rs. {emi.monthlyPayment.toFixed(2)}
                      </td>
                      <td className="py-3 text-right font-extrabold text-foreground">
                        Rs. {totalRemaining.toFixed(2)}
                      </td>
                      <td className="py-3 text-center">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            monthStatus === "PAID"
                              ? "bg-green-500/10 text-green-400"
                              : "bg-amber-500/10 text-amber-400 animate-pulse"
                          }`}
                        >
                          {monthStatus}
                        </span>
                      </td>
                      <td className="py-3 text-center">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            emi.status === "COMPLETED"
                              ? "bg-green-500/10 text-green-400"
                              : "bg-blue-500/10 text-blue-400"
                          }`}
                        >
                          {emi.status}
                        </span>
                      </td>
                      <td className="py-3 text-right pr-2">
                        <button
                          onClick={() => setActiveContract(sale)}
                          className="bg-primary/10 text-primary border border-primary/20 hover:bg-primary/20 p-1.5 rounded-lg text-[10px] font-bold flex items-center gap-1 ml-auto cursor-pointer"
                        >
                          <Eye className="w-3.5 h-3.5" /> View Plan
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* AGREEMENT CONFIGURATION FORM MODAL */}
      {selectedSale && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/75 backdrop-blur-sm z-50 px-4 overflow-y-auto">
          <div className="bg-card border border-border w-full max-w-4xl p-6 rounded-2xl shadow-2xl space-y-6 my-8 relative">
            <button
              onClick={() => setSelectedSale(null)}
              className="absolute top-4 right-4 text-muted-foreground hover:text-foreground transition cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            <div>
              <h2 className="text-base font-extrabold text-foreground flex items-center gap-1.5">
                <FileText className="w-5 h-5 text-primary" /> Configure Installment Agreement
              </h2>
              <p className="text-[11px] text-muted-foreground">
                Agreement details for invoice reference #<strong>{selectedSale.id.substring(0, 8)}</strong> (Customer: {selectedSale.customer?.name || "Walk-in"})
              </p>
            </div>

            <form onSubmit={handleActivateContract} className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Left Column: Underwriting inputs */}
              <div className="space-y-4">
                <h3 className="text-xs font-bold text-primary uppercase tracking-wider flex items-center gap-1">
                  <User className="w-3.5 h-3.5" /> Guarantor / Reference Details
                </h3>
                <div className="space-y-3">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-muted-foreground uppercase">Guarantor Name</label>
                    <input
                      type="text"
                      required
                      value={guarantorName}
                      onChange={(e) => setGuarantorName(e.target.value)}
                      placeholder="Enter full name"
                      className="w-full bg-secondary text-xs border border-border px-3 py-2 rounded-xl focus:outline-none"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-muted-foreground uppercase">Guarantor Phone</label>
                    <input
                      type="text"
                      required
                      value={guarantorPhone}
                      onChange={(e) => setGuarantorPhone(e.target.value)}
                      placeholder="e.g. 0300-1234567"
                      className="w-full bg-secondary text-xs border border-border px-3 py-2 rounded-xl focus:outline-none"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-muted-foreground uppercase">Guarantor Home Address</label>
                    <textarea
                      required
                      value={guarantorAddress}
                      onChange={(e) => setGuarantorAddress(e.target.value)}
                      placeholder="Complete physical address details"
                      rows={2}
                      className="w-full bg-secondary text-xs border border-border px-3 py-2 rounded-xl focus:outline-none resize-none"
                    />
                  </div>
                </div>

                <h3 className="text-xs font-bold text-primary uppercase tracking-wider flex items-center gap-1 pt-2">
                  <Upload className="w-3.5 h-3.5" /> File Scans Upload (CNIC & Bank Cheque)
                </h3>
                <div className="grid grid-cols-3 gap-2">
                  <div className="space-y-1">
                    <label className="text-[8px] font-bold text-muted-foreground uppercase block truncate">CNIC Front</label>
                    <label className="border border-dashed border-border/80 bg-secondary/35 hover:bg-secondary transition rounded-xl p-2.5 flex flex-col items-center justify-center cursor-pointer text-center h-20">
                      <Upload className="w-4.5 h-4.5 text-muted-foreground mb-1" />
                      <span className="text-[8px] text-muted-foreground truncate w-full font-bold">
                        {cnicFrontFile ? cnicFrontFile.name : "Select Image"}
                      </span>
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => setCnicFrontFile(e.target.files?.[0] || null)}
                      />
                    </label>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[8px] font-bold text-muted-foreground uppercase block truncate">CNIC Back</label>
                    <label className="border border-dashed border-border/80 bg-secondary/35 hover:bg-secondary transition rounded-xl p-2.5 flex flex-col items-center justify-center cursor-pointer text-center h-20">
                      <Upload className="w-4.5 h-4.5 text-muted-foreground mb-1" />
                      <span className="text-[8px] text-muted-foreground truncate w-full font-bold">
                        {cnicBackFile ? cnicBackFile.name : "Select Image"}
                      </span>
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => setCnicBackFile(e.target.files?.[0] || null)}
                      />
                    </label>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[8px] font-bold text-muted-foreground uppercase block truncate">Bank Cheque</label>
                    <label className="border border-dashed border-border/80 bg-secondary/35 hover:bg-secondary transition rounded-xl p-2.5 flex flex-col items-center justify-center cursor-pointer text-center h-20">
                      <Upload className="w-4.5 h-4.5 text-muted-foreground mb-1" />
                      <span className="text-[8px] text-muted-foreground truncate w-full font-bold">
                        {chequeFile ? chequeFile.name : "Select Image"}
                      </span>
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => setChequeFile(e.target.files?.[0] || null)}
                      />
                    </label>
                  </div>
                </div>
              </div>

              {/* Right Column: Pricing calculations & schedule preview */}
              <div className="space-y-4 bg-secondary/35 p-4 rounded-xl border border-border">
                <h3 className="text-xs font-bold text-foreground uppercase tracking-wider flex items-center gap-1 border-b border-border pb-2">
                  <TrendingUp className="w-3.5 h-3.5 text-emerald-400" /> EMI Terms Configurator
                </h3>

                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-muted-foreground uppercase">Tenure Months</label>
                    <select
                      value={emiMonths}
                      onChange={(e) => setEmiMonths(Number(e.target.value))}
                      className="w-full bg-card text-xs border border-border px-3 py-2.5 rounded-xl focus:outline-none font-bold"
                    >
                      <option value={3}>3 Months</option>
                      <option value={6}>6 Months</option>
                      <option value={12}>12 Months</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-muted-foreground uppercase">Markup (%)</label>
                    <input
                      type="number"
                      step="0.1"
                      required
                      value={interestRate}
                      onChange={(e) => setInterestRate(e.target.value)}
                      placeholder="e.g. 10"
                      className="w-full bg-card text-xs border border-border px-3 py-2 rounded-xl focus:outline-none font-bold text-primary"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-muted-foreground uppercase">Down Payment</label>
                    <input
                      type="number"
                      required
                      value={downPayment}
                      onChange={(e) => setDownPayment(e.target.value)}
                      placeholder="e.g. 5000"
                      className="w-full bg-card text-xs border border-border px-3 py-2 rounded-xl focus:outline-none font-bold text-primary"
                    />
                  </div>
                </div>

                <div className="space-y-2 text-xs border-t border-border pt-3">
                  <div className="flex justify-between text-muted-foreground">
                    <span>Original Purchase Amount:</span>
                    <span>Rs. {originalAmount.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between text-muted-foreground">
                    <span>Markup Interest (+{markupRate}%):</span>
                    <span>+Rs. {markupAdded.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between font-bold text-foreground pt-1 border-t border-border/20">
                    <span>Total Financed Principal:</span>
                    <span>Rs. {totalPrincipal.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between text-emerald-400 font-semibold">
                    <span>Down Payment Collected:</span>
                    <span>-Rs. {parsedDown.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between font-black text-foreground text-sm pt-2 border-t-2 border-dashed border-border/40">
                    <span>Remaining Installment Principal:</span>
                    <span>Rs. {remainingBal.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between bg-primary/10 border border-primary/20 p-2.5 rounded-xl text-primary font-black mt-3">
                    <span>Monthly Repayment (x{emiMonths}):</span>
                    <span>Rs. {monthlyPayment.toLocaleString(undefined, { maximumFractionDigits: 2 })} / month</span>
                  </div>
                </div>

                {/* Repayment Preview Table */}
                <div className="space-y-1.5 border-t border-border pt-3">
                  <label className="text-[9px] font-extrabold text-muted-foreground uppercase tracking-wider block">
                    Installment Repayment Schedule Preview
                  </label>
                  <div className="max-h-24 overflow-y-auto border border-border rounded-xl divide-y divide-border/50 bg-card pr-1">
                    {Array.from({ length: emiMonths }).map((_, idx) => {
                      const dueDate = new Date();
                      dueDate.setDate(dueDate.getDate() + (idx + 1) * 30);
                      return (
                        <div key={idx} className="flex justify-between items-center p-2 text-[10px] hover:bg-secondary/10">
                          <span className="font-bold text-foreground">Month {idx + 1}</span>
                          <span className="text-muted-foreground">Due: {dueDate.toLocaleDateString()}</span>
                          <span className="font-extrabold text-primary">Rs. {monthlyPayment.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-primary hover:bg-primary/95 text-white font-bold py-2.5 rounded-xl shadow-lg shadow-primary/15 text-xs transition disabled:opacity-50 mt-4 flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <CheckCircle className="w-4.5 h-4.5" /> Activate Agreement & Collect Downpayment
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* DETAILED ACTIVE CONTRACT MODAL SCHEDULER */}
      {activeContract && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/75 backdrop-blur-sm z-50 px-4 overflow-y-auto">
          <div className="bg-card border border-border w-full max-w-4xl p-6 rounded-2xl shadow-2xl grid grid-cols-1 md:grid-cols-12 gap-6 my-8 relative">
            <button
              onClick={() => setActiveContract(null)}
              className="absolute top-4 right-4 text-muted-foreground hover:text-foreground transition cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            {/* Left Column: Contract Metadata & Documents */}
            <div className="md:col-span-5 space-y-4">
              <div>
                <span className="px-2 py-0.5 rounded text-[9px] font-black tracking-widest uppercase bg-primary/20 text-primary">
                  EMI Contract Info
                </span>
                <div className="flex justify-between items-start mt-1">
                  <div>
                    <h3 className="text-base font-black text-foreground">Invoice #{activeContract.id.substring(0, 8)}</h3>
                    <p className="text-[10px] text-muted-foreground">Dated: {new Date(activeContract.saleDate).toLocaleDateString()}</p>
                  </div>
                  <button
                    onClick={downloadPdf}
                    className="bg-primary hover:bg-primary/95 text-white font-bold px-2.5 py-1.5 rounded-lg text-[10px] flex items-center gap-1 shadow-md shadow-primary/10 cursor-pointer"
                  >
                    <Receipt className="w-3.5 h-3.5" /> Download PDF
                  </button>
                </div>
              </div>

              <div className="space-y-2 text-xs border border-border p-3 rounded-xl bg-secondary/20">
                <p className="font-bold text-foreground">Customer Profile</p>
                <div className="space-y-1.5 text-muted-foreground">
                  <p className="flex items-center gap-1.5 text-[10px]">
                    <User className="w-3.5 h-3.5 text-muted-foreground" /> {activeContract.customer?.name || "Walk-in"}
                  </p>
                  <p className="flex items-center gap-1.5 text-[10px]">
                    <Phone className="w-3.5 h-3.5 text-muted-foreground" /> {activeContract.customer?.phone || "N/A"}
                  </p>
                </div>
              </div>

              <div className="space-y-2 text-xs border border-border p-3 rounded-xl bg-secondary/20">
                <p className="font-bold text-foreground">Purchased Items</p>
                <div className="space-y-2 max-h-32 overflow-y-auto pr-1">
                  {activeContract.items?.map((item: any) => (
                    <div key={item.id} className="border-b border-border/40 pb-1.5 last:border-b-0 text-[10px]">
                      <div className="flex justify-between font-semibold text-foreground">
                        <span className="truncate max-w-[150px]">{item.product?.name}</span>
                        <span>Rs. {item.totalPrice.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between text-muted-foreground text-[9px]">
                        <span>Qty: {item.quantity} @ Rs. {item.unitPrice}</span>
                      </div>
                      {(item.serialNumber || item.imei) && (
                        <p className="text-[9px] text-primary/80 font-bold mt-0.5 leading-none">
                          {item.serialNumber && `S/N: ${item.serialNumber}`}
                          {item.serialNumber && item.imei && " | "}
                          {item.imei && `IMEI: ${item.imei}`}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-2 text-xs border border-border p-3 rounded-xl bg-secondary/20">
                <p className="font-bold text-foreground">Guarantor / Reference Details</p>
                <div className="space-y-1.5 text-muted-foreground">
                  <p className="flex items-center gap-1.5 text-[10px] font-semibold text-foreground">
                    <User className="w-3.5 h-3.5 text-primary" /> {activeContract.emiDetails.guarantorName}
                  </p>
                  <p className="flex items-center gap-1.5 text-[10px]">
                    <Phone className="w-3.5 h-3.5 text-muted-foreground" /> {activeContract.emiDetails.guarantorPhone}
                  </p>
                  <p className="flex items-start gap-1.5 text-[10px]">
                    <MapPin className="w-3.5 h-3.5 text-muted-foreground mt-0.5 flex-shrink-0" /> 
                    <span className="leading-snug">{activeContract.emiDetails.guarantorAddress}</span>
                  </p>
                </div>
              </div>

              {/* Document Scans previews */}
              <div className="space-y-2">
                <p className="text-[10px] font-bold text-muted-foreground uppercase">Uploaded Contract Documents</p>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    onClick={() => setPreviewImage(`${uploadsBaseUrl}${activeContract.emiDetails.cnicFrontPath}`)}
                    className="border border-border bg-secondary hover:bg-secondary/80 p-2 rounded-xl text-center flex flex-col items-center justify-center gap-1 cursor-pointer"
                  >
                    <Eye className="w-4.5 h-4.5 text-primary" />
                    <span className="text-[9px] font-bold text-muted-foreground truncate w-full">CNIC Front</span>
                  </button>

                  <button
                    onClick={() => setPreviewImage(`${uploadsBaseUrl}${activeContract.emiDetails.cnicBackPath}`)}
                    className="border border-border bg-secondary hover:bg-secondary/80 p-2 rounded-xl text-center flex flex-col items-center justify-center gap-1 cursor-pointer"
                  >
                    <Eye className="w-4.5 h-4.5 text-primary" />
                    <span className="text-[9px] font-bold text-muted-foreground truncate w-full">CNIC Back</span>
                  </button>

                  <button
                    onClick={() => setPreviewImage(`${uploadsBaseUrl}${activeContract.emiDetails.chequePath}`)}
                    className="border border-border bg-secondary hover:bg-secondary/80 p-2 rounded-xl text-center flex flex-col items-center justify-center gap-1 cursor-pointer"
                  >
                    <Eye className="w-4.5 h-4.5 text-primary" />
                    <span className="text-[9px] font-bold text-muted-foreground truncate w-full">Bank Cheque</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Right Column: Payments Timeline schedule */}
            <div className="md:col-span-7 flex flex-col min-h-[350px] space-y-4">
              <div>
                <span className="text-[10px] font-bold text-muted-foreground uppercase">Repayment Schedule Timeline</span>
                <p className="text-[11px] text-muted-foreground">
                  Monthly installment calculations: <strong>Rs. {activeContract.emiDetails.monthlyPayment.toFixed(2)}</strong> for {activeContract.emiDetails.months} months
                </p>
              </div>

              <div className="flex-1 overflow-y-auto pr-1 border border-border rounded-xl divide-y divide-border/60 bg-secondary/10">
                {activeContract.emiDetails.installments.map((inst: any) => (
                  <div key={inst.id} className="p-3 flex items-center justify-between gap-4 hover:bg-secondary/20 transition text-xs">
                    <div className="space-y-0.5">
                      <p className="font-bold text-foreground">Installment #{inst.installmentNumber}</p>
                      <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                        <Calendar className="w-3.5 h-3.5" /> Due Date: {new Date(inst.dueDate).toLocaleDateString()}
                      </p>
                    </div>

                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <p className="font-black text-foreground">Rs. {inst.amount.toFixed(2)}</p>
                        {inst.paidDate && (
                          <p className="text-[8px] text-muted-foreground">Paid: {new Date(inst.paidDate).toLocaleDateString()}</p>
                        )}
                      </div>

                      {inst.status === "PAID" ? (
                        <span className="bg-green-500/10 text-green-400 font-bold px-2 py-0.5 rounded text-[10px]">
                          PAID
                        </span>
                      ) : (
                        <button
                          onClick={() => handlePayInstallment(activeContract.id, inst.id)}
                          className="bg-primary text-white font-bold px-2.5 py-1 rounded-lg text-[10px] hover:bg-primary/95 shadow-md shadow-primary/10 cursor-pointer"
                        >
                          Collect
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Document scan lightbox preview Modal */}
      {previewImage && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/90 z-50 p-4">
          <div className="relative max-w-4xl max-h-[90vh]">
            <button
              onClick={() => setPreviewImage(null)}
              className="absolute -top-10 right-0 bg-white/20 hover:bg-white/30 text-white rounded-full p-2 cursor-pointer"
              title="Close Preview"
            >
              <X className="w-6 h-6" />
            </button>
            <img
              src={previewImage}
              alt="Document Scan Preview"
              className="max-w-full max-h-[80vh] rounded-2xl border border-white/10 shadow-2xl object-contain"
            />
          </div>
        </div>
      )}

      {/* Hidden print slip for EMI Installments plan status */}
      {activeContract && (
        <div
          id="printable-receipt"
          style={{ display: "none", backgroundColor: "#ffffff", color: "#0f172a", padding: "24px" }}
          className="text-xs space-y-6 font-medium"
        >
          <div className="text-center border-b border-border pb-4 space-y-1">
            <h4 className="font-extrabold text-foreground tracking-widest uppercase text-sm">
              INSTALLMENT PLAN AGREEMENT STATEMENT
            </h4>
            <p className="text-[10px] text-muted-foreground">Invoice Ref: #{activeContract.id}</p>
            <p className="text-[10px] text-muted-foreground">Date of Purchase: {new Date(activeContract.saleDate).toLocaleString()}</p>
          </div>

          <div className="grid grid-cols-2 gap-4 border-b border-border pb-4">
            <div className="space-y-1">
              <p className="font-bold text-[10px] text-muted-foreground uppercase">Customer Profile</p>
              <p className="font-bold text-foreground">{activeContract.customer?.name || "Walk-in"}</p>
              <p className="text-muted-foreground">{activeContract.customer?.phone || "N/A"}</p>
            </div>
            <div className="space-y-1">
              <p className="font-bold text-[10px] text-muted-foreground uppercase">Guarantor / Reference</p>
              <p className="font-bold text-foreground">{activeContract.emiDetails.guarantorName}</p>
              <p className="text-muted-foreground">{activeContract.emiDetails.guarantorPhone}</p>
              <p className="text-[10px] text-muted-foreground">{activeContract.emiDetails.guarantorAddress}</p>
            </div>
          </div>

          <div className="space-y-3">
            <p className="font-bold text-[10px] text-muted-foreground uppercase">Purchased Items Details</p>
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-border text-muted-foreground font-semibold">
                  <th className="pb-2">Item Name</th>
                  <th className="pb-2 text-center">Qty</th>
                  <th className="pb-2 text-right">Unit Price</th>
                  <th className="pb-2 text-right">Total Price</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40">
                {activeContract.items?.map((item: any) => (
                  <tr key={item.id} className="py-2">
                    <td className="py-2">
                      <p className="font-semibold text-foreground">{item.product?.name}</p>
                      {(item.serialNumber || item.imei) && (
                        <p className="text-[9px] text-muted-foreground">
                          {item.serialNumber && `S/N: ${item.serialNumber}`}
                          {item.serialNumber && item.imei && " | "}
                          {item.imei && `IMEI: ${item.imei}`}
                        </p>
                      )}
                    </td>
                    <td className="py-2 text-center">{item.quantity}</td>
                    <td className="py-2 text-right">Rs. {item.unitPrice.toFixed(2)}</td>
                    <td className="py-2 text-right font-bold">Rs. {item.totalPrice.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="border-t border-border pt-4 space-y-2">
            <p className="font-bold text-[10px] text-muted-foreground uppercase">Financing Summary</p>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Original Purchase Total:</span>
                <span>Rs. {activeContract.payableAmount.toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Down Payment Collected:</span>
                <span>Rs. {activeContract.emiDetails.downPayment.toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Markup Rate Added:</span>
                <span>+{activeContract.emiDetails.interestRate}%</span>
              </div>
              <div className="flex justify-between font-bold text-foreground">
                <span>Remaining Financed Amount:</span>
                <span>Rs. {(activeContract.emiDetails.totalPrincipal - activeContract.emiDetails.downPayment).toFixed(2)}</span>
              </div>
            </div>
          </div>

          <div className="border-t border-border pt-4 space-y-3">
            <p className="font-bold text-[10px] text-muted-foreground uppercase">Installment Repayments Breakdown</p>
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-border text-muted-foreground font-semibold">
                  <th className="pb-2">Month</th>
                  <th className="pb-2">Due Date</th>
                  <th className="pb-2 text-right">Amount</th>
                  <th className="pb-2 text-center">Status</th>
                  <th className="pb-2 text-right">Payment Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40">
                {activeContract.emiDetails.installments.map((inst: any) => (
                  <tr key={inst.id} className="py-2">
                    <td className="py-2 font-bold">Installment #{inst.installmentNumber}</td>
                    <td className="py-2">{new Date(inst.dueDate).toLocaleDateString()}</td>
                    <td className="py-2 text-right font-semibold">Rs. {inst.amount.toFixed(2)}</td>
                    <td className="py-2 text-center">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${inst.status === "PAID" ? "text-green-500 bg-green-500/10" : "text-amber-500 bg-amber-500/10"}`}>
                        {inst.status}
                      </span>
                    </td>
                    <td className="py-2 text-right text-muted-foreground">
                      {inst.paidDate ? new Date(inst.paidDate).toLocaleDateString() : "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex justify-between pt-16 text-center text-[10px] text-muted-foreground">
            <div className="w-40 border-t border-dashed border-border pt-2">
              <p>Customer Signature</p>
            </div>
            <div className="w-40 border-t border-dashed border-border pt-2">
              <p>Manager Authorized Signature</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
