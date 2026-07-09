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
  Info
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

  useEffect(() => {
    loadBranches();
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
