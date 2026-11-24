import { prepareZXingModule, writeBarcode } from 'zxing-wasm/writer';

/** Error correction level: how much of the symbol can be damaged and still read. */
export type Level = 'L' | 'M' | 'Q' | 'H';

/** A QR symbol without its quiet zone: `size` × `size` modules, row by row, 1 for dark. */
export type QrSymbol = { size: number; modules: Uint8Array };

/** Modules of light border around the symbol, as the standard asks. */
export const QUIET_ZONE = 4;

/**
 * Tells the encoder where its WebAssembly file is. By default zxing-wasm
 * fetches it from a public CDN; the site serves its own copy instead.
 */
export function useWasm(source: { url: string } | { binary: ArrayBuffer }) {
  prepareZXingModule({
    overrides: 'url' in source
      ? { locateFile: (path: string, prefix: string) => (path.endsWith('.wasm') ? source.url : prefix + path) }
      : { wasmBinary: source.binary },
  });
}

/** Encodes text as the smallest QR symbol that holds it at the given level. */
export async function encode(text: string, level: Level): Promise<QrSymbol> {
  const { symbol, error } = await writeBarcode(text, { format: 'QRCode', options: `ecLevel=${level}`, addQuietZones: false });
  if (/too long/i.test(error)) {
    const bytes = new TextEncoder().encode(text).length;
    throw new Error(`${bytes} bytes is too long for a QR code at --ecc ${level}`);
  }
  if (error || !symbol) throw new Error(error || 'could not encode this text');
  // zxing marks dark modules with 0.
  return { size: symbol.width, modules: Uint8Array.from(symbol.data, value => (value === 0 ? 1 : 0)) };
}

/** QR versions run from 1 (21 × 21) to 40 (177 × 177), four modules apart. */
export const version = (symbol: QrSymbol) => (symbol.size - 17) / 4;

const dark = (symbol: QrSymbol, x: number, y: number) => symbol.modules[y * symbol.size + x] === 1;

/** Black on white SVG, one path drawing each run of dark modules in a row. */
export function toSvg(symbol: QrSymbol) {
  const side = symbol.size + QUIET_ZONE * 2;
  let path = '';
  for (let y = 0; y < symbol.size; y++) {
    for (let x = 0; x < symbol.size; x++) {
      if (!dark(symbol, x, y)) continue;
      let run = 1;
      while (x + run < symbol.size && dark(symbol, x + run, y)) run++;
      path += `M${x + QUIET_ZONE} ${y + QUIET_ZONE}h${run}v1h-${run}z`;
      x += run;
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${side} ${side}" shape-rendering="crispEdges">`
    + `<rect width="${side}" height="${side}" fill="#fff"/><path d="${path}" fill="#000"/></svg>`;
}

/** Draws the symbol with its quiet zone, `scale` pixels per module. */
export function draw(context: CanvasRenderingContext2D, symbol: QrSymbol, scale: number) {
  const side = (symbol.size + QUIET_ZONE * 2) * scale;
  context.canvas.width = side;
  context.canvas.height = side;
  context.fillStyle = '#fff';
  context.fillRect(0, 0, side, side);
  context.fillStyle = '#000';
  for (let y = 0; y < symbol.size; y++) {
    for (let x = 0; x < symbol.size; x++) {
      if (dark(symbol, x, y)) context.fillRect((x + QUIET_ZONE) * scale, (y + QUIET_ZONE) * scale, scale, scale);
    }
  }
}
