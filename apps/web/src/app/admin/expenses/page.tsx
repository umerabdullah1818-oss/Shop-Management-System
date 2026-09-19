"use client";

import { useEffect, useState } from "react";
import { newId } from "@shop/shared";
import { apiRequest, ApiError } from "@/lib/api-client";
import type { Expense, ExpenseCategory, PaymentMethod } from "@/lib/types";

const CATEGORIES: ExpenseCategory[] = ["RENT", "ELECTRICITY", "TRANSPORT", "SALARIES", "MAINTENANCE", "OTHER"];

// FR-080/BR-020.
export default function ExpensesPage() {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    category: "RENT" as ExpenseCategory,
    description: "",
    amount: "",
    paymentMethod: "CASH" as PaymentMethod,
    date: new Date().toISOString().slice(0, 10),
  });
  const [error, setError] = useState<string | null>(null);

  function load() {
    apiRequest<Expense[]>("/expenses").then(setExpenses);
  }

  useEffect(load, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await apiRequest("/expenses", {
        method: "POST",
        body: { id: newId(), ...form, amount: Number(form.amount), date: new Date(form.date).toISOString() },
      });
      setForm({ ...form, description: "", amount: "" });
      setShowForm(false);
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to save expense.");
    }
  }

  const total = expenses.reduce((s, e) => s + Number(e.amount), 0);

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold">Expenses</h1>
        <button onClick={() => setShowForm((v) => !v)} className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white">
          {showForm ? "Cancel" : "+ Add Expense"}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="mb-6 grid grid-cols-2 gap-3 rounded-lg border border-neutral-200 bg-white p-4 md:grid-cols-5">
          <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value as ExpenseCategory })} className="rounded-md border border-neutral-300 px-3 py-2">
            {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <input required placeholder="Description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="rounded-md border border-neutral-300 px-3 py-2" />
          <input required type="number" min={0.01} placeholder="Amount" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} className="rounded-md border border-neutral-300 px-3 py-2" />
          <select value={form.paymentMethod} onChange={(e) => setForm({ ...form, paymentMethod: e.target.value as PaymentMethod })} className="rounded-md border border-neutral-300 px-3 py-2">
            {(["CASH", "CARD", "BANK"] as PaymentMethod[]).map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
          <input required type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} className="rounded-md border border-neutral-300 px-3 py-2" />
          {error && <p className="col-span-full text-sm text-red-600">{error}</p>}
          <button type="submit" className="col-span-full rounded-md bg-neutral-900 px-4 py-2 font-medium text-white md:col-span-1">Save</button>
        </form>
      )}

      <p className="mb-2 text-sm text-neutral-500">Total: Rs. {total.toFixed(2)}</p>
      <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white">
        <table className="w-full text-sm">
          <thead className="border-b border-neutral-200 text-left text-neutral-500">
            <tr><th className="px-4 py-2">Date</th><th className="px-4 py-2">Category</th><th className="px-4 py-2">Description</th><th className="px-4 py-2">Method</th><th className="px-4 py-2">Amount</th></tr>
          </thead>
          <tbody>
            {expenses.map((e) => (
              <tr key={e.id} className="border-b border-neutral-100 last:border-0">
                <td className="px-4 py-2">{new Date(e.date).toLocaleDateString()}</td>
                <td className="px-4 py-2">{e.category}</td>
                <td className="px-4 py-2">{e.description}</td>
                <td className="px-4 py-2">{e.paymentMethod}</td>
                <td className="px-4 py-2">Rs. {e.amount}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
