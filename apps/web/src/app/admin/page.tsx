"use client";

import { useEffect, useState } from "react";
import { apiRequest } from "@/lib/api-client";
import type { DashboardSummary } from "@/lib/types";

function StatCard({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-4">
      <p className="text-sm text-neutral-500">{label}</p>
      <p className={`mt-1 text-2xl font-semibold ${warn ? "text-amber-600" : ""}`}>{value}</p>
    </div>
  );
}

// REP-008.
export default function AdminDashboardPage() {
  const [data, setData] = useState<DashboardSummary | null>(null);

  useEffect(() => {
    apiRequest<DashboardSummary>("/reports/dashboard").then(setData);
  }, []);

  if (!data) return <p className="text-neutral-500">Loading…</p>;

  return (
    <div>
      <h1 className="mb-4 text-xl font-semibold">Dashboard</h1>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <StatCard label="Today's Sales" value={`Rs. ${data.todaySalesRevenue.toFixed(0)}`} />
        <StatCard label="Low Stock" value={String(data.lowStockCount)} warn={data.lowStockCount > 0} />
        <StatCard label="Outstanding Khata" value={`Rs. ${data.outstandingKhata.toFixed(0)}`} />
        <StatCard label="Supplier Payable" value={`Rs. ${data.supplierPayable.toFixed(0)}`} />
        <StatCard label="Gross Profit (today)" value={`Rs. ${data.grossProfitToday.toFixed(0)}`} />
        <StatCard label="Net Profit (today)" value={`Rs. ${data.netProfitToday.toFixed(0)}`} />
      </div>

      <h2 className="mb-2 mt-6 font-semibold">Recent Transactions</h2>
      <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white">
        <table className="w-full text-sm">
          <thead className="border-b border-neutral-200 text-left text-neutral-500">
            <tr>
              <th className="px-4 py-2">Invoice</th>
              <th className="px-4 py-2">Total</th>
              <th className="px-4 py-2">Payment</th>
              <th className="px-4 py-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {data.recentSales.map((s) => (
              <tr key={s.id} className="border-b border-neutral-100 last:border-0">
                <td className="px-4 py-2">{s.invoiceNumber}</td>
                <td className="px-4 py-2">Rs. {s.grandTotal}</td>
                <td className="px-4 py-2">{s.paymentMethod}</td>
                <td className="px-4 py-2">{s.status}</td>
              </tr>
            ))}
            {data.recentSales.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-neutral-400">
                  No sales yet
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
