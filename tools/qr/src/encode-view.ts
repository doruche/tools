/** The `encode` half of the page: text in, a QR code out, redrawn as you type. */
import wasmUrl from 'zxing-wasm/writer/zxing_writer.wasm?url';
import type { Level, QrSymbol } from './encode.ts';

const $ = <T extends Element>(selector: string) => document.querySelector<T>(selector)!;
const text = $<HTMLTextAreaElement>('#text');
const eccHint = $<HTMLElement>('#ecc-hint');
const symbolBox = $<HTMLElement>('#symbol');
const image = $<HTMLElement>('#symbol-image');
const info = $<HTMLElement>('#symbol-info');
const status = $<HTMLElement>('#encode-status');
const copyButton = $<HTMLButtonElement>('#copy-png');

// The encoder and its WebAssembly file load the first time the encode view opens.
let encoder: Promise<typeof import('./encode.ts')> | undefined;
function loadEncoder() {
  encoder ??= import('./encode.ts').then(module => {
    module.useWasm({ url: wasmUrl });
    return module;
  });
  return encoder;
}

const recovers: Record<Level, string> = { L: '7%', M: '15%', Q: '25%', H: '30%' };

let current: QrSymbol | undefined;
// Typing quickly starts encodes faster than they finish; only the latest one is shown.
let latest = 0;

const level = () => (document.querySelector<HTMLInputElement>('[name=ecc]:checked')?.value ?? 'M') as Level;

function report(message: string, kind: 'error' | '' = '') {
  status.className = `log ${kind}`.trim();
  status.textContent = message;
}

/** Fits the text box to its content, up to the maximum height the stylesheet allows. */
function fit() {
  text.style.height = 'auto';
  text.style.height = `${text.scrollHeight + text.offsetHeight - text.clientHeight}px`;
}

async function update() {
  fit();
  const value = text.value;
  const chosen = level();
  const mine = ++latest;
  eccHint.textContent = `survives ${recovers[chosen]} damage`;
  if (!value) {
    current = undefined;
    symbolBox.hidden = true;
    report('');
    return;
  }
  try {
    const module = await loadEncoder();
    const symbol = await module.encode(value, chosen);
    if (mine !== latest) return;
    current = symbol;
    image.innerHTML = module.toSvg(symbol);
    const bytes = new TextEncoder().encode(value).length;
    info.textContent = `version ${module.version(symbol)} · ${symbol.size}×${symbol.size} modules · ${bytes} byte${bytes === 1 ? '' : 's'}`;
    symbolBox.hidden = false;
    report('');
  } catch (error) {
    if (mine !== latest) return;
    current = undefined;
    symbolBox.hidden = true;
    report(error instanceof Error ? error.message : String(error), 'error');
  }
}

function save(blob: Blob, name: string) {
  const link = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: name });
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}

/** A PNG about 1000 pixels wide, with whole pixels per module so edges stay sharp. */
async function png(symbol: QrSymbol) {
  const module = await loadEncoder();
  const canvas = document.createElement('canvas');
  module.draw(canvas.getContext('2d')!, symbol, Math.max(4, Math.round(1000 / (symbol.size + module.QUIET_ZONE * 2))));
  return new Promise<Blob>((resolve, reject) => canvas.toBlob(blob => (blob ? resolve(blob) : reject(new Error('could not draw the image'))), 'image/png'));
}

function flash(button: HTMLButtonElement, label: string) {
  const original = button.dataset.label ??= button.textContent ?? '';
  button.textContent = label;
  setTimeout(() => { button.textContent = original; }, 1200);
}

let started = false;
/** Wires up the view the first time it is shown. */
export function showEncoder() {
  text.focus();
  if (started) return;
  started = true;
  text.addEventListener('input', update);
  // A narrower window wraps the text onto more lines.
  addEventListener('resize', fit);
  for (const radio of document.querySelectorAll('[name=ecc]')) radio.addEventListener('change', update);
  $('#save-svg').addEventListener('click', async () => {
    if (current) save(new Blob([(await loadEncoder()).toSvg(current)], { type: 'image/svg+xml' }), 'qr.svg');
  });
  $('#save-png').addEventListener('click', async () => {
    if (current) save(await png(current), 'qr.png');
  });
  copyButton.addEventListener('click', async () => {
    if (!current) return;
    try {
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': png(current) })]);
      flash(copyButton, 'copied');
    } catch {
      flash(copyButton, 'failed');
    }
  });
  update();
}
