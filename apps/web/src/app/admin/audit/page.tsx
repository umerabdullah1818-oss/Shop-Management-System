"use client";

import { Fragment, useEffect, useState } from "react";
import { apiRequest } from "@/lib/api-client";
import type { AuditLogEntry } from "@/lib/types";

// FR-100/SEC-006: read-only — no edit/delete controls exist here at all,
// matching that the backend has no such endpoint for this resource.
export default function AuditPage() {
  const [entries, setEntries] = useState<AuditLogEntry[]>([]);
  const [entityType, setEntityType] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);

  function load() {
    apiRequest<AuditLogEntry[]>("/audit", { query: { entityType: entityType || undefined } }).then(setEntries);
  }

  useEffect(load, [entityType]);

  return (
    <div>
      <h1 className="mb-4 text-xl font-semibold">Audit Log</h1>
      <input
        placeholder="Filter by entity type (e.g. Sale)"
        value={entityType}
        onChange={(e) => setEntityType(e.target.value)}
        className="mb-3 w-full max-w-sm rounded-md border border-neutral-300 px-3 py-2"
      />
      <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white">
        <table className="w-full text-sm">
          <thead className="border-b border-neutral-200 text-left text-neutral-500">
            <tr>
              <th className="px-4 py-2">When</th>
              <th className="px-4 py-2">Action</th>
              <th className="px-4 py-2">Entity</th>
              <th className="px-4 py-2">Reason</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e) => (
              <Fragment key={e.id}>
                <tr className="border-b border-neutral-100 last:border-0">
                  <td className="px-4 py-2">{new Date(e.createdAt).toLocaleString()}</td>
                  <td className="px-4 py-2">{e.action}</td>
                  <td className="px-4 py-2">{e.entityType} · {e.entityId.slice(0, 12)}…</td>
                  <td className="px-4 py-2">{e.reason ?? "—"}</td>
                  <td className="px-4 py-2">
                    <button onClick={() => setExpanded(expanded === e.id ? null : e.id)} className="text-neutral-500 hover:underline">
                      {expanded === e.id ? "Hide" : "Details"}
                    </button>
                  </td>
                </tr>
                {expanded === e.id && (
                  <tr className="border-b border-neutral-100 bg-neutral-50">
                    <td colSpan={5} className="px-4 py-3">
                      <div className="grid grid-cols-2 gap-4 text-xs">
                        <div>
                          <p className="mb-1 font-medium text-neutral-500">Before</p>
                          <pre className="whitespace-pre-wrap break-words">{JSON.stringify(e.beforeJson, null, 2) ?? "—"}</pre>
                        </div>
                        <div>
                          <p className="mb-1 font-medium text-neutral-500">After</p>
                          <pre className="whitespace-pre-wrap break-words">{JSON.stringify(e.afterJson, null, 2) ?? "—"}</pre>
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
            {entries.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-6 text-center text-neutral-400">No audit entries</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
