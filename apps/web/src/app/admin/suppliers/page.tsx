"use client";

import { useEffect, useState } from "react";
import { newId } from "@shop/shared";
import { apiRequest, ApiError } from "@/lib/api-client";
import type { PaymentMethod, Supplier } from "@/lib/types";

// FR-010/FR-014/FR-015.
export default function SuppliersPage() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: "", phone: "", email: "", address: "" });
  const [paying, setPaying] = useState<string | null>(null);
  const [payAmount, setPayAmount] = useState("");
  const [payMethod, setPayMethod] = useState<PaymentMethod>("CASH");
  const [error, setError] = useState<string | null>(null);

  function load() {
    apiRequest<Supplier[]>("/suppliers").then(async (rows) => {
      const withTotals = await Promise.all(rows.map((r) => apiRequest<Supplier>(`/suppliers/${r.id}`)));
      setSuppliers(withTotals);
    });
  }

  useEffect(load, []);

  async function createSupplier(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await apiRequest("/suppliers", { method: "POST", body: form });
      setForm({ name: "", phone: "", email: "", address: "" });
      setShowForm(false);
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to save supplier.");
    }
  }

  async function recordPayment(supplierId: string) {
    setError(null);
    try {
      await apiRequest(`/suppliers/${supplierId}/payments`, {
        method: "POST",
        body: { id: newId(), amount: Number(payAmount), method: payMethod },
      });
      setPaying(null);
      setPayAmount("");
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to record payment.");
    }
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold">Suppliers</h1>
        <button onClick={() => setShowForm((v) => !v)} className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white">
          {showForm ? "Cancel" : "+ Add Supplier"}
        </button>
      </div>

      {showForm && (
        <form onSubmit={createSupplier} className="mb-6 grid grid-cols-2 gap-3 rounded-lg border border-neutral-200 bg-white p-4 md:grid-cols-4">
          <input required placeholder="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="rounded-md border border-neutral-300 px-3 py-2" />
          <input placeholder="Phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="rounded-md border border-neutral-300 px-3 py-2" />
          <input placeholder="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="rounded-md border border-neutral-300 px-3 py-2" />
          <input placeholder="Address" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} className="rounded-md border border-neutral-300 px-3 py-2" />
          {error && <p className="col-span-full text-sm text-red-600">{error}</p>}
          <button type="submit" className="col-span-full rounded-md bg-neutral-900 px-4 py-2 font-medium text-white md:col-span-1">Save</button>
        </form>
      )}

      <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white">
        <table className="w-full text-sm">
          <thead className="border-b border-neutral-200 text-left text-neutral-500">
            <tr>
              <th className="px-4 py-2">Name</th>
              <th className="px-4 py-2">Purchased</th>
              <th className="px-4 py-2">Paid</th>
              <th className="px-4 py-2">Payable</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {suppliers.map((s) => (
              <tr key={s.id} className="border-b border-neutral-100 last:border-0">
                <td className="px-4 py-2">{s.name}</td>
                <td className="px-4 py-2">Rs. {s.totals?.totalPurchased.toFixed(0) ?? 0}</td>
                <td className="px-4 py-2">Rs. {s.totals?.totalPaid.toFixed(0) ?? 0}</td>
                <td className="px-4 py-2">Rs. {s.totals?.totalPayable.toFixed(0) ?? 0}</td>
                <td className="px-4 py-2">
                  {paying === s.id ? (
                    <div className="flex items-center gap-1">
                      <input type="number" placeholder="Amount" value={payAmount} onChange={(e) => setPayAmount(e.target.value)} className="w-24 rounded border border-neutral-300 px-2 py-1" />
                      <select value={payMethod} onChange={(e) => setPayMethod(e.target.value as PaymentMethod)} className="rounded border border-neutral-300 px-1 py-1 text-xs">
                        {(["CASH", "CARD", "BANK"] as PaymentMethod[]).map((m) => <option key={m} value={m}>{m}</option>)}
                      </select>
                      <button onClick={() => recordPayment(s.id)} className="rounded bg-neutral-900 px-2 py-1 text-xs text-white">Pay</button>
                    </div>
                  ) : (
                    <button onClick={() => setPaying(s.id)} className="text-neutral-500 hover:underline">Record payment</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </div>
  );
}
