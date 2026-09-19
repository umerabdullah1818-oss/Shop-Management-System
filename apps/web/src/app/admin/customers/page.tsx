"use client";

import { useEffect, useState } from "react";
import { newId } from "@shop/shared";
import { apiRequest, ApiError } from "@/lib/api-client";
import type { Customer, KhataTransaction, PaymentMethod } from "@/lib/types";

// FR-030/FR-032/FR-033.
export default function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Customer | null>(null);
  const [khata, setKhata] = useState<{ balance: number; transactions: KhataTransaction[] } | null>(null);
  const [payAmount, setPayAmount] = useState("");
  const [payMethod, setPayMethod] = useState<PaymentMethod>("CASH");
  const [error, setError] = useState<string | null>(null);

  function loadCustomers(q?: string) {
    apiRequest<Customer[]>("/customers", { query: { search: q } }).then(setCustomers);
  }

  useEffect(() => { loadCustomers(); }, []);
  useEffect(() => {
    const h = setTimeout(() => loadCustomers(search), 250);
    return () => clearTimeout(h);
  }, [search]);

  function openCustomer(c: Customer) {
    setSelected(c);
    apiRequest<{ balance: number; transactions: KhataTransaction[] }>(`/customers/${c.id}/khata`).then(setKhata);
  }

  async function recordPayment() {
    if (!selected) return;
    setError(null);
    try {
      await apiRequest(`/customers/${selected.id}/khata-payments`, {
        method: "POST",
        body: { id: newId(), amount: Number(payAmount), method: payMethod },
      });
      setPayAmount("");
      openCustomer(selected);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to record payment.");
    }
  }

  return (
    <div>
      <h1 className="mb-4 text-xl font-semibold">Customers / Khata</h1>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-[1fr_1.2fr]">
        <div>
          <input placeholder="Search customers…" value={search} onChange={(e) => setSearch(e.target.value)} className="mb-3 w-full rounded-md border border-neutral-300 px-3 py-2" />
          <div className="overflow-hidden rounded-lg border border-neutral-200 bg-white">
            {customers.map((c) => (
              <button
                key={c.id}
                onClick={() => openCustomer(c)}
                className={`block w-full border-b border-neutral-100 px-4 py-2 text-left text-sm last:border-0 hover:bg-neutral-50 ${selected?.id === c.id ? "bg-neutral-100" : ""}`}
              >
                {c.isWalkIn ? "Walk-in Customer" : c.name} {c.phone && <span className="text-neutral-400">· {c.phone}</span>}
              </button>
            ))}
          </div>
        </div>

        {selected && khata && (
          <div className="rounded-lg border border-neutral-200 bg-white p-4">
            <h2 className="font-semibold">{selected.isWalkIn ? "Walk-in Customer" : selected.name}</h2>
            <p className="mb-3 text-lg">Outstanding: <span className={khata.balance > 0 ? "font-semibold text-amber-600" : ""}>Rs. {khata.balance.toFixed(2)}</span></p>

            {khata.balance > 0 && !selected.isWalkIn && (
              <div className="mb-4 flex items-center gap-2">
                <input type="number" placeholder="Amount" value={payAmount} onChange={(e) => setPayAmount(e.target.value)} className="w-28 rounded-md border border-neutral-300 px-3 py-2 text-sm" />
                <select value={payMethod} onChange={(e) => setPayMethod(e.target.value as PaymentMethod)} className="rounded-md border border-neutral-300 px-2 py-2 text-sm">
                  {(["CASH", "CARD", "BANK"] as PaymentMethod[]).map((m) => <option key={m} value={m}>{m}</option>)}
                </select>
                <button onClick={recordPayment} className="rounded-md bg-neutral-900 px-3 py-2 text-sm font-medium text-white">Record Payment</button>
              </div>
            )}
            {error && <p className="mb-3 text-sm text-red-600">{error}</p>}

            <h3 className="mb-1 text-sm font-medium text-neutral-600">Transaction History</h3>
            <div className="max-h-96 overflow-y-auto text-sm">
              {khata.transactions.map((t) => (
                <div key={t.id} className="flex justify-between border-b border-neutral-100 py-1.5 last:border-0">
                  <span>{t.type.replace(/_/g, " ")}</span>
                  <span className={Number(t.amount) < 0 ? "text-green-600" : ""}>Rs. {t.amount}</span>
                </div>
              ))}
              {khata.transactions.length === 0 && <p className="text-neutral-400">No Khata activity</p>}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
