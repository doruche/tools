import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { before, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { prepareZXingModule, writeBarcode } from 'zxing-wasm/writer';
import { decode, isLink, useWasm, type Pixels } from '../src/decode.ts';

const wasm = (name: string) => readFileSync(fileURLToPath(import.meta.resolve(`zxing-wasm/${name}/zxing_${name}.wasm`))).buffer;

before(() => {
  useWasm({ binary: wasm('reader') });
  prepareZXingModule({ overrides: { wasmBinary: wasm('writer') } });
});

/** Draws QR codes for each text on a white image, `scale` pixels per module. */
async function image(width: number, height: number, codes: { text: string; x: number; y: number; scale?: number }[]) {
  const pixels: Pixels = { data: new Uint8ClampedArray(width * height * 4).fill(255), width, height };
  for (const { text, x, y, scale = 4 } of codes) {
    const { symbol, error } = await writeBarcode(text, { format: 'QRCode' });
    assert.equal(error, '');
    for (let row = 0; row < symbol!.height * scale; row++) {
      for (let column = 0; column < symbol!.width * scale; column++) {
        const dark = symbol!.data[Math.floor(row / scale) * symbol!.width + Math.floor(column / scale)] === 0;
        const index = ((y + row) * width + x + column) * 4;
        if (dark) pixels.data.fill(0, index, index + 3);
      }
    }
  }
  return pixels;
}

test('reads text, including non-Latin text, with its corners', async () => {
  const [code, ...rest] = await decode(await image(200, 200, [{ text: '你好，世界 · hello', x: 40, y: 40 }]));
  assert.equal(rest.length, 0);
  assert.equal(code.text, '你好，世界 · hello');
  assert.equal(code.format, 'QRCode');
  assert.deepEqual(code.corners[0], { x: 40, y: 40 });
});

test('reads several codes in reading order', async () => {
  const codes = await decode(await image(520, 420, [
    { text: 'bottom', x: 40, y: 260 },
    { text: 'top right', x: 300, y: 50 },
    { text: 'top left', x: 40, y: 40 },
  ]));
  assert.deepEqual(codes.map(code => code.text), ['top left', 'top right', 'bottom']);
});

test('finds nothing in an image without codes', async () => {
  assert.deepEqual(await decode(await image(120, 80, [])), []);
});

test('recognises web addresses only', () => {
  assert.ok(isLink('https://example.com/a?b=c'));
  assert.ok(isLink(' HTTP://example.com '));
  assert.ok(!isLink('javascript:alert(1)'));
  assert.ok(!isLink('WIFI:S:home;T:WPA;P:secret;;'));
  assert.ok(!isLink('https://example.com and more'));
});
