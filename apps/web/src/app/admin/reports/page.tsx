"use client";

import { useEffect, useState } from "react";
import { apiRequest } from "@/lib/api-client";

const TABS = ["Sales", "Purchases", "Inventory", "Khata", "Suppliers", "Profit", "Expenses"] as const;
type Tab = (typeof TABS)[number];

const ENDPOINTS: Record<Tab, string> = {
  Sales: "/reports/sales",
  Purchases: "/reports/purchases",
  Inventory: "/reports/inventory",
  Khata: "/reports/khata",
  Suppliers: "/reports/suppliers",
  Profit: "/reports/profit",
  Expenses: "/reports/expenses",
};

// REP-001–REP-007: one hub, shared date-range controls, raw JSON result
// table — each report already has a well-defined shape from the API; this
// renders it generically rather than hand-building 7 bespoke table layouts.
export default function ReportsPage() {
  const [tab, setTab] = useState<Tab>("Sales");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [data, setData] = useState<unknown>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    apiRequest(ENDPOINTS[tab], { query: { from: from || undefined, to: to || undefined } })
      .then(setData)
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  function runQuery() {
    setLoading(true);
    apiRequest(ENDPOINTS[tab], { query: { from: from || undefined, to: to || undefined } })
      .then(setData)
      .finally(() => setLoading(false));
  }

  return (
    <div>
      <h1 className="mb-4 text-xl font-semibold">Reports</h1>

      <div className="mb-4 flex flex-wrap gap-1 rounded-md bg-neutral-100 p-1 text-sm">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`rounded px-3 py-1.5 ${tab === t ? "bg-white font-medium shadow-sm" : "text-neutral-500"}`}
          >
            {t}
          </button>
        ))}
      </div>

      {(tab === "Sales" || tab === "Profit" || tab === "Expenses") && (
        <div className="mb-4 flex items-end gap-2">
          <div>
            <label className="mb-1 block text-xs text-neutral-500">From</label>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="rounded-md border border-neutral-300 px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="mb-1 block text-xs text-neutral-500">To</label>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="rounded-md border border-neutral-300 px-3 py-2 text-sm" />
          </div>
          <button onClick={runQuery} className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white">Apply</button>
        </div>
      )}

      <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white p-4">
        {loading ? (
          <p className="text-neutral-400">Loading…</p>
        ) : (
          <pre className="whitespace-pre-wrap break-words text-xs text-neutral-700">{JSON.stringify(data, null, 2)}</pre>
        )}
      </div>
    </div>
  );
}
