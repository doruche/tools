import { prepareZXingModule, readBarcodes, type ReaderOptions } from 'zxing-wasm/reader';

/** Raw RGBA pixels, such as a canvas ImageData. */
export type Pixels = { data: Uint8ClampedArray; width: number; height: number };
export type Point = { x: number; y: number };
export type Code = { text: string; format: string; corners: Point[] };

const options: ReaderOptions = {
  formats: ['QRCode', 'MicroQRCode', 'RMQRCode'],
  tryHarder: true,
  maxNumberOfSymbols: 32,
};

/**
 * Tells the decoder where its WebAssembly file is. By default zxing-wasm
 * fetches it from a public CDN; the site serves its own copy instead.
 */
export function useWasm(source: { url: string } | { binary: ArrayBuffer }) {
  prepareZXingModule({
    overrides: 'url' in source
      ? { locateFile: (path: string, prefix: string) => (path.endsWith('.wasm') ? source.url : prefix + path) }
      : { wasmBinary: source.binary },
  });
}

/** Finds every QR code in the image, in reading order: top to bottom, then left to right. */
export async function decode(pixels: Pixels): Promise<Code[]> {
  const results = await readBarcodes(pixels as ImageData, options);
  const codes = results
    .filter(result => result.isValid)
    .map(({ text, format, position: p }) => ({
      text,
      format,
      corners: [p.topLeft, p.topRight, p.bottomRight, p.bottomLeft].map(({ x, y }) => ({ x, y })),
    }));
  const top = (code: Code) => Math.min(...code.corners.map(point => point.y));
  const left = (code: Code) => Math.min(...code.corners.map(point => point.x));
  const rowHeight = (code: Code) => Math.max(...code.corners.map(point => point.y)) - top(code);
  // Codes whose tops are within half a code's height count as one row.
  return codes.sort((a, b) => (Math.abs(top(a) - top(b)) < rowHeight(a) / 2 ? left(a) - left(b) : top(a) - top(b)));
}

/** Whether decoded text is a web address that can be offered as a link. */
export function isLink(text: string) {
  return /^https?:\/\/[^\s]+$/i.test(text.trim());
}
