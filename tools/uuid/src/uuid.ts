export type Random = (bytes: Uint8Array<ArrayBuffer>) => Uint8Array<ArrayBuffer>;

const secureRandom: Random = bytes => crypto.getRandomValues(bytes);

function layout(bytes: Uint8Array) {
  const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** A random (version 4) UUID, as in RFC 9562 §5.4. */
export function uuidV4(random: Random = secureRandom) {
  const bytes = random(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  return layout(bytes);
}

/**
 * Returns a version 7 UUID generator (RFC 9562 §5.7). The 12 bits after the
 * timestamp act as a counter, so UUIDs from one generator sort in creation
 * order even when many are made within the same millisecond.
 */
export function createUuidV7(now: () => number = Date.now, random: Random = secureRandom) {
  let lastTime = -1;
  let counter = 0;
  // Start each millisecond in the lower half so the counter has room to grow.
  const freshCounter = () => {
    const [high, low] = random(new Uint8Array(2));
    return ((high << 8) | low) & 0x7ff;
  };

  return () => {
    let time = now();
    if (time > lastTime) {
      counter = freshCounter();
    } else {
      time = lastTime;
      if (++counter > 0xfff) {
        time++;
        counter = freshCounter();
      }
    }
    lastTime = time;

    const bytes = random(new Uint8Array(16));
    for (let index = 5, rest = time; index >= 0; index--, rest = Math.floor(rest / 256)) bytes[index] = rest % 256;
    bytes[6] = 0x70 | (counter >> 8);
    bytes[7] = counter & 0xff;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    return layout(bytes);
  };
}

export function formatUuid(uuid: string, { uppercase = false, hyphens = true } = {}) {
  const text = hyphens ? uuid : uuid.replaceAll('-', '');
  return uppercase ? text.toUpperCase() : text;
}
