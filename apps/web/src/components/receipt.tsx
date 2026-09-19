import { PRINT_FORMAT_STYLES, type PrintFormat } from "@/lib/print-formats";

export interface ReceiptData {
  invoiceNumber: string;
  occurredAt: string;
  cashierName: string;
  customerName: string;
  items: { name: string; quantity: string; unitPrice: string; discountAmount: string; lineTotal: string }[];
  subtotal: string;
  discountTotal: string;
  grandTotal: string;
  amountPaid: string;
  remainingAmount: string;
  paymentMethod: string;
}

/**
 * FR-110/FR-111: the printable invoice. Deliberately plain, high-contrast,
 * monospace-friendly markup — thermal printers render CSS inconsistently,
 * so this avoids anything fancy (no shadows, gradients, or flex-heavy
 * layouts that some print drivers mangle).
 */
export function Receipt({ data, format = "80mm" }: { data: ReceiptData; format?: PrintFormat }) {
  const style = PRINT_FORMAT_STYLES[format];

  return (
    <div style={{ width: style.width, fontSize: style.fontSize, fontFamily: "monospace", padding: "4mm", color: "#000", background: "#fff" }}>
      <p style={{ textAlign: "center", fontWeight: "bold", marginBottom: 4 }}>SHOP NAME</p>
      <p style={{ textAlign: "center", marginBottom: 8 }}>Decoration Pieces</p>
      <Divider />
      <Row label="Invoice" value={data.invoiceNumber} />
      <Row label="Date" value={new Date(data.occurredAt).toLocaleString()} />
      <Row label="Cashier" value={data.cashierName} />
      <Row label="Customer" value={data.customerName} />
      <Divider />
      {data.items.map((item, i) => (
        <div key={i} style={{ marginBottom: 4 }}>
          <div>{item.name}</div>
          <Row label={`${item.quantity} x Rs.${item.unitPrice}`} value={`Rs. ${item.lineTotal}`} />
          {Number(item.discountAmount) > 0 && <Row label="Discount" value={`-Rs. ${item.discountAmount}`} />}
        </div>
      ))}
      <Divider />
      <Row label="Subtotal" value={`Rs. ${data.subtotal}`} />
      {Number(data.discountTotal) > 0 && <Row label="Discount" value={`-Rs. ${data.discountTotal}`} />}
      <Row label="Grand Total" value={`Rs. ${data.grandTotal}`} bold />
      <Row label="Paid" value={`Rs. ${data.amountPaid} (${data.paymentMethod})`} />
      {Number(data.remainingAmount) > 0 && <Row label="Khata Balance" value={`Rs. ${data.remainingAmount}`} bold />}
      <Divider />
      <p style={{ textAlign: "center", marginTop: 8 }}>Thank you for your purchase!</p>
    </div>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", fontWeight: bold ? "bold" : "normal" }}>
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}

function Divider() {
  return <div style={{ borderTop: "1px dashed #000", margin: "6px 0" }} />;
}
