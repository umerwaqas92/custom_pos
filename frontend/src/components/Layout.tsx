import React, { useState, useEffect } from "react";
import { Outlet, Link, useLocation, useNavigate } from "react-router-dom";
import axios from "axios";
import { useStore, Branch } from "../store/useStore";
import { ToastContainer } from "./Toast";
import {
  LayoutDashboard,
  ShoppingCart,
  Package,
  Users,
  Briefcase,
  LogOut,
  Bell,
  Sun,
  Moon,
  ChevronRight,
  ShieldCheck,
  Layers,
  FileText,
  Settings,
  CreditCard,
  BarChart3,
  AlertTriangle,
  Maximize2,
  Minimize2,
  Menu,
  ShoppingBag,
  X,
  Lock
} from "lucide-react";

export default function Layout() {
  const {
    user,
    logout,
    branches,
    setBranches,
    selectedBranchId,
    setSelectedBranchId,
    notifications,
    clearNotification,
    theme,
    toggleTheme,
    lowStockCount,
    checkLowStock,
    addNotification
  } = useStore();

  const location = useLocation();
  const navigate = useNavigate();
  const [notifOpen, setNotifOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [passwordModal, setPasswordModal] = useState(false);
  const [pwCurrent, setPwCurrent] = useState("");
  const [pwNew, setPwNew] = useState("");
  const [pwConfirm, setPwConfirm] = useState("");
  const [pwLoading, setPwLoading] = useState(false);

  useEffect(() => {
    setMobileSidebarOpen(false);
  }, [location.pathname]);

  const isPosRoute = location.pathname === "/pos";

  const toggleFullscreen = async () => {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        await document.documentElement.requestFullscreen();
      }
    } catch {
      console.error("Fullscreen is not supported or was denied.");
    }
  };

  // Collapse sidebar on POS for maximum catalog/cart space
  useEffect(() => {
    setSidebarOpen(!isPosRoute);
  }, [isPosRoute]);

  // Sync fullscreen state with browser
  useEffect(() => {
    const onFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", onFullscreenChange);
  }, []);

  // Ctrl/Cmd+Shift+F toggles fullscreen
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === "f") {
        e.preventDefault();
        toggleFullscreen();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Check low stock on mount and every 5 minutes
  useEffect(() => {
    checkLowStock();
    const interval = setInterval(checkLowStock, 300000); // 5 minutes
    return () => clearInterval(interval);
  }, [checkLowStock]);

  // Load branches once on mount (do not re-run when selection changes)
  useEffect(() => {
    const fetchBranches = async () => {
      try {
        const res = await axios.get("/api/auth/branches", { timeout: 15000 });
        const list = Array.isArray(res.data) ? res.data : [];
        setBranches(list);
        // Default to first branch if none selected, or if selected ID no longer exists
        if (list.length > 0 && (!selectedBranchId || !list.find((b: any) => b.id === selectedBranchId))) {
          setSelectedBranchId(list[0].id);
        }
      } catch (err) {
        console.error("Failed to load branches", err);
        setBranches([]);
      }
    };
    fetchBranches();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional mount-only fetch
  }, []);

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  const navItems = [
    { name: "Dashboard", path: "/", icon: LayoutDashboard, iconSrc: "/icons/sidebar/dashboard.png", roles: ["SUPER_ADMIN", "OWNER", "MANAGER", "CASHIER", "WAREHOUSE", "TECHNICIAN"] },
    { name: "POS Sales", path: "/pos", icon: ShoppingCart, iconSrc: "/icons/sidebar/pos.png", roles: ["OWNER", "MANAGER", "CASHIER"] },
    { name: "Sales History", path: "/sales-history", icon: FileText, iconSrc: "/icons/sidebar/sales-history.png", roles: ["OWNER", "MANAGER", "CASHIER"] },
    { name: "Installments", path: "/installments", icon: CreditCard, iconSrc: "/icons/sidebar/installments.png", roles: ["OWNER", "MANAGER", "CASHIER"] },
    { name: "Inventory", path: "/inventory", icon: Package, iconSrc: "/icons/sidebar/inventory.png", roles: ["OWNER", "MANAGER", "WAREHOUSE"] },
    { name: "Brands & Categories", path: "/categories-brands", icon: Layers, iconSrc: "/icons/sidebar/categories.png", roles: ["OWNER", "MANAGER"] },
    { name: "Contacts", path: "/contacts", icon: Users, iconSrc: "/icons/sidebar/contacts.png", roles: ["OWNER", "MANAGER", "CASHIER"] },
    { name: "Accounting", path: "/accounting", icon: Briefcase, iconSrc: "/icons/sidebar/accounting.png", roles: ["OWNER", "MANAGER"] },
    { name: "Branches", path: "/admin/branches", icon: ShoppingBag, iconSrc: "/icons/sidebar/dashboard.png", roles: ["SUPER_ADMIN"] },
    { name: "Platform Users", path: "/admin/users", icon: Users, iconSrc: "/icons/sidebar/contacts.png", roles: ["SUPER_ADMIN"] },
    { name: "All Products", path: "/admin/products", icon: Package, iconSrc: "/icons/sidebar/inventory.png", roles: ["SUPER_ADMIN"] },
    { name: "Platform Sales", path: "/admin/sales", icon: FileText, iconSrc: "/icons/sidebar/sales-history.png", roles: ["SUPER_ADMIN"] },
    { name: "Customers", path: "/admin/customers", icon: Users, iconSrc: "/icons/sidebar/contacts.png", roles: ["SUPER_ADMIN"] },
    { name: "Settings", path: "/settings", icon: Settings, iconSrc: "/icons/sidebar/settings.png", roles: ["OWNER", "MANAGER"] }
  ];

  const activeBranch = branches.find(b => b.id === selectedBranchId);

  return (
    <div className="flex h-screen bg-background text-foreground transition-all duration-300 overflow-hidden">
      <ToastContainer />

      {/* Sidebar (Desktop) */}
      <aside
        className={`hidden md:flex flex-col justify-between ${sidebarOpen ? "w-64" : "w-20"
          } bg-card border-r border-border transition-all duration-300 relative z-30`}
      >
        <div>
          {/* Logo Section */}
          <div className={`h-16 flex items-center border-b border-border relative ${sidebarOpen ? "px-5" : "justify-center"}`}>
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-xl bg-primary text-white flex-shrink-0">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
                </svg>
              </div>
              {sidebarOpen && (
                <span className="font-bold text-lg tracking-tight bg-gradient-to-r from-foreground to-muted-foreground bg-clip-text text-transparent">
                  {activeBranch?.name || "POS"}
                </span>
              )}
            </div>
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="absolute -right-3 top-5 bg-card border border-border p-1 rounded-full text-muted-foreground hover:text-foreground shadow-md z-50 transition"
            >
              <ChevronRight className={`w-4 h-4 transition-transform duration-300 ${sidebarOpen ? "rotate-180" : ""}`} />
            </button>
          </div>

          {/* Navigation Links */}
          <nav className="p-3 space-y-1">
            {navItems
              .filter(item => user && item.roles.includes(user.role))
              .map(item => {
                const Icon = item.icon;
                const isActive = location.pathname === item.path;
                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    className={`flex items-center gap-3 px-4 py-3 rounded-xl transition duration-150 ${isActive
                        ? "bg-primary text-white shadow-lg shadow-primary/20"
                        : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                      }`}
                  >
                    {item.iconSrc ? (
                      <span
                        className={`w-7 h-7 flex-shrink-0 rounded-lg flex items-center justify-center p-0.5 ${
                          isActive ? "bg-white/20" : "bg-primary/10"
                        }`}
                      >
                        <img
                          src={`${item.iconSrc}?v=2`}
                          alt=""
                          className="w-full h-full object-contain"
                          draggable={false}
                        />
                      </span>
                    ) : (
                      <Icon className="w-5 h-5 flex-shrink-0" />
                    )}
                    {sidebarOpen && <span className="font-medium text-sm">{item.name}</span>}
                  </Link>
                );
              })}
          </nav>
        </div>

        {/* User Card & Settings */}
        <div className={`border-t border-border space-y-4 ${sidebarOpen ? "p-4" : "p-2"}`}>
          {sidebarOpen && user && (
            <div className="flex items-center gap-3 p-2 bg-secondary/50 rounded-xl border border-border">
              <div className="w-9 h-9 rounded-lg bg-primary/20 text-primary flex items-center justify-center font-bold">
                {user.name.charAt(0)}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-bold truncate">{user.name}</p>
                <div className="flex items-center gap-1 mt-0.5">
                  <ShieldCheck className={`w-3.5 h-3.5 ${user.role === "SUPER_ADMIN" ? "text-amber-500" : "text-blue-400"}`} />
                  {user.role === "SUPER_ADMIN" ? (
                    <span className="text-[10px] text-amber-500 uppercase font-bold bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/20">
                      Super Admin
                    </span>
                  ) : (
                    <span className="text-[10px] text-muted-foreground uppercase font-semibold">{user.role}</span>
                  )}
                </div>
              </div>
              {user.role === "SUPER_ADMIN" && (
                <button
                  onClick={() => { setPasswordModal(true); setPwCurrent(""); setPwNew(""); setPwConfirm(""); }}
                  title="Change Password"
                  className="p-1.5 rounded-lg text-muted-foreground hover:text-amber-500 hover:bg-amber-500/10 transition"
                >
                  <Lock className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          )}

          <div className="flex flex-col gap-1">
            {/* Theme Toggle */}
            <button
              onClick={toggleTheme}
              className={`flex items-center gap-3 py-2.5 rounded-xl text-muted-foreground hover:bg-secondary hover:text-foreground transition ${sidebarOpen ? "px-4" : "justify-center"}`}
            >
              {theme === "dark" ? (
                <>
                  <Sun className="w-5 h-5" />
                  {sidebarOpen && <span className="text-sm font-medium">Light Mode</span>}
                </>
              ) : (
                <>
                  <Moon className="w-5 h-5" />
                  {sidebarOpen && <span className="text-sm font-medium">Dark Mode</span>}
                </>
              )}
            </button>

            {/* Logout */}
            <button
              onClick={handleLogout}
              className={`flex items-center gap-3 py-2.5 rounded-xl text-destructive hover:bg-destructive/10 transition ${sidebarOpen ? "px-4" : "justify-center"}`}
            >
              <LogOut className="w-5 h-5" />
              {sidebarOpen && <span className="text-sm font-medium">Logout</span>}
            </button>
          </div>
        </div>
      </aside>

      {/* Mobile Drawer Backdrop */}
      {mobileSidebarOpen && (
        <div
          onClick={() => setMobileSidebarOpen(false)}
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 md:hidden"
        />
      )}

      {/* Mobile Sidebar Content */}
      <aside
        className={`fixed top-0 bottom-0 left-0 w-64 bg-card border-r border-border flex flex-col justify-between z-50 transition-transform duration-300 md:hidden ${
          mobileSidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div>
          {/* Logo Section */}
          <div className="h-16 flex items-center justify-between border-b border-border px-5">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-xl bg-primary text-white flex-shrink-0">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
                </svg>
              </div>
              <span className="font-bold text-lg tracking-tight bg-gradient-to-r from-foreground to-muted-foreground bg-clip-text text-transparent">
                {activeBranch?.name || "POS"}
              </span>
            </div>
            <button
              onClick={() => setMobileSidebarOpen(false)}
              className="bg-secondary hover:bg-secondary/80 p-1.5 rounded-lg border border-border text-muted-foreground hover:text-foreground transition"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Navigation Links */}
          <nav className="p-3 space-y-1">
            {navItems
              .filter(item => user && item.roles.includes(user.role))
              .map(item => {
                const Icon = item.icon;
                const isActive = location.pathname === item.path;
                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    className={`flex items-center gap-3 px-4 py-3 rounded-xl transition duration-150 ${isActive
                        ? "bg-primary text-white shadow-lg shadow-primary/20"
                        : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                      }`}
                  >
                    {item.iconSrc ? (
                      <span
                        className={`w-7 h-7 flex-shrink-0 rounded-lg flex items-center justify-center p-0.5 ${
                          isActive ? "bg-white/20" : "bg-primary/10"
                        }`}
                      >
                        <img
                          src={`${item.iconSrc}?v=2`}
                          alt=""
                          className="w-full h-full object-contain"
                          draggable={false}
                        />
                      </span>
                    ) : (
                      <Icon className="w-5 h-5 flex-shrink-0" />
                    )}
                    <span className="font-medium text-sm">{item.name}</span>
                  </Link>
                );
              })}
          </nav>
        </div>

        {/* User Card & Settings */}
        <div className="border-t border-border p-4 space-y-4">
          {user && (
            <div className="flex items-center gap-3 p-2 bg-secondary/50 rounded-xl border border-border">
              <div className="w-9 h-9 rounded-lg bg-primary/20 text-primary flex items-center justify-center font-bold">
                {user.name.charAt(0)}
              </div>
              <div className="min-w-0">
                <p className="text-xs font-bold truncate">{user.name}</p>
                <div className="flex items-center gap-1 mt-0.5">
                  <ShieldCheck className={`w-3.5 h-3.5 ${user.role === "SUPER_ADMIN" ? "text-amber-500" : "text-blue-400"}`} />
                  {user.role === "SUPER_ADMIN" ? (
                    <span className="text-[10px] text-amber-500 uppercase font-bold bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/20">
                      Super Admin
                    </span>
                  ) : (
                    <span className="text-[10px] text-muted-foreground uppercase font-semibold">{user.role}</span>
                  )}
                </div>
              </div>
            </div>
          )}

          <div className="flex flex-col gap-1">
            <button
              onClick={toggleTheme}
              className="flex items-center gap-3 px-4 py-2.5 rounded-xl text-muted-foreground hover:bg-secondary hover:text-foreground transition"
            >
              {theme === "dark" ? (
                <>
                  <Sun className="w-5 h-5" />
                  <span className="text-sm font-medium">Light Mode</span>
                </>
              ) : (
                <>
                  <Moon className="w-5 h-5" />
                  <span className="text-sm font-medium">Dark Mode</span>
                </>
              )}
            </button>

            <button
              onClick={handleLogout}
              className="flex items-center gap-3 px-4 py-2.5 rounded-xl text-destructive hover:bg-destructive/10 transition"
            >
              <LogOut className="w-5 h-5" />
              <span className="text-sm font-medium">Logout</span>
            </button>
          </div>
        </div>
      </aside>

      {/* Main Workspace */}
      <div className="flex-1 flex flex-col min-w-0 h-screen overflow-hidden">

        {/* Top Header */}
        <header className="h-16 border-b border-border bg-card flex items-center justify-between px-4 md:px-6 z-20 relative">

          {/* Active Branch Display */}
          <div className="flex items-center gap-2 md:gap-3">
            <button
              onClick={() => setMobileSidebarOpen(true)}
              className="p-2 rounded-xl bg-secondary hover:bg-secondary/80 border border-border text-foreground transition md:hidden flex-shrink-0"
              title="Open menu"
            >
              <Menu className="w-4 h-4" />
            </button>
            <span className="text-xs md:text-sm font-semibold text-muted-foreground hidden sm:inline">Store Branch:</span>
            {user && (user.role === "OWNER" || user.role === "MANAGER") ? (
              <select
                value={selectedBranchId || ""}
                onChange={(e) => {
                  setSelectedBranchId(e.target.value);
                  window.location.reload();
                }}
                className="bg-secondary text-foreground text-sm font-bold border border-border px-3 py-1.5 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary"
              >
                {branches.map(b => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            ) : (
              <span className="text-sm font-bold bg-secondary px-3 py-1.5 rounded-lg border border-border">
                {activeBranch?.name || "Loading..."}
              </span>
            )}
          </div>

          {/* Notifications & Settings Actions */}
          <div className="flex items-center gap-4 relative">

            {/* Low Stock Alert Badge */}
            {lowStockCount > 0 && (
              <button
                onClick={() => navigate("/inventory")}
                className="p-2 rounded-xl bg-amber-50 hover:bg-amber-100 border border-amber-200 text-amber-600 dark:bg-amber-500/10 dark:hover:bg-amber-500/20 dark:border-amber-500/30 dark:text-amber-400 transition relative"
                title="Low stock items"
              >
                <AlertTriangle className="w-5 h-5" />
                <span className="absolute -top-1.5 -right-1.5 bg-amber-500 text-white text-[9px] font-bold w-5 h-5 flex items-center justify-center rounded-full">
                  {lowStockCount}
                </span>
              </button>
            )}

            {/* Fullscreen Toggle */}
            <button
              onClick={toggleFullscreen}
              className="p-2 rounded-xl bg-secondary hover:bg-secondary/80 border border-border text-foreground transition"
              title={isFullscreen ? "Exit fullscreen (Ctrl/Cmd+Shift+F)" : "Enter fullscreen (Ctrl/Cmd+Shift+F)"}
            >
              {isFullscreen ? <Minimize2 className="w-5 h-5" /> : <Maximize2 className="w-5 h-5" />}
            </button>

            {/* Bell Notifications */}
            <button
              onClick={() => setNotifOpen(!notifOpen)}
              className="p-2 rounded-xl bg-secondary hover:bg-secondary/80 border border-border text-foreground transition relative"
            >
              <Bell className="w-5 h-5" />
              {notifications.length > 0 && (
                <span className="absolute top-1 right-1 w-2.5 h-2.5 bg-red-500 rounded-full animate-pulse" />
              )}
            </button>

            {/* Notification Menu */}
            {notifOpen && (
              <div className="absolute right-0 top-12 w-80 bg-card border border-border rounded-xl shadow-xl p-4 space-y-3 z-50">
                <div className="flex items-center justify-between border-b border-border pb-2">
                  <h4 className="font-bold text-sm">Notifications ({notifications.length})</h4>
                  <button onClick={() => setNotifOpen(false)} className="text-xs text-muted-foreground hover:underline">Close</button>
                </div>
                <div className="max-h-60 overflow-y-auto space-y-2">
                  {notifications.length === 0 ? (
                    <p className="text-xs text-center text-muted-foreground py-4">No new alerts.</p>
                  ) : (
                    notifications.map(n => (
                      <div
                        key={n.id}
                        className={`p-2.5 rounded-lg text-xs flex justify-between gap-2 border bg-card/60 backdrop-blur-sm ${n.type === "warning"
                            ? "border-l-4 border-l-amber-500 border-y border-r border-border text-foreground"
                            : n.type === "success"
                              ? "border-l-4 border-l-emerald-500 border-y border-r border-border text-foreground"
                              : "border-l-4 border-l-blue-500 border-y border-r border-border text-foreground"
                          }`}
                      >
                        <div>
                          <p className="font-medium">{n.message}</p>
                          <span className="text-[10px] text-muted-foreground block mt-1">
                            {new Date(n.timestamp).toLocaleTimeString()}
                          </span>
                        </div>
                        <button
                          onClick={() => clearNotification(n.id)}
                          className="text-muted-foreground hover:text-foreground text-[10px] self-start"
                        >
                          Dismiss
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
        </header>

        {/* Dynamic Route Pages Content */}
        <main className="flex-1 overflow-y-auto p-4 md:p-6 flex flex-col">
          <Outlet />
        </main>
      </div>

      {/* Change Password Modal */}
      {passwordModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setPasswordModal(false)}>
          <div className="bg-card border border-border rounded-2xl p-6 w-full max-w-md shadow-2xl mx-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-lg font-bold text-foreground">Change Password</h3>
              <button onClick={() => setPasswordModal(false)} className="p-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (!pwCurrent || !pwNew || !pwConfirm) {
                  addNotification("All fields are required.", "warning");
                  return;
                }
                if (pwNew !== pwConfirm) {
                  addNotification("New passwords do not match.", "warning");
                  return;
                }
                if (pwNew.length < 6) {
                  addNotification("Password must be at least 6 characters.", "warning");
                  return;
                }
                setPwLoading(true);
                try {
                  await axios.put("/api/auth/change-password", {
                    currentPassword: pwCurrent,
                    newPassword: pwNew
                  });
                  addNotification("Password changed successfully.", "success");
                  setPasswordModal(false);
                } catch (err: any) {
                  const msg = err.response?.data?.error || "Failed to change password.";
                  addNotification(msg, "warning");
                } finally {
                  setPwLoading(false);
                }
              }}
              className="space-y-4"
            >
              <div>
                <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Current Password</label>
                <input
                  type="password"
                  value={pwCurrent}
                  onChange={(e) => setPwCurrent(e.target.value)}
                  className="w-full bg-secondary text-foreground border border-border px-4 py-2.5 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/50"
                  placeholder="Enter current password"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">New Password</label>
                <input
                  type="password"
                  value={pwNew}
                  onChange={(e) => setPwNew(e.target.value)}
                  className="w-full bg-secondary text-foreground border border-border px-4 py-2.5 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/50"
                  placeholder="At least 6 characters"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Confirm New Password</label>
                <input
                  type="password"
                  value={pwConfirm}
                  onChange={(e) => setPwConfirm(e.target.value)}
                  className="w-full bg-secondary text-foreground border border-border px-4 py-2.5 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/50"
                  placeholder="Repeat new password"
                />
              </div>
              <button
                type="submit"
                disabled={pwLoading}
                className="w-full bg-primary hover:bg-primary/95 text-white font-medium py-2.5 rounded-xl flex items-center justify-center transition disabled:opacity-50"
              >
                {pwLoading ? <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : "Update Password"}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
