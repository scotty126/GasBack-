import test from 'node:test';
import assert from 'node:assert/strict';
import { parseReceipt, extractDate } from '../src/lib/receiptParser.ts';

// NOTE: synthetic text only. Real receipt photos are still needed to tune the parser.
const NOW = new Date('2026-10-04T10:00:00Z');

const GOOD = `SEEGAS ENERGY PLANT
Ikeja, Lagos
Invoice No: 0045231
Date: 01/10/2026 14:32
LPG REFILL 12.5 kg
Total: N18,750.00
Thank you`;

const withText = (t) => parseReceipt(t, NOW);

test('parses a complete receipt', () => {
  const r = withText(GOOD);
  assert.equal(r.ok, true);
  assert.equal(r.data.volumeKg, 12.5);
  assert.equal(r.data.invoiceNum, '0045231');
  assert.equal(r.data.vendor, 'seegas');
  assert.equal(r.data.amountNgn, 18750);
  assert.equal(r.data.receiptAt.toISOString(), '2026-10-01T13:32:00.000Z'); // 14:32 WAT = 13:32Z
});

test('volume: only whole-token accepted sizes; "16 kg" must not match "6 kg"', () => {
  assert.equal(withText(GOOD.replace('12.5 kg', '16 kg')).code, 'NO_VOLUME');
  assert.equal(withText(GOOD.replace('12.5 kg', '112.5 kg')).code, 'NO_VOLUME');
  assert.equal(withText(GOOD.replace('12.5 kg', '12.5KG')).ok, true);
  assert.equal(withText(GOOD.replace('12.5 kg', '12.50 kg')).data?.volumeKg, 12.5);
  assert.equal(withText(GOOD.replace('12.5 kg', '6kg').replace('18,750.00', '8,000')).data?.volumeKg, 6);
});

test('invoice: bare digit runs (phone numbers, prices) no longer count as an invoice', () => {
  const noLabel = GOOD.replace('Invoice No: 0045231', 'Tel 08012345678');
  assert.equal(withText(noLabel).code, 'NO_INVOICE');
});

test('invoice: header words without a number do not match', () => {
  const t = 'RECEIPT\nTOTAL 18,000\nDate 01/10/2026\n12.5 kg';
  assert.equal(withText(t).code, 'NO_INVOICE');
});

test('invoice: common label formats', () => {
  const cases = [
    ['INV-0012345', '0012345'], ['INV0012345', '0012345'], ['Invoice #: 77881', '77881'],
    ['RCPT#9876', '9876'], ['Receipt No.: A-23451', 'A-23451'], ['Ref: kd/2210/77', 'KD/2210/77'],
  ];
  for (const [line, want] of cases) {
    const r = withText(GOOD.replace('Invoice No: 0045231', line));
    assert.equal(r.ok, true, line);
    assert.equal(r.data.invoiceNum, want, line);
  }
});

test('invoice: a word merely starting with a label ("Refill") is not a label', () => {
  const t = GOOD.replace('Invoice No: 0045231', 'Refill 5521');
  assert.equal(withText(t).code, 'NO_INVOICE');
});

test('vendor: known brands detected; TotalEnergies is not read as a "Total" amount label', () => {
  const t = GOOD.replace('SEEGAS ENERGY PLANT', 'TotalEnergies Ikeja 12').replace('Total: N18,750.00', 'Amount Paid: N18,750.00');
  const r = withText(t);
  assert.equal(r.ok, true);
  assert.equal(r.data.vendor, 'totalenergies');
  assert.equal(r.data.amountNgn, 18750);
  assert.equal(withText(GOOD.replace('SEEGAS ENERGY PLANT', 'Mama Gas Shop')).data.vendor, 'unknown_vendor');
});

test('dates: day-first and several formats', () => {
  // All times are Lagos wall-clock (WAT = UTC+1), so 00:00 WAT is 23:00Z the day before.
  assert.equal(extractDate('Date 03/10/2026').toISOString(), '2026-10-02T23:00:00.000Z'); // day-first: 3 Oct, not 10 Mar
  assert.equal(extractDate('2026-10-01').toISOString(), '2026-09-30T23:00:00.000Z');
  assert.equal(extractDate('1 Oct 2026').toISOString(), '2026-09-30T23:00:00.000Z');
  assert.equal(extractDate('01-10-26').toISOString(), '2026-09-30T23:00:00.000Z');
  assert.equal(extractDate('01/10/2026 02:30 PM').toISOString(), '2026-10-01T13:30:00.000Z'); // 14:30 WAT
  assert.equal(extractDate('01/10/2026 12:05 AM').toISOString(), '2026-09-30T23:05:00.000Z');
  assert.equal(extractDate('31/02/2026'), null); // not a real date
  assert.equal(extractDate('no date here'), null);
});

test('dates: missing, stale (>30 days), future', () => {
  assert.equal(withText(GOOD.replace('Date: 01/10/2026 14:32', 'Time 14:32')).code, 'NO_DATE');
  assert.equal(withText(GOOD.replace('01/10/2026', '01/08/2026')).code, 'DATE_STALE');
  assert.equal(withText(GOOD.replace('01/10/2026', '20/10/2026')).code, 'DATE_FUTURE');
  assert.equal(withText(GOOD.replace('01/10/2026', '05/09/2026')).ok, true); // 29 days old
});

test('amount: required and must be plausible for the claimed weight', () => {
  assert.equal(withText(GOOD.replace('Total: N18,750.00', 'Thanks')).code, 'NO_AMOUNT');
  assert.equal(withText(GOOD.replace('18,750.00', '500')).code, 'PRICE_IMPLAUSIBLE');      // ₦40/kg
  assert.equal(withText(GOOD.replace('12.5 kg', '50 kg').replace('18,750.00', '1,000')).code, 'PRICE_IMPLAUSIBLE');
  assert.equal(withText(GOOD.replace('N18,750.00', '₦18750')).data?.amountNgn, 18750);
  assert.equal(withText(GOOD.replace('Total: N18,750.00', 'GRAND TOTAL NGN 18,750')).data?.amountNgn, 18750);
});
