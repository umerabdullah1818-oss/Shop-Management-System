"use client";

import { useEffect, useState } from "react";
import { newId } from "@shop/shared";
import { apiRequest, ApiError } from "@/lib/api-client";
import type { Sale } from "@/lib/types";

interface SaleItem {
  id: string;
  productId: string;
  quantity: string;
  lineTotal: string;
}
interface SaleDetail extends Sale {
  items: SaleItem[];
}

// FR-060/FR-061/FR-062 + invoice cancellation (FR-070). Started from an
// existing invoice, per docs/11-ui-ux.md §7 — never a blank generic form.
export default function SalesPage() {
  const [sales, setSales] = useState<Sale[]>([]);
  const [selected, setSelected] = useState<SaleDetail | null>(null);
  const [returnQty, setReturnQty] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [cancelReason, setCancelReason] = useState("");

  function load() {
    apiRequest<Sale[]>("/sales").then(setSales);
  }

  useEffect(load, []);

  function openSale(id: string) {
    apiRequest<SaleDetail>(`/sales/${id}`).then((s) => {
      setSelected(s);
      setReturnQty({});
      setError(null);
    });
  }

  async function submitReturn() {
    if (!selected) return;
    setError(null);
    const items = Object.entries(returnQty)
      .filter(([, qty]) => Number(qty) > 0)
      .map(([saleItemId, qty]) => ({ saleItemId, quantity: Number(qty) }));
    if (items.length === 0) {
      setError("Enter a quantity to return.");
      return;
    }
    try {
      await apiRequest("/returns", { method: "POST", body: { id: newId(), saleId: selected.id, items } });
      openSale(selected.id);
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to process return.");
    }
  }

  async function cancelSale() {
    if (!selected) return;
    if (!confirm("Cancel this invoice? This reverses inventory, revenue, COGS, and Khata effects.")) return;
    setError(null);
    try {
      await apiRequest(`/sales/${selected.id}/cancel`, { method: "POST", body: { reason: cancelReason } });
      openSale(selected.id);
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to cancel invoice.");
    }
  }

  return (
    <div>
      <h1 className="mb-4 text-xl font-semibold">Sales &amp; Returns</h1>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-[1fr_1.3fr]">
        <div className="overflow-hidden rounded-lg border border-neutral-200 bg-white">
          {sales.map((s) => (
            <button
              key={s.id}
              onClick={() => openSale(s.id)}
              className={`block w-full border-b border-neutral-100 px-4 py-2 text-left text-sm last:border-0 hover:bg-neutral-50 ${selected?.id === s.id ? "bg-neutral-100" : ""}`}
            >
              <span className="font-medium">{s.invoiceNumber}</span>{" "}
              <span className="text-neutral-500">Rs. {s.grandTotal} · {s.status}</span>
            </button>
          ))}
          {sales.length === 0 && <p className="p-4 text-neutral-400">No sales yet</p>}
        </div>

        {selected && (
          <div className="rounded-lg border border-neutral-200 bg-white p-4">
            <h2 className="mb-1 font-semibold">{selected.invoiceNumber}</h2>
            <p className="mb-1 text-sm text-neutral-500">
              Rs. {selected.grandTotal} · {selected.paymentMethod} · {selected.status}
            </p>
            <a
              href={`/print/${selected.id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="mb-3 inline-block text-sm text-neutral-500 underline underline-offset-2 hover:text-neutral-900"
            >
              Reprint receipt
            </a>

            {selected.status === "COMPLETED" && (
              <>
                <table className="mb-3 w-full text-sm">
                  <thead className="text-left text-neutral-500">
                    <tr><th>Product</th><th>Qty sold</th><th>Return qty</th></tr>
                  </thead>
                  <tbody>
                    {selected.items.map((it) => (
                      <tr key={it.id}>
                        <td className="py-1">{it.productId.slice(0, 10)}…</td>
                        <td className="py-1">{it.quantity}</td>
                        <td className="py-1">
                          <input
                            type="number"
                            min={0}
                            max={Number(it.quantity)}
                            value={returnQty[it.id] ?? ""}
                            onChange={(e) => setReturnQty({ ...returnQty, [it.id]: e.target.value })}
                            className="w-20 rounded border border-neutral-300 px-2 py-1"
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {error && <p className="mb-2 text-sm text-red-600">{error}</p>}
                <button onClick={submitReturn} className="mb-4 rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white">
                  Process Return
                </button>

                <div className="border-t border-neutral-200 pt-3">
                  <input
                    placeholder="Cancellation reason"
                    value={cancelReason}
                    onChange={(e) => setCancelReason(e.target.value)}
                    className="mb-2 w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
                  />
                  <button onClick={cancelSale} className="rounded-md border border-red-300 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50">
                    Cancel Invoice
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
