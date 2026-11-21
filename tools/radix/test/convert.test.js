import assert from 'node:assert/strict';
import { test } from 'node:test';
import { format, parse } from '../convert.js';

test('parses digits, signs, separators and own-base prefixes', () => {
  assert.equal(parse('ff', 16), 255n);
  assert.equal(parse('0xFF', 16), 255n);
  assert.equal(parse('0b1010_1010', 2), 170n);
  assert.equal(parse('-0o17', 8), -15n);
  assert.equal(parse(' 1 000 ', 10), 1000n);
  assert.equal(parse('zz', 36), 1295n);
  assert.equal(parse('', 10), null);
});

test('keeps precision beyond 64 bits', () => {
  const big = parse('1'.repeat(100), 2);
  assert.equal(format(big, 16), 'f'.repeat(25));
});

test('rejects digits outside the base', () => {
  assert.throws(() => parse('102', 2), /“2” is not a base-2 digit/);
  assert.throws(() => parse('0x', 16), /at least one digit/);
  assert.throws(() => parse('0x1', 10), /“x” is not a base-10 digit/);
});

test('formats with optional uppercase letters', () => {
  assert.equal(format(255n, 16), 'ff');
  assert.equal(format(255n, 16, { uppercase: true }), 'FF');
  assert.equal(format(-10n, 2), '-1010');
});
