import React, { useState, useEffect } from "react";
import axios from "axios";
import { useStore } from "../store/useStore";
import {
  BarChart3,
  Calendar,
  Layers,
  Users,
  Wrench,
  Shield,
  ArrowLeft,
  FileText,
  FileSpreadsheet,
  Download,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  DollarSign,
  Package,
  Award,
  Activity,
  Briefcase
} from "lucide-react";

interface ReportItem {
  id: string;
  name: string;
  description: string;
  icon: React.ComponentType<any>;
  category: "financial" | "inventory" | "entity" | "operations";
}

const REPORT_TYPES: ReportItem[] = [
  { id: "sales-daily", name: "Daily Sales Report", description: "Granular breakdown of transaction histories day-by-day.", icon: TrendingUp, category: "financial" },
  { id: "sales-monthly", name: "Monthly Sales Report", description: "Aggregated monthly sales volume, taxes, and discounts.", icon: Calendar, category: "financial" },
  { id: "sales-annual", name: "Annual Sales Report", description: "Macro annual review of total business collections.", icon: BarChart3, category: "financial" },
  { id: "profit-loss", name: "Profit & Loss Summary", description: "Revenue versus business expenses and net margins.", icon: DollarSign, category: "financial" },
  { id: "inventory-value", name: "Inventory Value", description: "Complete retail and cost valuation of physical stocks.", icon: Package, category: "inventory" },
  { id: "low-stock", name: "Low Stock Alerts", description: "Real-time list of products falling under threshold limits.", icon: AlertTriangle, category: "inventory" },
  { id: "best-selling", name: "Best Selling Products", description: "Top products ranked by quantity sold and revenue.", icon: Award, category: "inventory" },
  { id: "slow-moving", name: "Slow Moving Products", description: "Laggard catalog items with low turnover rates.", icon: Activity, category: "inventory" },
  { id: "brand-share", name: "Brand Sales Report", description: "Revenue split and market share by product brand.", icon: Layers, category: "entity" },
  { id: "category-share", name: "Category Sales Report", description: "Revenue split by product categories.", icon: Briefcase, category: "entity" },
  { id: "supplier-summary", name: "Supplier Purchase Report", description: "Procurement volumes and order counts per supplier.", icon: Users, category: "entity" },
  { id: "customer-summary", name: "Customer Ledger Report", description: "Sales volumes, loyalties, and unpaid credit balances.", icon: Users, category: "entity" },
  { id: "technician-performance", name: "Technician Performance", description: "Repair job resolution stats and repair revenue.", icon: Wrench, category: "operations" },
  { id: "warranty-summary", name: "Warranty Claims Report", description: "Log of active, pending, and resolved warranty cases.", icon: Shield, category: "operations" }
];

const getSummaryWidgets = (type: string, data: any[]) => {
  if (data.length === 0) return [];

  const widgets: { label: string; value: number; isCurrency: boolean }[] = [];

  // General row count
  widgets.push({ label: "Total Records", value: data.length, isCurrency: false });

  // Helper to sum a field
  const sumField = (field: string) => {
    return data.reduce((acc, row) => {
      const val = row[field];
      return acc + (typeof val === "number" ? val : 0);
    }, 0);
  };

  if (type.startsWith("sales-") || type === "sales-daily" || type === "sales-monthly" || type === "sales-annual") {
    const revenueKey = data[0].grandTotal !== undefined ? "grandTotal" : "revenue";
    widgets.push({ label: "Total Revenue", value: sumField(revenueKey), isCurrency: true });
    if (data[0].discount !== undefined) {
      widgets.push({ label: "Total Discounts", value: sumField("discount"), isCurrency: true });
    }
    if (data[0].tax !== undefined) {
      widgets.push({ label: "Total Sales Tax", value: sumField("tax"), isCurrency: true });
    }
  } else if (type === "profit-loss") {
    const revenue = data.find(r => r.reportItem && r.reportItem.includes("Revenue"))?.amount || 0;
    const expenses = data.find(r => r.reportItem && r.reportItem.includes("Expenses"))?.amount || 0;
    const net = data.find(r => r.reportItem && r.reportItem.includes("Net"))?.amount || 0;
    widgets.push({ label: "Gross Revenue", value: revenue, isCurrency: true });
    widgets.push({ label: "Total Expenses", value: expenses, isCurrency: true });
    widgets.push({ label: "Net Profit / Loss", value: net, isCurrency: true });
  } else if (type === "inventory-value") {
    widgets.push({ label: "Total Stock Qty", value: sumField("stockQty"), isCurrency: false });
    widgets.push({ label: "Total Cost Value", value: sumField("totalCostValue"), isCurrency: true });
    widgets.push({ label: "Total Retail Value", value: sumField("totalRetailValue"), isCurrency: true });
    widgets.push({ label: "Projected Profit", value: sumField("projectedProfit"), isCurrency: true });
  } else if (type === "low-stock") {
    widgets.push({ label: "Total Low Stock Items", value: data.length, isCurrency: false });
    widgets.push({ label: "Sum of Current Stock", value: sumField("currentStock"), isCurrency: false });
  } else if (type === "best-selling" || type === "slow-moving") {
    const soldKey = data[0].itemsSold !== undefined ? "itemsSold" : data[0].totalSold !== undefined ? "totalSold" : "quantitySold";
    widgets.push({ label: "Total Items Sold", value: sumField(soldKey), isCurrency: false });
    if (data[0].revenueGenerated !== undefined) {
      widgets.push({ label: "Total Revenue Generated", value: sumField("revenueGenerated"), isCurrency: true });
    }
  } else if (type === "brand-share" || type === "category-share") {
    widgets.push({ label: "Total Items Sold", value: sumField("quantitySold"), isCurrency: false });
    widgets.push({ label: "Total Sales Value", value: sumField("totalSalesValue"), isCurrency: true });
  } else if (type === "supplier-summary") {
    widgets.push({ label: "Total Orders Placed", value: sumField("ordersCount"), isCurrency: false });
    widgets.push({ label: "Total Purchases Value", value: sumField("totalPurchasedValue"), isCurrency: true });
  } else if (type === "customer-summary") {
    widgets.push({ label: "Total Purchases Value", value: sumField("totalPurchaseVolume"), isCurrency: true });
    widgets.push({ label: "Total Outstanding Credit", value: sumField("outstandingBalance"), isCurrency: true });
  } else if (type === "technician-performance") {
    widgets.push({ label: "Total Completed Repairs", value: sumField("completedCount"), isCurrency: false });
    widgets.push({ label: "Total Pending Repairs", value: sumField("pendingCount"), isCurrency: false });
    widgets.push({ label: "Total Revenue Generated", value: sumField("revenueGenerated"), isCurrency: true });
  } else if (type === "warranty-summary") {
    widgets.push({ label: "Total Claims Filed", value: data.length, isCurrency: false });
  }

  // Remove "Total Records" if there are other, more specific widgets
  if (widgets.length > 1) {
    return widgets.filter(w => w.label !== "Total Records");
  }

  return widgets;
};

export default function Reports() {
  const { addNotification } = useStore();
  const [selectedReport, setSelectedReport] = useState<ReportItem | null>(null);
  const [branches, setBranches] = useState<any[]>([]);

  // Filter parameters
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [branchId, setBranchId] = useState("");

  // Report results state
  const [reportData, setReportData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState<string | null>(null);

  useEffect(() => {
    const fetchBranches = async () => {
      try {
        const res = await axios.get("/api/auth/branches");
        setBranches(res.data);
      } catch (err) {
        console.error("Failed to load branches.");
      }
    };
    fetchBranches();
  }, []);

  const handleFetchReport = async (report: ReportItem) => {
    setLoading(true);
    try {
      const res = await axios.get(`/api/reports/query/${report.id}`, {
        params: { startDate, endDate, branchId }
      });
      setReportData(res.data);
      setSelectedReport(report);
    } catch (err: any) {
      addNotification(err.response?.data?.error || "Failed to load report data.", "warning");
    } finally {
      setLoading(false);
    }
  };

  const handleExport = async (format: "pdf" | "excel" | "csv") => {
    if (!selectedReport) return;
    setExporting(format);
    try {
      addNotification(`Generating ${format.toUpperCase()} export...`, "info");
      const res = await axios.get(`/api/reports/export/${selectedReport.id}/${format}`, {
        params: { startDate, endDate, branchId },
        responseType: "blob"
      });

      const extensions = { pdf: "pdf", excel: "xlsx", csv: "csv" };
      const contentTypes = {
        pdf: "application/pdf",
        excel: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        csv: "text/csv"
      };

      const url = window.URL.createObjectURL(new Blob([res.data], { type: contentTypes[format] }));
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", `${selectedReport.id}-report-${new Date().toISOString().split("T")[0]}.${extensions[format]}`);
      document.body.appendChild(link);
      link.click();
      link.parentNode?.removeChild(link);
      addNotification("Report exported successfully.", "success");
    } catch (err) {
      addNotification("Export failed. Please try again.", "warning");
    } finally {
      setExporting(null);
    }
  };

  // Helper to format table values beautifully
  const formatCellValue = (key: string, value: any) => {
    if (typeof value === "number") {
      const normalizedKey = key.toLowerCase();
      const isNumericNonCurrency =
        normalizedKey.includes("qty") ||
        normalizedKey.includes("count") ||
        normalizedKey.includes("stock") ||
        normalizedKey.includes("points") ||
        normalizedKey.includes("months");

      if (isNumericNonCurrency) {
        return value.toString();
      }
      return `Rs. ${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }
    return String(value);
  };

  // Format header names to readable labels
  const formatHeaderLabel = (str: string) => {
    const result = str.replace(/([A-Z])/g, " $1");
    return result.charAt(0).toUpperCase() + result.slice(1);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-black tracking-tight text-foreground flex items-center gap-2">
            <BarChart3 className="w-6 h-6 text-primary" /> Reports Dashboard
          </h2>
          <p className="text-xs text-muted-foreground">
            Monitor shop performance, compile statistics, and export auditing sheets.
          </p>
        </div>

        {/* Global Filter Bar */}
        <div className="flex flex-wrap items-center gap-3 bg-card border border-border p-3 rounded-2xl shadow-sm">
          <div className="flex items-center gap-1.5 text-xs">
            <Calendar className="w-4 h-4 text-muted-foreground" />
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="bg-secondary/40 border border-border/80 rounded-xl px-2.5 py-1.5 text-xs text-foreground focus:outline-none focus:border-primary"
              title="Start Date"
            />
            <span className="text-muted-foreground">to</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="bg-secondary/40 border border-border/80 rounded-xl px-2.5 py-1.5 text-xs text-foreground focus:outline-none focus:border-primary"
              title="End Date"
            />
          </div>

          <select
            value={branchId}
            onChange={(e) => setBranchId(e.target.value)}
            className="bg-secondary/40 border border-border/80 rounded-xl px-2.5 py-1.5 text-xs text-foreground focus:outline-none focus:border-primary"
            title="Filter by Branch"
          >
            <option value="">All Branches</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>

          {selectedReport && (
            <button
              onClick={() => handleFetchReport(selectedReport)}
              className="bg-primary hover:bg-primary/90 text-white text-xs font-bold px-3 py-1.5 rounded-xl transition cursor-pointer"
            >
              Refresh
            </button>
          )}
        </div>
      </div>

      {!selectedReport ? (
        /* Report Cards Selector */
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {REPORT_TYPES.map((report) => {
              const Icon = report.icon;
              return (
                <div
                  key={report.id}
                  onClick={() => handleFetchReport(report)}
                  className="group bg-card border border-border/70 hover:border-primary/50 hover:shadow-lg p-5 rounded-2xl transition cursor-pointer relative overflow-hidden flex flex-col justify-between"
                >
                  <div className="absolute top-0 right-0 w-24 h-24 bg-primary/5 rounded-full translate-x-8 -translate-y-8 group-hover:scale-125 transition duration-300" />
                  <div className="space-y-3">
                    <div className="bg-primary/10 text-primary w-10 h-10 rounded-xl flex items-center justify-center group-hover:bg-primary group-hover:text-white transition duration-300">
                      <Icon className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="font-extrabold text-sm text-foreground group-hover:text-primary transition duration-300">
                        {report.name}
                      </h4>
                      <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                        {report.description}
                      </p>
                    </div>
                  </div>
                  <span className="text-[10px] uppercase font-bold text-primary tracking-wider mt-4 inline-block">
                    Generate Report ➔
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        /* Active Report Preview & Actions */
        <div className="space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-card border border-border p-4 rounded-2xl shadow-sm">
            <div className="flex items-center gap-3">
              <button
                onClick={() => {
                  setSelectedReport(null);
                  setReportData([]);
                }}
                className="bg-secondary hover:bg-secondary/80 text-foreground p-2 rounded-xl transition cursor-pointer"
                title="Back to Selector"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
              <div>
                <h3 className="font-extrabold text-sm text-foreground flex items-center gap-1.5">
                  {selectedReport.name}
                </h3>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Date Range: {startDate || "All Time"} to {endDate || "All Time"}
                </p>
              </div>
            </div>

            {/* Export Toolbar */}
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => handleExport("pdf")}
                disabled={exporting !== null || reportData.length === 0}
                className="bg-red-500/10 hover:bg-red-500/20 text-red-500 border border-red-500/30 text-xs font-bold px-3 py-2 rounded-xl transition flex items-center gap-1.5 cursor-pointer disabled:opacity-40"
              >
                <FileText className="w-4 h-4" />
                {exporting === "pdf" ? "Exporting..." : "PDF"}
              </button>
              <button
                onClick={() => handleExport("excel")}
                disabled={exporting !== null || reportData.length === 0}
                className="bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-600 border border-emerald-500/30 text-xs font-bold px-3 py-2 rounded-xl transition flex items-center gap-1.5 cursor-pointer disabled:opacity-40"
              >
                <FileSpreadsheet className="w-4 h-4" />
                {exporting === "excel" ? "Exporting..." : "Excel"}
              </button>
              <button
                onClick={() => handleExport("csv")}
                disabled={exporting !== null || reportData.length === 0}
                className="bg-blue-500/10 hover:bg-blue-500/20 text-blue-600 border border-blue-500/30 text-xs font-bold px-3 py-2 rounded-xl transition flex items-center gap-1.5 cursor-pointer disabled:opacity-40"
              >
                <Download className="w-4 h-4" />
                {exporting === "csv" ? "Exporting..." : "CSV"}
              </button>
          </div>
        </div>

        {/* Summary Widgets Row */}
        {!loading && reportData.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {getSummaryWidgets(selectedReport.id, reportData).map((widget, i) => (
              <div key={i} className="bg-card border border-border/80 p-4 rounded-2xl shadow-sm space-y-1.5 relative overflow-hidden">
                <div className="absolute top-0 inset-x-0 h-[2px] bg-primary" />
                <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest">{widget.label}</p>
                <p className="text-base font-extrabold text-foreground">
                  {widget.isCurrency 
                    ? `Rs. ${widget.value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                    : widget.value.toLocaleString()}
                </p>
              </div>
            ))}
          </div>
        )}

        {/* Interactive Data Table Preview */}
          <div className="bg-card border border-border rounded-2xl shadow-sm overflow-hidden">
            {loading ? (
              <div className="p-12 text-center text-muted-foreground text-xs">
                Compiling database aggregates, please wait...
              </div>
            ) : reportData.length === 0 ? (
              <div className="p-12 text-center text-muted-foreground text-xs">
                No matching records found for the selected date range and branch filters.
              </div>
            ) : (
              <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
                <table className="w-full text-xs text-left border-collapse">
                  <thead className="bg-secondary/40 border-b border-border sticky top-0 backdrop-blur z-10">
                    <tr className="text-muted-foreground font-bold uppercase text-[9px] tracking-wider">
                      {Object.keys(reportData[0]).map((key) => (
                        <th key={key} className="py-3 px-4">
                          {formatHeaderLabel(key)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60">
                    {reportData.map((row, i) => (
                      <tr key={i} className="hover:bg-secondary/10 transition">
                        {Object.entries(row).map(([key, val], j) => (
                          <td key={j} className="py-3 px-4 font-medium text-foreground">
                            {formatCellValue(key, val)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
