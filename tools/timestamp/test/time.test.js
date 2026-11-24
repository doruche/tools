import assert from 'node:assert/strict';
import { test } from 'node:test';
import { formats, isTimeZone, parse, relative } from '../time.js';

const read = (text, zone = 'UTC') => {
  const { ns, as } = parse(text, zone);
  return { ns: String(ns), as };
};

test('reads unix time in any unit, telling them apart by length', () => {
  assert.deepEqual(read('1795000000'), { ns: '1795000000000000000', as: 'unix seconds' });
  assert.deepEqual(read('1795000000123'), { ns: '1795000000123000000', as: 'unix milliseconds' });
  assert.deepEqual(read('1795000000123456'), { ns: '1795000000123456000', as: 'unix microseconds' });
  assert.deepEqual(read('1795000000123456789'), { ns: '1795000000123456789', as: 'unix nanoseconds' });
  assert.deepEqual(read('-1.5'), { ns: '-1500000000', as: 'unix seconds' });
  assert.equal(parse('  ', 'UTC'), null);
});

test('reads ISO 8601 with an offset, or as a clock time in the chosen zone', () => {
  assert.deepEqual(read('2026-11-25T10:13:20.5+08:00'), { ns: '1795572800500000000', as: 'ISO 8601' });
  assert.deepEqual(read('2026-11-25T02:13:20Z'), read('2026-11-25 10:13:20+0800'));
  assert.deepEqual(read('2026-11-25 10:13:20', 'Asia/Shanghai'), { ns: '1795572800000000000', as: 'Asia/Shanghai time (--tz)' });
  assert.equal(read('2026-11-25', 'Asia/Shanghai').ns, String(BigInt(Date.UTC(2026, 10, 24, 16)) * 1_000_000n));
});

test('settles clock times that summer time skips or repeats', () => {
  // Berlin skips 02:00–03:00 on 2026-03-29 and repeats 02:00–03:00 on 2026-10-25.
  assert.equal(formats(parse('2026-03-29 02:30', 'Europe/Berlin').ns, 'Europe/Berlin').zoned, '2026-03-29T03:30:00+02:00');
  assert.equal(formats(parse('2026-10-25 02:30', 'Europe/Berlin').ns, 'Europe/Berlin').zoned, '2026-10-25T02:30:00+02:00');
});

test('reads RFC 2822 and HTTP dates', () => {
  assert.deepEqual(read('Wed, 25 Nov 2026 10:13:20 +0800'), { ns: '1795572800000000000', as: 'RFC 2822' });
  assert.equal(read('Wed, 25 Nov 2026 02:13:20 GMT').ns, '1795572800000000000');
});

test('rejects what it cannot read', () => {
  assert.throws(() => parse('yesterday', 'UTC'), /not a time this tool reads/);
  assert.throws(() => parse('2026-02-30', 'UTC'), /not a real date/);
  assert.throws(() => parse('-99999999999', 'UTC'), /outside the years 1 to 9999/);
});

test('writes every notation, in UTC and in the chosen zone', () => {
  assert.deepEqual(formats(1795572800500000000n, 'Asia/Shanghai'), {
    unix: '1795572800.5',
    unixMs: '1795572800500',
    utc: '2026-11-25T02:13:20.5Z',
    zoned: '2026-11-25T10:13:20.5+08:00',
    rfc2822: 'Wed, 25 Nov 2026 10:13:20 +0800',
    calendar: 'Wednesday · day 329 · week 2026-W48',
  });
  assert.equal(formats(0n, 'America/St_Johns').zoned, '1969-12-31T20:30:00-03:30');
  assert.equal(formats(-1n, 'UTC').utc, '1969-12-31T23:59:59.999999999Z');
  // 2027-01-01 is a Friday, so it still belongs to the last ISO week of 2026.
  assert.equal(formats(parse('2027-01-01', 'UTC').ns, 'UTC').calendar, 'Friday · day 1 · week 2026-W53');
});

test('says how far away a time is', () => {
  const now = Date.UTC(2026, 10, 25);
  assert.equal(relative(BigInt(now + 3 * 3_600_000) * 1_000_000n, now), 'in 3 hours');
  assert.equal(relative(BigInt(now - 2 * 86_400_000) * 1_000_000n, now), '2 days ago');
  assert.equal(relative(BigInt(now + 36 * 86_400_000) * 1_000_000n, now), 'in 5 weeks');
  assert.equal(relative(BigInt(now - 90 * 60_000) * 1_000_000n, now), '90 minutes ago');
  assert.equal(relative(BigInt(now) * 1_000_000n, now), 'now');
});

test('knows time zones', () => {
  assert.ok(isTimeZone('Asia/Shanghai'));
  assert.ok(!isTimeZone('Mars/Olympus_Mons'));
});
