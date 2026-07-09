import { create } from "zustand";

export interface User {
  id: string;
  name: string;
  username: string;
  role: string;
  email?: string;
  phone?: string;
  branch?: {
    id: string;
    name: string;
  };
}

export interface Branch {
  id: string;
  name: string;
  address?: string;
  phone?: string;
}

export interface CartItem {
  productId: string;
  name: string;
  sku: string;
  sellingPrice: number;
  quantity: number;
  discount: number; // percentage
  tax: number; // percentage
  serialNumber?: string;
  imei?: string;
  stockLimit: number; // branch stock limit
}

export interface SystemNotification {
  id: string;
  message: string;
  type: "info" | "warning" | "success";
  timestamp: Date;
}

interface StateStore {
  token: string | null;
  user: User | null;
  branches: Branch[];
  selectedBranchId: string | null;
  cart: CartItem[];
  notifications: SystemNotification[];
  theme: "light" | "dark";
  
  // Actions
  login: (token: string, user: User) => void;
  logout: () => void;
  setBranches: (branches: Branch[]) => void;
  setSelectedBranchId: (id: string) => void;
  addToCart: (product: any, branchStockQty: number) => void;
  removeFromCart: (productId: string) => void;
  updateCartQty: (productId: string, quantity: number) => void;
  updateCartItemDetails: (productId: string, details: Partial<CartItem>) => void;
  clearCart: () => void;
  addNotification: (message: string, type?: "info" | "warning" | "success") => void;
  clearNotification: (id: string) => void;
  toggleTheme: () => void;
}

export const useStore = create<StateStore>((set) => ({
  token: localStorage.getItem("pos_token"),
  user: localStorage.getItem("pos_user") ? JSON.parse(localStorage.getItem("pos_user")!) : null,
  branches: [],
  selectedBranchId: localStorage.getItem("pos_branch_id"),
  cart: [],
  notifications: [],
  theme: (localStorage.getItem("pos_theme") as "light" | "dark") || "dark",

  login: (token, user) => {
    localStorage.setItem("pos_token", token);
    localStorage.setItem("pos_user", JSON.stringify(user));
    const branchId = user.branch?.id || null;
    if (branchId) {
      localStorage.setItem("pos_branch_id", branchId);
    }
    set({ token, user, selectedBranchId: branchId });
  },

  logout: () => {
    localStorage.removeItem("pos_token");
    localStorage.removeItem("pos_user");
    localStorage.removeItem("pos_branch_id");
    set({ token: null, user: null, selectedBranchId: null, cart: [] });
  },

  setBranches: (branches) => set({ branches }),

  setSelectedBranchId: (id) => {
    localStorage.setItem("pos_branch_id", id);
    set({ selectedBranchId: id });
  },

  addToCart: (product, branchStockQty) =>
    set((state) => {
      const existing = state.cart.find((item) => item.productId === product.id);
      if (existing) {
        if (existing.quantity >= branchStockQty) {
          state.addNotification(`Cannot exceed available stock (${branchStockQty}) for ${product.name}`, "warning");
          return {};
        }
        return {
          cart: state.cart.map((item) =>
            item.productId === product.id
              ? { ...item, quantity: item.quantity + 1 }
              : item
          ),
        };
      }
      const newItem: CartItem = {
        productId: product.id,
        name: product.name,
        sku: product.sku,
        sellingPrice: product.sellingPrice,
        quantity: 1,
        discount: product.discountRate || 0,
        tax: product.taxRate || 0,
        stockLimit: branchStockQty,
      };
      return { cart: [...state.cart, newItem] };
    }),

  removeFromCart: (productId) =>
    set((state) => ({
      cart: state.cart.filter((item) => item.productId !== productId),
    })),

  updateCartQty: (productId, quantity) =>
    set((state) => {
      const item = state.cart.find((i) => i.productId === productId);
      if (item && quantity > item.stockLimit) {
        state.addNotification(`Cannot exceed available stock limit of ${item.stockLimit}`, "warning");
        return {};
      }
      return {
        cart: state.cart.map((i) =>
          i.productId === productId ? { ...i, quantity: Math.max(1, quantity) } : i
        ),
      };
    }),

  updateCartItemDetails: (productId, details) =>
    set((state) => ({
      cart: state.cart.map((i) =>
        i.productId === productId ? { ...i, ...details } : i
      ),
    })),

  clearCart: () => set({ cart: [] }),

  addNotification: (message, type = "info") =>
    set((state) => {
      const newNotif: SystemNotification = {
        id: Math.random().toString(36).substring(7),
        message,
        type,
        timestamp: new Date(),
      };
      return { notifications: [newNotif, ...state.notifications].slice(0, 20) };
    }),

  clearNotification: (id) =>
    set((state) => ({
      notifications: state.notifications.filter((n) => n.id !== id),
    })),

  toggleTheme: () =>
    set((state) => {
      const newTheme = state.theme === "dark" ? "light" : "dark";
      localStorage.setItem("pos_theme", newTheme);
      // Update DOM class list
      const root = window.document.documentElement;
      root.classList.remove("light", "dark");
      root.classList.add(newTheme);
      return { theme: newTheme };
    }),
}));
