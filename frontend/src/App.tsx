import React, { useState, useEffect } from "react";
import { BrowserRouter, Routes, Route, Navigate, Link } from "react-router-dom";
import axios from "axios";
import { useStore } from "./store/useStore";
import Layout from "./components/Layout";

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

// Set Axios Base URL
axios.defaults.baseURL = "http://localhost:5001";

// Login Page Component
function Login() {
  const { login, addNotification, theme } = useStore();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  // Auto-apply theme on load
  useEffect(() => {
    const root = window.document.documentElement;
    root.classList.remove("light", "dark");
    root.classList.add(theme);
  }, [theme]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username || !password) {
      addNotification("Please enter both username and password.", "warning");
      return;
    }

    setLoading(true);
    try {
      const response = await axios.post("/api/auth/login", { username, password });
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

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      {/* Background radial glow */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(59,130,246,0.08),transparent_50%)] pointer-events-none" />

      <div className="w-full max-w-md bg-card border border-border p-8 rounded-2xl shadow-2xl relative overflow-hidden backdrop-blur-md">
        {/* Glow accent */}
        <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-500" />
        
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-primary/10 text-primary mb-3">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-8 h-8">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold tracking-tight text-foreground">QUICKO ELECTRONICS POS</h2>
          <p className="text-sm text-muted-foreground mt-1">Electronics Shop Management Dashboard</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Username</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="e.g., admin, cashier, tech"
              className="w-full bg-secondary text-foreground border border-border px-4 py-3 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/50 placeholder-muted-foreground transition duration-200"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full bg-secondary text-foreground border border-border px-4 py-3 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/50 placeholder-muted-foreground transition duration-200"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-primary hover:bg-primary/95 text-white font-medium py-3 rounded-xl flex items-center justify-center transition duration-200 disabled:opacity-50"
          >
            {loading ? (
              <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              "Sign In"
            )}
          </button>
        </form>

        <div className="mt-8 text-center text-xs text-muted-foreground">
          <p>Default logins: <strong>admin</strong> / <strong>admin123</strong> (Owner)</p>
          <p className="mt-1">Staff: <strong>cashier</strong> or <strong>tech</strong> / <strong>staff123</strong></p>
        </div>
      </div>
    </div>
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
  const { token, theme } = useStore();

  // Configure Axios interceptors for Authorization Header
  useEffect(() => {
    if (token) {
      axios.defaults.headers.common["Authorization"] = `Bearer ${token}`;
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

  return (
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

          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
