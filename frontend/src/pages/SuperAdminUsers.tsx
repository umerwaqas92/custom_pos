import React, { useState, useEffect } from "react";
import axios from "axios";
import { useStore } from "../store/useStore";
import { Search, Users, RefreshCw, Lock, Edit3, X } from "lucide-react";

export default function SuperAdminUsers() {
  const { addNotification } = useStore();
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedRole, setSelectedRole] = useState("");
  const [branches, setBranches] = useState<any[]>([]);
  const [editTarget, setEditTarget] = useState<any>(null);
  const [editForm, setEditForm] = useState({ name: "", email: "", phone: "", role: "", branchId: "", isActive: true });
  const [editPassword, setEditPassword] = useState("");
  const [saving, setSaving] = useState(false);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const res = await axios.get("/api/auth/users");
      setUsers(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      addNotification("Failed to fetch users.", "warning");
    } finally {
      setLoading(false);
    }
  };

  const fetchBranches = async () => {
    try {
      const res = await axios.get("/api/auth/branches");
      setBranches(Array.isArray(res.data) ? res.data : []);
    } catch {}
  };

  useEffect(() => {
    fetchUsers();
    fetchBranches();
  }, []);

  const filteredUsers = users.filter((u) => {
    const s = search.toLowerCase();
    const matchesSearch =
      u.name?.toLowerCase().includes(s) ||
      u.username?.toLowerCase().includes(s) ||
      u.email?.toLowerCase().includes(s);
    const matchesRole = selectedRole === "" || u.role === selectedRole;
    return matchesSearch && matchesRole;
  });

  const roleBadge = (role: string) => {
    const map: Record<string, string> = {
      OWNER: "bg-amber-500/15 text-amber-400 border-amber-500/30",
      MANAGER: "bg-violet-500/15 text-violet-400 border-violet-500/30",
      CASHIER: "bg-sky-500/15 text-sky-400 border-sky-500/30",
      TECHNICIAN: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
      WAREHOUSE: "bg-orange-500/15 text-orange-400 border-orange-500/30",
      SUPER_ADMIN: "bg-red-500/15 text-red-400 border-red-500/30"
    };
    return map[role] || "bg-secondary text-muted-foreground border-border";
  };

  return (
    <div className="space-y-6 flex-1">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="space-y-1">
          <h1 className="text-xl font-black text-foreground tracking-tight flex items-center gap-2">
            <span className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center p-1.5">
              <Users className="w-4 h-4 text-primary" />
            </span>
            Platform Users
          </h1>
          <p className="text-xs text-muted-foreground">
            Manage and view all registered users and staff accounts across all tenant shops.
          </p>
        </div>
        <button
          onClick={fetchUsers}
          disabled={loading}
          className="bg-secondary border border-border hover:bg-secondary/80 text-foreground text-xs font-bold px-3 py-2.5 rounded-xl flex items-center gap-1.5 transition disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} /> Refresh
        </button>
      </div>

      {/* Filters Bar */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex items-center gap-3 bg-card border border-border px-4 py-3 rounded-2xl max-w-md flex-1">
          <Search className="w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search users by name, username or email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="bg-transparent border-0 outline-none text-xs text-foreground placeholder-muted-foreground w-full"
          />
        </div>
        <select
          value={selectedRole}
          onChange={(e) => setSelectedRole(e.target.value)}
          className="bg-card border border-border px-4 py-3 rounded-2xl text-xs text-foreground outline-none cursor-pointer"
        >
          <option value="">All Roles</option>
          <option value="OWNER">Owner</option>
          <option value="MANAGER">Manager</option>
          <option value="CASHIER">Cashier</option>
          <option value="TECHNICIAN">Technician</option>
          <option value="WAREHOUSE">Warehouse</option>
          <option value="SUPER_ADMIN">Super Admin</option>
        </select>
      </div>

      {/* Main Table Card */}
      <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-sm">
        {loading ? (
          <div className="py-20 flex flex-col items-center gap-2">
            <span className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
            <p className="text-xs text-muted-foreground font-medium">Retrieving users...</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-border bg-secondary/40 text-[10px] uppercase tracking-wider text-muted-foreground select-none">
                  <th className="px-5 py-4 font-bold">Name</th>
                  <th className="px-5 py-4 font-bold">Username / Email</th>
                  <th className="px-5 py-4 font-bold">Role</th>
                  <th className="px-5 py-4 font-bold">Assigned Branch</th>
                  <th className="px-5 py-4 font-bold">Status</th>
                  <th className="px-5 py-4 font-bold text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {filteredUsers.map((u) => (
                  <tr key={u.id} className="hover:bg-secondary/20 transition-colors">
                    <td className="px-5 py-4 font-extrabold text-foreground">{u.name}</td>
                    <td className="px-5 py-4 font-mono text-muted-foreground">{u.email || u.username}</td>
                    <td className="px-5 py-4">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-lg border ${roleBadge(u.role)}`}>
                        {u.role}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-muted-foreground">{u.branch?.name || "—"}</td>
                    <td className="px-5 py-4">
                      <span className={`text-[10px] font-bold ${u.isActive ? "text-emerald-400" : "text-red-400"}`}>
                        {u.isActive ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => {
                            setEditTarget(u);
                            setEditForm({
                              name: u.name || "",
                              email: u.email || "",
                              phone: u.phone || "",
                              role: u.role || "CASHIER",
                              branchId: u.branchId || "",
                              isActive: u.isActive !== false
                            });
                            setEditPassword("");
                          }}
                          title="Edit User"
                          className="p-1.5 rounded-lg text-muted-foreground hover:text-primary hover:bg-primary/10 transition"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {filteredUsers.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-16 text-center text-muted-foreground font-medium">
                      No users found matching your filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Edit User Modal */}
      {editTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setEditTarget(null)}>
          <div className="bg-card border border-border rounded-2xl p-6 w-full max-w-md shadow-2xl mx-4 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <div>
                <h3 className="text-lg font-bold text-foreground">Edit User</h3>
                <p className="text-xs text-muted-foreground mt-1">{editTarget.name} ({editTarget.username})</p>
              </div>
              <button onClick={() => setEditTarget(null)} className="p-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (!editForm.name.trim()) {
                  addNotification("Name is required.", "warning");
                  return;
                }
                setSaving(true);
                try {
                  const payload: any = { ...editForm };
                  if (editPassword) {
                    if (editPassword.length < 6) {
                      addNotification("Password must be at least 6 characters.", "warning");
                      setSaving(false);
                      return;
                    }
                    payload.password = editPassword;
                  }
                  await axios.put(`/api/auth/users/${editTarget.id}`, payload);
                  addNotification(`User ${editTarget.name} updated.`, "success");
                  setEditTarget(null);
                  fetchUsers();
                } catch (err: any) {
                  const msg = err.response?.data?.error || "Failed to update user.";
                  addNotification(msg, "warning");
                } finally {
                  setSaving(false);
                }
              }}
              className="space-y-4"
            >
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Name</label>
                  <input type="text" value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                    className="w-full bg-secondary text-foreground border border-border px-4 py-2.5 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/50" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Email</label>
                  <input type="email" value={editForm.email} onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                    className="w-full bg-secondary text-foreground border border-border px-4 py-2.5 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/50" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Phone</label>
                  <input type="text" value={editForm.phone} onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                    className="w-full bg-secondary text-foreground border border-border px-4 py-2.5 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/50" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Role</label>
                  <select value={editForm.role} onChange={(e) => setEditForm({ ...editForm, role: e.target.value })}
                    className="w-full bg-secondary text-foreground border border-border px-4 py-2.5 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/50">
                    <option value="OWNER">Owner</option>
                    <option value="MANAGER">Manager</option>
                    <option value="CASHIER">Cashier</option>
                    <option value="TECHNICIAN">Technician</option>
                    <option value="WAREHOUSE">Warehouse</option>
                    <option value="SUPER_ADMIN">Super Admin</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Branch</label>
                  <select value={editForm.branchId} onChange={(e) => setEditForm({ ...editForm, branchId: e.target.value })}
                    className="w-full bg-secondary text-foreground border border-border px-4 py-2.5 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/50">
                    <option value="">— No Branch —</option>
                    {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </select>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={editForm.isActive}
                    onChange={(e) => setEditForm({ ...editForm, isActive: e.target.checked })}
                    className="w-4 h-4 rounded border-border accent-primary" />
                  <span className="text-xs font-semibold text-muted-foreground">Active</span>
                </label>
              </div>
              <div>
                <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
                  New Password <span className="text-[10px] font-normal normal-case text-muted-foreground">(leave blank to keep current)</span>
                </label>
                <input type="password" value={editPassword} onChange={(e) => setEditPassword(e.target.value)}
                  className="w-full bg-secondary text-foreground border border-border px-4 py-2.5 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/50"
                  placeholder="At least 6 characters" />
              </div>
              <div className="flex gap-3">
                <button type="button" onClick={() => setEditTarget(null)}
                  className="flex-1 bg-secondary hover:bg-secondary/80 text-foreground font-medium py-2.5 rounded-xl transition">Cancel</button>
                <button type="submit" disabled={saving}
                  className="flex-[2] bg-primary hover:bg-primary/95 text-white font-medium py-2.5 rounded-xl flex items-center justify-center transition disabled:opacity-50">
                  {saving ? <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : "Save Changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
