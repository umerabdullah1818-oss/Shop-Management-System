"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { useI18n } from "@/lib/i18n/context";

/**
 * NFR-003: ONLINE/OFFLINE should reflect Local Shop Server <-> Cloud
 * reachability, not LAN health to this browser — a lost LAN connection
 * means this whole app can't load, a different and more visible failure
 * than a stale badge. This polls /health, which only confirms the Local
 * Shop Server itself is reachable; swapping in the Admin-only /sync/status
 * (queue depth, last successful cloud sync) is the natural next step once
 * that's wired up for non-Admin users too, or shown only on the Admin
 * dashboard instead of this global bar.
 */
export function StatusBar() {
  const { user, logout } = useAuth();
  const pathname = usePathname();
  const { locale, setLocale, t } = useI18n();
  const [online, setOnline] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    const base = process.env.NEXT_PUBLIC_API_URL ?? "/api/v1";

    async function check() {
      try {
        const res = await fetch(`${base}/health`);
        if (!cancelled) setOnline(res.ok);
      } catch {
        if (!cancelled) setOnline(false);
      }
    }

    check();
    const interval = setInterval(check, 30_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  return (
    <header className="flex items-center justify-between border-b border-neutral-200 bg-white px-4 py-2 text-sm print:hidden">
      <div className="flex items-center gap-2 font-medium">
        <span
          className={`inline-block h-2.5 w-2.5 rounded-full ${
            online === null ? "bg-neutral-300" : online ? "bg-green-500" : "bg-red-500"
          }`}
          aria-hidden
        />
        <span>{online === null ? t("status.checking") : online ? t("status.online") : t("status.offline")}</span>
      </div>
      <div className="flex items-center gap-3 text-neutral-600">
        <button
          onClick={() => setLocale(locale === "en" ? "ur" : "en")}
          className="underline underline-offset-2 hover:text-neutral-900"
        >
          {t("status.language")}
        </button>
        {user && (
          <>
            {user.role === "ADMIN" && (
              <Link href={pathname.startsWith("/admin") ? "/pos" : "/admin"} className="underline underline-offset-2 hover:text-neutral-900">
                {pathname.startsWith("/admin") ? "Go to POS" : "Go to Admin"}
              </Link>
            )}
            <span>
              {user.name} · {user.role}
            </span>
            <button onClick={logout} className="text-neutral-500 underline underline-offset-2 hover:text-neutral-900">
              {t("status.logout")}
            </button>
          </>
        )}
      </div>
    </header>
  );
}
