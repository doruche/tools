import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { before, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { readBarcodes } from 'zxing-wasm/reader';
import { decode, useWasm as useReaderWasm, type Pixels } from '../src/decode.ts';
import { encode, QUIET_ZONE, toSvg, useWasm, version, type Level, type QrSymbol } from '../src/encode.ts';

const wasm = (name: string) => readFileSync(fileURLToPath(import.meta.resolve(`zxing-wasm/${name}/zxing_${name}.wasm`))).buffer;

before(() => {
  useReaderWasm({ binary: wasm('reader') });
  useWasm({ binary: wasm('writer') });
});

/** Renders a symbol with its quiet zone, 4 pixels per module. */
function render(symbol: QrSymbol): Pixels {
  const scale = 4;
  const side = (symbol.size + QUIET_ZONE * 2) * scale;
  const data = new Uint8ClampedArray(side * side * 4).fill(255);
  for (let y = 0; y < side; y++) {
    for (let x = 0; x < side; x++) {
      const mx = Math.floor(x / scale) - QUIET_ZONE;
      const my = Math.floor(y / scale) - QUIET_ZONE;
      const inside = mx >= 0 && my >= 0 && mx < symbol.size && my < symbol.size;
      if (inside && symbol.modules[my * symbol.size + mx]) data.fill(0, (y * side + x) * 4, (y * side + x) * 4 + 3);
    }
  }
  return { data, width: side, height: side };
}

test('encodes text that the decoder reads back, at every level', async () => {
  for (const level of ['L', 'M', 'Q', 'H'] as Level[]) {
    const text = `你好，世界 · hello · ${level}`;
    const pixels = render(await encode(text, level));
    assert.equal((await decode(pixels))[0]?.text, text);
    const [read] = await readBarcodes(pixels as ImageData, { formats: ['QRCode'] });
    assert.equal(read.ecLevel, level);
  }
});

test('picks a larger version for more text or more correction', async () => {
  assert.equal(version(await encode('hi', 'L')), 1);
  assert.ok(version(await encode('hi'.repeat(40), 'L')) > 1);
  assert.ok(version(await encode('hi'.repeat(40), 'H')) > version(await encode('hi'.repeat(40), 'L')));
});

test('says when the text does not fit', async () => {
  await assert.rejects(encode('x'.repeat(3000), 'M'), /^Error: 3000 bytes is too long for a QR code at --ecc M$/);
});

test('draws an SVG with the quiet zone around the symbol', async () => {
  const svg = toSvg(await encode('hi', 'M'));
  assert.match(svg, /viewBox="0 0 29 29"/);
  assert.match(svg, /<path d="M4 4h7v1h-7z/);
});
