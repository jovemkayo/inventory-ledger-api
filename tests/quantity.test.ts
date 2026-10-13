import test from 'node:test';
import assert from 'node:assert/strict';
import { toMilliQuantity, fromMilliQuantity } from '../src/domain/quantity.ts';

test('converts valid decimal quantities into exact integer storage', () => {
  for (const [value, expected] of [[0.001, 1], [1.001, 1001], [2.5, 2500], [1_000_000, 1_000_000_000]]) {
    assert.equal(toMilliQuantity(value), expected);
  }
  assert.equal(fromMilliQuantity(1001), 1.001);
});
test('rejects invalid movements instead of rounding or coercing them', () => {
  for (const value of [0, -1, NaN, Infinity, '1', 1.0001, 1_000_000.001, null, undefined]) {
    assert.throws(() => toMilliQuantity(value), { code: 'INVALID_QUANTITY' });
  }
});
test('allows zero only for a minimum stock threshold', () => {
  assert.equal(toMilliQuantity(0, true), 0);
});
