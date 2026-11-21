import '@doruche-tools/kit/kit.css';
import './style.css';
import { bindCopy } from '@doruche-tools/kit/copy.js';
import wasmUrl from 'zxing-wasm/reader/zxing_reader.wasm?url';
import type { Code } from './decode.ts';

const $ = <T extends Element>(selector: string) => document.querySelector<T>(selector)!;
const fileInput = $<HTMLInputElement>('#file');
const dropzone = $<HTMLElement>('#dropzone');
const result = $<HTMLElement>('#result');
const fileInfo = $<HTMLElement>('#file-info');
const canvas = $<HTMLCanvasElement>('#canvas');
const boxes = $<SVGSVGElement>('#boxes');
const labels = $<HTMLElement>('#labels');
const list = $<HTMLOListElement>('#codes');
const status = $<HTMLElement>('#status');

// Largest image side decoded; bigger images are scaled down to keep memory in check.
const MAX_SIDE = 4096;
const SVG = 'http://www.w3.org/2000/svg';

// The decoder and its 1 MB WebAssembly file load on first use only.
let decoder: Promise<typeof import('./decode.ts')> | undefined;
function loadDecoder() {
  decoder ??= import('./decode.ts').then(module => {
    module.useWasm({ url: wasmUrl });
    return module;
  });
  return decoder;
}

if (/Mac|iPhone|iPad/.test(navigator.platform)) $('#paste-key').textContent = '⌘V';

function report(message: string, kind: 'ok' | 'error' | '' = '') {
  status.className = `log ${kind}`.trim();
  status.textContent = message;
}

function describe(file: File, width: number, height: number) {
  const type = (file.type.split('/')[1] ?? 'image').replace('+xml', '').toUpperCase();
  const size = file.size < 1024 * 1024 ? `${Math.max(1, Math.round(file.size / 1024))} KB` : `${(file.size / 1024 / 1024).toFixed(1)} MB`;
  return `${file.name || 'pasted image'}: ${type}, ${width} × ${height}, ${size}`;
}

function showCodes(codes: Code[], isLink: (text: string) => boolean = () => false) {
  boxes.replaceChildren();
  labels.replaceChildren();
  list.replaceChildren();
  codes.forEach((code, index) => {
    const number = String(index + 1);
    const box = document.createElementNS(SVG, 'polygon');
    box.setAttribute('points', code.corners.map(({ x, y }) => `${x},${y}`).join(' '));
    boxes.append(box);

    const label = Object.assign(document.createElement('span'), { textContent: number });
    const corner = code.corners[0];
    label.style.left = `${(corner.x / canvas.width) * 100}%`;
    label.style.top = `${(corner.y / canvas.height) * 100}%`;
    labels.append(label);

    const item = document.createElement('li');
    const text = Object.assign(document.createElement('span'), { className: 'text', textContent: code.text });
    const copy = Object.assign(document.createElement('button'), { type: 'button', className: 'cmd', textContent: 'copy' });
    copy.setAttribute('aria-label', `Copy code ${number}`);
    bindCopy(copy, () => code.text);
    const actions = Object.assign(document.createElement('span'), { className: 'actions' });
    actions.append(copy);
    item.append(text, actions);
    if (isLink(code.text)) {
      const open = Object.assign(document.createElement('a'), {
        className: 'cmd', textContent: 'open', href: code.text.trim(), target: '_blank', rel: 'noopener noreferrer',
      });
      open.setAttribute('aria-label', `Open code ${number} in a new tab`);
      actions.append(open);
    }
    // Pointing at a result highlights its box on the image.
    const highlight = (on: boolean) => { box.classList.toggle('active', on); label.classList.toggle('active', on); };
    item.addEventListener('pointerenter', () => highlight(true));
    item.addEventListener('pointerleave', () => highlight(false));
    item.addEventListener('focusin', () => highlight(true));
    item.addEventListener('focusout', () => highlight(false));
    list.append(item);
  });
}

async function open(file: File) {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    report(`${file.name || 'this file'} is not an image this browser can open`, 'error');
    return;
  }
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const context = canvas.getContext('2d', { willReadFrequently: true })!;
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  boxes.setAttribute('viewBox', `0 0 ${canvas.width} ${canvas.height}`);

  fileInfo.textContent = describe(file, canvas.width, canvas.height);
  showCodes([]);
  dropzone.hidden = true;
  result.hidden = false;

  report(decoder ? 'decoding…' : 'loading decoder…');
  const started = performance.now();
  try {
    const module = await loadDecoder();
    const codes = await module.decode(context.getImageData(0, 0, canvas.width, canvas.height));
    const elapsed = Math.round(performance.now() - started);
    showCodes(codes, module.isLink);
    if (codes.length) report(`found ${codes.length} code${codes.length === 1 ? '' : 's'} in ${elapsed} ms`, 'ok');
    else report('no QR code found in this image', 'error');
  } catch (error) {
    report(`could not decode: ${error instanceof Error ? error.message : error}`, 'error');
  }
}

function clear() {
  result.hidden = true;
  dropzone.hidden = false;
  showCodes([]);
  report('');
  fileInput.value = '';
}

// Choosing, dropping and pasting all lead to open().
for (const button of document.querySelectorAll('[data-choose]')) button.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', () => { if (fileInput.files?.[0]) open(fileInput.files[0]); });
$('#clear').addEventListener('click', clear);

let depth = 0;
document.addEventListener('dragenter', event => {
  if (!event.dataTransfer?.types.includes('Files')) return;
  depth++;
  dropzone.classList.add('dragging');
  document.body.classList.add('dragging');
});
document.addEventListener('dragleave', () => {
  if (--depth > 0) return;
  dropzone.classList.remove('dragging');
  document.body.classList.remove('dragging');
});
document.addEventListener('dragover', event => event.preventDefault());
document.addEventListener('drop', event => {
  event.preventDefault();
  depth = 0;
  dropzone.classList.remove('dragging');
  document.body.classList.remove('dragging');
  const file = event.dataTransfer?.files[0];
  if (file) open(file);
});
document.addEventListener('paste', event => {
  const item = [...(event.clipboardData?.items ?? [])].find(entry => entry.type.startsWith('image/'));
  const file = item?.getAsFile();
  if (!file) return;
  event.preventDefault();
  open(file);
});
