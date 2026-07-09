import React, { useState, useEffect } from "react";
import axios from "axios";
import { useStore } from "../store/useStore";
import {
  Settings as SettingsIcon,
  Store,
  MapPin,
  Phone,
  Plus,
  Edit,
  Trash2,
  X,
  CheckCircle,
  Info,
  ShieldAlert,
  Download
} from "lucide-react";

export default function Settings() {
  const { addNotification } = useStore();
  const [branches, setBranches] = useState<any[]>([]);
  const [addOpen, setAddOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);

  // Form states
  const [newBranch, setNewBranch] = useState({ name: "", address: "", phone: "" });
  const [selectedBranchId, setSelectedBranchId] = useState("");
  const [editBranch, setEditBranch] = useState({ name: "", address: "", phone: "" });

  const loadBranches = async () => {
    try {
      const res = await axios.get("/api/auth/branches");
      setBranches(res.data);
    } catch (err) {
      addNotification("Failed to load branches.", "warning");
    }
  };

  const [resetting, setResetting] = useState(false);

  const handleResetTransactions = async () => {
    const doubleCheck = window.confirm(
      "WARNING: This will permanently delete all sales, transactions, invoices, installments, expenses, and log history. This action CANNOT be undone.\n\nAre you sure you want to proceed?"
    );
    if (!doubleCheck) return;

    const securityConfirm = window.prompt(
      "To confirm this action, please type the word 'RESET' below:"
    );
    if (securityConfirm !== "RESET") {
      addNotification("Reset cancelled. Confirmation keyword did not match.", "warning");
      return;
    }

    setResetting(true);
    try {
      const res = await axios.post("/api/auth/reset-transactions");
      addNotification(res.data.message || "Transactions cleared successfully.", "success");
      setTimeout(() => {
        window.location.reload();
      }, 1500);
    } catch (err: any) {
      addNotification(
        err.response?.data?.error || "Failed to clear transaction records.",
        "warning"
      );
    } finally {
      setResetting(false);
    }
  };

  const [importing, setImporting] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const handleExportBackup = async () => {
    try {
      addNotification("Preparing backup package...", "info");
      const res = await axios.get("/api/auth/backup/export", { responseType: "blob" });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", `pos-backup-${new Date().toISOString().split('T')[0]}.zip`);
      document.body.appendChild(link);
      link.click();
      link.parentNode?.removeChild(link);
      addNotification("Backup file downloaded successfully.", "success");
    } catch (err) {
      addNotification("Failed to export backup.", "warning");
    }
  };

  const handleImportBackup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile) return addNotification("Please select a backup file first.", "warning");

    const doubleCheck = window.confirm(
      "WARNING: Restoring from backup will overwrite all current sales, products, and configurations. This cannot be undone. Are you sure you want to proceed?"
    );
    if (!doubleCheck) return;

    const formData = new FormData();
    formData.append("backup", selectedFile);

    setImporting(true);
    try {
      const res = await axios.post("/api/auth/backup/import", formData, {
        headers: { "Content-Type": "multipart/form-data" }
      });
      addNotification(res.data.message || "Data restored successfully from backup.", "success");
      setSelectedFile(null);
      setTimeout(() => {
        window.location.reload();
      }, 1500);
    } catch (err: any) {
      addNotification(
        err.response?.data?.error || "Failed to restore backup data.",
        "warning"
      );
    } finally {
      setImporting(false);
    }
  };

  const [backups, setBackups] = useState<any[]>([]);

  const loadBackups = async () => {
    try {
      const res = await axios.get("/api/auth/backup/list");
      setBackups(res.data);
    } catch (err) {
      console.error("Failed to load backups list.");
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
      addNotification("Backup downloaded successfully.", "success");
    } catch (err) {
      addNotification("Failed to download backup.", "warning");
    }
  };

  const handleRestoreBackup = async (filename: string) => {
    const confirmRestore = window.confirm(
      `WARNING: Are you sure you want to restore the system to the backup: "${filename}"?\n\nThis will overwrite all current data. This action cannot be undone.`
    );
    if (!confirmRestore) return;

    addNotification("Restoring system data...", "info");
    try {
      const res = await axios.post(`/api/auth/backup/restore/${filename}`);
      addNotification(res.data.message || "System data restored successfully.", "success");
      setTimeout(() => {
        window.location.reload();
      }, 1500);
    } catch (err: any) {
      addNotification(err.response?.data?.error || "Failed to restore data.", "warning");
    }
  };

  const handleDeleteBackup = async (filename: string) => {
    const confirmDelete = window.confirm(
      `Are you sure you want to delete the backup file: "${filename}"?`
    );
    if (!confirmDelete) return;

    try {
      const res = await axios.delete(`/api/auth/backup/delete/${filename}`);
      addNotification(res.data.message || "Backup file deleted.", "success");
      loadBackups();
    } catch (err: any) {
      addNotification(err.response?.data?.error || "Failed to delete backup file.", "warning");
    }
  };

  useEffect(() => {
    loadBranches();
    loadBackups();
  }, []);

  const handleAddBranch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newBranch.name) return addNotification("Shop name is required.", "warning");
    try {
      await axios.post("/api/auth/branches", newBranch);
      addNotification("New shop branch created successfully.", "success");
      setAddOpen(false);
      setNewBranch({ name: "", address: "", phone: "" });
      loadBranches();
    } catch (err: any) {
      addNotification(err.response?.data?.error || "Failed to create branch.", "warning");
    }
  };

  const handleOpenEdit = (b: any) => {
    setSelectedBranchId(b.id);
    setEditBranch({
      name: b.name || "",
      address: b.address || "",
      phone: b.phone || ""
    });
    setEditOpen(true);
  };

  const handleEditBranch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editBranch.name) return addNotification("Shop name is required.", "warning");
    try {
      await axios.put(`/api/auth/branches/${selectedBranchId}`, editBranch);
      addNotification("Shop details updated successfully.", "success");
      setEditOpen(false);
      loadBranches();
    } catch (err: any) {
      addNotification(err.response?.data?.error || "Failed to update branch.", "warning");
    }
  };

  const handleDeleteBranch = async (id: string, name: string) => {
    if (!window.confirm(`Are you sure you want to delete "${name}"? All stocks associated with this branch will be removed.`)) {
      return;
    }
    try {
      await axios.delete(`/api/auth/branches/${id}`);
      addNotification("Shop deleted successfully.", "success");
      loadBranches();
    } catch (err: any) {
      addNotification(err.response?.data?.error || "Failed to delete branch.", "warning");
    }
  };

  return (
    <div className="space-y-6 flex-1">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-card border border-border p-5 rounded-2xl">
        <div className="space-y-1">
          <h2 className="text-lg font-black text-foreground tracking-tight flex items-center gap-2">
            <SettingsIcon className="w-5 h-5 text-primary" /> Shop & POS Configurations
          </h2>
          <p className="text-xs text-muted-foreground">Manage your shop name, contact number, and street addresses printed on invoices.</p>
        </div>
        <button
          onClick={() => setAddOpen(true)}
          className="bg-primary hover:bg-primary/95 text-white text-xs font-bold px-4 py-2.5 rounded-xl flex items-center gap-1.5 transition"
        >
          <Plus className="w-4 h-4" /> Add New Shop
        </button>
      </div>

      {/* Info notice about receipts */}
      <div className="bg-primary/5 border border-primary/20 p-4 rounded-2xl flex gap-3 text-xs text-muted-foreground">
        <Info className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
        <div className="space-y-1">
          <h4 className="font-extrabold text-foreground">POS Receipt Header Auto-Sync</h4>
          <p>
            Whenever a transaction is completed, the system automatically reads the cashier's active branch location. 
            The printed slip pulls its **Shop Name**, **Address**, and **Phone Number** from these settings dynamically.
          </p>
        </div>
      </div>

      {/* Shops Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {branches.length === 0 ? (
          <div className="col-span-full bg-card border border-border rounded-2xl p-8 text-center text-muted-foreground text-xs">
            No active shop branches found. Click "Add New Shop" to get started.
          </div>
        ) : (
          branches.map((b) => (
            <div key={b.id} className="bg-card border border-border rounded-2xl p-5 space-y-4 hover:border-primary/45 transition">
              <div className="flex justify-between items-start">
                <div className="flex items-center gap-2">
                  <Store className="w-5 h-5 text-primary" />
                  <h3 className="font-extrabold text-sm text-foreground">{b.name}</h3>
                </div>
                <div className="flex gap-1.5">
                  <button
                    onClick={() => handleOpenEdit(b)}
                    className="p-1 text-muted-foreground hover:text-primary transition"
                    title="Edit Shop Details"
                  >
                    <Edit className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDeleteBranch(b.id, b.name)}
                    className="p-1 text-muted-foreground hover:text-destructive transition"
                    title="Delete Shop"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div className="space-y-2 text-xs border-t border-border/50 pt-3">
                <div className="flex items-start gap-2 text-muted-foreground">
                  <MapPin className="w-4 h-4 text-muted-foreground flex-shrink-0 mt-0.5" />
                  <span>{b.address || <span className="italic">No address set</span>}</span>
                </div>
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Phone className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                  <span>{b.phone || <span className="italic">No phone set</span>}</span>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Backup & Restore */}
      <div className="bg-card border border-border p-6 rounded-2xl space-y-5 shadow-sm relative overflow-hidden">
        <div className="absolute top-0 inset-x-0 h-[2px] bg-gradient-to-r from-blue-500 to-indigo-500" />
        
        <div className="space-y-1">
          <h3 className="font-extrabold text-sm text-foreground flex items-center gap-2">
            <Download className="w-5 h-5 text-primary" /> Database Backup & Restore
          </h3>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Backup your database and uploaded documents to a single ZIP file, or upload a previously generated ZIP backup to restore all data.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2 border-t border-border/50">
          {/* Export Section */}
          <div className="space-y-3">
            <h4 className="font-bold text-xs text-foreground uppercase tracking-wider">Export POS Data</h4>
            <p className="text-xs text-muted-foreground">
              Downloads a full system archive containing the SQLite database (`dev.db`) and all uploaded customer documents, receipt attachments, and warranty records.
            </p>
            <button
              type="button"
              onClick={handleExportBackup}
              className="bg-primary hover:bg-primary/95 text-white text-xs font-bold px-4 py-2.5 rounded-xl flex items-center gap-1.5 transition cursor-pointer"
            >
              <Download className="w-4 h-4" /> Download Backup Zip
            </button>
          </div>

          {/* Import Section */}
          <div className="space-y-3 border-t md:border-t-0 md:border-l border-border/50 pt-4 md:pt-0 md:pl-6">
            <h4 className="font-bold text-xs text-foreground uppercase tracking-wider text-red-400">Restore POS Data</h4>
            <p className="text-xs text-muted-foreground">
              Select and upload a previously exported `.zip` file. Overwrites all current database records and public folder files.
            </p>
            <form onSubmit={handleImportBackup} className="space-y-3">
              <div className="flex items-center gap-2">
                <input
                  type="file"
                  accept=".zip"
                  onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                  className="block w-full text-xs text-muted-foreground
                    file:mr-4 file:py-2 file:px-4
                    file:rounded-xl file:border-0
                    file:text-xs file:font-semibold
                    file:bg-primary/10 file:text-primary
                    hover:file:bg-primary/20
                    cursor-pointer"
                />
              </div>
              <button
                type="submit"
                disabled={importing || !selectedFile}
                className="bg-red-500/10 border border-red-500/30 hover:bg-red-500/20 hover:border-red-500/50 text-red-400 text-xs font-bold px-4 py-2.5 rounded-xl transition flex-shrink-0 cursor-pointer disabled:opacity-40"
              >
                {importing ? "Restoring..." : "Upload & Restore"}
              </button>
            </form>
          </div>
        </div>

        {/* Automatic Backups List */}
        <div className="pt-5 border-t border-border/50 space-y-3">
          <div className="flex justify-between items-center">
            <h4 className="font-bold text-xs text-foreground uppercase tracking-wider">Automatic Backups (Every 7 Days)</h4>
            <span className="text-[10px] bg-secondary border border-border px-2.5 py-1 rounded-lg text-muted-foreground font-semibold">
              Retention: Last 5 Backups
            </span>
          </div>

          {backups.length === 0 ? (
            <div className="bg-secondary/20 border border-border/50 rounded-xl p-6 text-center text-muted-foreground text-xs">
              No automatic backups generated yet. (They are created every 7 days, or when the server restarts).
            </div>
          ) : (
            <div className="border border-border/60 rounded-xl overflow-hidden bg-secondary/10">
              <table className="w-full text-xs text-left border-collapse">
                <thead>
                  <tr className="bg-secondary/40 border-b border-border text-muted-foreground text-[10px] uppercase font-bold">
                    <th className="py-2.5 px-4">Backup Name</th>
                    <th className="py-2.5 px-4">Size</th>
                    <th className="py-2.5 px-4">Created Date</th>
                    <th className="py-2.5 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/40">
                  {backups.map((bk) => {
                    const sizeMB = (bk.size / (1024 * 1024)).toFixed(2);
                    const dateStr = new Date(bk.createdAt).toLocaleString();
                    return (
                      <tr key={bk.filename} className="hover:bg-secondary/20 transition">
                        <td className="py-2.5 px-4 font-mono text-[11px] text-foreground">{bk.filename}</td>
                        <td className="py-2.5 px-4 text-muted-foreground">{sizeMB} MB</td>
                        <td className="py-2.5 px-4 text-muted-foreground">{dateStr}</td>
                        <td className="py-2.5 px-4 text-right space-x-3">
                          <button
                            type="button"
                            onClick={() => handleDownloadBackup(bk.filename)}
                            className="text-primary hover:underline font-bold transition cursor-pointer"
                          >
                            Download
                          </button>
                          <button
                            type="button"
                            onClick={() => handleRestoreBackup(bk.filename)}
                            className="text-amber-400 hover:underline font-bold transition cursor-pointer"
                          >
                            Restore
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteBackup(bk.filename)}
                            className="text-red-400 hover:underline font-bold transition cursor-pointer"
                          >
                            Delete
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Danger Zone / Factory Reset */}
      <div className="bg-card border border-red-500/20 p-6 rounded-2xl space-y-4 shadow-sm relative overflow-hidden">
        {/* Glow indicator */}
        <div className="absolute top-0 inset-x-0 h-0.5 bg-red-500/30" />
        
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div className="space-y-1">
            <h3 className="font-extrabold text-sm text-foreground flex items-center gap-2">
              <ShieldAlert className="w-5 h-5 text-red-400" /> Danger Zone: Clear Sales & Transaction Data
            </h3>
            <p className="text-xs text-muted-foreground max-w-2xl leading-relaxed">
              This action will permanently delete all sales histories, transactions, EMIs/installments, expenses, warranty claims, and purchase orders. 
              <strong> Master records (like products, categories, brands, customers, suppliers, staff users, and store locations) will be preserved.</strong>
            </p>
          </div>
          <button
            type="button"
            onClick={handleResetTransactions}
            disabled={resetting}
            className="w-full sm:w-auto bg-red-500/10 border border-red-500/30 hover:bg-red-500/20 hover:border-red-500/50 text-red-400 text-xs font-bold px-5 py-3 rounded-xl transition flex-shrink-0 cursor-pointer disabled:opacity-50"
          >
            {resetting ? "Clearing Data..." : "Clear Transactions Data"}
          </button>
        </div>
      </div>

      {/* Add Shop Modal */}
      {addOpen && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/60 backdrop-blur-sm z-50 px-4">
          <div className="bg-card border border-border w-full max-w-sm p-6 rounded-2xl shadow-2xl relative">
            <h3 className="font-bold text-sm text-foreground mb-4">Add New Shop Branch</h3>
            <form onSubmit={handleAddBranch} className="space-y-4">
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-muted-foreground uppercase">Shop Name *</label>
                <input
                  type="text"
                  required
                  value={newBranch.name}
                  onChange={(e) => setNewBranch({ ...newBranch, name: e.target.value })}
                  placeholder="e.g. Central City Electronics"
                  className="w-full bg-secondary border border-border px-3 py-2 rounded text-xs focus:outline-none"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-muted-foreground uppercase">Street Address</label>
                <input
                  type="text"
                  value={newBranch.address}
                  onChange={(e) => setNewBranch({ ...newBranch, address: e.target.value })}
                  placeholder="e.g. Shop 45, Hall Road, Lahore"
                  className="w-full bg-secondary border border-border px-3 py-2 rounded text-xs focus:outline-none"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-muted-foreground uppercase">Phone Number</label>
                <input
                  type="text"
                  value={newBranch.phone}
                  onChange={(e) => setNewBranch({ ...newBranch, phone: e.target.value })}
                  placeholder="e.g. 0300-1234567"
                  className="w-full bg-secondary border border-border px-3 py-2 rounded text-xs focus:outline-none"
                />
              </div>

              <div className="flex gap-3 justify-end pt-4">
                <button
                  type="button"
                  onClick={() => setAddOpen(false)}
                  className="px-4 py-2 border border-border text-xs rounded hover:bg-secondary transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-primary text-white text-xs rounded hover:bg-primary/95 transition"
                >
                  Create Shop
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Shop Modal */}
      {editOpen && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/60 backdrop-blur-sm z-50 px-4">
          <div className="bg-card border border-border w-full max-w-sm p-6 rounded-2xl shadow-2xl relative">
            <h3 className="font-bold text-sm text-foreground mb-4">Edit Shop Details</h3>
            <form onSubmit={handleEditBranch} className="space-y-4">
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-muted-foreground uppercase">Shop Name *</label>
                <input
                  type="text"
                  required
                  value={editBranch.name}
                  onChange={(e) => setEditBranch({ ...editBranch, name: e.target.value })}
                  className="w-full bg-secondary border border-border px-3 py-2 rounded text-xs focus:outline-none"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-muted-foreground uppercase">Street Address</label>
                <input
                  type="text"
                  value={editBranch.address}
                  onChange={(e) => setEditBranch({ ...editBranch, address: e.target.value })}
                  className="w-full bg-secondary border border-border px-3 py-2 rounded text-xs focus:outline-none"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-muted-foreground uppercase">Phone Number</label>
                <input
                  type="text"
                  value={editBranch.phone}
                  onChange={(e) => setEditBranch({ ...editBranch, phone: e.target.value })}
                  className="w-full bg-secondary border border-border px-3 py-2 rounded text-xs focus:outline-none"
                />
              </div>

              <div className="flex gap-3 justify-end pt-4">
                <button
                  type="button"
                  onClick={() => setEditOpen(false)}
                  className="px-4 py-2 border border-border text-xs rounded hover:bg-secondary transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-primary text-white text-xs rounded hover:bg-primary/95 transition"
                >
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
