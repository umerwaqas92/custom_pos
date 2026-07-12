import React, { useState, useEffect } from "react";
import axios from "axios";
import { useStore } from "../store/useStore";
import { Search, Users, RefreshCw, Lock, X } from "lucide-react";

export default function SuperAdminUsers() {
  const { addNotification } = useStore();
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedRole, setSelectedRole] = useState("");
  const [resetTarget, setResetTarget] = useState<any>(null);
  const [newPassword, setNewPassword] = useState("");
  const [pwLoading, setPwLoading] = useState(false);

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

  useEffect(() => {
    fetchUsers();
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
                      <button
                        onClick={() => { setResetTarget(u); setNewPassword(""); }}
                        title="Reset Password"
                        className="p-1.5 rounded-lg text-muted-foreground hover:text-amber-500 hover:bg-amber-500/10 transition"
                      >
                        <Lock className="w-3.5 h-3.5" />
                      </button>
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

      {/* Password Reset Modal */}
      {resetTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setResetTarget(null)}>
          <div className="bg-card border border-border rounded-2xl p-6 w-full max-w-md shadow-2xl mx-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <div>
                <h3 className="text-lg font-bold text-foreground">Reset Password</h3>
                <p className="text-xs text-muted-foreground mt-1">{resetTarget.name} ({resetTarget.username})</p>
              </div>
              <button onClick={() => setResetTarget(null)} className="p-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (!newPassword || newPassword.length < 6) {
                  addNotification("Password must be at least 6 characters.", "warning");
                  return;
                }
                setPwLoading(true);
                try {
                  await axios.put(`/api/auth/users/${resetTarget.id}`, { password: newPassword });
                  addNotification(`Password reset for ${resetTarget.name}.`, "success");
                  setResetTarget(null);
                } catch (err: any) {
                  const msg = err.response?.data?.error || "Failed to reset password.";
                  addNotification(msg, "warning");
                } finally {
                  setPwLoading(false);
                }
              }}
              className="space-y-4"
            >
              <div>
                <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">New Password</label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full bg-secondary text-foreground border border-border px-4 py-2.5 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/50"
                  placeholder="At least 6 characters"
                  autoFocus
                />
              </div>
              <button
                type="submit"
                disabled={pwLoading}
                className="w-full bg-primary hover:bg-primary/95 text-white font-medium py-2.5 rounded-xl flex items-center justify-center transition disabled:opacity-50"
              >
                {pwLoading ? <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : "Reset Password"}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
