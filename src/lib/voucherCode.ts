/**
 * Voucher codes look like GASBACK-XXXXX-XXXXX (32-symbol alphabet: no 0, 1, I, O).
 * Attendants type them by hand, so accept lower case, spaces, missing dashes and a missing
 * "GASBACK" prefix, and always return the canonical form (or null).
 * Import-free so Node tests can load it directly.
 */
const BODY = /^[A-HJ-NP-Z2-9]{10}$/;

export function normalizeVoucherCode(input: string): string | null {
  let s = String(input ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (s.startsWith('GASBACK')) s = s.slice(7);
  if (!BODY.test(s)) return null;
  return `GASBACK-${s.slice(0, 5)}-${s.slice(5)}`;
}
