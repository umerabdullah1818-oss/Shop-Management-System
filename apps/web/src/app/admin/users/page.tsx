"use client";

import { Fragment, useEffect, useState } from "react";
import { newId } from "@shop/shared";
import {
  DEFAULT_DASHBOARD_MODULES,
  DEFAULT_DASHBOARD_WIDGETS,
  DEFAULT_CASHIER_ACTION_PERMISSIONS,
  type DashboardModules,
  type DashboardWidgets,
  type CashierActionPermissions,
} from "@shop/shared";
import { apiRequest, ApiError } from "@/lib/api-client";
import type { Counter, ManagedUser, UserActivity, UserRole } from "@/lib/types";

function humanize(key: string) {
  const spaced = key.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase());
  return spaced.replace(/^Can /, "").trim();
}

const MODULE_KEYS = Object.keys(DEFAULT_DASHBOARD_MODULES) as (keyof DashboardModules)[];
const WIDGET_KEYS = Object.keys(DEFAULT_DASHBOARD_WIDGETS) as (keyof DashboardWidgets)[];
const ACTION_KEYS = Object.keys(DEFAULT_CASHIER_ACTION_PERMISSIONS) as (keyof CashierActionPermissions)[];

// §3/§4 of the audit: Admin must have a real create/edit/disable/reset-PIN
// control over every account, plus per-cashier dashboard/permission
// configuration — all enforced server-side (see PermissionsService on the
// backend), this page is purely the admin control surface for it.
export default function UsersPage() {
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [counters, setCounters] = useState<Counter[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ role: "CASHIER" as UserRole, name: "", username: "", password: "", pin: "", counterId: "" });
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [activity, setActivity] = useState<Record<string, UserActivity>>({});
  const [resetting, setResetting] = useState<string | null>(null);
  const [resetValue, setResetValue] = useState("");

  function load() {
    apiRequest<ManagedUser[]>("/users").then(setUsers);
    apiRequest<Counter[]>("/counters").then(setCounters);
  }
  useEffect(load, []);

  async function createUser(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await apiRequest("/users", {
        method: "POST",
        body: {
          id: newId(),
          name: form.name,
          role: form.role,
          ...(form.role === "ADMIN"
            ? { username: form.username, password: form.password }
            : { pin: form.pin, counterId: form.counterId || undefined }),
        },
      });
      setForm({ role: "CASHIER", name: "", username: "", password: "", pin: "", counterId: "" });
      setShowForm(false);
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to create user.");
    }
  }

  async function toggleStatus(u: ManagedUser) {
    setError(null);
    try {
      await apiRequest(`/users/${u.id}/${u.status === "ACTIVE" ? "disable" : "enable"}`, { method: "PATCH" });
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to update status.");
    }
  }

  async function resetCredential(u: ManagedUser) {
    setError(null);
    try {
      await apiRequest(`/users/${u.id}/reset-credential`, {
        method: "POST",
        body: u.role === "ADMIN" ? { password: resetValue } : { pin: resetValue },
      });
      setResetting(null);
      setResetValue("");
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to reset credential.");
    }
  }

  async function toggleExpand(u: ManagedUser) {
    if (expanded === u.id) {
      setExpanded(null);
      return;
    }
    setExpanded(u.id);
    if (!activity[u.id]) {
      const a = await apiRequest<UserActivity>(`/users/${u.id}/activity`);
      setActivity((prev) => ({ ...prev, [u.id]: a }));
    }
  }

  async function updateProfile(u: ManagedUser, patch: Record<string, unknown>) {
    setError(null);
    try {
      await apiRequest(`/users/${u.id}/permissions`, { method: "PATCH", body: patch });
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to update permissions.");
    }
  }

  async function updateCounter(u: ManagedUser, counterId: string) {
    setError(null);
    try {
      await apiRequest(`/users/${u.id}`, { method: "PATCH", body: { name: u.name, counterId: counterId || null } });
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to update counter.");
    }
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold">Users / Cashiers</h1>
        <button onClick={() => setShowForm((v) => !v)} className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white">
          {showForm ? "Cancel" : "+ Add User"}
        </button>
      </div>

      {showForm && (
        <form onSubmit={createUser} className="mb-6 grid grid-cols-2 gap-3 rounded-lg border border-neutral-200 bg-white p-4 md:grid-cols-4">
          <select
            value={form.role}
            onChange={(e) => setForm({ ...form, role: e.target.value as UserRole })}
            className="rounded-md border border-neutral-300 px-3 py-2"
          >
            <option value="CASHIER">Cashier</option>
            <option value="ADMIN">Admin</option>
          </select>
          <input required placeholder="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="rounded-md border border-neutral-300 px-3 py-2" />
          {form.role === "ADMIN" ? (
            <>
              <input required placeholder="Username" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} className="rounded-md border border-neutral-300 px-3 py-2" />
              <input required type="password" placeholder="Password (min. 8 chars)" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} className="rounded-md border border-neutral-300 px-3 py-2" />
            </>
          ) : (
            <>
              <input required placeholder="PIN (4-8 digits)" value={form.pin} onChange={(e) => setForm({ ...form, pin: e.target.value })} className="rounded-md border border-neutral-300 px-3 py-2" />
              <select value={form.counterId} onChange={(e) => setForm({ ...form, counterId: e.target.value })} className="rounded-md border border-neutral-300 px-3 py-2">
                <option value="">No counter assigned</option>
                {counters.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </>
          )}
          {error && <p className="col-span-full text-sm text-red-600">{error}</p>}
          <button type="submit" className="col-span-full rounded-md bg-neutral-900 px-4 py-2 font-medium text-white md:col-span-1">Save</button>
        </form>
      )}

      <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white">
        <table className="w-full text-sm">
          <thead className="border-b border-neutral-200 text-left text-neutral-500">
            <tr>
              <th className="px-4 py-2">Name</th>
              <th className="px-4 py-2">Role</th>
              <th className="px-4 py-2">Login / Counter</th>
              <th className="px-4 py-2">Status</th>
              <th className="px-4 py-2">Last Login</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <Fragment key={u.id}>
                <tr className="border-b border-neutral-100 last:border-0">
                  <td className="px-4 py-2 font-medium">{u.name}</td>
                  <td className="px-4 py-2">{u.role}</td>
                  <td className="px-4 py-2 text-neutral-500">
                    {u.role === "ADMIN" ? u.username : u.cashierProfile?.counter?.name ?? "—"}
                  </td>
                  <td className="px-4 py-2">
                    <span className={u.status === "ACTIVE" ? "text-green-600" : "text-red-600"}>
                      {u.status}
                      {u.lockedUntil && new Date(u.lockedUntil) > new Date() ? " (locked)" : ""}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-neutral-500">{u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString() : "Never"}</td>
                  <td className="space-x-2 whitespace-nowrap px-4 py-2 text-right">
                    <button onClick={() => toggleExpand(u)} className="text-neutral-600 hover:underline">
                      {expanded === u.id ? "Close" : "Manage"}
                    </button>
                    <button onClick={() => toggleStatus(u)} className="text-neutral-600 hover:underline">
                      {u.status === "ACTIVE" ? "Disable" : "Enable"}
                    </button>
                  </td>
                </tr>
                {expanded === u.id && (
                  <tr className="border-b border-neutral-100 bg-neutral-50">
                    <td colSpan={6} className="px-4 py-4">
                      <div className="grid gap-6 md:grid-cols-3">
                        <div>
                          <h3 className="mb-2 text-xs font-semibold uppercase text-neutral-500">Reset Credential</h3>
                          {resetting === u.id ? (
                            <div className="flex items-center gap-2">
                              <input
                                placeholder={u.role === "ADMIN" ? "New password" : "New PIN"}
                                value={resetValue}
                                onChange={(e) => setResetValue(e.target.value)}
                                className="w-40 rounded-md border border-neutral-300 px-2 py-1 text-sm"
                              />
                              <button onClick={() => resetCredential(u)} className="rounded bg-neutral-900 px-2 py-1 text-xs text-white">Save</button>
                              <button onClick={() => { setResetting(null); setResetValue(""); }} className="text-xs text-neutral-500">Cancel</button>
                            </div>
                          ) : (
                            <button onClick={() => setResetting(u.id)} className="text-sm text-neutral-600 hover:underline">
                              Reset {u.role === "ADMIN" ? "password" : "PIN"}
                            </button>
                          )}

                          {u.role === "CASHIER" && (
                            <div className="mt-4">
                              <h3 className="mb-2 text-xs font-semibold uppercase text-neutral-500">Counter</h3>
                              <select
                                value={u.cashierProfile?.counterId ?? ""}
                                onChange={(e) => updateCounter(u, e.target.value)}
                                className="rounded-md border border-neutral-300 px-2 py-1 text-sm"
                              >
                                <option value="">No counter assigned</option>
                                {counters.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                              </select>
                            </div>
                          )}

                          <div className="mt-4">
                            <h3 className="mb-2 text-xs font-semibold uppercase text-neutral-500">Activity</h3>
                            {activity[u.id] ? (
                              <div className="space-y-1 text-xs text-neutral-600">
                                <p>Total sales: {activity[u.id].totalSales}</p>
                                <p>Recent shifts: {activity[u.id].shifts.length}</p>
                                <div className="max-h-40 overflow-y-auto rounded border border-neutral-200 bg-white p-2">
                                  {activity[u.id].auditLogs.length === 0 && <p className="text-neutral-400">No audit history yet.</p>}
                                  {activity[u.id].auditLogs.map((log) => (
                                    <div key={log.id} className="border-b border-neutral-100 py-1 last:border-0">
                                      <span className="font-medium">{log.action}</span>{" "}
                                      <span className="text-neutral-400">{new Date(log.createdAt).toLocaleString()}</span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            ) : (
                              <p className="text-xs text-neutral-400">Loading…</p>
                            )}
                          </div>
                        </div>

                        {u.role === "CASHIER" && u.cashierProfile && (
                          <>
                            <div>
                              <h3 className="mb-2 text-xs font-semibold uppercase text-neutral-500">Dashboard Modules</h3>
                              <div className="space-y-1">
                                {MODULE_KEYS.map((key) => (
                                  <label key={key} className="flex items-center gap-2 text-sm">
                                    <input
                                      type="checkbox"
                                      checked={u.cashierProfile!.dashboardModules[key]}
                                      onChange={(e) =>
                                        updateProfile(u, { dashboardModules: { [key]: e.target.checked } })
                                      }
                                    />
                                    {humanize(key)}
                                  </label>
                                ))}
                              </div>
                              <h3 className="mb-2 mt-4 text-xs font-semibold uppercase text-neutral-500">Dashboard Widgets</h3>
                              <div className="space-y-1">
                                {WIDGET_KEYS.map((key) => (
                                  <label key={key} className="flex items-center gap-2 text-sm">
                                    <input
                                      type="checkbox"
                                      checked={u.cashierProfile!.dashboardWidgets[key]}
                                      onChange={(e) =>
                                        updateProfile(u, { dashboardWidgets: { [key]: e.target.checked } })
                                      }
                                    />
                                    {humanize(key)}
                                  </label>
                                ))}
                              </div>
                            </div>

                            <div>
                              <h3 className="mb-2 text-xs font-semibold uppercase text-neutral-500">
                                Cashier Actions (enforced by the backend, not just hidden in the UI)
                              </h3>
                              <div className="space-y-1">
                                {ACTION_KEYS.map((key) => (
                                  <label key={key} className="flex items-center gap-2 text-sm">
                                    <input
                                      type="checkbox"
                                      checked={u.cashierProfile![key]}
                                      onChange={(e) => updateProfile(u, { [key]: e.target.checked })}
                                    />
                                    {humanize(key)}
                                  </label>
                                ))}
                              </div>
                            </div>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
            {users.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-neutral-400">No users yet.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </div>
  );
}
