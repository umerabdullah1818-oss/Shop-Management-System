"use client";

import { useEffect, useState } from "react";
import { newId } from "@shop/shared";
import { apiRequest, ApiError } from "@/lib/api-client";
import type { Product } from "@/lib/types";

interface LowStockRow extends Product {
  totalStock: number;
}

const ADJUSTMENT_TYPES = ["ADJUSTMENT", "DAMAGED", "EXPIRED", "OTHER"] as const;

// FR-025/FR-027/REP-003.
export default function InventoryPage() {
  const [lowStock, setLowStock] = useState<LowStockRow[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedProductId, setSelectedProductId] = useState("");
  interface BatchRow { id: string; remainingQty: string; unitCost: string; status: string }
  const [batches, setBatches] = useState<BatchRow[]>([]);
  const [adjustBatchId, setAdjustBatchId] = useState("");
  const [adjustQty, setAdjustQty] = useState("");
  const [adjustType, setAdjustType] = useState<(typeof ADJUSTMENT_TYPES)[number]>("ADJUSTMENT");
  const [adjustReason, setAdjustReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  function loadLowStock() {
    apiRequest<LowStockRow[]>("/products/low-stock").then(setLowStock);
  }

  useEffect(() => {
    loadLowStock();
    apiRequest<Product[]>("/products", { query: { status: "ALL" } }).then(setProducts);
  }, []);

  useEffect(() => {
    if (!selectedProductId) return;
    apiRequest<BatchRow[]>(`/products/${selectedProductId}/batches`).then((rows) => {
      setBatches(rows);
      setAdjustBatchId(rows[0]?.id ?? "");
    });
  }, [selectedProductId]);

  async function submitAdjustment(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await apiRequest("/inventory/adjustments", {
        method: "POST",
        body: { id: newId(), batchId: adjustBatchId, quantity: Number(adjustQty), type: adjustType, reason: adjustReason },
      });
      setAdjustQty("");
      setAdjustReason("");
      apiRequest<BatchRow[]>(`/products/${selectedProductId}/batches`).then(setBatches);
      loadLowStock();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to adjust stock.");
    }
  }

  return (
    <div>
      <h1 className="mb-4 text-xl font-semibold">Inventory</h1>

      <h2 className="mb-2 font-semibold">Low Stock</h2>
      <div className="mb-6 overflow-x-auto rounded-lg border border-neutral-200 bg-white">
        <table className="w-full text-sm">
          <thead className="border-b border-neutral-200 text-left text-neutral-500">
            <tr><th className="px-4 py-2">Product</th><th className="px-4 py-2">Total Stock</th><th className="px-4 py-2">Min Level</th></tr>
          </thead>
          <tbody>
            {lowStock.map((p) => (
              <tr key={p.id} className="border-b border-neutral-100 text-amber-700 last:border-0">
                <td className="px-4 py-2">{p.name}</td>
                <td className="px-4 py-2">{p.totalStock}</td>
                <td className="px-4 py-2">{p.minStockLevel}</td>
              </tr>
            ))}
            {lowStock.length === 0 && <tr><td colSpan={3} className="px-4 py-6 text-center text-neutral-400">Nothing low on stock</td></tr>}
          </tbody>
        </table>
      </div>

      <h2 className="mb-2 font-semibold">Manual Adjustment (Admin-only)</h2>
      <div className="rounded-lg border border-neutral-200 bg-white p-4">
        <select value={selectedProductId} onChange={(e) => setSelectedProductId(e.target.value)} className="mb-3 w-full max-w-sm rounded-md border border-neutral-300 px-3 py-2">
          <option value="">Select a product…</option>
          {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>

        {selectedProductId && (
          <form onSubmit={submitAdjustment} className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <select value={adjustBatchId} onChange={(e) => setAdjustBatchId(e.target.value)} className="rounded-md border border-neutral-300 px-3 py-2">
              {batches.map((b) => <option key={b.id} value={b.id}>Rs.{b.unitCost} — {b.remainingQty} left ({b.status})</option>)}
            </select>
            <input required type="number" placeholder="Quantity (+/-)" value={adjustQty} onChange={(e) => setAdjustQty(e.target.value)} className="rounded-md border border-neutral-300 px-3 py-2" />
            <select value={adjustType} onChange={(e) => setAdjustType(e.target.value as typeof adjustType)} className="rounded-md border border-neutral-300 px-3 py-2">
              {ADJUSTMENT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
            <input required placeholder="Reason" value={adjustReason} onChange={(e) => setAdjustReason(e.target.value)} className="rounded-md border border-neutral-300 px-3 py-2" />
            {error && <p className="col-span-full text-sm text-red-600">{error}</p>}
            <button type="submit" className="col-span-full rounded-md bg-neutral-900 px-4 py-2 font-medium text-white md:col-span-1">Apply</button>
          </form>
        )}
      </div>
    </div>
  );
}
