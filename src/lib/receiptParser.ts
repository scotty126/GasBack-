// Receipt text → structured fields + validation. Pure (no imports) so it is unit-testable.
//
// NOTE: written from assumptions about Nigerian thermal LPG receipts and tested only on
// synthetic text. Thresholds below are untuned until real receipt photos are available.

// ── Tunable rules ────────────────────────────────────────────────────────────
export const ACCEPTED_SIZES_KG = [6, 12.5, 25, 50] as const;
/** Receipt must be dated within this many days before the upload (Terms §4: 30 days). */
export const MAX_RECEIPT_AGE_DAYS = 30;
/** Tolerance for clock/timezone skew on a receipt dated "today". */
export const MAX_FUTURE_HOURS = 24;
/** Sanity band for ₦ per kg (catches a total that can't match the claimed weight). */
export const MIN_NGN_PER_KG = 200;
export const MAX_NGN_PER_KG = 5000;

const KNOWN_VENDORS = /(seegas|instagas|gas[\s\w]+plant|totalenergies|oando)/i;
// "12.5" also reads as "12.50"; whole sizes also read as "6.0". The lookbehind stops "16 kg" matching 6.
const SIZE_ALT = ACCEPTED_SIZES_KG
  .map((s) => (String(s).includes('.') ? `${String(s).replace('.', '\\.')}0*` : `${s}(?:\\.0+)?`))
  .join('|');
const VOLUME_RE = new RegExp(`(?<![\\d.])(${SIZE_ALT})\\s*kg\\b`, 'i');

// A labelled reference. The token must contain a digit so a header like "RECEIPT\nTOTAL" can't match.
const INVOICE_RE =
  /\b(?:invoice|inv|receipt|rcpt|reference|ref|transaction|trans|txn|bill|order|sale)(?![A-Za-z])[ \t]*(?:no\.?|number|num|#|id)?[ \t]*[:#.\-]?[ \t]*\r?\n?[ \t]*((?=[A-Z0-9\-/]*\d)[A-Z0-9][A-Z0-9\-/]{3,19})\b/i;

// `(?![A-Za-z])` stops label matches inside words ("TotalEnergies", "Refill").
// Number part tolerates common OCR artefacts in thousands grouping: "18,750", "18, 750" (stray space,
// seen from OCR.space), "18 750", and dot grouping "18.750" (exactly 3 digits, so "18.75" stays a decimal).
const AMOUNT_RE =
  /\b(?:grand[ \t]*total|total(?:[ \t]*amount)?|amount(?:[ \t]*paid)?|net[ \t]*amount|amt|paid)(?![A-Za-z])[^\d\n]{0,14}(?:₦|NGN|N)?[ \t]*(\d{1,3}(?:,[ \t]?\d{3})+(?:\.\d{1,2})?|\d{1,3}(?: \d{3})+(?!\d)|\d{1,3}(?:\.\d{3})+(?!\d)|\d+(?:\.\d{1,2})?)/i;

/** "18, 750" → 18750 · "18 750" → 18750 · "18.750" → 18750 · "18,750.00" → 18750 · "18.75" → 18.75 */
export function parseAmount(raw: string): number {
  const s = raw.trim();
  if (/^\d{1,3}(\.\d{3})+$/.test(s)) return parseFloat(s.replace(/\./g, ''));
  return parseFloat(s.replace(/[,\s]/g, ''));
}

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
};

export type ParseErrorCode =
  | 'NO_VOLUME' | 'NO_INVOICE' | 'NO_DATE' | 'DATE_FUTURE' | 'DATE_STALE'
  | 'NO_AMOUNT' | 'PRICE_IMPLAUSIBLE';

export interface ParsedReceipt {
  volumeKg: number;
  invoiceNum: string;
  vendor: string;
  amountNgn: number;
  receiptAt: Date;
}

export type ParseResult =
  | { ok: true; data: ParsedReceipt }
  | { ok: false; code: ParseErrorCode; message: string };

/** Build a Date from a Lagos (WAT, UTC+1) wall-clock reading; null if it isn't a real date. */
function watDate(y: number, mo: number, d: number, h = 0, mi = 0): Date | null {
  if (y < 100) y += 2000;
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59) return null;
  const t = new Date(Date.UTC(y, mo - 1, d, h, mi) - 3_600_000);
  const check = new Date(t.getTime() + 3_600_000);
  return check.getUTCFullYear() === y && check.getUTCMonth() === mo - 1 && check.getUTCDate() === d ? t : null;
}

function timeAfter(text: string, from: number): { h: number; mi: number } {
  const m = /^[ T,@\-]*(\d{1,2}):(\d{2})(?::\d{2})?\s*(am|pm)?/i.exec(text.slice(from, from + 24));
  if (!m) return { h: 0, mi: 0 };
  let h = parseInt(m[1], 10);
  const mi = parseInt(m[2], 10);
  if (m[3]) {
    const pm = m[3].toLowerCase() === 'pm';
    if (pm && h < 12) h += 12;
    if (!pm && h === 12) h = 0;
  }
  return { h, mi };
}

/** First plausible date in the text. Day-first (Nigerian convention). */
export function extractDate(text: string): Date | null {
  const patterns: { re: RegExp; build: (m: RegExpExecArray) => [number, number, number] | null }[] = [
    { re: /\b(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})\b/g, build: (m) => [+m[1], +m[2], +m[3]] },
    { re: /\b(\d{1,2})[-/.](\d{1,2})[-/.](\d{4}|\d{2})\b/g, build: (m) => [+m[3], +m[2], +m[1]] },
    {
      re: /\b(\d{1,2})[ \-]([A-Za-z]{3,4})[a-z]*[ \-,]*(\d{4}|\d{2})\b/g,
      build: (m) => { const mo = MONTHS[m[2].toLowerCase()]; return mo ? [+m[3], mo, +m[1]] : null; },
    },
  ];
  for (const { re, build } of patterns) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(text))) {
      const parts = build(m);
      if (!parts) continue;
      const { h, mi } = timeAfter(text, m.index + m[0].length);
      const d = watDate(parts[0], parts[1], parts[2], h, mi);
      if (d) return d;
    }
  }
  return null;
}

export function parseReceipt(rawText: string, now: Date = new Date()): ParseResult {
  const vol = VOLUME_RE.exec(rawText);
  if (!vol) {
    return { ok: false, code: 'NO_VOLUME', message: `No valid LPG cylinder size found. Accepted sizes: ${ACCEPTED_SIZES_KG.join(', ')} kg.` };
  }
  const volumeKg = parseFloat(vol[1]);

  const inv = INVOICE_RE.exec(rawText);
  if (!inv) {
    return { ok: false, code: 'NO_INVOICE', message: 'No invoice or receipt number found. The number must be printed next to a label such as "Invoice No" or "Receipt #".' };
  }
  const invoiceNum = inv[1].toUpperCase();

  const receiptAt = extractDate(rawText);
  if (!receiptAt) {
    return { ok: false, code: 'NO_DATE', message: 'No purchase date found on the receipt.' };
  }
  const ageMs = now.getTime() - receiptAt.getTime();
  if (ageMs < -MAX_FUTURE_HOURS * 3_600_000) {
    return { ok: false, code: 'DATE_FUTURE', message: 'The receipt date is in the future.' };
  }
  if (ageMs > MAX_RECEIPT_AGE_DAYS * 86_400_000) {
    return { ok: false, code: 'DATE_STALE', message: `The receipt is older than ${MAX_RECEIPT_AGE_DAYS} days.` };
  }

  const amt = AMOUNT_RE.exec(rawText);
  const amountNgn = amt ? parseAmount(amt[1]) : NaN;
  if (!amt || !(amountNgn > 0)) {
    return { ok: false, code: 'NO_AMOUNT', message: 'No total amount found on the receipt.' };
  }
  const perKg = amountNgn / volumeKg;
  if (perKg < MIN_NGN_PER_KG || perKg > MAX_NGN_PER_KG) {
    return { ok: false, code: 'PRICE_IMPLAUSIBLE', message: 'The amount paid does not match the gas weight on the receipt.' };
  }

  const v = KNOWN_VENDORS.exec(rawText);
  const vendor = v ? v[0].trim().toLowerCase().replace(/\s+/g, '_') : 'unknown_vendor';

  return { ok: true, data: { volumeKg, invoiceNum, vendor, amountNgn, receiptAt } };
}
