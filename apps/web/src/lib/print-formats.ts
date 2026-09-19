/**
 * FR-110: 80mm thermal is the default (Decision #6), built behind this
 * abstraction so 58mm/A4 can be added later without touching the receipt
 * data model — only the CSS width/font-size profile changes per format.
 */
export type PrintFormat = "80mm" | "58mm" | "A4";

export const PRINT_FORMAT_STYLES: Record<PrintFormat, { width: string; fontSize: string }> = {
  "80mm": { width: "80mm", fontSize: "12px" },
  "58mm": { width: "58mm", fontSize: "10px" },
  A4: { width: "210mm", fontSize: "14px" },
};
