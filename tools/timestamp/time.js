/**
 * Reading and writing one instant in the usual notations. An instant is a
 * BigInt count of nanoseconds since 1970-01-01T00:00:00Z, so 19-digit unix
 * nanoseconds survive intact. Time zones come from Intl, and only years
 * 1 to 9999 are supported, which keeps every notation four digits wide.
 */

const NS_PER_MS = 1_000_000n;
const NS_PER_S = 1_000_000_000n;
const DAY_MS = 86_400_000;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/**
 * Milliseconds since the epoch for a UTC date and time. Unlike Date.UTC,
 * years below 100 are taken literally.
 */
function utc(year, month, day, hour = 0, minute = 0, second = 0, ms = 0) {
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  date.setUTCHours(hour, minute, second, ms);
  return date.getTime();
}

const FIRST = utc(1, 1, 1);
const LAST = utc(10000, 1, 1) - 1;

function inRange(ns) {
  const ms = Number(floorDiv(ns, NS_PER_MS));
  if (ms < FIRST || ms > LAST) throw new Error('outside the years 1 to 9999');
  return ns;
}

function floorDiv(a, b) {
  const q = a / b;
  return a % b !== 0n && (a < 0n) !== (b < 0n) ? q - 1n : q;
}
const mod = (a, b) => ((a % b) + b) % b;

/** Whether `name` is a time zone Intl knows, such as "Asia/Shanghai" or "UTC". */
export function isTimeZone(name) {
  try {
    new Intl.DateTimeFormat('en', { timeZone: name });
    return true;
  } catch {
    return false;
  }
}

const formatters = new Map();
function wallFormatter(zone) {
  if (!formatters.has(zone)) {
    formatters.set(zone, new Intl.DateTimeFormat('en-US', {
      timeZone: zone, hourCycle: 'h23',
      year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric',
    }));
  }
  return formatters.get(zone);
}

/** The date and time on a clock in `zone` at `ms`, to the second. */
function wall(ms, zone) {
  const parts = Object.fromEntries(wallFormatter(zone).formatToParts(new Date(ms)).map(part => [part.type, part.value]));
  return {
    year: Number(parts.year), month: Number(parts.month), day: Number(parts.day),
    hour: Number(parts.hour), minute: Number(parts.minute), second: Number(parts.second),
  };
}

/** The zone's offset from UTC at `ms`, in milliseconds. */
function offsetAt(ms, zone) {
  const { year, month, day, hour, minute, second } = wall(ms, zone);
  return utc(year, month, day, hour, minute, second) - (ms - mod(ms, 1000));
}

/**
 * The instant a clock in `zone` shows the given time. When the clock skips
 * that time, as when summer time starts, the time is pushed forward; when it
 * shows the time twice, the earlier one wins. Temporal calls this "compatible".
 */
function fromWall(fields, zone) {
  const local = utc(fields.year, fields.month, fields.day, fields.hour, fields.minute, fields.second);
  const before = offsetAt(local - DAY_MS, zone);
  const after = offsetAt(local + DAY_MS, zone);
  const valid = [local - before, local - after].filter(ms => offsetAt(ms, zone) === local - ms);
  return valid.length ? Math.min(...valid) : local - before;
}

/** "123" → 123000000n: a decimal fraction of a second, as nanoseconds. */
const fraction = digits => BigInt((digits ?? '').padEnd(9, '0').slice(0, 9) || '0');

/** Unix time in seconds, milliseconds, microseconds or nanoseconds, told apart by length. */
const units = [
  { upTo: 11, name: 'seconds', scale: 9 },
  { upTo: 14, name: 'milliseconds', scale: 6 },
  { upTo: 17, name: 'microseconds', scale: 3 },
  { upTo: Infinity, name: 'nanoseconds', scale: 0 },
];

function parseUnix(text) {
  const match = /^([+-]?)(\d+)(?:\.(\d+))?$/.exec(text);
  if (!match) return undefined;
  const [, sign, whole, decimals = ''] = match;
  const unit = units.find(({ upTo }) => whole.replace(/^0+(?=\d)/, '').length <= upTo);
  // Shift the decimal point right by the unit's scale, dropping digits beyond a nanosecond.
  const digits = whole + decimals.padEnd(unit.scale, '0').slice(0, unit.scale);
  const ns = BigInt(digits) * (sign === '-' ? -1n : 1n);
  return { ns, as: `unix ${unit.name}` };
}

const isoPattern = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:[.,](\d+))?)?)?\s*(Z|[+-]\d{2}(?::?\d{2})?)?$/i;

function checkFields(fields) {
  const { year, month, day, hour, minute, second } = fields;
  const ms = utc(year, month, day, hour, minute, second);
  const back = new Date(ms);
  const same = back.getUTCFullYear() === year && back.getUTCMonth() + 1 === month && back.getUTCDate() === day
    && back.getUTCHours() === hour && back.getUTCMinutes() === minute && back.getUTCSeconds() === second;
  if (!same || year < 1) throw new Error('not a real date and time');
}

/** "+08:00", "-0530", "+08" or "Z" → milliseconds east of UTC. */
function parseOffset(text) {
  if (/^z$/i.test(text)) return 0;
  const [, sign, hours, minutes = '0'] = /^([+-])(\d{2}):?(\d{2})?$/.exec(text);
  if (Number(hours) > 23 || Number(minutes) > 59) throw new Error(`“${text}” is not an offset from UTC`);
  return (sign === '-' ? -1 : 1) * (Number(hours) * 60 + Number(minutes)) * 60_000;
}

function parseIso(text, zone) {
  const match = isoPattern.exec(text);
  if (!match) return undefined;
  const [, year, month, day, hour = '0', minute = '0', second = '0', decimals, offset] = match;
  const fields = { year: +year, month: +month, day: +day, hour: +hour, minute: +minute, second: +second };
  checkFields(fields);
  const ms = offset === undefined
    ? fromWall(fields, zone)
    : utc(fields.year, fields.month, fields.day, fields.hour, fields.minute, fields.second) - parseOffset(offset);
  return {
    ns: BigInt(ms) * NS_PER_MS + fraction(decimals),
    as: offset === undefined ? `${zone} time (--tz)` : 'ISO 8601',
  };
}

const rfcPattern = /^(?:[a-z]{3},\s*)?(\d{1,2})\s+([a-z]{3})\s+(\d{4})\s+(\d{2}):(\d{2})(?::(\d{2}))?\s+(GMT|UTC?|Z|[+-]\d{4})$/i;

function parseRfc(text) {
  const match = rfcPattern.exec(text);
  if (!match) return undefined;
  const [, day, monthName, year, hour, minute, second = '0', zone] = match;
  const month = MONTHS.findIndex(name => name.toLowerCase() === monthName.toLowerCase()) + 1;
  if (!month) throw new Error(`“${monthName}” is not a month`);
  const fields = { year: +year, month, day: +day, hour: +hour, minute: +minute, second: +second };
  checkFields(fields);
  const offset = /^[+-]/.test(zone) ? parseOffset(zone) : 0;
  return { ns: BigInt(utc(year, month, +day, +hour, +minute, +second) - offset) * NS_PER_MS, as: 'RFC 2822' };
}

/**
 * Reads a unix timestamp, an ISO 8601 date (with or without a time or
 * offset) or an RFC 2822 / HTTP date. A date without an offset is a clock
 * time in `zone`. Returns null for empty text and throws for anything else
 * it cannot read.
 */
export function parse(text, zone) {
  const trimmed = text.trim();
  if (!trimmed) return null;
  const result = parseUnix(trimmed) ?? parseIso(trimmed, zone) ?? parseRfc(trimmed);
  if (!result) throw new Error('not a time this tool reads: try a unix timestamp, ISO 8601 or RFC 2822');
  inRange(result.ns);
  return result;
}

const pad = (value, width = 2) => String(value).padStart(width, '0');

/** A decimal number of `unit`s, with trailing zeros of the fraction dropped. */
function decimal(ns, scale) {
  const unit = 10n ** BigInt(scale);
  const whole = floorDiv(ns, unit);
  const rest = mod(ns, unit);
  // Negative times count back from the epoch, so -1.5 s is written as such, not as -2 + 0.5.
  if (ns < 0n && rest) return `-${decimal(-ns, scale)}`;
  return rest ? `${whole}.${String(rest).padStart(scale, '0').replace(/0+$/, '')}` : String(whole);
}

/** ".123" for the sub-second part, or nothing when it is zero. */
function subsecond(ns) {
  const rest = mod(ns, NS_PER_S);
  return rest ? `.${String(rest).padStart(9, '0').replace(/0+$/, '')}` : '';
}

function offsetText(ms, separator = ':') {
  const minutes = Math.round(ms / 60_000);
  const sign = minutes < 0 ? '-' : '+';
  return `${sign}${pad(Math.floor(Math.abs(minutes) / 60))}${separator}${pad(Math.abs(minutes) % 60)}`;
}

/** Day of the year and ISO 8601 week for a calendar date. */
function calendar({ year, month, day }) {
  const date = utc(year, month, day);
  const weekday = new Date(date).getUTCDay();
  const dayOfYear = (date - utc(year, 1, 1)) / DAY_MS + 1;
  // The ISO week belongs to the year of its Thursday.
  const thursday = new Date(date + (3 - ((weekday + 6) % 7)) * DAY_MS);
  const weekYear = thursday.getUTCFullYear();
  const week = Math.floor((thursday.getTime() - utc(weekYear, 1, 1)) / DAY_MS / 7) + 1;
  return { weekday: WEEKDAYS[weekday], dayOfYear, week: `${weekYear}-W${pad(week)}` };
}

const relativeFormat = new Intl.RelativeTimeFormat('en', { numeric: 'always' });
const relativeUnits = [
  ['year', 365.2425 * DAY_MS], ['month', 30.436875 * DAY_MS], ['week', 7 * DAY_MS],
  ['day', DAY_MS], ['hour', 3_600_000], ['minute', 60_000], ['second', 1000],
];

/**
 * "in 3 hours", "5 weeks ago", "now": the largest unit that counts at least
 * two, so 36 days reads as 5 weeks rather than one month.
 */
export function relative(ns, now) {
  const difference = Number(floorDiv(ns, NS_PER_MS)) - now;
  for (const [unit, size] of relativeUnits) {
    const count = Math.trunc(difference / size);
    if (Math.abs(count) >= 2) return relativeFormat.format(count, unit);
  }
  return 'now';
}

/** Every notation this tool writes, for an instant shown on a clock in `zone`. */
export function formats(ns, zone) {
  const ms = Number(floorDiv(ns, NS_PER_MS));
  const second = ms - mod(ms, 1000);
  const u = wall(second, 'UTC');
  const z = wall(second, zone);
  const offset = offsetAt(second, zone);
  const date = ({ year, month, day }) => `${pad(year, 4)}-${pad(month)}-${pad(day)}`;
  const time = ({ hour, minute, second: s }) => `${pad(hour)}:${pad(minute)}:${pad(s)}${subsecond(ns)}`;
  const { weekday, dayOfYear, week } = calendar(z);
  return {
    unix: decimal(ns, 9),
    unixMs: decimal(ns, 6),
    utc: `${date(u)}T${time(u)}Z`,
    zoned: `${date(z)}T${time(z)}${offsetText(offset)}`,
    rfc2822: `${weekday.slice(0, 3)}, ${pad(z.day)} ${MONTHS[z.month - 1]} ${pad(z.year, 4)} ${pad(z.hour)}:${pad(z.minute)}:${pad(z.second)} ${offsetText(offset, '')}`,
    calendar: `${weekday} · day ${dayOfYear} · week ${week}`,
  };
}
