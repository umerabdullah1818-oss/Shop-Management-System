"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";

const NAV = [
  { href: "/admin", label: "Dashboard" },
  { href: "/admin/products", label: "Products" },
  { href: "/admin/inventory", label: "Inventory" },
  { href: "/admin/purchases", label: "Purchases" },
  { href: "/admin/suppliers", label: "Suppliers" },
  { href: "/admin/customers", label: "Customers / Khata" },
  { href: "/admin/sales", label: "Sales / Returns" },
  { href: "/admin/expenses", label: "Expenses" },
  { href: "/admin/shifts", label: "Shifts" },
  { href: "/admin/reports", label: "Reports" },
  { href: "/admin/settings", label: "Settings" },
  { href: "/admin/audit", label: "Audit Log" },
  { href: "/admin/sync", label: "Sync Status" },
];

// §9/role matrix: every screen under /admin is Admin-only. The backend
// re-enforces this on every request regardless (SEC-001) — this redirect is
// purely a UX convenience for a Cashier who lands here by mistake.
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (loading) return;
    if (!user) router.replace("/login");
    else if (user.role !== "ADMIN") router.replace("/pos");
  }, [loading, user, router]);

  if (loading || !user || user.role !== "ADMIN") return null;

  return (
    <div className="flex flex-1">
      <nav className="w-56 shrink-0 border-r border-neutral-200 bg-white p-3">
        <ul className="space-y-0.5 text-sm">
          {NAV.map((item) => (
            <li key={item.href}>
              <Link
                href={item.href}
                className={`block rounded-md px-3 py-2 ${
                  pathname === item.href
                    ? "bg-neutral-900 font-medium text-white"
                    : "text-neutral-600 hover:bg-neutral-100"
                }`}
              >
                {item.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      <div className="flex-1 overflow-x-auto p-6">{children}</div>
    </div>
  );
}
