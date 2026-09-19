"use client";

import { useEffect, useState } from "react";
import { apiRequest } from "@/lib/api-client";

interface Setting {
  key: string;
  value: unknown;
}

// §57 coding rules: business-rule values configurable here, not hardcoded.
export default function SettingsPage() {
  const [settings, setSettings] = useState<Setting[]>([]);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState<string | null>(null);

  function load() {
    apiRequest<Setting[]>("/settings").then((rows) => {
      setSettings(rows);
      setEdits(Object.fromEntries(rows.map((r) => [r.key, String(r.value)])));
    });
  }

  useEffect(load, []);

  async function save(key: string) {
    setSaved(null);
    let value: unknown = edits[key];
    if (value !== undefined && !isNaN(Number(value)) && value !== "") value = Number(value);
    await apiRequest(`/settings/${key}`, { method: "PATCH", body: { value } });
    setSaved(key);
    load();
  }

  return (
    <div>
      <h1 className="mb-4 text-xl font-semibold">Settings</h1>
      <div className="max-w-lg space-y-3">
        {settings.map((s) => (
          <div key={s.key} className="flex items-center gap-2 rounded-lg border border-neutral-200 bg-white p-3">
            <span className="flex-1 text-sm font-medium">{s.key}</span>
            <input
              value={edits[s.key] ?? ""}
              onChange={(e) => setEdits({ ...edits, [s.key]: e.target.value })}
              className="w-32 rounded-md border border-neutral-300 px-2 py-1 text-sm"
            />
            <button onClick={() => save(s.key)} className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white">
              Save
            </button>
            {saved === s.key && <span className="text-xs text-green-600">Saved</span>}
          </div>
        ))}
        {settings.length === 0 && <p className="text-neutral-400">No settings configured yet.</p>}
      </div>
    </div>
  );
}
