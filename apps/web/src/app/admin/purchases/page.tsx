"use client";

import { useEffect, useState } from "react";
import { newId } from "@shop/shared";
import { apiRequest, ApiError } from "@/lib/api-client";
import type { Product, Purchase, Supplier } from "@/lib/types";

interface LineInput {
  productId: string;
  quantity: string;
  costPerUnit: string;
}

// FR-011/FR-012/FR-013.
export default function PurchasesPage() {
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [supplierId, setSupplierId] = useState("");
  const [purchaseDate, setPurchaseDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [amountPaid, setAmountPaid] = useState("0");
  const [lines, setLines] = useState<LineInput[]>([{ productId: "", quantity: "", costPerUnit: "" }]);
  const [error, setError] = useState<string | null>(null);

  function load() {
    apiRequest<Purchase[]>("/purchases").then(setPurchases);
  }

  useEffect(() => {
    load();
    apiRequest<Supplier[]>("/suppliers").then((rows) => {
      setSuppliers(rows);
      setSupplierId(rows[0]?.id ?? "");
    });
    apiRequest<Product[]>("/products").then(setProducts);
  }, []);

  function updateLine(i: number, patch: Partial<LineInput>) {
    setLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await apiRequest("/purchases", {
        method: "POST",
        body: {
          id: newId(),
          supplierId,
          purchaseDate: new Date(purchaseDate).toISOString(),
          items: lines
            .filter((l) => l.productId && l.quantity && l.costPerUnit)
            .map((l) => ({ productId: l.productId, quantity: Number(l.quantity), costPerUnit: Number(l.costPerUnit) })),
          amountPaid: Number(amountPaid),
        },
      });
      setLines([{ productId: "", quantity: "", costPerUnit: "" }]);
      setAmountPaid("0");
      setShowForm(false);
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to save purchase.");
    }
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold">Purchases</h1>
        <button onClick={() => setShowForm((v) => !v)} className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white">
          {showForm ? "Cancel" : "+ New Purchase"}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="mb-6 rounded-lg border border-neutral-200 bg-white p-4">
          <div className="mb-3 grid grid-cols-2 gap-3 md:grid-cols-3">
            <select required value={supplierId} onChange={(e) => setSupplierId(e.target.value)} className="rounded-md border border-neutral-300 px-3 py-2">
              {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            <input required type="date" value={purchaseDate} onChange={(e) => setPurchaseDate(e.target.value)} className="rounded-md border border-neutral-300 px-3 py-2" />
            <input required type="number" min={0} placeholder="Amount paid now" value={amountPaid} onChange={(e) => setAmountPaid(e.target.value)} className="rounded-md border border-neutral-300 px-3 py-2" />
          </div>

          <p className="mb-2 text-sm font-medium text-neutral-600">Line items (each creates a new FIFO batch)</p>
          {lines.map((line, i) => (
            <div key={i} className="mb-2 grid grid-cols-3 gap-2">
              <select required value={line.productId} onChange={(e) => updateLine(i, { productId: e.target.value })} className="rounded-md border border-neutral-300 px-3 py-2">
                <option value="">Product…</option>
                {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              <input required type="number" min={0.0001} placeholder="Quantity" value={line.quantity} onChange={(e) => updateLine(i, { quantity: e.target.value })} className="rounded-md border border-neutral-300 px-3 py-2" />
              <input required type="number" min={0} placeholder="Cost per unit" value={line.costPerUnit} onChange={(e) => updateLine(i, { costPerUnit: e.target.value })} className="rounded-md border border-neutral-300 px-3 py-2" />
            </div>
          ))}
          <button type="button" onClick={() => setLines((prev) => [...prev, { productId: "", quantity: "", costPerUnit: "" }])} className="mb-3 text-sm text-neutral-500 underline underline-offset-2">
            + Add line
          </button>

          {error && <p className="mb-3 text-sm text-red-600">{error}</p>}
          <button type="submit" className="rounded-md bg-neutral-900 px-4 py-2 font-medium text-white">Save Purchase</button>
        </form>
      )}

      <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white">
        <table className="w-full text-sm">
          <thead className="border-b border-neutral-200 text-left text-neutral-500">
            <tr>
              <th className="px-4 py-2">Date</th>
              <th className="px-4 py-2">Supplier</th>
              <th className="px-4 py-2">Items</th>
              <th className="px-4 py-2">Paid</th>
              <th className="px-4 py-2">Payable</th>
              <th className="px-4 py-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {purchases.map((p) => (
              <tr key={p.id} className="border-b border-neutral-100 last:border-0">
                <td className="px-4 py-2">{new Date(p.purchaseDate).toLocaleDateString()}</td>
                <td className="px-4 py-2">{p.supplier?.name ?? p.supplierId}</td>
                <td className="px-4 py-2">{p.items.length}</td>
                <td className="px-4 py-2">Rs. {p.amountPaid}</td>
                <td className="px-4 py-2">Rs. {p.amountPayable}</td>
                <td className="px-4 py-2">{p.paymentStatus}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
