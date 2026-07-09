import React, { useState, useEffect, useRef } from "react";
import axios from "axios";
import { useStore, CartItem } from "../store/useStore";
import {
  Search,
  ShoppingCart,
  Plus,
  Minus,
  Trash2,
  User,
  CreditCard,
  Percent,
  Receipt,
  CheckCircle,
  X,
  Banknote,
  BookOpen,
  Landmark,
  Wallet
} from "lucide-react";

export default function POS() {
  const {
    selectedBranchId,
    cart,
    addToCart,
    removeFromCart,
    updateCartQty,
    updateCartItemDetails,
    clearCart,
    addNotification
  } = useStore();

  const [products, setProducts] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);

  // Filter and search states
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCat, setSelectedCat] = useState("ALL");
  const [selectedCustId, setSelectedCustId] = useState("");

  // Calculation parameters
  const [cartDiscount, setCartDiscount] = useState(0); // overall dollar discount
  const [paymentMethod, setPaymentMethod] = useState("CASH");
  const [amountPaid, setAmountPaid] = useState("");

  // UI States
  const [loading, setLoading] = useState(false);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [receiptResult, setReceiptResult] = useState<any | null>(null);
  const [custModalOpen, setCustModalOpen] = useState(false);

  // New Customer Form State
  const [newCust, setNewCust] = useState({ name: "", phone: "", email: "", address: "", creditLimit: "1000000" });

  const barcodeInputRef = useRef<HTMLInputElement>(null);

  const handleCreateCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCust.name || !newCust.phone) {
      addNotification("Name and phone number are required.", "warning");
      return;
    }

    try {
      const response = await axios.post("/api/accounting/customers", newCust);
      addNotification("Customer profile created successfully.", "success");
      
      // Reload customers list
      const custRes = await axios.get("/api/accounting/customers");
      setCustomers(custRes.data);
      
      // Auto-select the newly created customer
      setSelectedCustId(response.data.id);
      
      setCustModalOpen(false);
      setNewCust({ name: "", phone: "", email: "", address: "", creditLimit: "1000000" });
    } catch (err: any) {
      const msg = err.response?.data?.error || "Failed to create customer.";
      addNotification(msg, "warning");
    }
  };

  // Fetch initial data
  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      try {
        const [prodRes, catRes, custRes] = await Promise.all([
          axios.get("/api/products"),
          axios.get("/api/products/categories"),
          axios.get("/api/accounting/customers")
        ]);
        setProducts(prodRes.data);
        setCategories(catRes.data);
        setCustomers(custRes.data);
      } catch (err) {
        addNotification("Failed to load POS catalog.", "warning");
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, [addNotification]);

  // Handle barcode scanner input focusing
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      // Focus barcode input if Ctrl+B or F2 is pressed
      if (e.key === "F2") {
        e.preventDefault();
        barcodeInputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", handleKeyPress);
    return () => window.removeEventListener("keydown", handleKeyPress);
  }, []);

  // Filtered Products List
  const filteredProducts = products.filter((p) => {
    const matchesSearch =
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.sku.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (p.barcode && p.barcode.includes(searchQuery));
    
    const matchesCategory = selectedCat === "ALL" || p.categoryId === selectedCat;

    return matchesSearch && matchesCategory;
  });

  // Calculate totals
  const subtotal = cart.reduce((acc, item) => {
    const base = item.sellingPrice * item.quantity;
    const disc = base * (item.discount / 100);
    const tax = (base - disc) * (item.tax / 100);
    return acc + (base - disc + tax);
  }, 0);

  const finalTax = cart.reduce((acc, item) => {
    const base = item.sellingPrice * item.quantity;
    const disc = base * (item.discount / 100);
    return acc + (base - disc) * (item.tax / 100);
  }, 0);

  const payableAmount = Math.max(0, subtotal - cartDiscount);

  // Automatically adjust amountPaid when payableAmount or paymentMethod changes
  useEffect(() => {
    setAmountPaid(payableAmount.toFixed(2));
  }, [payableAmount, paymentMethod]);

  const handleInstantCheckout = async () => {
    const paid = Number(amountPaid);

    if (isNaN(paid) || paid < 0) {
      addNotification("Please enter a valid paid amount.", "warning");
      return;
    }

    if (paymentMethod === "CREDIT" && !selectedCustId) {
      addNotification("Please select a customer for Credit Sales.", "warning");
      return;
    }

    // Verify serial numbers for all items in the cart
    const missingSerial = cart.some(item => {
      const p = products.find(prod => prod.id === item.productId);
      // If product serial/IMEI is required by type
      return (p?.serialNumber || p?.imei) && !item.serialNumber && !item.imei;
    });

    if (missingSerial) {
      addNotification("Please provide a Serial/IMEI number for all marked electronics products.", "warning");
      return;
    }

    try {
      const payload = {
        branchId: selectedBranchId,
        customerId: selectedCustId || null,
        paymentMethod,
        paidAmount: paid,
        discountAmount: cartDiscount,
        taxAmount: finalTax,
        items: cart.map(item => ({
          productId: item.productId,
          quantity: item.quantity,
          discount: item.discount,
          tax: item.tax,
          serialNumber: item.serialNumber,
          imei: item.imei
        }))
      };

      const response = await axios.post("/api/sales", payload);
      setReceiptResult(response.data);
      addNotification("Checkout completed successfully!", "success");
      clearCart();
      setCartDiscount(0);
      setSelectedCustId("");
      
      // Reload products to update stock numbers
      const prodRes = await axios.get("/api/products");
      setProducts(prodRes.data);
    } catch (err: any) {
      const msg = err.response?.data?.error || "Transaction failed.";
      addNotification(msg, "warning");
    }
  };

  const handleBarcodeSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const input = barcodeInputRef.current?.value || "";
    if (!input) return;

    // Search product with exact barcode or SKU matches
    const found = products.find(p => p.barcode === input || p.sku === input);
    if (found) {
      // Find branch stock quantity
      const bStock = found.branchStocks?.find((bs: any) => bs.branchId === selectedBranchId);
      const stockQty = bStock ? bStock.quantity : 0;

      if (stockQty <= 0) {
        addNotification(`Product ${found.name} is out of stock in this branch.`, "warning");
      } else {
        addToCart(found, stockQty);
        addNotification(`Added ${found.name} by barcode scanner.`, "success");
      }
    } else {
      addNotification(`Product with sku/barcode "${input}" not found.`, "warning");
    }

    if (barcodeInputRef.current) barcodeInputRef.current.value = "";
  };

  return (
    <div className="flex-1 flex gap-6 h-[calc(100vh-195px)] overflow-hidden">
      
      {/* Catalog / Left Panel */}
      <div className="flex-1 flex flex-col min-w-0 bg-card border border-border rounded-2xl p-4 space-y-4 h-full">
        
        {/* Search header controls */}
        <div className="flex flex-col sm:flex-row gap-3">
          <form onSubmit={handleBarcodeSubmit} className="flex-1 relative flex">
            <input
              ref={barcodeInputRef}
              type="text"
              placeholder="Scan Barcode or Type SKU (F2 to focus)..."
              className="w-full bg-secondary text-foreground border border-border pl-10 pr-4 py-2.5 rounded-xl text-sm focus:outline-none focus:ring-1 focus:ring-primary placeholder-muted-foreground"
            />
            <Search className="w-5 h-5 text-muted-foreground absolute left-3 top-3" />
          </form>
          
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search items by name..."
            className="w-48 bg-secondary border border-border px-3 py-2.5 rounded-xl text-sm focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>

        {/* Categories Bar */}
        <div className="flex gap-2 overflow-x-auto pb-1.5 scrollbar-thin">
          <button
            onClick={() => setSelectedCat("ALL")}
            className={`px-4 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition ${
              selectedCat === "ALL" ? "bg-primary text-white" : "bg-secondary text-muted-foreground hover:bg-secondary/80"
            }`}
          >
            All Products
          </button>
          {categories.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setSelectedCat(cat.id)}
              className={`px-4 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition ${
                selectedCat === cat.id ? "bg-primary text-white" : "bg-secondary text-muted-foreground hover:bg-secondary/80"
              }`}
            >
              {cat.name}
            </button>
          ))}
        </div>

        {/* Product Grid */}
        <div className="flex-1 overflow-y-auto grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-4 pr-1">
          {loading ? (
            <div className="col-span-full py-16 text-center text-xs text-muted-foreground">Catalog loading...</div>
          ) : filteredProducts.length === 0 ? (
            <div className="col-span-full py-16 text-center text-xs text-muted-foreground">No matching products in directory.</div>
          ) : (
            filteredProducts.map((p) => {
              const bStock = p.branchStocks?.find((bs: any) => bs.branchId === selectedBranchId);
              const branchQty = bStock ? bStock.quantity : 0;
              const isLowStock = branchQty <= p.minStock;

              return (
                <button
                  key={p.id}
                  disabled={branchQty <= 0}
                  onClick={() => addToCart(p, branchQty)}
                  className={`bg-secondary/40 border text-left p-2.5 rounded-xl flex flex-col justify-between hover:border-primary/50 transition cursor-pointer relative ${
                    branchQty <= 0 ? "opacity-50 cursor-not-allowed" : ""
                  }`}
                >
                  <div className="space-y-0.5">
                    <span className="text-[9px] uppercase font-bold text-muted-foreground tracking-wider">{p.brand?.name}</span>
                    <h4 className="font-semibold text-[11px] leading-tight text-foreground line-clamp-2">{p.name}</h4>
                    <p className="text-[9px] text-muted-foreground">SKU: {p.sku}</p>
                  </div>

                  <div className="flex items-center justify-between mt-2">
                    <span className="font-bold text-xs text-foreground">Rs. {p.sellingPrice}</span>
                    <span
                      className={`text-[10px] px-2 py-0.5 rounded font-bold ${
                        branchQty <= 0
                          ? "bg-red-500/10 text-red-400"
                          : isLowStock
                          ? "bg-amber-500/10 text-amber-400"
                          : "bg-green-500/10 text-green-400"
                      }`}
                    >
                      {branchQty <= 0 ? "Out of Stock" : `${branchQty} Available`}
                    </span>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* POS Cart / Right Panel */}
      <div className="w-96 bg-card border border-border rounded-2xl flex flex-col justify-between p-4 overflow-hidden h-full min-h-0 max-h-full">
        
        {/* Cart Header */}
        <div className="flex items-center justify-between border-b border-border pb-3">
          <div className="flex items-center gap-2">
            <ShoppingCart className="w-5 h-5 text-primary" />
            <h3 className="font-bold text-sm">Shopping Cart ({cart.length})</h3>
          </div>
          {cart.length > 0 && (
            <button onClick={clearCart} className="text-xs text-destructive hover:underline flex items-center gap-1">
              Clear All
            </button>
          )}
        </div>

        {/* Cart Item List */}
        <div className="flex-1 overflow-y-auto divide-y divide-border/60 py-2 pr-1 space-y-4 min-h-0 max-h-[calc(100vh-440px)]">
          {cart.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full py-16 text-center text-muted-foreground space-y-2">
              <ShoppingCart className="w-10 h-10 opacity-30" />
              <p className="text-xs">Your shopping cart is empty.</p>
            </div>
          ) : (
            cart.map((item) => (
              <div key={item.productId} className="space-y-2 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h4 className="font-bold text-xs text-foreground truncate">{item.name}</h4>
                    <p className="text-[10px] text-muted-foreground">SKU: {item.sku} | Price: Rs. {item.sellingPrice}</p>
                  </div>
                  <button onClick={() => removeFromCart(item.productId)} className="text-muted-foreground hover:text-destructive">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>

                {/* Serial / IMEI input tracking details */}
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={item.serialNumber || ""}
                    onChange={(e) => updateCartItemDetails(item.productId, { serialNumber: e.target.value })}
                    placeholder="S/N (Required)"
                    className="flex-1 bg-secondary text-[10px] border border-border px-2 py-1 rounded focus:outline-none"
                  />
                  <input
                    type="text"
                    value={item.imei || ""}
                    onChange={(e) => updateCartItemDetails(item.productId, { imei: e.target.value })}
                    placeholder="IMEI (Mobile)"
                    className="flex-1 bg-secondary text-[10px] border border-border px-2 py-1 rounded focus:outline-none"
                  />
                </div>

                {/* Adjuster Panel */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center border border-border rounded-lg bg-secondary">
                    <button
                      onClick={() => updateCartQty(item.productId, item.quantity - 1)}
                      className="p-1 text-muted-foreground hover:text-foreground"
                    >
                      <Minus className="w-3.5 h-3.5" />
                    </button>
                    <span className="px-2.5 text-xs font-bold">{item.quantity}</span>
                    <button
                      onClick={() => updateCartQty(item.productId, item.quantity + 1)}
                      className="p-1 text-muted-foreground hover:text-foreground"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <span className="font-bold text-xs text-foreground">
                    Rs. {((item.sellingPrice * item.quantity) * (1 - item.discount / 100)).toFixed(2)}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Customer & Totals Summary Panel */}
        <div className="border-t border-border pt-4 space-y-3">
          
          {/* Customer Selection */}
          <div className="flex items-center gap-1.5">
            <div className="flex-1 flex items-center gap-2 bg-secondary/50 border border-border p-2 rounded-xl">
              <User className="w-4 h-4 text-muted-foreground" />
              <select
                value={selectedCustId}
                onChange={(e) => setSelectedCustId(e.target.value)}
                className="flex-1 bg-transparent text-xs text-foreground focus:outline-none cursor-pointer"
              >
                <option value="">Walk-in Customer</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.phone}) - Due: Rs. {c.creditBalance}
                  </option>
                ))}
              </select>
            </div>
            <button
              type="button"
              onClick={() => setCustModalOpen(true)}
              className="p-2.5 bg-primary/10 border border-primary/20 hover:bg-primary/20 text-primary rounded-xl transition flex-shrink-0"
              title="Add New Customer"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>

          {/* Cart Pricing Aggregates */}
          <div className="space-y-1 text-xs">
            <div className="flex justify-between text-muted-foreground">
              <span>Subtotal:</span>
              <span>Rs. {subtotal.toFixed(2)}</span>
            </div>
            
            {/* Cart overall discount */}
            <div className="flex justify-between text-muted-foreground items-center">
              <span className="flex items-center gap-1">
                <Percent className="w-3.5 h-3.5 text-indigo-400" />
                Cart Discount (Rs.):
              </span>
              <input
                type="number"
                value={cartDiscount || ""}
                onChange={(e) => setCartDiscount(Math.max(0, Number(e.target.value)))}
                className="w-16 bg-secondary text-right border border-border px-1 py-0.5 rounded text-[11px] focus:outline-none"
              />
            </div>
            <div className="flex justify-between text-muted-foreground">
              <span>Estimated Tax:</span>
              <span>Rs. {finalTax.toFixed(2)}</span>
            </div>
            <div className="flex justify-between font-black text-sm text-foreground pt-1.5 border-t border-border/50">
              <span>Grand Total:</span>
              <span>Rs. {payableAmount.toFixed(2)}</span>
            </div>
          </div>

          {/* Payment Method Selector Grid */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-muted-foreground uppercase">Payment Method</label>
            <div className="grid grid-cols-3 gap-1.5">
              <button
                type="button"
                onClick={() => setPaymentMethod("CASH")}
                className={`flex items-center justify-center gap-1 p-2 rounded-lg border text-left transition-all ${
                  paymentMethod === "CASH"
                    ? "bg-primary/10 border-primary text-primary font-bold shadow"
                    : "bg-secondary/40 border-border text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
                }`}
              >
                <Banknote className="w-3.5 h-3.5 flex-shrink-0" />
                <span className="text-[10px] font-extrabold font-black">Cash</span>
              </button>

              <button
                type="button"
                onClick={() => setPaymentMethod("CARD")}
                className={`flex items-center justify-center gap-1 p-2 rounded-lg border text-left transition-all ${
                  paymentMethod === "CARD"
                    ? "bg-primary/10 border-primary text-primary font-bold shadow"
                    : "bg-secondary/40 border-border text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
                }`}
              >
                <Landmark className="w-3.5 h-3.5 flex-shrink-0" />
                <span className="text-[10px] font-extrabold font-black">Bank</span>
              </button>

              <button
                type="button"
                onClick={() => setPaymentMethod("MOBILE")}
                className={`flex items-center justify-center gap-1 p-2 rounded-lg border text-left transition-all ${
                  paymentMethod === "MOBILE"
                    ? "bg-primary/10 border-primary text-primary font-bold shadow"
                    : "bg-secondary/40 border-border text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
                }`}
              >
                <Wallet className="w-3.5 h-3.5 flex-shrink-0" />
                <span className="text-[10px] font-extrabold font-black">Wallet</span>
              </button>
            </div>
          </div>

          {/* Amount Paid input */}
          <div className="space-y-1">
            <div className="flex justify-between items-center text-[10px] font-bold text-muted-foreground uppercase">
              <span>Amount Paid (Rs.)</span>
              {Number(amountPaid) > payableAmount && (
                <span className="text-emerald-400 font-extrabold normal-case">
                  Change: Rs. {(Number(amountPaid) - payableAmount).toFixed(2)}
                </span>
              )}
            </div>
            <input
              type="number"
              value={amountPaid}
              onChange={(e) => setAmountPaid(e.target.value)}
              step="0.01"
              className="w-full bg-secondary border border-border px-3 py-1.5 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          <button
            onClick={handleInstantCheckout}
            disabled={cart.length === 0}
            className="w-full bg-primary hover:bg-primary/95 text-white font-bold py-2.5 rounded-xl flex items-center justify-center gap-2 transition disabled:opacity-50 text-xs shadow-md shadow-primary/10"
          >
            <CheckCircle className="w-4 h-4" />
            Complete Sale & Invoice
          </button>
        </div>
      </div>



      {/* Invoice Receipt Modal */}
      {receiptResult && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/75 backdrop-blur-sm z-50 px-4 overflow-y-auto">
          <div className="bg-card border border-border w-full max-w-sm p-6 rounded-2xl shadow-2xl space-y-6 my-8">
            <div className="text-center space-y-1">
              <CheckCircle className="w-12 h-12 text-green-400 mx-auto" />
              <h3 className="text-lg font-black tracking-tight text-foreground">Transaction Complete</h3>
              <p className="text-xs text-muted-foreground">Invoice reference: {receiptResult.id.substring(0, 8)}</p>
            </div>

            {/* Receipt layout */}
            <div id="printable-receipt" className="bg-secondary/30 p-4 border border-dashed border-border rounded-xl text-xs space-y-4">
              <div className="text-center border-b border-border pb-3">
                <h4 className="font-extrabold text-foreground tracking-widest uppercase">
                  {receiptResult.branch?.name || "ANTIGRAVITY POS"}
                </h4>
                {receiptResult.branch?.address && (
                  <p className="text-[9px] text-muted-foreground mt-0.5">{receiptResult.branch.address}</p>
                )}
                {receiptResult.branch?.phone && (
                  <p className="text-[9px] text-muted-foreground">{receiptResult.branch.phone}</p>
                )}
                <p className="text-[10px] text-muted-foreground mt-1">Invoice Receipt Slip</p>
                <p className="text-[9px] text-muted-foreground mt-1">Date: {new Date(receiptResult.saleDate).toLocaleString()}</p>
              </div>

              <div className="space-y-2">
                {receiptResult.items.map((item: any) => (
                  <div key={item.id} className="flex justify-between items-start">
                    <div>
                      <p className="font-semibold text-foreground">{item.product.name}</p>
                      <p className="text-[9px] text-muted-foreground">
                        Qty: {item.quantity} @ Rs. {item.unitPrice} {item.serialNumber && `(S/N: ${item.serialNumber})`}
                      </p>
                    </div>
                    <span className="font-bold text-foreground">Rs. {item.totalPrice.toFixed(2)}</span>
                  </div>
                ))}
              </div>

              <div className="border-t border-border pt-3 space-y-1 text-[11px]">
                <div className="flex justify-between text-muted-foreground">
                  <span>Subtotal:</span>
                  <span>Rs. {receiptResult.totalAmount.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-muted-foreground">
                  <span>Discount:</span>
                  <span>-Rs. {receiptResult.discountAmount.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-muted-foreground">
                  <span>Sales Tax ({receiptResult.items[0]?.tax || 0}%):</span>
                  <span>+Rs. {receiptResult.taxAmount.toFixed(2)}</span>
                </div>
                <div className="flex justify-between font-black text-foreground text-xs pt-1 border-t border-border/40">
                  <span>Total Paid ({
                    receiptResult.paymentMethod === "CASH" ? "Cash" :
                    receiptResult.paymentMethod === "CARD" ? "Bank" :
                    receiptResult.paymentMethod === "MOBILE" ? "Wallet" : "Credit"
                  }):</span>
                  <span>Rs. {receiptResult.paidAmount.toFixed(2)}</span>
                </div>
              </div>

              {receiptResult.customer && (
                <div className="bg-secondary/60 p-2 rounded text-[10px] text-muted-foreground">
                  <p>Customer: <strong>{receiptResult.customer.name}</strong></p>
                  <p>Repayment Balance: <strong>Rs. {receiptResult.customer.creditBalance}</strong></p>
                </div>
              )}
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => window.print()}
                className="flex-1 border border-border hover:bg-secondary text-foreground text-xs font-bold py-2.5 rounded-xl flex items-center justify-center gap-1.5 transition"
              >
                <Receipt className="w-4 h-4" />
                Print Slip
              </button>
              <button
                onClick={() => setReceiptResult(null)}
                className="flex-1 bg-primary hover:bg-primary/95 text-white text-xs font-bold py-2.5 rounded-xl transition"
              >
                Dismiss Window
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Customer Modal dialog */}
      {custModalOpen && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/60 backdrop-blur-sm z-50 px-4">
          <div className="bg-card border border-border w-full max-w-sm p-6 rounded-2xl shadow-2xl relative animate-fade-in">
            <h3 className="font-bold text-sm text-foreground mb-4">Register New Customer</h3>
            <form onSubmit={handleCreateCustomer} className="space-y-4">
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-muted-foreground uppercase">Customer Name *</label>
                <input
                  type="text"
                  required
                  value={newCust.name}
                  onChange={(e) => setNewCust({ ...newCust, name: e.target.value })}
                  placeholder="e.g. Asif Khan"
                  className="w-full bg-secondary border border-border px-3 py-2 rounded text-xs focus:outline-none"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-muted-foreground uppercase">Phone Number *</label>
                <input
                  type="text"
                  required
                  value={newCust.phone}
                  onChange={(e) => setNewCust({ ...newCust, phone: e.target.value })}
                  placeholder="e.g. 0300-1234567"
                  className="w-full bg-secondary border border-border px-3 py-2 rounded text-xs focus:outline-none"
                />
              </div>



              <div className="flex gap-3 justify-end pt-4">
                <button
                  type="button"
                  onClick={() => setCustModalOpen(false)}
                  className="px-4 py-2 border border-border text-xs rounded hover:bg-secondary transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-primary text-white text-xs rounded hover:bg-primary/95 transition"
                >
                  Add Customer
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
