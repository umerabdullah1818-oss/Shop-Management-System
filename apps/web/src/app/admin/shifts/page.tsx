"use client";

import { useEffect, useState } from "react";
import { apiRequest } from "@/lib/api-client";
import type { Shift } from "@/lib/types";

// FR-090/FR-092: Admin can review closed shifts, incl. cash variance.
export default function ShiftsPage() {
  const [shifts, setShifts] = useState<Shift[]>([]);

  useEffect(() => {
    apiRequest<Shift[]>("/shifts").then(setShifts);
  }, []);

  return (
    <div>
      <h1 className="mb-4 text-xl font-semibold">Shifts</h1>
      <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white">
        <table className="w-full text-sm">
          <thead className="border-b border-neutral-200 text-left text-neutral-500">
            <tr>
              <th className="px-4 py-2">Opened</th>
              <th className="px-4 py-2">Closed</th>
              <th className="px-4 py-2">Opening Cash</th>
              <th className="px-4 py-2">Expected</th>
              <th className="px-4 py-2">Actual</th>
              <th className="px-4 py-2">Difference</th>
              <th className="px-4 py-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {shifts.map((s) => {
              const diff = s.difference !== null ? Number(s.difference) : null;
              return (
                <tr key={s.id} className="border-b border-neutral-100 last:border-0">
                  <td className="px-4 py-2">{new Date(s.openedAt).toLocaleString()}</td>
                  <td className="px-4 py-2">{s.closedAt ? new Date(s.closedAt).toLocaleString() : "—"}</td>
                  <td className="px-4 py-2">Rs. {s.openingCash}</td>
                  <td className="px-4 py-2">{s.expectedCash !== null ? `Rs. ${s.expectedCash}` : "—"}</td>
                  <td className="px-4 py-2">{s.closingCash !== null ? `Rs. ${s.closingCash}` : "—"}</td>
                  <td className={`px-4 py-2 ${diff !== null && diff !== 0 ? "font-medium text-amber-600" : ""}`}>
                    {diff !== null ? `Rs. ${diff.toFixed(2)}` : "—"}
                  </td>
                  <td className="px-4 py-2">{s.status}</td>
                </tr>
              );
            })}
            {shifts.length === 0 && (
              <tr><td colSpan={7} className="px-4 py-6 text-center text-neutral-400">No shifts yet</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
