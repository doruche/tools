const DIGITS = '0123456789abcdefghijklmnopqrstuvwxyz';
const PREFIXES = { 2: /^0b/i, 8: /^0o/i, 16: /^0x/i };

/**
 * Parses an integer written in `base` (2–36). Spaces and underscores are
 * ignored, and 0b/0o/0x prefixes are accepted for their own bases.
 * Returns null for empty input and throws a RangeError for invalid input.
 * @param {string} text
 * @param {number} base
 * @returns {bigint | null}
 */
export function parse(text, base) {
  let digits = text.replace(/[\s_]/g, '');
  if (!digits) return null;
  const negative = digits[0] === '-';
  if (negative || digits[0] === '+') digits = digits.slice(1);
  digits = digits.replace(PREFIXES[base] ?? /^$/, '');
  if (!digits) throw new RangeError('Enter at least one digit');

  const radix = BigInt(base);
  let value = 0n;
  for (const char of digits.toLowerCase()) {
    const digit = DIGITS.indexOf(char);
    if (digit < 0 || digit >= base) throw new RangeError(`“${char}” is not a base-${base} digit`);
    value = value * radix + BigInt(digit);
  }
  return negative ? -value : value;
}

/**
 * @param {bigint} value
 * @param {number} base
 * @param {{ uppercase?: boolean }} [options]
 */
export function format(value, base, { uppercase = false } = {}) {
  const text = value.toString(base);
  return uppercase ? text.toUpperCase() : text;
}
