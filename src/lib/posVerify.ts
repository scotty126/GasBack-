/**
 * Vendor POS cross-validation: ask the station's own system whether this sale exists.
 *
 * Contract we expect from a vendor (POST, JSON, `Authorization: Bearer <outbound_secret>`):
 *   request  { invoice_number, volume_kg, amount_ngn, receipt_at (ISO) }
 *   response { found: boolean, volume_kg?: number, amount_ngn?: number }
 * Any other answer, a non-2xx status, a timeout or a network error is "unavailable" — the caller
 * must NOT treat that as "fake receipt" nor as "confirmed".
 */

export type PosResult =
  | { status: 'confirmed' }
  | { status: 'not_found' }
  | { status: 'mismatch'; detail: string }
  | { status: 'unavailable'; detail: string };

export interface PosConfig { endpointUrl: string; secret: string }
export interface PosReceipt { invoiceNum: string; volumeKg: number; amountNgn: number; receiptAt: Date }

const VOLUME_TOLERANCE_KG = 0.05;
const AMOUNT_TOLERANCE_NGN = 1;

export async function verifyWithPos(
  cfg: PosConfig,
  receipt: PosReceipt,
  opts: { timeoutMs?: number; allowInsecure?: boolean } = {},
): Promise<PosResult> {
  // https only (also enforced in the DB); `allowInsecure` exists for local tests.
  if (!opts.allowInsecure && !/^https:\/\//i.test(cfg.endpointUrl)) {
    return { status: 'unavailable', detail: 'POS endpoint is not https' };
  }
  try {
    const res = await fetch(cfg.endpointUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${cfg.secret}` },
      body: JSON.stringify({
        invoice_number: receipt.invoiceNum,
        volume_kg: receipt.volumeKg,
        amount_ngn: receipt.amountNgn,
        receipt_at: receipt.receiptAt.toISOString(),
      }),
      redirect: 'error',                                   // never follow a redirect to somewhere else
      signal: AbortSignal.timeout(opts.timeoutMs ?? 8000),
    });
    if (!res.ok) return { status: 'unavailable', detail: `POS HTTP ${res.status}` };

    const body = (await res.json().catch(() => null)) as
      { found?: unknown; volume_kg?: unknown; amount_ngn?: unknown } | null;
    if (!body || typeof body.found !== 'boolean') return { status: 'unavailable', detail: 'POS reply not understood' };
    if (!body.found) return { status: 'not_found' };

    if (body.volume_kg !== undefined) {
      if (typeof body.volume_kg !== 'number' || Math.abs(body.volume_kg - receipt.volumeKg) > VOLUME_TOLERANCE_KG) {
        return { status: 'mismatch', detail: `volume ${String(body.volume_kg)} vs ${receipt.volumeKg}` };
      }
    }
    if (body.amount_ngn !== undefined) {
      if (typeof body.amount_ngn !== 'number' || Math.abs(body.amount_ngn - receipt.amountNgn) > AMOUNT_TOLERANCE_NGN) {
        return { status: 'mismatch', detail: `amount ${String(body.amount_ngn)} vs ${receipt.amountNgn}` };
      }
    }
    return { status: 'confirmed' };
  } catch (e) {
    return { status: 'unavailable', detail: e instanceof Error ? e.message : 'POS request failed' };
  }
}
