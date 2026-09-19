export type Locale = "en" | "ur";

/**
 * Decision #18: bilingual English/Urdu toggle. Implemented as a lightweight
 * client-side dictionary + context (not full route-based locales via
 * next-intl) so the rest of the app didn't need restructuring into a
 * [locale]/ segment — a reasonable trade-off given this is a LAN app with
 * no SEO/URL-sharing need for locale-specific links. Covers the two
 * highest-traffic screens (Login, POS) in full; the remaining Admin screens
 * are still English-only strings — the infrastructure here (useTranslation,
 * the `t()` dictionary pattern) is what the rest would adopt incrementally.
 */
export const translations = {
  en: {
    "login.title": "Sign in",
    "login.subtitle": "Shop Billing & Management System",
    "login.tab.pin": "Cashier PIN",
    "login.tab.password": "Admin",
    "login.pin.placeholder": "Enter PIN",
    "login.username.placeholder": "Username",
    "login.password.placeholder": "Password",
    "login.submit": "Sign in",
    "login.submitting": "Signing in…",
    "login.error.generic": "Unable to sign in. Please try again.",

    "pos.search.placeholder": "Search or scan product…",
    "pos.cart.title": "Cart",
    "pos.cart.empty": "No items yet",
    "pos.cart.qty": "Qty",
    "pos.cart.price": "Price",
    "pos.cart.discount": "Disc.",
    "pos.subtotal": "Subtotal",
    "pos.discount": "Discount",
    "pos.grandTotal": "Grand Total",
    "pos.remaining": "Remaining",
    "pos.toKhata": "→ Khata",
    "pos.completeSale": "Complete Sale",
    "pos.processing": "Processing…",
    "pos.closeShift": "Close Shift",
    "pos.closing": "Closing…",
    "pos.saleComplete": "Sale complete",
    "pos.total": "Total",
    "pos.addedToKhata": "Added to Khata",
    "pos.printReceipt": "Print Receipt",
    "pos.newSale": "New Sale",
    "pos.openShift": "Open Shift",
    "pos.counter": "Counter",
    "pos.openingCash": "Opening cash",

    "status.online": "Online",
    "status.offline": "Offline",
    "status.checking": "Checking…",
    "status.logout": "Log out",
    "status.language": "اردو / EN",
  },
  ur: {
    "login.title": "سائن ان کریں",
    "login.subtitle": "شاپ بلنگ اینڈ مینجمنٹ سسٹم",
    "login.tab.pin": "کیشیئر پن",
    "login.tab.password": "ایڈمن",
    "login.pin.placeholder": "پن درج کریں",
    "login.username.placeholder": "صارف کا نام",
    "login.password.placeholder": "پاس ورڈ",
    "login.submit": "سائن ان کریں",
    "login.submitting": "سائن ان ہو رہا ہے…",
    "login.error.generic": "سائن ان نہیں ہو سکا۔ دوبارہ کوشش کریں۔",

    "pos.search.placeholder": "پروڈکٹ تلاش کریں یا اسکین کریں…",
    "pos.cart.title": "کارٹ",
    "pos.cart.empty": "ابھی کوئی چیز شامل نہیں",
    "pos.cart.qty": "تعداد",
    "pos.cart.price": "قیمت",
    "pos.cart.discount": "رعایت",
    "pos.subtotal": "ذیلی مجموعہ",
    "pos.discount": "رعایت",
    "pos.grandTotal": "کل رقم",
    "pos.remaining": "باقی رقم",
    "pos.toKhata": "→ کھاتہ",
    "pos.completeSale": "فروخت مکمل کریں",
    "pos.processing": "کارروائی جاری ہے…",
    "pos.closeShift": "شفٹ بند کریں",
    "pos.closing": "بند ہو رہا ہے…",
    "pos.saleComplete": "فروخت مکمل ہوگئی",
    "pos.total": "کل رقم",
    "pos.addedToKhata": "کھاتے میں شامل",
    "pos.printReceipt": "رسید پرنٹ کریں",
    "pos.newSale": "نئی فروخت",
    "pos.openShift": "شفٹ کھولیں",
    "pos.counter": "کاؤنٹر",
    "pos.openingCash": "ابتدائی نقدی",

    "status.online": "آن لائن",
    "status.offline": "آف لائن",
    "status.checking": "چیک ہو رہا ہے…",
    "status.logout": "لاگ آؤٹ",
    "status.language": "English / اردو",
  },
} as const satisfies Record<Locale, Record<string, string>>;

export type TranslationKey = keyof typeof translations.en;
