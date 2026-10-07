import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeVoucherCode as n } from '../src/lib/voucherCode.ts';

test('canonical code passes through', () => assert.equal(n('GASBACK-ABCDE-FGH23'), 'GASBACK-ABCDE-FGH23'));
test('lower case, spaces, missing dashes and missing prefix are tolerated', () => {
  assert.equal(n(' gasback-abcde-fgh23 '), 'GASBACK-ABCDE-FGH23');
  assert.equal(n('GASBACKABCDEFGH23'), 'GASBACK-ABCDE-FGH23');
  assert.equal(n('abcde fgh23'), 'GASBACK-ABCDE-FGH23');
});
test('rejects wrong length and symbols outside the alphabet (0 1 I O)', () => {
  assert.equal(n(''), null);
  assert.equal(n('GASBACK-ABCDE'), null);
  assert.equal(n('GASBACK-ABCDE-FGH234'), null);
  for (const bad of ['0', '1', 'I', 'O']) assert.equal(n(`GASBACK-ABCD${bad}-FGH23`), null, bad);
});
test('non-string input is rejected, not thrown', () => {
  assert.equal(n(undefined), null);
  assert.equal(n(null), null);
  assert.equal(n(12345), null);
});
test('injection-looking input is rejected', () => assert.equal(n("GASBACK-ABCDE-FGH23'; DROP TABLE vouchers;--"), null));
