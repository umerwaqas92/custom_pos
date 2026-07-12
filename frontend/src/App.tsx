import React, { useState, useEffect } from "react";
import { BrowserRouter, Routes, Route, Navigate, Link } from "react-router-dom";
import axios from "axios";
import { useStore } from "./store/useStore";
import Layout from "./components/Layout";
import TrialExpiredOverlay from "./components/TrialExpiredOverlay";
import { ToastContainer } from "./components/Toast";

// Import pages
import Dashboard from "./pages/Dashboard";
import POS from "./pages/POS";
import Inventory from "./pages/Inventory";
import Contacts from "./pages/Contacts";
import Installments from "./pages/Installments";
import Accounting from "./pages/Accounting";
import CategoriesBrands from "./pages/CategoriesBrands";
import SalesHistory from "./pages/SalesHistory";
import Settings from "./pages/Settings";
import SuperAdminBranches from "./pages/SuperAdminBranches";
import SuperAdminUsers from "./pages/SuperAdminUsers";
import SuperAdminProducts from "./pages/SuperAdminProducts";
import SuperAdminSales from "./pages/SuperAdminSales";
import SuperAdminCustomers from "./pages/SuperAdminCustomers";

// API base: production uses same origin (PHP /api on shared host).
// Dev defaults to Node backend; override with VITE_API_URL (e.g. http://localhost:8080 for PHP).
axios.defaults.baseURL =
  import.meta.env.VITE_API_URL ??
  (import.meta.env.PROD ? "" : "http://localhost:5001");

// InfinityFree / shared hosts often strip Authorization — also send X-Access-Token.
axios.defaults.timeout = 25000;
axios.interceptors.request.use((config) => {
  const token =
    (typeof localStorage !== "undefined" && localStorage.getItem("pos_token")) ||
    (axios.defaults.headers.common["Authorization"] as string | undefined)?.replace(/^Bearer\s+/i, "") ||
    null;
  if (token) {
    config.headers = config.headers ?? {};
    config.headers.Authorization = `Bearer ${token}`;
    config.headers["X-Access-Token"] = token;
  }
  return config;
});

// Login + Admin Signup
function Login() {
  const { login, addNotification, theme } = useStore();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [shopName, setShopName] = useState("");
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    const root = window.document.documentElement;
    root.classList.remove("light", "dark");
    root.classList.add(theme);
  }, [theme]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      addNotification("Please enter both email and password.", "warning");
      return;
    }
    setLoading(true);
    try {
      const response = await axios.post("/api/auth/login", { email, password });
      const { token, user } = response.data;
      login(token, user);
      addNotification(`Welcome back, ${user.name}!`, "success");
    } catch (err: any) {
      const msg = err.response?.data?.error || "Login failed. Please check your credentials.";
      addNotification(msg, "warning");
    } finally {
      setLoading(false);
    }
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !email.trim() || !password) {
      addNotification("Name, email, and password are required.", "warning");
      return;
    }
    if (password.length < 6) {
      addNotification("Password must be at least 6 characters.", "warning");
      return;
    }
    setLoading(true);
    try {
      const response = await axios.post("/api/auth/signup", {
        name: name.trim(),
        email: email.trim(),
        password,
        shopName: shopName.trim() || undefined,
        phone: phone.trim() || undefined
      });
      const { token, user } = response.data;
      login(token, user);
      addNotification(`Welcome, ${user.name}! Your admin account is ready.`, "success");
    } catch (err: any) {
      const msg = err.response?.data?.error || "Signup failed. Please try a different email.";
      addNotification(msg, "warning");
    } finally {
      setLoading(false);
    }
  };

  const inputCls =
    "w-full bg-secondary text-foreground border border-border px-4 py-3 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/50 placeholder-muted-foreground transition duration-200";

  return (
    <>
      <ToastContainer />
      <div className="min-h-screen flex items-center justify-center bg-background px-4 py-8">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(59,130,246,0.08),transparent_50%)] pointer-events-none" />

      <div className="w-full max-w-md bg-card border border-border p-8 rounded-2xl shadow-2xl relative overflow-hidden backdrop-blur-md">
        <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-500" />

        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-primary/10 text-primary mb-3">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-8 h-8">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold tracking-tight text-foreground">POS System</h2>
          <p className="text-sm text-muted-foreground mt-1">
            {mode === "login" ? "Sign in to your shop" : "Create admin (owner) account"}
          </p>
        </div>

        {/* Login / Signup toggle */}
        <div className="flex gap-1 bg-secondary/80 border border-border p-1 rounded-xl mb-6">
          <button
            type="button"
            onClick={() => setMode("login")}
            className={`flex-1 py-2 rounded-lg text-xs font-bold transition ${
              mode === "login" ? "bg-primary text-white shadow-sm" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Sign In
          </button>
          <button
            type="button"
            onClick={() => setMode("signup")}
            className={`flex-1 py-2 rounded-lg text-xs font-bold transition ${
              mode === "signup" ? "bg-primary text-white shadow-sm" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Admin Signup
          </button>
        </div>

        {mode === "login" ? (
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Email</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="admin@shop.com" className={inputCls} autoComplete="email" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Password</label>
              <div className="relative">
                <input type={showPassword ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" className={`${inputCls} pr-10`} autoComplete="current-password" />
                <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition">
                  {showPassword ? (
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
            </div>
            <button type="submit" disabled={loading} className="w-full bg-primary hover:bg-primary/95 text-white font-medium py-3 rounded-xl flex items-center justify-center transition disabled:opacity-50">
              {loading ? <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : "Sign In"}
            </button>
          </form>
        ) : (
          <form onSubmit={handleSignup} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Full name *</label>
              <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" className={inputCls} required />
            </div>
            <div>
              <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Shop name</label>
              <input type="text" value={shopName} onChange={(e) => setShopName(e.target.value)} placeholder="Default Store (optional)" className={inputCls} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Email *</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="admin@shop.com" className={inputCls} required autoComplete="email" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Password * (min 6)</label>
              <div className="relative">
                <input type={showPassword ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" className={`${inputCls} pr-10`} required autoComplete="new-password" />
                <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition">
                  {showPassword ? (
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
            </div>
            <div>
              <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Phone</label>
              <input type="text" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Optional" className={inputCls} />
            </div>
            <button type="submit" disabled={loading} className="w-full bg-primary hover:bg-primary/95 text-white font-medium py-3 rounded-xl flex items-center justify-center transition disabled:opacity-50">
              {loading ? <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : "Create Admin Account"}
            </button>
            <p className="text-[11px] text-muted-foreground text-center">
              Creates an <strong className="text-foreground">OWNER</strong> account. After signup you can add cashiers & technicians in Settings → Staff.
            </p>
          </form>
        )}
      </div>
    </>
  );
}

// Role Guard Component
interface GuardProps {
  children: React.ReactNode;
  allowedRoles: string[];
}

function RoleGuard({ children, allowedRoles }: GuardProps) {
  const { user } = useStore();

  if (!user) return <Navigate to="/login" replace />;

  if (!allowedRoles.includes(user.role)) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-16 h-16 text-destructive mb-4">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m0-10.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.75c0 5.592 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.57-.598-3.75h-.152c-3.196 0-6.1-1.249-8.25-3.286zm0 13.036h.008v.008H12v-.008z" />
        </svg>
        <h3 className="text-xl font-bold text-foreground">Access Denied</h3>
        <p className="text-muted-foreground mt-1 max-w-sm">Your staff account role ({user.role}) does not have permission to view this panel.</p>
        <Link to="/" className="mt-4 bg-primary px-5 py-2 rounded-xl text-white font-medium hover:bg-primary/95 transition">
          Return to Dashboard
        </Link>
      </div>
    );
  }

  return <>{children}</>;
}

export default function App() {
  const { token, theme, loadSettings, logout } = useStore();
  const [trialExpired, setTrialExpired] = useState(false);
  const [activated, setActivated] = useState(localStorage.getItem("pos_activated") === "true");
  const [sessionChecked, setSessionChecked] = useState(!token);

  // If a stored token is invalid/stale, clear it so user is not stuck on loading dashboard
  useEffect(() => {
    if (!token) {
      setSessionChecked(true);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        await axios.get("/api/auth/me", { timeout: 12000 });
      } catch {
        if (!cancelled) {
          logout();
        }
      } finally {
        if (!cancelled) setSessionChecked(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, logout]);

  // Handle checking trial duration (30 days)
  useEffect(() => {
    let trialStart = localStorage.getItem("pos_trial_start");
    if (!trialStart) {
      trialStart = new Date().toISOString();
      localStorage.setItem("pos_trial_start", trialStart);
    }

    const checkTrialStatus = () => {
      const isActivated = localStorage.getItem("pos_activated") === "true";
      setActivated(isActivated);

      if (isActivated) {
        setTrialExpired(false);
        return;
      }

      const startDate = new Date(trialStart!);
      const thirtyDays = 30 * 24 * 60 * 60 * 1000; // 30 days in milliseconds
      const expiryTime = startDate.getTime() + thirtyDays;
      
      if (Date.now() > expiryTime) {
        setTrialExpired(true);
      } else {
        setTrialExpired(false);
      }
    };

    checkTrialStatus();
    const interval = setInterval(checkTrialStatus, 15000); // Check status periodically
    return () => clearInterval(interval);
  }, []);

  const handleResetTrial = () => {
    const newStart = new Date().toISOString();
    localStorage.setItem("pos_trial_start", newStart);
    localStorage.removeItem("pos_activated");
    setActivated(false);
    setTrialExpired(false);
    window.location.reload();
  };

  const handleActivate = () => {
    setActivated(true);
    setTrialExpired(false);
  };

  // Configure Axios interceptors for Authorization Header
  useEffect(() => {
    if (token) {
      axios.defaults.headers.common["Authorization"] = `Bearer ${token}`;
      // Load settings from backend when token is available
      loadSettings();
    } else {
      delete axios.defaults.headers.common["Authorization"];
    }
  }, [token]);

  // Handle active dark mode toggles
  useEffect(() => {
    const root = window.document.documentElement;
    root.classList.remove("light", "dark");
    root.classList.add(theme);
  }, [theme]);

  if (!sessionChecked) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 bg-background text-foreground">
        <span className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
        <p className="text-sm text-muted-foreground">Checking session…</p>
        <button
          type="button"
          className="text-xs text-primary underline"
          onClick={() => {
            logout();
            setSessionChecked(true);
          }}
        >
          Skip to login
        </button>
      </div>
    );
  }

  return (
    <>
      <BrowserRouter>
      <Routes>
        <Route path="/login" element={!token ? <Login /> : <Navigate to="/" replace />} />

        <Route
          path="/"
          element={token ? <Layout /> : <Navigate to="/login" replace />}
        >
          {/* Dashboard (All users can view) */}
          <Route index element={<Dashboard />} />

          {/* POS (Cashier, Owner, Manager) */}
          <Route
            path="pos"
            element={
              <RoleGuard allowedRoles={["OWNER", "MANAGER", "CASHIER"]}>
                <POS />
              </RoleGuard>
            }
          />

          {/* Inventory (Warehouse, Manager, Owner) */}
          <Route
            path="inventory"
            element={
              <RoleGuard allowedRoles={["OWNER", "MANAGER", "WAREHOUSE"]}>
                <Inventory />
              </RoleGuard>
            }
          />



          {/* Installments (Owner, Manager, Cashier) */}
          <Route
            path="installments"
            element={
              <RoleGuard allowedRoles={["OWNER", "MANAGER", "CASHIER"]}>
                <Installments />
              </RoleGuard>
            }
          />

          {/* Contacts (Owner, Manager, Cashier) */}
          <Route
            path="contacts"
            element={
              <RoleGuard allowedRoles={["OWNER", "MANAGER", "CASHIER"]}>
                <Contacts />
              </RoleGuard>
            }
          />

          {/* Accounting (Owner, Manager) */}
          <Route
            path="accounting"
            element={
              <RoleGuard allowedRoles={["OWNER", "MANAGER"]}>
                <Accounting />
              </RoleGuard>
            }
          />

          {/* Categories & Brands (Owner, Manager) */}
          <Route
            path="categories-brands"
            element={
              <RoleGuard allowedRoles={["OWNER", "MANAGER"]}>
                <CategoriesBrands />
              </RoleGuard>
            }
          />

          {/* Sales History (Owner, Manager, Cashier) */}
          <Route
            path="sales-history"
            element={
              <RoleGuard allowedRoles={["OWNER", "MANAGER", "CASHIER"]}>
                <SalesHistory />
              </RoleGuard>
            }
          />

          {/* Configuration Settings (Owner, Manager) */}
          <Route
            path="settings"
            element={
              <RoleGuard allowedRoles={["OWNER", "MANAGER"]}>
                <Settings />
              </RoleGuard>
            }
          />

          {/* Super Admin Routes */}
          <Route
            path="admin/branches"
            element={
              <RoleGuard allowedRoles={["SUPER_ADMIN"]}>
                <SuperAdminBranches />
              </RoleGuard>
            }
          />
          <Route
            path="admin/users"
            element={
              <RoleGuard allowedRoles={["SUPER_ADMIN"]}>
                <SuperAdminUsers />
              </RoleGuard>
            }
          />
          <Route
            path="admin/products"
            element={
              <RoleGuard allowedRoles={["SUPER_ADMIN"]}>
                <SuperAdminProducts />
              </RoleGuard>
            }
          />
          <Route
            path="admin/sales"
            element={
              <RoleGuard allowedRoles={["SUPER_ADMIN"]}>
                <SuperAdminSales />
              </RoleGuard>
            }
          />
          <Route
            path="admin/customers"
            element={
              <RoleGuard allowedRoles={["SUPER_ADMIN"]}>
                <SuperAdminCustomers />
              </RoleGuard>
            }
          />

          {/* Reports page hidden — redirect if bookmarked */}
          <Route path="reports" element={<Navigate to="/" replace />} />

          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
    {trialExpired && !activated && (
      <TrialExpiredOverlay onActivate={handleActivate} onResetTrial={handleResetTrial} />
    )}
  </>
);
}
