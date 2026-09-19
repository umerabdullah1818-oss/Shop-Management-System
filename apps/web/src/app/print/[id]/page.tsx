"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { apiRequest } from "@/lib/api-client";
import { Receipt, type ReceiptData } from "@/components/receipt";

interface SaleItemFull {
  quantity: string;
  unitPrice: string;
  discountAmount: string;
  lineTotal: string;
  product: { name: string };
}
interface SaleFull {
  invoiceNumber: string;
  occurredAt: string;
  subtotal: string;
  discountTotal: string;
  grandTotal: string;
  amountPaid: string;
  remainingAmount: string;
  paymentMethod: string;
  cashier: { name: string };
  customer: { name: string; isWalkIn: boolean };
  items: SaleItemFull[];
}

// FR-110/FR-111: a dedicated print route rather than an in-page modal —
// keeps the printable DOM isolated from the app chrome (nav, status bar),
// which is what makes `window.print()`'s output clean without needing a
// print stylesheet to hide half the page.
export default function PrintReceiptPage() {
  const { id } = useParams<{ id: string }>();
  const [sale, setSale] = useState<SaleFull | null>(null);

  useEffect(() => {
    apiRequest<SaleFull>(`/sales/${id}`).then((s) => {
      setSale(s);
      // FR-111: every print (first or a reprint) is logged; fire-and-forget
      // so a slow/offline audit write never blocks the actual printing.
      apiRequest(`/sales/${id}/print`, { method: "POST" }).catch(() => undefined);
      setTimeout(() => window.print(), 300);
    });
  }, [id]);

  if (!sale) return null;

  const data: ReceiptData = {
    invoiceNumber: sale.invoiceNumber,
    occurredAt: sale.occurredAt,
    cashierName: sale.cashier.name,
    customerName: sale.customer.isWalkIn ? "Walk-in Customer" : sale.customer.name,
    items: sale.items.map((i) => ({
      name: i.product.name,
      quantity: i.quantity,
      unitPrice: i.unitPrice,
      discountAmount: i.discountAmount,
      lineTotal: i.lineTotal,
    })),
    subtotal: sale.subtotal,
    discountTotal: sale.discountTotal,
    grandTotal: sale.grandTotal,
    amountPaid: sale.amountPaid,
    remainingAmount: sale.remainingAmount,
    paymentMethod: sale.paymentMethod,
  };

  return (
    <div className="flex justify-center bg-neutral-200 p-4 print:bg-white print:p-0">
      <Receipt data={data} />
    </div>
  );
}
