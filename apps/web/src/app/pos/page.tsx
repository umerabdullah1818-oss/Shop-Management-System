"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { newId } from "@shop/shared";
import { apiRequest, ApiError } from "@/lib/api-client";
import { useAuth } from "@/lib/auth-context";
import { useI18n } from "@/lib/i18n/context";
import type { Customer, PaymentMethod, Product, Sale, Shift } from "@/lib/types";

interface CartLine {
  productId: string;
  name: string;
  officialPrice: number;
  quantity: number;
  unitPrice: number;
  discountAmount: number;
}

interface Counter {
  id: string;
  name: string;
}

// docs/11-ui-ux.md §1 — one screen, no step-by-step wizard (FR-040).
export default function PosPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!authLoading && !user) router.replace("/login");
  }, [authLoading, user, router]);

  const [shift, setShift] = useState<Shift | null | undefined>(undefined); // undefined = still checking
  const [counters, setCounters] = useState<Counter[]>([]);

  const loadShift = useCallback(async () => {
    if (!user) return;
    const [shifts, counterList] = await Promise.all([
      apiRequest<Shift[]>("/shifts", { query: { status: "OPEN" } }),
      apiRequest<Counter[]>("/counters"),
    ]);
    setCounters(counterList);
    setShift(shifts.find((s) => s.userId === user.id) ?? null);
  }, [user]);

  useEffect(() => {
    loadShift();
  }, [loadShift]);

  if (authLoading || !user) return null;
  if (shift === undefined) return <CenteredMessage>Loading…</CenteredMessage>;
  if (shift === null) return <OpenShiftForm counters={counters} onOpened={setShift} />;

  return <PosScreen shift={shift} onShiftClosed={() => setShift(null)} />;
}

function CenteredMessage({ children }: { children: React.ReactNode }) {
  return <main className="flex flex-1 items-center justify-center text-neutral-500">{children}</main>;
}

function OpenShiftForm({ counters, onOpened }: { counters: Counter[]; onOpened: (s: Shift) => void }) {
  const { t } = useI18n();
  const [counterId, setCounterId] = useState(counters[0]?.id ?? "");
  const [openingCash, setOpeningCash] = useState("0");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!counterId && counters[0]) setCounterId(counters[0].id);
  }, [counters, counterId]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const shift = await apiRequest<Shift>("/shifts/open", {
        method: "POST",
        body: { id: newId(), counterId, openingCash: Number(openingCash) },
      });
      onOpened(shift);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to open shift.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="flex flex-1 items-center justify-center p-4">
      <form onSubmit={handleSubmit} className="w-full max-w-sm rounded-lg border border-neutral-200 bg-white p-6 shadow-sm">
        <h1 className="mb-4 text-lg font-semibold">{t("pos.openShift")}</h1>
        <label className="mb-1 block text-sm text-neutral-600">{t("pos.counter")}</label>
        <select
          value={counterId}
          onChange={(e) => setCounterId(e.target.value)}
          className="mb-3 w-full rounded-md border border-neutral-300 px-3 py-2"
        >
          {counters.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <label className="mb-1 block text-sm text-neutral-600">{t("pos.openingCash")}</label>
        <input
          type="number"
          min={0}
          value={openingCash}
          onChange={(e) => setOpeningCash(e.target.value)}
          className="mb-3 w-full rounded-md border border-neutral-300 px-3 py-2"
        />
        {error && <p className="mb-3 text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={submitting || !counterId}
          className="w-full rounded-md bg-neutral-900 px-4 py-2.5 font-medium text-white disabled:opacity-50"
        >
          {submitting ? t("pos.processing") : t("pos.openShift")}
        </button>
      </form>
    </main>
  );
}

function PosScreen({ shift, onShiftClosed }: { shift: Shift; onShiftClosed: () => void }) {
  const { user } = useAuth();
  const { t } = useI18n();
  const [search, setSearch] = useState("");
  const [products, setProducts] = useState<Product[]>([]);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [customerId, setCustomerId] = useState<string>("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("CASH");
  const [amountPaidInput, setAmountPaidInput] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [lastSale, setLastSale] = useState<Sale | null>(null);
  const [pendingSaleId, setPendingSaleId] = useState<string | null>(null);
  const [overrideBlockedBy, setOverrideBlockedBy] = useState<string | null>(null);
  const [closingShift, setClosingShift] = useState(false);

  async function closeShift() {
    const closingCashInput = window.prompt("Counted cash in drawer:");
    if (closingCashInput === null) return;
    setClosingShift(true);
    try {
      await apiRequest(`/shifts/${shift.id}/close`, {
        method: "POST",
        body: { closingCash: Number(closingCashInput) },
      });
      onShiftClosed();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to close shift.");
    } finally {
      setClosingShift(false);
    }
  }

  useEffect(() => {
    apiRequest<Customer[]>("/customers").then((list) => {
      setCustomers(list);
      const walkIn = list.find((c) => c.isWalkIn);
      if (walkIn) setCustomerId(walkIn.id);
    });
  }, []);

  useEffect(() => {
    const handle = setTimeout(() => {
      apiRequest<Product[]>("/products", { query: { search } }).then(setProducts);
    }, 200);
    return () => clearTimeout(handle);
  }, [search]);

  const subtotal = useMemo(() => cart.reduce((s, l) => s + l.quantity * l.unitPrice, 0), [cart]);
  const discountTotal = useMemo(() => cart.reduce((s, l) => s + l.discountAmount, 0), [cart]);
  const grandTotal = subtotal - discountTotal;
  const amountPaid = amountPaidInput === "" ? grandTotal : Number(amountPaidInput);
  const remaining = Math.max(0, grandTotal - amountPaid);

  function addToCart(product: Product) {
    setCart((prev) => {
      const existing = prev.find((l) => l.productId === product.id);
      if (existing) {
        return prev.map((l) => (l.productId === product.id ? { ...l, quantity: l.quantity + 1 } : l));
      }
      return [
        ...prev,
        {
          productId: product.id,
          name: product.name,
          officialPrice: Number(product.officialPrice),
          quantity: 1,
          unitPrice: Number(product.officialPrice),
          discountAmount: 0,
        },
      ];
    });
  }

  function updateLine(productId: string, patch: Partial<CartLine>) {
    setCart((prev) => prev.map((l) => (l.productId === productId ? { ...l, ...patch } : l)));
  }

  function removeLine(productId: string) {
    setCart((prev) => prev.filter((l) => l.productId !== productId));
  }

  async function completeSale(overrideToken?: string) {
    if (!user || cart.length === 0) return;
    setError(null);
    setSubmitting(true);
    const saleId = pendingSaleId ?? newId();
    setPendingSaleId(saleId);

    try {
      const sale = await apiRequest<Sale>("/sales", {
        method: "POST",
        body: {
          id: saleId,
          counterId: shift.counterId,
          shiftId: shift.id,
          customerId,
          items: cart.map((l) => ({
            productId: l.productId,
            quantity: l.quantity,
            unitPrice: l.unitPrice,
            discountAmount: l.discountAmount,
          })),
          paymentMethod,
          amountPaid,
          overrideToken,
        },
      });
      setLastSale(sale);
      setCart([]);
      setPendingSaleId(null);
      setAmountPaidInput("");
    } catch (err) {
      if (err instanceof ApiError && (err.code === "BELOW_COST_BLOCKED" || err.code === "DISCOUNT_CAP_EXCEEDED")) {
        // BR-011: Cashier's cart/sale attempt is held (saleId is stable,
        // reused on retry) while an Admin authorizes on this same terminal.
        setOverrideBlockedBy(err.code);
      } else {
        setError(err instanceof ApiError ? err.message : "Unable to complete sale.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (lastSale) {
    return (
      <main className="flex flex-1 items-center justify-center p-4">
        <div className="w-full max-w-sm rounded-lg border border-neutral-200 bg-white p-6 text-center shadow-sm">
          <p className="text-sm text-neutral-500">{t("pos.saleComplete")}</p>
          <p className="mt-1 text-2xl font-semibold">{lastSale.invoiceNumber}</p>
          <p className="mt-2 text-neutral-600">{t("pos.total")} Rs. {lastSale.grandTotal}</p>
          {Number(lastSale.remainingAmount) > 0 && (
            <p className="mt-1 text-amber-600">{t("pos.addedToKhata")}: Rs. {lastSale.remainingAmount}</p>
          )}
          <a
            href={`/print/${lastSale.id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-4 block w-full rounded-md border border-neutral-300 px-4 py-2.5 text-center font-medium"
          >
            {t("pos.printReceipt")}
          </a>
          <button
            onClick={() => setLastSale(null)}
            className="mt-2 w-full rounded-md bg-neutral-900 px-4 py-2.5 font-medium text-white"
          >
            {t("pos.newSale")}
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="grid flex-1 grid-cols-1 gap-4 p-4 md:grid-cols-[1fr_380px]">
      {overrideBlockedBy && (
        <OverrideModal
          reason={overrideBlockedBy}
          saleClientId={pendingSaleId!}
          onAuthorized={(token) => {
            setOverrideBlockedBy(null);
            completeSale(token);
          }}
          onCancel={() => setOverrideBlockedBy(null)}
        />
      )}

      <section>
        <input
          autoFocus
          placeholder={t("pos.search.placeholder")}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="mb-3 w-full rounded-md border border-neutral-300 px-4 py-3 text-lg"
        />
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
          {products.map((p) => (
            <button
              key={p.id}
              onClick={() => addToCart(p)}
              className="rounded-lg border border-neutral-200 bg-white p-3 text-left hover:border-neutral-400"
            >
              <p className="truncate font-medium">{p.name}</p>
              <p className="text-sm text-neutral-500">Rs. {p.officialPrice}</p>
            </button>
          ))}
        </div>
      </section>

      <aside className="flex flex-col rounded-lg border border-neutral-200 bg-white p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-semibold">{t("pos.cart.title")}</h2>
          <button
            onClick={closeShift}
            disabled={closingShift}
            className="text-xs text-neutral-500 underline underline-offset-2 hover:text-neutral-900 disabled:opacity-50"
          >
            {closingShift ? t("pos.closing") : t("pos.closeShift")}
          </button>
        </div>
        <div className="flex-1 space-y-3 overflow-y-auto">
          {cart.length === 0 && <p className="text-sm text-neutral-400">{t("pos.cart.empty")}</p>}
          {cart.map((line) => (
            <div key={line.productId} className="border-b border-neutral-100 pb-2">
              <div className="flex items-center justify-between">
                <p className="font-medium">{line.name}</p>
                <button onClick={() => removeLine(line.productId)} className="text-neutral-400 hover:text-red-600">
                  ✕
                </button>
              </div>
              <div className="mt-1 flex items-center gap-2 text-sm">
                <label className="text-neutral-500">{t("pos.cart.qty")}</label>
                <input
                  type="number"
                  min={0.0001}
                  value={line.quantity}
                  onChange={(e) => updateLine(line.productId, { quantity: Number(e.target.value) })}
                  className="w-16 rounded border border-neutral-300 px-2 py-1"
                />
                <label className="text-neutral-500">{t("pos.cart.price")}</label>
                <input
                  type="number"
                  min={0}
                  value={line.unitPrice}
                  onChange={(e) => updateLine(line.productId, { unitPrice: Number(e.target.value) })}
                  className="w-20 rounded border border-neutral-300 px-2 py-1"
                />
                <label className="text-neutral-500">{t("pos.cart.discount")}</label>
                <input
                  type="number"
                  min={0}
                  value={line.discountAmount}
                  onChange={(e) => updateLine(line.productId, { discountAmount: Number(e.target.value) })}
                  className="w-16 rounded border border-neutral-300 px-2 py-1"
                />
              </div>
            </div>
          ))}
        </div>

        <div className="mt-3 space-y-1 border-t border-neutral-200 pt-3 text-sm">
          <div className="flex justify-between">
            <span>{t("pos.subtotal")}</span>
            <span>Rs. {subtotal.toFixed(2)}</span>
          </div>
          <div className="flex justify-between">
            <span>{t("pos.discount")}</span>
            <span>Rs. {discountTotal.toFixed(2)}</span>
          </div>
          <div className="flex justify-between text-base font-semibold">
            <span>{t("pos.grandTotal")}</span>
            <span>Rs. {grandTotal.toFixed(2)}</span>
          </div>
        </div>

        <div className="mt-3 space-y-2">
          <select
            value={customerId}
            onChange={(e) => setCustomerId(e.target.value)}
            className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
          >
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.isWalkIn ? "Walk-in Customer" : c.name}
              </option>
            ))}
          </select>

          <div className="flex gap-1">
            {(["CASH", "CARD", "BANK", "KHATA"] as PaymentMethod[]).map((m) => (
              <button
                key={m}
                onClick={() => setPaymentMethod(m)}
                className={`flex-1 rounded-md border px-2 py-1.5 text-xs font-medium ${
                  paymentMethod === m ? "border-neutral-900 bg-neutral-900 text-white" : "border-neutral-300"
                }`}
              >
                {m}
              </button>
            ))}
          </div>

          <input
            type="number"
            min={0}
            placeholder={`Amount paid (default: ${grandTotal.toFixed(2)})`}
            value={amountPaidInput}
            onChange={(e) => setAmountPaidInput(e.target.value)}
            className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
          />
          {remaining > 0 && (
            <p className="text-xs text-amber-600">
              {t("pos.remaining")} Rs. {remaining.toFixed(2)} {t("pos.toKhata")}
            </p>
          )}

          {error && <p className="text-sm text-red-600">{error}</p>}

          <button
            onClick={() => completeSale()}
            disabled={submitting || cart.length === 0}
            className="w-full rounded-md bg-neutral-900 px-4 py-3 font-semibold text-white disabled:opacity-50"
          >
            {submitting ? t("pos.processing") : t("pos.completeSale")}
          </button>
        </div>
      </aside>
    </main>
  );
}

function OverrideModal({
  reason,
  saleClientId,
  onAuthorized,
  onCancel,
}: {
  reason: string;
  saleClientId: string;
  onAuthorized: (token: string) => void;
  onCancel: () => void;
}) {
  const [adminUsername, setAdminUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await apiRequest<{ overrideToken: string }>("/auth/step-up", {
        method: "POST",
        body: { adminUsername, password, saleClientId },
      });
      onAuthorized(res.overrideToken);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to authorize.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-10 flex items-center justify-center bg-black/40 p-4">
      <form onSubmit={handleSubmit} className="w-full max-w-sm rounded-lg bg-white p-6 shadow-lg">
        <h2 className="mb-1 font-semibold">Admin approval required</h2>
        <p className="mb-4 text-sm text-neutral-500">
          {reason === "BELOW_COST_BLOCKED"
            ? "This price is below the item's cost."
            : "This discount is beyond the cashier limit."}{" "}
          An admin must approve on this terminal.
        </p>
        <input
          autoFocus
          placeholder="Admin username"
          value={adminUsername}
          onChange={(e) => setAdminUsername(e.target.value)}
          className="mb-2 w-full rounded-md border border-neutral-300 px-3 py-2"
        />
        <input
          type="password"
          placeholder="Admin password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="mb-3 w-full rounded-md border border-neutral-300 px-3 py-2"
        />
        {error && <p className="mb-3 text-sm text-red-600">{error}</p>}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 rounded-md border border-neutral-300 px-4 py-2 font-medium"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="flex-1 rounded-md bg-neutral-900 px-4 py-2 font-medium text-white disabled:opacity-50"
          >
            {submitting ? "Checking…" : "Approve"}
          </button>
        </div>
      </form>
    </div>
  );
}
