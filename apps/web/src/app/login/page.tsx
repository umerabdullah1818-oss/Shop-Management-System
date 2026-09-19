"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { useI18n } from "@/lib/i18n/context";
import { ApiError } from "@/lib/api-client";

// Decision #17: full credentials for Admin, fast PIN quick-login for Cashier.
export default function LoginPage() {
  const { loginWithPassword, loginWithPin } = useAuth();
  const { t } = useI18n();
  const router = useRouter();
  const [mode, setMode] = useState<"pin" | "password">("pin");
  const [pin, setPin] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const loggedInUser = mode === "pin" ? await loginWithPin(pin) : await loginWithPassword(username, password);
      router.push(loggedInUser.role === "ADMIN" ? "/admin" : "/pos");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("login.error.generic"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="flex flex-1 items-center justify-center p-4">
      <div className="w-full max-w-sm rounded-lg border border-neutral-200 bg-white p-6 shadow-sm">
        <h1 className="mb-1 text-xl font-semibold">{t("login.title")}</h1>
        <p className="mb-6 text-sm text-neutral-500">{t("login.subtitle")}</p>

        <div className="mb-4 flex gap-2 rounded-md bg-neutral-100 p-1 text-sm">
          <button
            type="button"
            onClick={() => setMode("pin")}
            className={`flex-1 rounded px-3 py-1.5 ${mode === "pin" ? "bg-white shadow-sm font-medium" : "text-neutral-500"}`}
          >
            {t("login.tab.pin")}
          </button>
          <button
            type="button"
            onClick={() => setMode("password")}
            className={`flex-1 rounded px-3 py-1.5 ${mode === "password" ? "bg-white shadow-sm font-medium" : "text-neutral-500"}`}
          >
            {t("login.tab.password")}
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          {mode === "pin" ? (
            <input
              autoFocus
              inputMode="numeric"
              placeholder={t("login.pin.placeholder")}
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              className="rounded-md border border-neutral-300 px-3 py-3 text-center text-lg tracking-widest"
              maxLength={8}
            />
          ) : (
            <>
              <input
                autoFocus
                placeholder={t("login.username.placeholder")}
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="rounded-md border border-neutral-300 px-3 py-2"
              />
              <input
                type="password"
                placeholder={t("login.password.placeholder")}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="rounded-md border border-neutral-300 px-3 py-2"
              />
            </>
          )}

          {error && <p className="text-sm text-red-600">{error}</p>}

          <button
            type="submit"
            disabled={submitting}
            className="mt-1 rounded-md bg-neutral-900 px-4 py-2.5 font-medium text-white disabled:opacity-50"
          >
            {submitting ? t("login.submitting") : t("login.submit")}
          </button>
        </form>
      </div>
    </main>
  );
}
