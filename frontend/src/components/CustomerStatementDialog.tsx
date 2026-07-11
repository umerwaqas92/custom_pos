import React, { useEffect, useState } from "react";
import axios from "axios";
import PortalModal from "./PortalModal";

const money = (n: number) =>
  `Rs. ${Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

type Props = {
  customerId: string | null;
  isOpen: boolean;
  onClose: () => void;
};

/**
 * Dialog: all sales + payments for one customer.
 */
export default function CustomerStatementDialog({ customerId, isOpen, onClose }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [data, setData] = useState<any | null>(null);

  useEffect(() => {
    if (!isOpen || !customerId) {
      setData(null);
      setError("");
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError("");
      try {
        const res = await axios.get(`/api/accounting/customers/${customerId}/statement`);
        if (!cancelled) setData(res.data);
      } catch (err: any) {
        if (!cancelled) {
          setError(err.response?.data?.error || "Failed to load customer details.");
          setData(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isOpen, customerId]);

  const customer = data?.customer;
  const summary = data?.summary;
  const sales: any[] = data?.sales || [];
  const payments: any[] = data?.creditPayments || [];

  const statusClass = (s: string) => {
    if (s === "PAID") return "bg-green-500/15 text-green-400";
    if (s === "PARTIAL") return "bg-amber-500/15 text-amber-400";
    return "bg-rose-500/15 text-rose-400";
  };

  return (
    <PortalModal
      isOpen={isOpen}
      onClose={onClose}
      backdropClass="bg-black/60 backdrop-blur-sm px-4 overflow-y-auto"
    >
      <div className="bg-card border border-border w-full max-w-3xl p-5 sm:p-6 rounded-2xl shadow-2xl relative my-6 max-h-[90vh] flex flex-col">
        <div className="flex items-start justify-between gap-3 mb-4 shrink-0">
          <div>
            <h3 className="text-base font-bold text-foreground">
              {customer?.name || "Customer statement"}
            </h3>
            {customer && (
              <p className="text-[11px] text-muted-foreground mt-0.5">
                {customer.phone || "No phone"}
                {customer.address ? ` · ${customer.address}` : ""}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-xs px-3 py-1.5 rounded-lg border border-border hover:bg-secondary transition"
          >
            Close
          </button>
        </div>

        {loading && (
          <p className="text-xs text-muted-foreground py-8 text-center">Loading sales & payments…</p>
        )}
        {error && !loading && (
          <p className="text-xs text-rose-400 py-6 text-center">{error}</p>
        )}

        {!loading && !error && data && (
          <div className="overflow-y-auto space-y-5 pr-1 min-h-0 flex-1">
            {/* Summary cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <div className="bg-secondary/50 border border-border rounded-xl p-3">
                <p className="text-[9px] uppercase font-bold text-muted-foreground">Sales</p>
                <p className="text-sm font-black text-foreground">{summary.saleCount}</p>
              </div>
              <div className="bg-secondary/50 border border-border rounded-xl p-3">
                <p className="text-[9px] uppercase font-bold text-muted-foreground">Total sold</p>
                <p className="text-sm font-black text-foreground">{money(summary.totalSales)}</p>
              </div>
              <div className="bg-secondary/50 border border-border rounded-xl p-3">
                <p className="text-[9px] uppercase font-bold text-muted-foreground">Received on bills</p>
                <p className="text-sm font-black text-green-400">{money(summary.totalPaidOnInvoices)}</p>
              </div>
              <div className="bg-secondary/50 border border-border rounded-xl p-3">
                <p className="text-[9px] uppercase font-bold text-muted-foreground">Credit balance</p>
                <p className={`text-sm font-black ${summary.creditBalance > 0 ? "text-amber-400" : "text-green-400"}`}>
                  {money(summary.creditBalance)}
                </p>
              </div>
            </div>

            {summary.totalCreditRepayments > 0 && (
              <p className="text-[10px] text-muted-foreground">
                Extra repayments received (Receive Payment):{" "}
                <strong className="text-foreground">{money(summary.totalCreditRepayments)}</strong>
                {" · "}
                Outstanding on invoices:{" "}
                <strong className="text-amber-400">{money(summary.outstandingOnInvoices)}</strong>
              </p>
            )}

            {/* Sales */}
            <div>
              <h4 className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground mb-2">
                All sales ({sales.length})
              </h4>
              {sales.length === 0 ? (
                <p className="text-xs text-muted-foreground py-4 text-center border border-border rounded-xl">
                  No sales for this customer.
                </p>
              ) : (
                <div className="space-y-2">
                  {sales.map((sale) => {
                    const due = Math.max(0, (sale.payableAmount || 0) - (sale.paidAmount || 0));
                    return (
                      <div
                        key={sale.id}
                        className="border border-border rounded-xl p-3 bg-secondary/20 space-y-2"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div>
                            <p className="text-[11px] font-bold text-foreground">
                              {new Date(sale.saleDate).toLocaleString()}
                            </p>
                            <p className="text-[9px] font-mono text-muted-foreground">
                              {sale.id.substring(0, 8)}… · {sale.cashier?.name || "—"}
                            </p>
                          </div>
                          <span
                            className={`text-[9px] font-bold px-2 py-0.5 rounded-lg ${statusClass(
                              sale.paymentStatus
                            )}`}
                          >
                            {sale.paymentStatus}
                          </span>
                        </div>

                        <ul className="space-y-1 border-t border-border/50 pt-2">
                          {(sale.items || []).map((it: any) => (
                            <li
                              key={it.id}
                              className="flex justify-between gap-2 text-[11px] text-foreground"
                            >
                              <span className="truncate">
                                {it.product?.name || "Item"} × {it.quantity}
                                {it.unitPrice != null && (
                                  <span className="text-muted-foreground">
                                    {" "}
                                    @ {money(it.unitPrice)}
                                  </span>
                                )}
                              </span>
                              <span className="font-semibold shrink-0">{money(it.totalPrice)}</span>
                            </li>
                          ))}
                        </ul>

                        <div className="flex flex-wrap gap-x-4 gap-y-1 text-[10px] border-t border-border/50 pt-2">
                          <span>
                            Total: <strong>{money(sale.payableAmount)}</strong>
                          </span>
                          <span className="text-green-400">
                            Paid: <strong>{money(sale.paidAmount)}</strong>
                          </span>
                          {due > 0 && (
                            <span className="text-amber-400">
                              Pending: <strong>{money(due)}</strong>
                            </span>
                          )}
                          <span className="text-muted-foreground">
                            Method: {sale.paymentMethod}
                          </span>
                        </div>
                        {sale.notes && (
                          <p className="text-[9px] text-muted-foreground">{sale.notes}</p>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Credit repayments */}
            <div>
              <h4 className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground mb-2">
                Credit repayments ({payments.length})
              </h4>
              {payments.length === 0 ? (
                <p className="text-xs text-muted-foreground py-3 text-center border border-border rounded-xl">
                  No separate repayments recorded (only invoice paid amounts above).
                </p>
              ) : (
                <div className="overflow-x-auto border border-border rounded-xl">
                  <table className="w-full text-left text-[11px]">
                    <thead>
                      <tr className="border-b border-border text-muted-foreground">
                        <th className="p-2.5">Date</th>
                        <th className="p-2.5">Method</th>
                        <th className="p-2.5 text-right">Amount</th>
                        <th className="p-2.5">Notes</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/50">
                      {payments.map((p) => (
                        <tr key={p.id}>
                          <td className="p-2.5 text-muted-foreground">
                            {new Date(p.paymentDate).toLocaleString()}
                          </td>
                          <td className="p-2.5">{p.paymentMethod}</td>
                          <td className="p-2.5 text-right font-bold text-green-400">
                            {money(p.amount)}
                          </td>
                          <td className="p-2.5 text-muted-foreground">{p.notes || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </PortalModal>
  );
}
