import React, { useState, useEffect } from "react";
import axios from "axios";
import { useStore } from "../store/useStore";
import PortalModal from "../components/PortalModal";
import {
  Store,
  MapPin,
  Phone,
  Plus,
  Edit2,
  Trash2,
  X,
  Info,
  Download,
  Building2,
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
  Users,
  UserPlus,
  Shield,
} from "lucide-react";

type TabId = "shops" | "staff" | "tax" | "backup" | "danger";

const TABS: { id: TabId; label: string; iconSrc: string; accent: string }[] = [
  { id: "shops",  label: "Shop Branches", iconSrc: "/icons/settings/shops.png", accent: "text-primary" },
  { id: "staff",  label: "Staff",         iconSrc: "/icons/settings/gear.png", accent: "text-indigo-500" },
  { id: "tax",    label: "GST / Tax",     iconSrc: "/icons/settings/tax.png", accent: "text-emerald-500" },
  { id: "backup", label: "Backup & Restore", iconSrc: "/icons/settings/backup.png", accent: "text-blue-500" },
  { id: "danger", label: "Danger Zone",   iconSrc: "/icons/settings/danger.png", accent: "text-red-400" },
];

export default function Settings() {
  const { addNotification, gstEnabled, gstRate, setGstSettings, setBranches: setStoreBranches, user } = useStore();
  const [activeTab, setActiveTab] = useState<TabId>("shops");
  const isOwner = user?.role === "OWNER" || user?.role === "SUPER_ADMIN";
  const isReadOnly = user?.role === "SUPER_ADMIN";

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
  const [exporting, setExporting] = useState(false);
  const [creatingBackup, setCreatingBackup] = useState(false);
  const [restoringName, setRestoringName] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const parseApiError = async (err: any, fallback: string) => {
    const data = err?.response?.data;
    if (!data) return fallback;
    if (typeof data === "string") return data;
    if (data.error) return data.error;
    if (data instanceof Blob) {
      try {
        const text = await data.text();
        const json = JSON.parse(text);
        return json.error || fallback;
      } catch {
        return fallback;
      }
    }
    return fallback;
  };

  // ─── Danger Zone State ────────────────────────────────────────────────────
  const CLEAR_OPTIONS = [
    { key: "sales_records", label: "Sales Records" },
    { key: "invoices", label: "Invoices" },
    { key: "installments", label: "Installments" },
    { key: "expenses", label: "Expenses" },
    { key: "warranty_claims", label: "Warranty Claims" },
    { key: "purchase_orders", label: "Purchase Orders" },
  ] as const;
  const PRESERVED_OPTIONS = [
    { key: "products", label: "Products" },
    { key: "categories", label: "Categories" },
    { key: "brands", label: "Brands" },
    { key: "customers", label: "Customers" },
    { key: "suppliers", label: "Suppliers" },
    { key: "staff", label: "Staff" },
    { key: "branches", label: "Shop Branches" },
  ] as const;
  const ALL_OPTIONS = [...CLEAR_OPTIONS, ...PRESERVED_OPTIONS];
  const [selectedTypes, setSelectedTypes] = useState<Record<string, boolean>>(
    Object.fromEntries(ALL_OPTIONS.map((o) => [o.key, false]))
  );
  const [resetting, setResetting] = useState(false);
  const [dataCounts, setDataCounts] = useState<Record<string, number>>({});
  const [loadingCounts, setLoadingCounts] = useState(false);

  // ─── Staff State ──────────────────────────────────────────────────────────
  const [staff, setStaff] = useState<any[]>([]);
  const [staffLoading, setStaffLoading] = useState(false);
  const [staffModalOpen, setStaffModalOpen] = useState(false);
  const [savingStaff, setSavingStaff] = useState(false);
  const [showStaffPassword, setShowStaffPassword] = useState(false);
  const [newStaff, setNewStaff] = useState({
    name: "",
    email: "",
    password: "",
    role: "CASHIER" as "CASHIER" | "TECHNICIAN",
    phone: "",
    branchId: ""
  });

  // ─── Load ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    loadBranches();
    loadBackups();
    if (isOwner) loadStaff();
  }, [isOwner]);

  const loadBranches = async () => {
    try {
      const res = await axios.get("/api/auth/branches");
      const list = Array.isArray(res.data) ? res.data : [];
      setBranches(list);
      setStoreBranches(list);
    } catch {
      addNotification("Failed to load branches.", "warning");
    }
  };

  const loadStaff = async () => {
    setStaffLoading(true);
    try {
      const res = await axios.get("/api/auth/users");
      setStaff(Array.isArray(res.data) ? res.data : []);
    } catch {
      addNotification("Failed to load staff list.", "warning");
      setStaff([]);
    } finally {
      setStaffLoading(false);
    }
  };

  const handleCreateStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isReadOnly) {
      addNotification("Action failed: Super Admin has read-only access.", "warning");
      return;
    }
    if (!newStaff.name.trim() || !newStaff.email.trim() || !newStaff.password) {
      addNotification("Name, email, and password are required.", "warning");
      return;
    }
    setSavingStaff(true);
    try {
      await axios.post("/api/auth/users", {
        name: newStaff.name.trim(),
        email: newStaff.email.trim(),
        password: newStaff.password,
        role: newStaff.role,
        phone: newStaff.phone.trim() || undefined,
        branchId: newStaff.branchId || undefined
      });
      addNotification(`${newStaff.role === "TECHNICIAN" ? "Technician" : "Cashier"} created.`, "success");
      setStaffModalOpen(false);
      setNewStaff({ name: "", email: "", password: "", role: "CASHIER", phone: "", branchId: "" });
      loadStaff();
    } catch (err: any) {
      addNotification(err.response?.data?.error || "Failed to create staff.", "warning");
    } finally {
      setSavingStaff(false);
    }
  };

  const handleToggleStaff = async (u: any) => {
    if (isReadOnly) {
      addNotification("Action failed: Super Admin has read-only access.", "warning");
      return;
    }
    if (u.role === "OWNER") {
      addNotification("Cannot deactivate an owner from here.", "warning");
      return;
    }
    try {
      await axios.delete(`/api/auth/users/${u.id}`);
      addNotification(
        u.isActive ? `${u.name} deactivated.` : `${u.name} activated.`,
        "success"
      );
      loadStaff();
    } catch (err: any) {
      addNotification(err.response?.data?.error || "Failed to update staff status.", "warning");
    }
  };

  const loadBackups = async () => {
    try {
      const res = await axios.get("/api/auth/backup/list");
      setBackups(Array.isArray(res.data) ? res.data : []);
    } catch {
      addNotification("Failed to load backup list.", "warning");
    }
  };

  // ─── GST ──────────────────────────────────────────────────────────────────
  const handleSaveGst = async () => {
    if (isReadOnly) {
      addNotification("Action failed: Super Admin has read-only access.", "warning");
      return;
    }
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
    if (isReadOnly) {
      addNotification("Action failed: Super Admin has read-only access.", "warning");
      return;
    }
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
    if (isReadOnly) {
      addNotification("Action failed: Super Admin has read-only access.", "warning");
      return;
    }
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
    if (isReadOnly) {
      addNotification("Action failed: Super Admin has read-only access.", "warning");
      return;
    }
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
    setExporting(true);
    try {
      addNotification("Preparing backup package…", "info");
      const res = await axios.get("/api/auth/backup/export", { responseType: "blob" });
      // Guard against error JSON returned as blob
      if (res.data?.type === "application/json") {
        const text = await res.data.text();
        const json = JSON.parse(text);
        throw new Error(json.error || "Export failed");
      }
      const url = window.URL.createObjectURL(new Blob([res.data], { type: "application/zip" }));
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", `pos-backup-${new Date().toISOString().split("T")[0]}.zip`);
      document.body.appendChild(link);
      link.click();
      link.parentNode?.removeChild(link);
      window.URL.revokeObjectURL(url);
      addNotification("Backup downloaded successfully.", "success");
    } catch (err: any) {
      addNotification(err.message || (await parseApiError(err, "Failed to export backup.")), "warning");
    } finally {
      setExporting(false);
    }
  };

  const handleCreateServerBackup = async () => {
    if (isReadOnly) {
      addNotification("Action failed: Super Admin has read-only access.", "warning");
      return;
    }
    setCreatingBackup(true);
    try {
      const res = await axios.post("/api/auth/backup/create");
      addNotification(res.data.message || "Server backup created.", "success");
      loadBackups();
    } catch (err: any) {
      addNotification(await parseApiError(err, "Failed to create backup."), "warning");
    } finally {
      setCreatingBackup(false);
    }
  };

  const handleImportBackup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isReadOnly) {
      addNotification("Action failed: Super Admin has read-only access.", "warning");
      return;
    }
    if (!selectedFile) return addNotification("Select a backup file first.", "warning");
    if (
      !window.confirm(
        "WARNING: Restoring from backup will overwrite all current data. This cannot be undone. Continue?"
      )
    )
      return;
    const formData = new FormData();
    formData.append("backup", selectedFile);
    setImporting(true);
    try {
      const res = await axios.post("/api/auth/backup/import", formData, {
        headers: { "Content-Type": "multipart/form-data" },
        timeout: 120000
      });
      addNotification(res.data.message || "Data restored from backup.", "success");
      setSelectedFile(null);
      setTimeout(() => window.location.reload(), 1500);
    } catch (err: any) {
      addNotification(await parseApiError(err, "Failed to restore backup."), "warning");
    } finally {
      setImporting(false);
    }
  };

  const handleDownloadBackup = async (filename: string) => {
    try {
      const res = await axios.get(`/api/auth/backup/download/${encodeURIComponent(filename)}`, {
        responseType: "blob"
      });
      if (res.data?.type === "application/json") {
        const text = await res.data.text();
        const json = JSON.parse(text);
        throw new Error(json.error || "Download failed");
      }
      const url = window.URL.createObjectURL(new Blob([res.data], { type: "application/zip" }));
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", filename);
      document.body.appendChild(link);
      link.click();
      link.parentNode?.removeChild(link);
      window.URL.revokeObjectURL(url);
      addNotification("Backup downloaded.", "success");
    } catch (err: any) {
      addNotification(err.message || (await parseApiError(err, "Failed to download backup.")), "warning");
    }
  };

  const handleRestoreBackup = async (filename: string) => {
    if (isReadOnly) {
      addNotification("Action failed: Super Admin has read-only access.", "warning");
      return;
    }
    if (
      !window.confirm(
        `Restore system to backup "${filename}"?\n\nThis will overwrite all current data.`
      )
    )
      return;
    setRestoringName(filename);
    addNotification("Restoring system data…", "info");
    try {
      const res = await axios.post(`/api/auth/backup/restore/${encodeURIComponent(filename)}`, null, {
        timeout: 120000
      });
      addNotification(res.data.message || "System data restored.", "success");
      setTimeout(() => window.location.reload(), 1500);
    } catch (err: any) {
      addNotification(await parseApiError(err, "Failed to restore."), "warning");
    } finally {
      setRestoringName(null);
    }
  };

  const handleDeleteBackup = async (filename: string) => {
    if (isReadOnly) {
      addNotification("Action failed: Super Admin has read-only access.", "warning");
      return;
    }
    if (!window.confirm(`Delete backup file "${filename}"?`)) return;
    try {
      await axios.delete(`/api/auth/backup/delete/${encodeURIComponent(filename)}`);
      addNotification("Backup file deleted.", "success");
      loadBackups();
    } catch (err: any) {
      addNotification(await parseApiError(err, "Failed to delete backup."), "warning");
    }
  };

  // ─── Danger ───────────────────────────────────────────────────────────────
  const loadDataCounts = async () => {
    setLoadingCounts(true);
    try {
      const res = await axios.get("/api/auth/data-counts");
      setDataCounts(res.data || {});
    } catch {
      setDataCounts({});
    } finally {
      setLoadingCounts(false);
    }
  };

  useEffect(() => {
    if (activeTab === "danger") loadDataCounts();
  }, [activeTab]);
  const handleResetTransactions = async () => {
    if (isReadOnly) {
      addNotification("Action failed: Super Admin has read-only access.", "warning");
      return;
    }
    const selected = ALL_OPTIONS.filter((o) => selectedTypes[o.key]).map((o) => o.label);
    if (selected.length === 0) {
      addNotification("Select at least one data type to clear.", "warning");
      return;
    }
    const hasMasterData = PRESERVED_OPTIONS.some((o) => selectedTypes[o.key]);
    let msg = `WARNING: This will permanently delete the following data:\n\n• ${selected.join("\n• ")}\n\nThis CANNOT be undone. Proceed?`;
    if (hasMasterData) {
      msg = `EXTREME WARNING: You are about to delete MASTER RECORDS including Products, Customers, Staff, or Branches.\n\nThis will permanently delete:\n\n• ${selected.join("\n• ")}\n\nAll associated transaction data for these records will also be lost.\n\nThis CANNOT be undone. Proceed?`;
    }
    if (!window.confirm(msg)) return;
    setResetting(true);
    try {
      const types = ALL_OPTIONS.filter((o) => selectedTypes[o.key]).map((o) => o.key);
      const res = await axios.post("/api/auth/reset-transactions", { types });
      addNotification(res.data.message || "Selected data cleared.", "success");
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
    <PortalModal isOpen={true} onClose={onClose} backdropClass="bg-black/70 backdrop-blur-sm px-4">
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
    </PortalModal>
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
                {!isReadOnly && (
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
                )}
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
          {!isReadOnly && (
            <button onClick={() => setAddOpen(true)}
              className="group border-2 border-dashed border-border hover:border-primary/40 rounded-2xl p-5 flex flex-col items-center justify-center gap-2 text-muted-foreground hover:text-primary transition-all min-h-[140px]">
              <div className="w-9 h-9 rounded-xl bg-secondary group-hover:bg-primary/10 flex items-center justify-center transition-colors">
                <Plus className="w-4 h-4" />
              </div>
              <span className="text-xs font-bold">Add New Shop</span>
            </button>
          )}
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
            onClick={() => !isReadOnly && setGstEnabledLocal(!gstEnabledLocal)}
            disabled={isReadOnly}
            className="flex-shrink-0 ml-4 disabled:opacity-50"
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
                    disabled={isReadOnly}
                    type="number"
                    value={gstRateLocal}
                    onChange={(e) => setGstRateLocal(e.target.value)}
                    min="0"
                    max="100"
                    step="0.5"
                    placeholder="e.g. 5"
                    className="w-full bg-secondary border border-border px-3 py-2.5 pr-8 rounded-xl text-sm font-bold focus:outline-none focus:ring-2 focus:ring-emerald-500/30 transition disabled:opacity-60"
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

      {!isReadOnly && (
        <button
          onClick={handleSaveGst}
          disabled={savingGst}
          className="w-full sm:w-auto bg-emerald-600 hover:bg-emerald-600/90 text-white text-xs font-bold px-6 py-3 rounded-xl flex items-center justify-center gap-2 transition disabled:opacity-50"
        >
          {savingGst ? "Saving…" : "Save Tax Settings"}
        </button>
      )}
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
          <div className="flex flex-col gap-2">
            <button
              onClick={handleExportBackup}
              disabled={exporting}
              className="w-full bg-blue-600 hover:bg-blue-600/90 text-white text-xs font-bold px-4 py-2.5 rounded-xl flex items-center justify-center gap-1.5 transition disabled:opacity-50"
            >
              <Download className="w-3.5 h-3.5" />
              {exporting ? "Preparing…" : "Download Backup ZIP"}
            </button>
            {!isReadOnly && (
              <button
                onClick={handleCreateServerBackup}
                disabled={creatingBackup}
                className="w-full bg-secondary border border-border hover:bg-secondary/80 text-foreground text-xs font-bold px-4 py-2.5 rounded-xl flex items-center justify-center gap-1.5 transition disabled:opacity-50"
              >
                <HardDrive className="w-3.5 h-3.5" />
                {creatingBackup ? "Saving…" : "Save Backup on Server"}
              </button>
            )}
          </div>
        </div>

        {/* Import */}
        {!isReadOnly && (
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
        )}
      </div>

      {/* Server backups list (auto + manual) */}
      <div className="bg-card border border-border rounded-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-primary" />
            <h3 className="font-extrabold text-sm text-foreground">Server Backups</h3>
            <span className="text-[10px] bg-secondary border border-border px-2 py-0.5 rounded-lg text-muted-foreground font-semibold">
              Auto every 7 days
            </span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-[10px] text-muted-foreground">Keeps last 5 auto</span>
            <button
              onClick={loadBackups}
              className="text-[10px] font-bold text-primary hover:underline flex items-center gap-1"
            >
              <RefreshCw className="w-3 h-3" /> Refresh
            </button>
          </div>
        </div>

        {backups.length === 0 ? (
          <div className="p-10 text-center space-y-2">
            <HardDrive className="w-8 h-8 text-muted-foreground/30 mx-auto" />
            <p className="text-xs text-muted-foreground">No server backups yet.</p>
            <p className="text-[10px] text-muted-foreground opacity-60">
              Use “Save Backup on Server” or wait for the weekly auto backup.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-border/50">
            {backups.map((bk) => (
              <div
                key={bk.filename}
                className="flex items-center justify-between px-5 py-3.5 hover:bg-secondary/30 transition"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <HardDrive className="w-4 h-4 text-primary/60 flex-shrink-0" />
                  <div className="min-w-0">
                    <p className="text-xs font-mono font-bold text-foreground truncate">{bk.filename}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {new Date(bk.createdAt).toLocaleString()} ·{" "}
                      {((bk.size || 0) / (1024 * 1024)).toFixed(2)} MB
                      {String(bk.filename).startsWith("auto-") ? " · auto" : " · manual"}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3 text-[11px] font-bold flex-shrink-0 ml-4">
                  <button
                    onClick={() => handleDownloadBackup(bk.filename)}
                    className="text-primary hover:underline transition"
                  >
                    Download
                  </button>
                  <button
                    onClick={() => handleRestoreBackup(bk.filename)}
                    disabled={restoringName === bk.filename}
                    className="text-amber-400 hover:underline transition disabled:opacity-50"
                  >
                    {restoringName === bk.filename ? "Restoring…" : "Restore"}
                  </button>
                  <button
                    onClick={() => handleDeleteBackup(bk.filename)}
                    className="text-red-400 hover:underline transition"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );

  const roleBadge = (role: string) => {
    const map: Record<string, string> = {
      OWNER: "bg-amber-500/15 text-amber-400 border-amber-500/30",
      MANAGER: "bg-violet-500/15 text-violet-400 border-violet-500/30",
      CASHIER: "bg-sky-500/15 text-sky-400 border-sky-500/30",
      TECHNICIAN: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
      WAREHOUSE: "bg-orange-500/15 text-orange-400 border-orange-500/30"
    };
    return map[role] || "bg-secondary text-muted-foreground border-border";
  };

  const renderStaff = () => (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-extrabold text-foreground flex items-center gap-2">
            <Users className="w-4 h-4 text-indigo-400" /> Staff accounts
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Create cashiers and technicians. Only owners can manage staff.
          </p>
        </div>
        {!isReadOnly && isOwner && (
          <button
            type="button"
            onClick={() => {
              setNewStaff({
                name: "",
                email: "",
                password: "",
                role: "CASHIER",
                phone: "",
                branchId: branches[0]?.id || ""
              });
              setStaffModalOpen(true);
            }}
            className="bg-primary text-white text-xs font-bold px-4 py-2.5 rounded-xl flex items-center gap-1.5 hover:bg-primary/90 transition"
          >
            <UserPlus className="w-4 h-4" /> Add staff
          </button>
        )}
      </div>

      {!isOwner ? (
        <div className="bg-card border border-border rounded-2xl p-8 text-center text-sm text-muted-foreground">
          Only the shop <strong className="text-foreground">owner</strong> can add or manage staff.
        </div>
      ) : staffLoading ? (
        <div className="py-16 text-center text-xs text-muted-foreground">Loading staff…</div>
      ) : staff.length === 0 ? (
        <div className="bg-card border border-dashed border-border rounded-2xl p-10 text-center">
          <Shield className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
          <p className="text-sm font-bold text-foreground">No staff yet</p>
          <p className="text-xs text-muted-foreground mt-1">Add a cashier for POS or a technician for repairs.</p>
        </div>
      ) : (
        <div className="bg-card border border-border rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-border bg-secondary/40 text-[10px] uppercase tracking-wider text-muted-foreground">
                  <th className="px-4 py-3 font-bold">Name</th>
                  <th className="px-4 py-3 font-bold">Email</th>
                  <th className="px-4 py-3 font-bold">Role</th>
                  <th className="px-4 py-3 font-bold">Branch</th>
                  <th className="px-4 py-3 font-bold">Status</th>
                  <th className="px-4 py-3 font-bold text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {staff.map((u) => (
                  <tr key={u.id} className="border-b border-border/60 last:border-0 hover:bg-secondary/20">
                    <td className="px-4 py-3 font-semibold text-foreground">{u.name}</td>
                    <td className="px-4 py-3 font-mono text-muted-foreground">{u.email || u.username}</td>
                    <td className="px-4 py-3">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-lg border ${roleBadge(u.role)}`}>
                        {u.role}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{u.branch?.name || "—"}</td>
                    <td className="px-4 py-3">
                      <span className={`text-[10px] font-bold ${u.isActive ? "text-emerald-400" : "text-red-400"}`}>
                        {u.isActive ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {u.role !== "OWNER" && !isReadOnly && (
                        <button
                          type="button"
                          onClick={() => handleToggleStaff(u)}
                          className="text-[11px] font-bold text-primary hover:underline"
                        >
                          {u.isActive ? "Deactivate" : "Activate"}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>

            </table>
          </div>
        </div>
      )}

      <div className="bg-secondary/40 border border-border rounded-xl p-4 text-[11px] text-muted-foreground space-y-1">
        <p><strong className="text-foreground">CASHIER</strong> — POS sales, customers, installments</p>
        <p><strong className="text-foreground">TECHNICIAN</strong> — repairs & warranty jobs</p>
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
            <div className="space-y-1 flex-1">
              <h3 className="font-extrabold text-sm text-foreground">Clear Sales & Transaction Data</h3>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Select the data types to permanently delete. These operations cannot be undone.
              </p>
              <button
                onClick={() => {
                  const allSelected = ALL_OPTIONS.every((o) => selectedTypes[o.key]);
                  const next: Record<string, boolean> = {};
                  ALL_OPTIONS.forEach((o) => { next[o.key] = !allSelected; });
                  setSelectedTypes(next);
                }}
                className="text-[10px] font-semibold text-red-400 hover:text-red-300 transition underline underline-offset-2"
              >
                {ALL_OPTIONS.every((o) => selectedTypes[o.key]) ? "Deselect All" : "Select All"}
              </button>
              <div className="grid grid-cols-2 gap-2 pt-1">
                {CLEAR_OPTIONS.map(({ key, label }) => (
                  <label
                    key={key}
                    className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl border text-xs font-semibold cursor-pointer transition-all ${
                      selectedTypes[key]
                        ? "bg-red-500/10 border-red-500/30 text-red-400"
                        : "bg-secondary/40 border-border/60 text-muted-foreground hover:border-red-500/20 hover:text-foreground"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={selectedTypes[key]}
                      onChange={() => setSelectedTypes((prev) => ({ ...prev, [key]: !prev[key] }))}
                      className="w-4 h-4 rounded border-gray-500 text-red-500 focus:ring-red-500/30 accent-red-500"
                    />
                    <span className="flex-1">{label}</span>
                    <span className="text-[10px] font-mono opacity-60">
                      {loadingCounts ? "…" : dataCounts[key] ?? "—"}
                    </span>
                  </label>
                ))}
              </div>
            </div>
          </div>

          {/* Master Records Section */}
          <div className="border-t border-red-500/10 pt-4 space-y-3">
            <div className="flex items-start gap-2">
              <AlertTriangle className="w-3.5 h-3.5 text-orange-400 flex-shrink-0 mt-0.5" />
              <p className="text-[10px] text-orange-400 font-semibold leading-relaxed">
                Master records are normally preserved. Check below to also delete them — this will remove all associated data.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {PRESERVED_OPTIONS.map(({ key, label }) => (
                <label
                  key={key}
                  className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl border text-xs font-semibold cursor-pointer transition-all ${
                    selectedTypes[key]
                      ? "bg-orange-500/10 border-orange-500/30 text-orange-400"
                      : "bg-secondary/40 border-border/60 text-muted-foreground hover:border-orange-500/20 hover:text-foreground"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={selectedTypes[key]}
                    onChange={() => setSelectedTypes((prev) => ({ ...prev, [key]: !prev[key] }))}
                    className="w-4 h-4 rounded border-gray-500 text-orange-500 focus:ring-orange-500/30 accent-orange-500"
                  />
                  <span className="flex-1">{label}</span>
                  <span className="text-[10px] font-mono opacity-60">
                    {loadingCounts ? "…" : dataCounts[key] ?? "—"}
                  </span>
                </label>
              ))}
            </div>
          </div>

          <div className="border-t border-red-500/10 pt-4">
            <button
              onClick={handleResetTransactions}
              disabled={resetting || isReadOnly || ALL_OPTIONS.every((o) => !selectedTypes[o.key])}
              className="bg-red-500/10 border border-red-500/30 hover:bg-red-500/20 hover:border-red-500/50 text-red-400 text-xs font-bold px-5 py-3 rounded-xl transition flex items-center gap-2 disabled:opacity-40"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              {resetting
                ? "Clearing Data…"
                : `Clear Selected Data (${ALL_OPTIONS.filter((o) => selectedTypes[o.key]).length})`}
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
            <span className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center p-1">
              <img src="/icons/settings/gear.png?v=1" alt="" className="w-full h-full object-contain" draggable={false} />
            </span>
            Settings
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
            <span
              className={`w-5 h-5 rounded-md flex items-center justify-center p-0.5 ${
                activeTab === tab.id ? "bg-white/20" : "bg-secondary"
              }`}
            >
              <img
                src={`${tab.iconSrc}?v=1`}
                alt=""
                className="w-full h-full object-contain"
                draggable={false}
              />
            </span>
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === "shops"  && renderShops()}
      {activeTab === "staff"  && renderStaff()}
      {activeTab === "tax"    && renderTax()}
      {activeTab === "backup" && renderBackup()}
      {activeTab === "danger" && renderDanger()}

      {/* Add Staff Modal */}
      {staffModalOpen && (
        <Modal
          title="Add staff member"
          onClose={() => setStaffModalOpen(false)}
          onSubmit={handleCreateStaff}
          submitLabel={savingStaff ? "Saving…" : "Create staff"}
        >
          <Field label="Full name *">
            <input
              required
              type="text"
              value={newStaff.name}
              onChange={(e) => setNewStaff({ ...newStaff, name: e.target.value })}
              placeholder="e.g. Ali Cashier"
              className={inputCls}
            />
          </Field>
          <Field label="Email *">
            <input
              required
              type="email"
              value={newStaff.email}
              onChange={(e) => setNewStaff({ ...newStaff, email: e.target.value })}
              placeholder="cashier@shop.com"
              className={inputCls}
            />
          </Field>
          <Field label="Password *">
            <div className="relative">
              <input
                required
                type={showStaffPassword ? "text" : "password"}
                value={newStaff.password}
                onChange={(e) => setNewStaff({ ...newStaff, password: e.target.value })}
                placeholder="Min 4 characters"
                className={`${inputCls} pr-10`}
              />
              <button type="button" onClick={() => setShowStaffPassword(!showStaffPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition">
                {showStaffPassword ? (
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
                  </svg>
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                )}
              </button>
            </div>
          </Field>
          <Field label="Role *">
            <select
              value={newStaff.role}
              onChange={(e) => setNewStaff({ ...newStaff, role: e.target.value as "CASHIER" | "TECHNICIAN" })}
              className={inputCls}
            >
              <option value="CASHIER">Cashier (POS)</option>
              <option value="TECHNICIAN">Technician (Repairs)</option>
            </select>
          </Field>
          <Field label="Branch">
            <select
              value={newStaff.branchId}
              onChange={(e) => setNewStaff({ ...newStaff, branchId: e.target.value })}
              className={inputCls}
            >
              <option value="">— None —</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          </Field>
          <Field label="Phone">
            <input
              type="text"
              value={newStaff.phone}
              onChange={(e) => setNewStaff({ ...newStaff, phone: e.target.value })}
              placeholder="Optional"
              className={inputCls}
            />
          </Field>
        </Modal>
      )}

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
