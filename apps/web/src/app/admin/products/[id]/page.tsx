"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { apiRequest } from "@/lib/api-client";
import type { Batch, Product } from "@/lib/types";

// docs/11-ui-ux.md §3: FIFO waterfall — active batch highlighted, waiting
// batches below with cost/date/remaining/supplier/status (FR-026).
export default function ProductDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [product, setProduct] = useState<Product | null>(null);
  const [batches, setBatches] = useState<Batch[]>([]);

  useEffect(() => {
    apiRequest<Product>(`/products/${id}`).then(setProduct);
    apiRequest<Batch[]>(`/products/${id}/batches`).then(setBatches);
  }, [id]);

  if (!product) return <p className="text-neutral-500">Loading…</p>;

  const totalStock = batches.reduce((s, b) => s + Number(b.remainingQty), 0);
  const activeBatches = batches.filter((b) => Number(b.remainingQty) > 0);

  return (
    <div>
      <a href="/admin/products" className="text-sm text-neutral-500 hover:underline">&larr; Products</a>
      <h1 className="mb-1 mt-1 text-xl font-semibold">{product.name}</h1>
      <p className="mb-4 text-sm text-neutral-500">SKU {product.sku} · {product.unit} · Official price Rs. {product.officialPrice}</p>

      <div className="mb-6 rounded-lg border border-neutral-200 bg-white p-4">
        <p className="text-sm text-neutral-500">Total Stock</p>
        <p className="text-2xl font-semibold">{totalStock}</p>
      </div>

      <h2 className="mb-2 font-semibold">Batches (FIFO order — oldest first)</h2>
      <div className="space-y-2">
        {batches.map((b, i) => {
          const isActive = activeBatches[0]?.id === b.id;
          return (
            <div
              key={b.id}
              className={`rounded-lg border p-3 text-sm ${
                isActive ? "border-neutral-900 bg-white" : "border-neutral-200 bg-neutral-50"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="font-medium">
                  Batch {i + 1} {isActive && <span className="ml-2 rounded bg-neutral-900 px-1.5 py-0.5 text-xs text-white">ACTIVE</span>}
                </span>
                <span className="text-neutral-500">{b.status}</span>
              </div>
              <div className="mt-1 grid grid-cols-2 gap-x-4 gap-y-1 text-neutral-600 sm:grid-cols-4">
                <span>Cost: Rs. {b.unitCost}</span>
                <span>Remaining: {b.remainingQty} / {b.originalQty}</span>
                <span>Purchased: {new Date(b.purchaseDate).toLocaleDateString()}</span>
                <span>Supplier: {b.supplier?.name ?? "—"}</span>
              </div>
            </div>
          );
        })}
        {batches.length === 0 && <p className="text-neutral-400">No batches yet — record a purchase to create one.</p>}
      </div>
    </div>
  );
}
