import type { Field } from "./types";

/**
 * Guess which master field a column header belongs to.
 * Order matters: "Unit Price" must be price (not unit), "Product Code" must be sku (not name).
 */
const RULES: [Field, RegExp][] = [
  ["file", /^source( file)?$/],
  ["location", /^location$/],
  ["currency", /^(currency|curr|ccy)$/],
  ["price", /price|cost|amount|\brate\b|\brrp\b|\bmsrp\b|\bsrp\b|harga|tariff|^\$$|^(usd|sgd|myr|eur|gbp|rm)$/],
  ["sku", /sku|code|item ?(no|#|number|num)|part ?(no|#|number)?|\bref\b|barcode|upc|ean|article|model ?(no|#)|cat(alog(ue)?)? ?(no|#)|^no\.?$|^#$/],
  ["unit", /^(unit|uom|units|pack|pack size|packing|size|qty per|per)$|unit of measure/],
  ["details", /^details?$|remark|note|spec|brand|category|colou?r/],
  ["name", /name|product|description|\bdesc\b|^item$|^items$|model|title|goods|particulars/],
];

export function normalizeHeader(s: string): string {
  return s.toLowerCase().replace(/[\s_\-:/()]+/g, " ").replace(/\s+/g, " ").trim();
}

export function mapHeader(label: string): Field | null {
  const h = normalizeHeader(label);
  if (!h) return null;
  for (const [field, re] of RULES) if (re.test(h)) return field;
  return null;
}

const CURRENCY_SYMBOLS: Record<string, string> = {
  $: "USD", "US$": "USD", "S$": "SGD", "A$": "AUD", "RM": "MYR", "€": "EUR", "£": "GBP", "¥": "JPY", "₹": "INR", "₱": "PHP", "฿": "THB", "Rp": "IDR",
};
const CODES = "USD|SGD|MYR|EUR|GBP|AUD|JPY|CNY|RMB|INR|PHP|THB|IDR|HKD|NZD|CAD";
const SYMBOLS = "US\\$|S\\$|A\\$|RM|Rp|[$€£¥₹₱฿]";

/** Matches a cell that is (only) a price, e.g. "$1,299.00", "RM 12.50", "12.5 SGD", "1299" */
const PRICE_CELL_RE = new RegExp(
  `^(?:(${SYMBOLS}|${CODES})\\s?)?(-?\\d{1,3}(?:,\\d{3})+(?:\\.\\d{1,4})?|-?\\d+(?:\\.\\d{1,4})?)(?:\\s?(${CODES}))?$`,
  "i"
);

export type ParsedPrice = { value: number; currency: string; explicit: boolean };

/** Parse a price-looking string. `explicit` = had a currency marker or decimal places (so it's very likely a price). */
export function parsePrice(raw: string): ParsedPrice | null {
  const s = raw.trim().replace(/ /g, " ");
  const m = PRICE_CELL_RE.exec(s);
  if (!m) return null;
  const [, pre, num, post] = m;
  const value = Number(num.replace(/,/g, ""));
  if (!Number.isFinite(value)) return null;
  const marker = pre || post || "";
  const currency = marker ? CURRENCY_SYMBOLS[marker] || CURRENCY_SYMBOLS[marker.toUpperCase()] || marker.toUpperCase() : "";
  return { value, currency, explicit: Boolean(marker) || num.includes(".") };
}

/** Lines in price lists that are not products. */
export const SKIP_LINE_RE = /\b(sub ?total|grand total|total|tax|gst|vat|sst|discount|shipping|delivery charge|balance|page \d+|invoice no|quotation no)\b/i;

export const hasLetters = (s: string) => /\p{L}/u.test(s);

/** Currency named in a header, e.g. "Price (SGD)" -> "SGD", "Price RM" -> "MYR". */
export function headerCurrency(label: string): string {
  const m = new RegExp(`(?:^|[\\s(])(${CODES}|${SYMBOLS})(?:$|[\\s)])`, "i").exec(label);
  if (!m) return "";
  return CURRENCY_SYMBOLS[m[1]] || CURRENCY_SYMBOLS[m[1].toUpperCase()] || m[1].toUpperCase();
}
