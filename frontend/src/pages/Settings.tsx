import React, { useState, useEffect } from "react";
import axios from "axios";
import { useStore } from "../store/useStore";
import {
  Settings as SettingsIcon,
  Store,
  MapPin,
  Phone,
  Plus,
  Edit2,
  Trash2,
  X,
  Info,
  ShieldAlert,
  Download,
  Percent,
  Building2,
  Database,
  ToggleLeft,
  ToggleRight,
  RotateCcw,
  Upload,
  CheckCircle2,
  Clock,
  HardDrive,
  ChevronRight,
  AlertTriangle,
  RefreshCw,
} from "lucide-react";

type TabId = "shops" | "tax" | "backup" | "danger";

const TABS: { id: TabId; label: string; icon: React.ReactNode; accent: string }[] = [
  { id: "shops",  label: "Shop Branches", icon: <Building2 className="w-4 h-4" />, accent: "text-primary" },
  { id: "tax",    label: "GST / Tax",     icon: <Percent className="w-4 h-4" />,   accent: "text-emerald-500" },
  { id: "backup", label: "Backup & Restore", icon: <Database className="w-4 h-4" />, accent: "text-blue-500" },
  { id: "danger", label: "Danger Zone",   icon: <ShieldAlert className="w-4 h-4" />, accent: "text-red-400" },
];

export default function Settings() {
  const { addNotification, gstEnabled, gstRate, setGstSettings } = useStore();
  const [activeTab, setActiveTab] = useState<TabId>("shops");

  // ─── GST State ────────────────────────────────────────────────────────────
  const [gstEnabledLocal, setGstEnabledLocal] = useState(gstEnabled);
  const [gstRateLocal, setGstRateLocal] = useState(gstRate > 0 ? gstRate.toString() : "");
  const [savingGst, setSavingGst] = useState(false);

  // ─── Branches State ───────────────────────────────────────────────────────
  const [branches, setBranches] = useState<any[]>([]);
  const [addOpen, setAddOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [newBranch, setNewBranch] = useState({ name: "", address: "", phone: "" });
  const [selectedBranchId, setSelectedBranchId] = useState("");
  const [editBranch, setEditBranch] = useState({ name: "", address: "", phone: "" });

  // ─── Backup State ─────────────────────────────────────────────────────────
  const [backups, setBackups] = useState<any[]>([]);
  const [importing, setImporting] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  // ─── Danger Zone State ────────────────────────────────────────────────────
  const [resetting, setResetting] = useState(false);

  // ─── Load ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    loadBranches();
    loadBackups();
  }, []);

  const loadBranches = async () => {
    try {
      const res = await axios.get("/api/auth/branches");
      setBranches(res.data);
    } catch {
      addNotification("Failed to load branches.", "warning");
    }
  };

  const loadBackups = async () => {
    try {
      const res = await axios.get("/api/auth/backup/list");
      setBackups(res.data);
    } catch { /* silent */ }
  };

  // ─── GST ──────────────────────────────────────────────────────────────────
  const handleSaveGst = async () => {
    const rate = parseFloat(gstRateLocal);
    if (gstEnabledLocal && (isNaN(rate) || rate < 0 || rate > 100)) {
      addNotification("Enter a valid tax rate between 0 and 100.", "warning");
      return;
    }
    setSavingGst(true);
    try {
      const res = await axios.put("/api/settings", {
        settings: {
          gstEnabled: String(gstEnabledLocal),
          gstRate: String(gstEnabledLocal ? rate : 0),
        },
      });
      console.log("GST settings saved:", res.data);
      setGstSettings(gstEnabledLocal, gstEnabledLocal ? rate : 0);
      addNotification("Tax settings saved successfully.", "success");
    } catch (err: any) {
      console.error("GST settings error:", err.response?.data || err.message);
      addNotification(err.response?.data?.error || "Failed to save settings.", "warning");
    } finally {
      setSavingGst(false);
    }
  };

  // ─── Branches ─────────────────────────────────────────────────────────────
  const handleAddBranch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newBranch.name) return addNotification("Shop name is required.", "warning");
    try {
      await axios.post("/api/auth/branches", newBranch);
      addNotification("New shop branch created.", "success");
      setAddOpen(false);
      setNewBranch({ name: "", address: "", phone: "" });
      loadBranches();
    } catch (err: any) {
      addNotification(err.response?.data?.error || "Failed to create branch.", "warning");
    }
  };

  const handleOpenEdit = (b: any) => {
    setSelectedBranchId(b.id);
    setEditBranch({ name: b.name || "", address: b.address || "", phone: b.phone || "" });
    setEditOpen(true);
  };

  const handleEditBranch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editBranch.name) return addNotification("Shop name is required.", "warning");
    try {
      await axios.put(`/api/auth/branches/${selectedBranchId}`, editBranch);
      addNotification("Shop details updated.", "success");
      setEditOpen(false);
      loadBranches();
    } catch (err: any) {
      addNotification(err.response?.data?.error || "Failed to update branch.", "warning");
    }
  };

  const handleDeleteBranch = async (id: string, name: string) => {
    if (!window.confirm(`Delete "${name}"? All stock records for this branch will be removed.`)) return;
    try {
      await axios.delete(`/api/auth/branches/${id}`);
      addNotification("Shop deleted.", "success");
      loadBranches();
    } catch (err: any) {
      addNotification(err.response?.data?.error || "Failed to delete branch.", "warning");
    }
  };

  // ─── Backup ───────────────────────────────────────────────────────────────
  const handleExportBackup = async () => {
    try {
      addNotification("Preparing backup package…", "info");
      const res = await axios.get("/api/auth/backup/export", { responseType: "blob" });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", `pos-backup-${new Date().toISOString().split("T")[0]}.zip`);
      document.body.appendChild(link);
      link.click();
      link.parentNode?.removeChild(link);
      addNotification("Backup downloaded successfully.", "success");
    } catch {
      addNotification("Failed to export backup.", "warning");
    }
  };

  const handleImportBackup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile) return addNotification("Select a backup file first.", "warning");
    if (!window.confirm("WARNING: Restoring from backup will overwrite all current data. This cannot be undone. Continue?")) return;
    const formData = new FormData();
    formData.append("backup", selectedFile);
    setImporting(true);
    try {
      const res = await axios.post("/api/auth/backup/import", formData, { headers: { "Content-Type": "multipart/form-data" } });
      addNotification(res.data.message || "Data restored from backup.", "success");
      setSelectedFile(null);
      setTimeout(() => window.location.reload(), 1500);
    } catch (err: any) {
      addNotification(err.response?.data?.error || "Failed to restore backup.", "warning");
    } finally {
      setImporting(false);
    }
  };

  const handleDownloadBackup = async (filename: string) => {
    try {
      const res = await axios.get(`/api/auth/backup/download/${filename}`, { responseType: "blob" });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", filename);
      document.body.appendChild(link);
      link.click();
      link.parentNode?.removeChild(link);
      addNotification("Backup downloaded.", "success");
    } catch { addNotification("Failed to download backup.", "warning"); }
  };

  const handleRestoreBackup = async (filename: string) => {
    if (!window.confirm(`Restore system to backup "${filename}"?\n\nThis will overwrite all current data.`)) return;
    addNotification("Restoring system data…", "info");
    try {
      const res = await axios.post(`/api/auth/backup/restore/${filename}`);
      addNotification(res.data.message || "System data restored.", "success");
      setTimeout(() => window.location.reload(), 1500);
    } catch (err: any) {
      addNotification(err.response?.data?.error || "Failed to restore.", "warning");
    }
  };

  const handleDeleteBackup = async (filename: string) => {
    if (!window.confirm(`Delete backup file "${filename}"?`)) return;
    try {
      await axios.delete(`/api/auth/backup/delete/${filename}`);
      addNotification("Backup file deleted.", "success");
      loadBackups();
    } catch (err: any) {
      addNotification(err.response?.data?.error || "Failed to delete backup.", "warning");
    }
  };

  // ─── Danger ───────────────────────────────────────────────────────────────
  const handleResetTransactions = async () => {
    if (!window.confirm("WARNING: This will permanently delete all sales, transactions, invoices, installments, expenses, and log history.\n\nMaster records (products, customers, staff, etc.) will be preserved.\n\nThis CANNOT be undone. Proceed?")) return;
    const keyword = window.prompt("Type the word RESET to confirm:");
    if (keyword !== "RESET") { addNotification("Reset cancelled.", "warning"); return; }
    setResetting(true);
    try {
      const res = await axios.post("/api/auth/reset-transactions");
      addNotification(res.data.message || "Transactions cleared.", "success");
      setTimeout(() => window.location.reload(), 1500);
    } catch (err: any) {
      addNotification(err.response?.data?.error || "Failed to clear data.", "warning");
    } finally {
      setResetting(false);
    }
  };

  // ─── Helper: field ────────────────────────────────────────────────────────
  const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
    <div className="space-y-1.5">
      <label className="block text-[10px] font-bold text-muted-foreground uppercase tracking-widest">{label}</label>
      {children}
    </div>
  );

  const inputCls = "w-full bg-secondary border border-border px-3 py-2.5 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-primary/30 transition";

  // ─── Modal ────────────────────────────────────────────────────────────────
  const Modal = ({ title, onClose, onSubmit, children, submitLabel = "Save" }: {
    title: string; onClose: () => void; onSubmit: (e: React.FormEvent) => void;
    children: React.ReactNode; submitLabel?: string;
  }) => (
    <div className="fixed inset-0 flex items-center justify-center bg-black/70 backdrop-blur-sm z-50 px-4">
      <div className="bg-card border border-border w-full max-w-sm rounded-2xl shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h3 className="font-extrabold text-sm text-foreground">{title}</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition">
            <X className="w-4 h-4" />
          </button>
        </div>
        <form onSubmit={onSubmit} className="p-6 space-y-4">
          {children}
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose}
              className="flex-1 px-4 py-2.5 border border-border text-xs font-semibold rounded-xl hover:bg-secondary transition">
              Cancel
            </button>
            <button type="submit"
              className="flex-1 px-4 py-2.5 bg-primary text-white text-xs font-bold rounded-xl hover:bg-primary/95 transition">
              {submitLabel}
            </button>
          </div>
        </form>
      </div>
    </div>
  );

  // ─── Tab content renderers ────────────────────────────────────────────────
  const renderShops = () => (
    <div className="space-y-5">
      {/* info banner */}
      <div className="flex gap-3 bg-primary/5 border border-primary/20 rounded-2xl p-4 text-xs text-muted-foreground">
        <Info className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
        <div>
          <span className="font-bold text-foreground">Receipt Auto-Sync: </span>
          The printed slip automatically pulls its Shop Name, Address, and Phone from the cashier's active branch.
        </div>
      </div>

      {branches.length === 0 ? (
        <div className="bg-card border border-dashed border-border rounded-2xl p-10 text-center space-y-3">
          <Building2 className="w-10 h-10 text-muted-foreground/40 mx-auto" />
          <p className="text-xs text-muted-foreground">No shop branches yet. Add your first one to get started.</p>
          <button onClick={() => setAddOpen(true)}
            className="bg-primary text-white text-xs font-bold px-4 py-2.5 rounded-xl flex items-center gap-1.5 mx-auto transition hover:bg-primary/95">
            <Plus className="w-3.5 h-3.5" /> Add First Shop
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {branches.map((b) => (
            <div key={b.id} className="group bg-card border border-border rounded-2xl p-5 space-y-4 hover:border-primary/40 hover:shadow-md transition-all">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <Store className="w-4 h-4 text-primary" />
                  </div>
                  <div>
                    <h3 className="font-extrabold text-sm text-foreground leading-tight">{b.name}</h3>
                    <p className="text-[10px] text-muted-foreground">Branch</p>
                  </div>
                </div>
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button onClick={() => handleOpenEdit(b)}
                    className="p-1.5 rounded-lg hover:bg-secondary text-muted-foreground hover:text-primary transition" title="Edit">
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={() => handleDeleteBranch(b.id, b.name)}
                    className="p-1.5 rounded-lg hover:bg-red-500/10 text-muted-foreground hover:text-red-400 transition" title="Delete">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
              <div className="space-y-2 text-xs border-t border-border/50 pt-3">
                <div className="flex items-start gap-2 text-muted-foreground">
                  <MapPin className="w-3.5 h-3.5 flex-shrink-0 mt-0.5 text-primary/60" />
                  <span className="leading-snug">{b.address || <span className="italic opacity-50">No address set</span>}</span>
                </div>
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Phone className="w-3.5 h-3.5 flex-shrink-0 text-primary/60" />
                  <span>{b.phone || <span className="italic opacity-50">No phone set</span>}</span>
                </div>
              </div>
            </div>
          ))}

          {/* Add new card */}
          <button onClick={() => setAddOpen(true)}
            className="group border-2 border-dashed border-border hover:border-primary/40 rounded-2xl p-5 flex flex-col items-center justify-center gap-2 text-muted-foreground hover:text-primary transition-all min-h-[140px]">
            <div className="w-9 h-9 rounded-xl bg-secondary group-hover:bg-primary/10 flex items-center justify-center transition-colors">
              <Plus className="w-4 h-4" />
            </div>
            <span className="text-xs font-bold">Add New Shop</span>
          </button>
        </div>
      )}
    </div>
  );

  const renderTax = () => (
    <div className="max-w-xl space-y-6">
      {/* Toggle row */}
      <div className="bg-card border border-border rounded-2xl overflow-hidden">
        <div className="flex items-center justify-between p-5">
          <div className="space-y-0.5">
            <h3 className="font-extrabold text-sm text-foreground">Global GST / Tax</h3>
            <p className="text-xs text-muted-foreground leading-relaxed">
              When enabled, this rate is applied to all products that don't have a product-specific tax set.
            </p>
          </div>
          {/* Toggle */}
          <button
            type="button"
            onClick={() => setGstEnabledLocal(!gstEnabledLocal)}
            className="flex-shrink-0 ml-4"
            title={gstEnabledLocal ? "Disable Tax" : "Enable Tax"}
          >
            {gstEnabledLocal
              ? <ToggleRight className="w-10 h-10 text-emerald-500 transition-all" />
              : <ToggleLeft className="w-10 h-10 text-muted-foreground/40 transition-all" />}
          </button>
        </div>

        {/* Status badge */}
        <div className={`px-5 py-2.5 text-[10px] font-bold uppercase tracking-widest flex items-center gap-2 transition-colors ${
          gstEnabledLocal
            ? "bg-emerald-500/10 text-emerald-500 border-t border-emerald-500/20"
            : "bg-secondary/60 text-muted-foreground border-t border-border/50"
        }`}>
          <span className={`w-1.5 h-1.5 rounded-full ${gstEnabledLocal ? "bg-emerald-500" : "bg-muted-foreground/40"}`} />
          {gstEnabledLocal ? "Tax collection active" : "Tax collection disabled"}
        </div>

        {/* Rate input — only when enabled */}
        {gstEnabledLocal && (
          <div className="p-5 border-t border-border/50 space-y-4">
            <div className="space-y-1.5">
              <label className="block text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
                Tax Rate (%)
              </label>
              <div className="flex items-center gap-3">
                <div className="relative flex-1 max-w-[160px]">
                  <input
                    type="number"
                    value={gstRateLocal}
                    onChange={(e) => setGstRateLocal(e.target.value)}
                    min="0"
                    max="100"
                    step="0.5"
                    placeholder="e.g. 5"
                    className="w-full bg-secondary border border-border px-3 py-2.5 pr-8 rounded-xl text-sm font-bold focus:outline-none focus:ring-2 focus:ring-emerald-500/30 transition"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground font-bold">%</span>
                </div>
                {gstRateLocal && (
                  <div className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 text-xs font-extrabold px-3 py-2.5 rounded-xl">
                    Rs. 100 → Rs. {(100 * (1 + parseFloat(gstRateLocal || "0") / 100)).toFixed(2)}
                  </div>
                )}
              </div>
              <p className="text-[10px] text-muted-foreground">Enter a value between 0 and 100.</p>
            </div>
          </div>
        )}
      </div>

      {/* How it works */}
      <div className="bg-card border border-border/60 rounded-2xl p-5 space-y-3">
        <h4 className="text-xs font-extrabold text-foreground flex items-center gap-2">
          <Info className="w-3.5 h-3.5 text-primary" /> How Tax Works in This System
        </h4>
        <ul className="text-xs text-muted-foreground space-y-2">
          {[
            "Each product can have its own tax rate set in the Inventory page.",
            "This GST rate is the only tax rate used in POS sales and receipts.",
            "If a product has a specific tax rate (e.g. 10%), it always takes priority over the global rate.",
            "The final tax amount is shown on the POS cart and printed on every receipt.",
          ].map((t, i) => (
            <li key={i} className="flex items-start gap-2">
              <ChevronRight className="w-3.5 h-3.5 flex-shrink-0 mt-0.5 text-primary/60" />
              {t}
            </li>
          ))}
        </ul>
      </div>

      <button
        onClick={handleSaveGst}
        disabled={savingGst}
        className="w-full sm:w-auto bg-emerald-600 hover:bg-emerald-600/90 text-white text-xs font-bold px-6 py-3 rounded-xl flex items-center justify-center gap-2 transition disabled:opacity-50"
      >
        <CheckCircle2 className="w-4 h-4" />
        {savingGst ? "Saving…" : "Save Tax Settings"}
      </button>
    </div>
  );

  const renderBackup = () => (
    <div className="space-y-6">
      {/* Export + Import grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* Export */}
        <div className="bg-card border border-border rounded-2xl p-6 space-y-4 relative overflow-hidden">
          <div className="absolute top-0 inset-x-0 h-[2px] bg-gradient-to-r from-blue-500 to-indigo-500" />
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-blue-500/10 flex items-center justify-center flex-shrink-0">
              <Download className="w-4 h-4 text-blue-500" />
            </div>
            <div>
              <h3 className="font-extrabold text-sm text-foreground">Export Backup</h3>
              <p className="text-[10px] text-muted-foreground">Download full system archive</p>
            </div>
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Downloads a ZIP containing the SQLite database and all uploaded files (documents, receipts, warranty records).
          </p>
          <button onClick={handleExportBackup}
            className="w-full bg-blue-600 hover:bg-blue-600/90 text-white text-xs font-bold px-4 py-2.5 rounded-xl flex items-center justify-center gap-1.5 transition">
            <Download className="w-3.5 h-3.5" /> Download Backup ZIP
          </button>
        </div>

        {/* Import */}
        <div className="bg-card border border-border rounded-2xl p-6 space-y-4 relative overflow-hidden">
          <div className="absolute top-0 inset-x-0 h-[2px] bg-gradient-to-r from-amber-500 to-orange-500" />
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-amber-500/10 flex items-center justify-center flex-shrink-0">
              <Upload className="w-4 h-4 text-amber-500" />
            </div>
            <div>
              <h3 className="font-extrabold text-sm text-foreground">Restore Backup</h3>
              <p className="text-[10px] text-muted-foreground">Upload & restore from ZIP</p>
            </div>
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Select a previously exported <code className="font-mono bg-secondary px-1 rounded">.zip</code> file. This <strong>overwrites</strong> all current data.
          </p>
          <form onSubmit={handleImportBackup} className="space-y-3">
            <div className="border-2 border-dashed border-border hover:border-amber-500/40 rounded-xl p-3 text-center transition-colors cursor-pointer">
              <input
                type="file"
                accept=".zip"
                onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                className="hidden"
                id="backup-file-input"
              />
              <label htmlFor="backup-file-input" className="cursor-pointer block">
                {selectedFile ? (
                  <span className="text-xs font-bold text-amber-500">{selectedFile.name}</span>
                ) : (
                  <span className="text-xs text-muted-foreground">Click to select .zip file</span>
                )}
              </label>
            </div>
            <button type="submit" disabled={importing || !selectedFile}
              className="w-full bg-amber-500/10 border border-amber-500/30 hover:bg-amber-500/20 text-amber-500 text-xs font-bold px-4 py-2.5 rounded-xl transition disabled:opacity-40">
              {importing ? "Restoring…" : "Upload & Restore"}
            </button>
          </form>
        </div>
      </div>

      {/* Automatic Backups list */}
      <div className="bg-card border border-border rounded-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-primary" />
            <h3 className="font-extrabold text-sm text-foreground">Automatic Backups</h3>
            <span className="text-[10px] bg-secondary border border-border px-2 py-0.5 rounded-lg text-muted-foreground font-semibold">Every 7 Days</span>
          </div>
          <span className="text-[10px] text-muted-foreground">Keeps last 5</span>
        </div>

        {backups.length === 0 ? (
          <div className="p-10 text-center space-y-2">
            <HardDrive className="w-8 h-8 text-muted-foreground/30 mx-auto" />
            <p className="text-xs text-muted-foreground">No automatic backups generated yet.</p>
            <p className="text-[10px] text-muted-foreground opacity-60">They are created every 7 days automatically.</p>
          </div>
        ) : (
          <div className="divide-y divide-border/50">
            {backups.map((bk) => (
              <div key={bk.filename} className="flex items-center justify-between px-5 py-3.5 hover:bg-secondary/30 transition">
                <div className="flex items-center gap-3 min-w-0">
                  <HardDrive className="w-4 h-4 text-primary/60 flex-shrink-0" />
                  <div className="min-w-0">
                    <p className="text-xs font-mono font-bold text-foreground truncate">{bk.filename}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {new Date(bk.createdAt).toLocaleString()} · {(bk.size / (1024 * 1024)).toFixed(2)} MB
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3 text-[11px] font-bold flex-shrink-0 ml-4">
                  <button onClick={() => handleDownloadBackup(bk.filename)}
                    className="text-primary hover:underline transition">Download</button>
                  <button onClick={() => handleRestoreBackup(bk.filename)}
                    className="text-amber-400 hover:underline transition">Restore</button>
                  <button onClick={() => handleDeleteBackup(bk.filename)}
                    className="text-red-400 hover:underline transition">Delete</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );

  const renderDanger = () => (
    <div className="max-w-2xl space-y-5">
      <div className="flex gap-3 bg-red-500/5 border border-red-500/20 rounded-2xl p-4 text-xs text-muted-foreground">
        <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
        <div>
          <span className="font-bold text-red-400">Irreversible actions ahead. </span>
          These operations permanently delete data and cannot be undone. Proceed with extreme caution.
        </div>
      </div>

      <div className="bg-card border border-red-500/20 rounded-2xl overflow-hidden relative">
        <div className="absolute top-0 inset-x-0 h-[2px] bg-red-500/40" />
        <div className="p-6 space-y-4">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl bg-red-500/10 flex items-center justify-center flex-shrink-0 mt-0.5">
              <RotateCcw className="w-4 h-4 text-red-400" />
            </div>
            <div className="space-y-1">
              <h3 className="font-extrabold text-sm text-foreground">Clear Sales & Transaction Data</h3>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Permanently deletes all sales histories, transactions, EMIs/installments, expenses, warranty claims, and purchase orders.
              </p>
              <div className="flex flex-wrap gap-2 pt-1">
                {["Sales Records", "Invoices", "Installments", "Expenses", "Warranty Claims", "Purchase Orders"].map((item) => (
                  <span key={item} className="text-[10px] bg-red-500/10 text-red-400 border border-red-500/20 px-2 py-0.5 rounded-lg font-semibold">{item}</span>
                ))}
              </div>
              <p className="text-[10px] text-muted-foreground pt-1">
                <strong className="text-foreground">Preserved:</strong> Products, Categories, Brands, Customers, Suppliers, Staff, and Shop Branches.
              </p>
            </div>
          </div>
          <div className="border-t border-red-500/10 pt-4">
            <button
              onClick={handleResetTransactions}
              disabled={resetting}
              className="bg-red-500/10 border border-red-500/30 hover:bg-red-500/20 hover:border-red-500/50 text-red-400 text-xs font-bold px-5 py-3 rounded-xl transition flex items-center gap-2 disabled:opacity-50"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              {resetting ? "Clearing Data…" : "Clear All Transaction Data"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex-1 space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="space-y-1">
          <h1 className="text-xl font-black text-foreground tracking-tight flex items-center gap-2">
            <SettingsIcon className="w-5 h-5 text-primary" /> Settings
          </h1>
          <p className="text-xs text-muted-foreground">Manage your shop, tax rules, backups, and system configuration.</p>
        </div>
        <button
          onClick={() => { loadBranches(); loadBackups(); }}
          className="border border-border bg-secondary hover:bg-secondary/80 text-foreground text-xs font-bold px-3 py-2.5 rounded-xl flex items-center gap-1.5 transition"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {/* Tab Bar */}
      <div className="flex gap-1 bg-card border border-border p-1.5 rounded-2xl w-fit">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
              activeTab === tab.id
                ? "bg-primary text-white shadow-sm"
                : "text-muted-foreground hover:text-foreground hover:bg-secondary/60"
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === "shops"  && renderShops()}
      {activeTab === "tax"    && renderTax()}
      {activeTab === "backup" && renderBackup()}
      {activeTab === "danger" && renderDanger()}

      {/* Add Shop Modal */}
      {addOpen && (
        <Modal title="Add New Shop Branch" onClose={() => setAddOpen(false)} onSubmit={handleAddBranch} submitLabel="Create Shop">
          <Field label="Shop Name *">
            <input required type="text" value={newBranch.name}
              onChange={(e) => setNewBranch({ ...newBranch, name: e.target.value })}
              placeholder="e.g. Central City Electronics" className={inputCls} />
          </Field>
          <Field label="Street Address">
            <input type="text" value={newBranch.address}
              onChange={(e) => setNewBranch({ ...newBranch, address: e.target.value })}
              placeholder="e.g. Shop 45, Hall Road, Lahore" className={inputCls} />
          </Field>
          <Field label="Phone Number">
            <input type="text" value={newBranch.phone}
              onChange={(e) => setNewBranch({ ...newBranch, phone: e.target.value })}
              placeholder="e.g. 0300-1234567" className={inputCls} />
          </Field>
        </Modal>
      )}

      {/* Edit Shop Modal */}
      {editOpen && (
        <Modal title="Edit Shop Details" onClose={() => setEditOpen(false)} onSubmit={handleEditBranch} submitLabel="Save Changes">
          <Field label="Shop Name *">
            <input required type="text" value={editBranch.name}
              onChange={(e) => setEditBranch({ ...editBranch, name: e.target.value })}
              className={inputCls} />
          </Field>
          <Field label="Street Address">
            <input type="text" value={editBranch.address}
              onChange={(e) => setEditBranch({ ...editBranch, address: e.target.value })}
              className={inputCls} />
          </Field>
          <Field label="Phone Number">
            <input type="text" value={editBranch.phone}
              onChange={(e) => setEditBranch({ ...editBranch, phone: e.target.value })}
              className={inputCls} />
          </Field>
        </Modal>
      )}
    </div>
  );
}
