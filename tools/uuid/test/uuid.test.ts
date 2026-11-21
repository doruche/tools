import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createUuidV7, formatUuid, uuidV4 } from '../src/uuid.ts';

const shape = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

test('v4 sets the version and variant bits', () => {
  for (let i = 0; i < 100; i++) {
    const id = uuidV4();
    assert.match(id, shape);
    assert.equal(id[14], '4');
  }
  assert.equal(uuidV4(bytes => bytes.fill(0xff)), 'ffffffff-ffff-4fff-bfff-ffffffffffff');
});

test('v7 encodes the timestamp and version', () => {
  const time = 0x0190_1234_abcd;
  const id = createUuidV7(() => time)();
  assert.match(id, shape);
  assert.equal(id[14], '7');
  assert.equal(id.replaceAll('-', '').slice(0, 12), time.toString(16).padStart(12, '0'));
});

test('v7 IDs stay ordered within one millisecond and across counter overflow', () => {
  const next = createUuidV7(() => 1_700_000_000_000);
  const ids = Array.from({ length: 10_000 }, next);
  assert.deepEqual([...ids].sort(), ids);
  assert.equal(new Set(ids).size, ids.length);
});

test('v7 IDs stay ordered when the clock moves backwards', () => {
  const times = [2000, 1000, 1000];
  const next = createUuidV7(() => times.shift()!);
  const ids = [next(), next(), next()];
  assert.deepEqual([...ids].sort(), ids);
});

test('formats with case and hyphen options', () => {
  const id = '0190f2a4-1b2c-7d3e-8f40-123456789abc';
  assert.equal(formatUuid(id, { uppercase: true }), '0190F2A4-1B2C-7D3E-8F40-123456789ABC');
  assert.equal(formatUuid(id, { hyphens: false }), '0190f2a41b2c7d3e8f40123456789abc');
});
