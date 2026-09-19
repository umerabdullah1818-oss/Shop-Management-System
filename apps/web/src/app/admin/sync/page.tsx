"use client";

import { useEffect, useState } from "react";
import { apiRequest } from "@/lib/api-client";
import type { SyncConflict, SyncStatus } from "@/lib/types";

// SYNC-006/docs/09-api-design.md §14: queue depth, oldest pending age, last
// successful sync, and any conflicts needing manual review (SYNC-004 —
// never auto-resolved).
export default function SyncStatusPage() {
  const [status, setStatus] = useState<SyncStatus | null>(null);
  const [conflicts, setConflicts] = useState<SyncConflict[]>([]);
  const [notes, setNotes] = useState<Record<string, string>>({});

  function load() {
    apiRequest<SyncStatus>("/sync/status").then(setStatus);
    apiRequest<SyncConflict[]>("/sync/conflicts").then(setConflicts);
  }

  useEffect(() => {
    load();
    const interval = setInterval(load, 15_000);
    return () => clearInterval(interval);
  }, []);

  async function resolve(id: string) {
    await apiRequest(`/sync/conflicts/${id}/resolve`, { method: "POST", body: { notes: notes[id] } });
    load();
  }

  return (
    <div>
      <h1 className="mb-4 text-xl font-semibold">Sync Status</h1>

      {status && (
        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-lg border border-neutral-200 bg-white p-4">
            <p className="text-sm text-neutral-500">Pending</p>
            <p className="text-2xl font-semibold">{status.pendingCount}</p>
          </div>
          <div className="rounded-lg border border-neutral-200 bg-white p-4">
            <p className="text-sm text-neutral-500">Failed (retrying)</p>
            <p className={`text-2xl font-semibold ${status.failedCount > 0 ? "text-amber-600" : ""}`}>{status.failedCount}</p>
          </div>
          <div className="rounded-lg border border-neutral-200 bg-white p-4">
            <p className="text-sm text-neutral-500">Open Conflicts</p>
            <p className={`text-2xl font-semibold ${status.openConflictCount > 0 ? "text-red-600" : ""}`}>{status.openConflictCount}</p>
          </div>
          <div className="rounded-lg border border-neutral-200 bg-white p-4">
            <p className="text-sm text-neutral-500">Last Synced</p>
            <p className="text-sm font-medium">{status.lastSyncedAt ? new Date(status.lastSyncedAt).toLocaleString() : "Never"}</p>
          </div>
        </div>
      )}

      <h2 className="mb-2 font-semibold">Conflicts Needing Review</h2>
      <div className="space-y-2">
        {conflicts.map((c) => (
          <div key={c.id} className="rounded-lg border border-neutral-200 bg-white p-3 text-sm">
            <pre className="mb-2 whitespace-pre-wrap break-words text-xs text-neutral-600">{JSON.stringify(c.details, null, 2)}</pre>
            <div className="flex items-center gap-2">
              <input
                placeholder="Resolution note"
                value={notes[c.id] ?? ""}
                onChange={(e) => setNotes({ ...notes, [c.id]: e.target.value })}
                className="flex-1 rounded-md border border-neutral-300 px-2 py-1"
              />
              <button onClick={() => resolve(c.id)} className="rounded-md bg-neutral-900 px-3 py-1.5 text-white">Resolve</button>
            </div>
          </div>
        ))}
        {conflicts.length === 0 && <p className="text-neutral-400">No open conflicts</p>}
      </div>
    </div>
  );
}
