import '@doruche-tools/kit/kit.css';
import './style.css';
import { bindCopy } from '@doruche-tools/kit/copy.js';
import { bindDrop } from '@doruche-tools/kit/drop.js';
import { highlight, pretty } from './source.ts';
import { Stage } from './stage.ts';
import { base64Uri, dataUri, drawable, inspect, open, round, type Opened, type Report } from './svg.ts';

const $ = <T extends Element>(selector: string) => document.querySelector<T>(selector)!;
const dropzone = $<HTMLElement>('#dropzone');
const result = $<HTMLElement>('#result');
const fileInfo = $<HTMLElement>('#file-info');
const stageBox = $<HTMLElement>('#stage');
const image = $<HTMLImageElement>('#image');
const zoomLevel = $<HTMLOutputElement>('#zoom-level');
const facts = $<HTMLDListElement>('#facts');
const warnings = $<HTMLUListElement>('#warnings');
const scaleHint = $<HTMLElement>('#scale-hint');
const sourceCount = $<HTMLElement>('#source-count');
const prettyBox = $<HTMLInputElement>('#pretty');
const code = $<HTMLOListElement>('#code');
const status = $<HTMLElement>('#status');

// Canvases larger than this on a side fail in some browsers.
const MAX_CANVAS = 16384;
// The source view stops here; copying still gets every line.
const MAX_LINES = 4000;

if (/Mac|iPhone|iPad/.test(navigator.platform)) {
  for (const key of document.querySelectorAll('.paste-key')) key.textContent = '⌘V';
  for (const key of document.querySelectorAll('.mod-key')) key.textContent = '⌘';
}

type Current = Opened & {
  name: string;
  report: Report;
  /** Object URL of the copy that is drawn on screen and into PNGs. */
  url: string;
};
let current: Current | undefined;
// Opening can overlap when files arrive quickly; only the latest one is shown.
let latest = 0;

const stage = new Stage(stageBox, image);
stage.onChange = (scale, fitted) => {
  zoomLevel.textContent = `${scale < 0.1 ? (scale * 100).toFixed(1) : Math.round(scale * 100)}%`;
  $('#fit').setAttribute('aria-pressed', String(fitted));
};

function report(message: string, kind: 'ok' | 'error' | '' = '') {
  status.className = `log ${kind}`.trim();
  status.textContent = message;
}

const bytes = (size: number) => (size < 1024 ? `${size} B` : size < 1024 * 1024 ? `${(size / 1024).toFixed(1)} KB` : `${(size / 1024 / 1024).toFixed(1)} MB`);
const dimensions = (width: number, height: number) => `${round(width)} × ${round(height)}`;
const element = <K extends keyof HTMLElementTagNameMap>(tag: K, properties: Partial<HTMLElementTagNameMap[K]> = {}) =>
  Object.assign(document.createElement(tag), properties);

async function gunzip(data: Uint8Array<ArrayBuffer>) {
  const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function openFile(file: File) {
  const mine = ++latest;
  if (/^image\//.test(file.type) && file.type !== 'image/svg+xml') {
    fail(`${file.name} is a ${file.type.slice(6).toUpperCase()} image, not SVG`);
    return;
  }
  let data = new Uint8Array(await file.arrayBuffer());
  let kind = 'SVG';
  if (data[0] === 0x1f && data[1] === 0x8b) {
    try {
      data = await gunzip(data);
      kind = 'SVGZ';
    } catch {
      fail(`${file.name} looks compressed but could not be unpacked`);
      return;
    }
  }
  if (mine === latest) await show(file.name, new TextDecoder().decode(data), file.size, kind);
}

function fail(message: string) {
  clear();
  report(message, 'error');
}

async function show(name: string, text: string, size: number, kind: string) {
  const mine = ++latest;
  let opened: Opened;
  try {
    opened = open(text, new DOMParser());
  } catch (error) {
    fail(`${name} is ${error instanceof Error ? error.message : error}`);
    return;
  }
  const svg = inspect(opened);
  const url = URL.createObjectURL(new Blob([drawable(opened.root, svg.size, new XMLSerializer())], { type: 'image/svg+xml' }));
  image.src = url;
  image.alt = name;
  let drawn = true;
  try {
    await image.decode();
  } catch {
    drawn = false;
  }
  if (mine !== latest) {
    URL.revokeObjectURL(url);
    return;
  }
  if (!drawn) {
    URL.revokeObjectURL(url);
    fail(`${name} is valid SVG, but this browser could not draw it`);
    return;
  }
  if (current) URL.revokeObjectURL(current.url);
  current = { ...opened, name, report: svg, url };

  fileInfo.textContent = `${name}: ${kind}, ${dimensions(svg.size.width, svg.size.height)}, ${bytes(size)}`;
  dropzone.hidden = true;
  result.hidden = false;
  report('');
  stage.show(svg.size.width, svg.size.height);
  showFacts(svg);
  updateScale();
  prettyBox.checked = text.split('\n').some(line => line.length > 200);
  showSource();
}

function showFacts(svg: Report) {
  const from = { attributes: 'from width and height', viewBox: 'from the viewBox', default: 'the browser default, with no size given' }[svg.size.from];
  const rows: [string, string | Node[]][] = [
    ['size', `${dimensions(svg.size.width, svg.size.height)} px, ${from}`],
    ['viewBox', svg.viewBox ?? 'none'],
    ['elements', `${svg.elements}: ${svg.tags.slice(0, 6).map(([tag, n]) => `${n} ${tag}`).join(', ')}${svg.tags.length > 6 ? ', …' : ''}`],
  ];
  if (svg.colours.length) {
    const swatches: Node[] = svg.colours.slice(0, 16).map(([colour]) => {
      // An SVG shown as an image has no text colour to inherit, so currentColor draws black, here as anywhere.
      const swatch = element('span', { className: 'swatch' });
      swatch.style.background = colour === 'currentColor' ? '#000' : colour;
      const item = element('span', { className: 'colour' });
      if (colour === 'currentColor') item.title = 'black in an <img> or CSS background; the text colour when the SVG is placed inline in HTML';
      item.append(swatch, colour);
      return item;
    });
    if (svg.colours.length > 16) swatches.push(document.createTextNode('…'));
    rows.push(['colours', swatches]);
  }
  facts.replaceChildren(...rows.flatMap(([term, value]) => {
    const dd = element('dd');
    if (typeof value === 'string') dd.textContent = value;
    else dd.append(...value);
    return [element('dt', { textContent: term }), dd];
  }));
  warnings.replaceChildren(...svg.warnings.map(text => element('li', { className: 'log warning', textContent: text })));
}

const scale = () => Number(document.querySelector<HTMLInputElement>('[name=scale]:checked')?.value ?? 1);
const pngSize = (factor: number) => current
  ? { width: Math.max(1, Math.round(current.report.size.width * factor)), height: Math.max(1, Math.round(current.report.size.height * factor)) }
  : { width: 0, height: 0 };

function updateScale() {
  for (const radio of document.querySelectorAll<HTMLInputElement>('[name=scale]')) {
    const { width, height } = pngSize(Number(radio.value));
    radio.disabled = Math.max(width, height) > MAX_CANVAS;
  }
  // Fall back to the largest scale that fits when the chosen one is too big.
  if (document.querySelector<HTMLInputElement>('[name=scale]:checked')?.disabled) {
    const usable = [...document.querySelectorAll<HTMLInputElement>('[name=scale]:not(:disabled)')];
    if (usable.length) usable.at(-1)!.checked = true;
  }
  const { width, height } = pngSize(scale());
  scaleHint.textContent = `→ ${width} × ${height} px`;
}

function sourceText() {
  if (!current) return '';
  return prettyBox.checked ? pretty(current.doc) : current.source;
}

function showSource() {
  const text = sourceText();
  const lines = highlight(text);
  sourceCount.textContent = `· ${lines.length} line${lines.length === 1 ? '' : 's'}`;
  const items = lines.slice(0, MAX_LINES).map(tokens => {
    const item = element('li');
    for (const { kind, text: part } of tokens) item.append(kind === 'text' ? part : element('span', { className: kind, textContent: part }));
    return item;
  });
  if (lines.length > MAX_LINES) items.push(element('li', { className: 'more', textContent: `… ${lines.length - MAX_LINES} more lines; copy gets them all` }));
  code.replaceChildren(...items);
}

function clear() {
  if (current) URL.revokeObjectURL(current.url);
  current = undefined;
  image.removeAttribute('src');
  result.hidden = true;
  dropzone.hidden = false;
  report('');
}

const baseName = () => (current?.name === 'pasted source' ? 'image' : current?.name.replace(/\.svgz?$/i, '') ?? 'image');

function save(blob: Blob, name: string) {
  const link = element('a', { href: URL.createObjectURL(blob), download: name });
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}

/** Draws the image into a PNG at the chosen scale, with a transparent background. */
function png() {
  const { width, height } = pngSize(scale());
  const canvas = element('canvas', { width, height });
  canvas.getContext('2d')!.drawImage(image, 0, 0, width, height);
  return new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(blob => (blob ? resolve(blob) : reject(new Error('the image is too large for this browser to draw'))), 'image/png'));
}

function flash(button: HTMLButtonElement, label: string) {
  const original = button.dataset.label ??= button.textContent ?? '';
  button.textContent = label;
  setTimeout(() => { button.textContent = original; }, 1200);
}

// Opening: choose, drop, or paste either a file or the source text.
bindDrop({ zone: dropzone, input: $<HTMLInputElement>('#file'), onFile: openFile });
document.addEventListener('paste', event => {
  const file = [...(event.clipboardData?.files ?? [])][0];
  if (file) {
    event.preventDefault();
    openFile(file);
    return;
  }
  const text = event.clipboardData?.getData('text/plain') ?? '';
  if (!text.trim()) return;
  event.preventDefault();
  if (/<svg[\s>/]/.test(text)) show('pasted source', text, new TextEncoder().encode(text).length, 'SVG');
  else report('the clipboard holds text, but no <svg> element', 'error');
});
$('#clear').addEventListener('click', clear);

// Viewing.
for (const radio of document.querySelectorAll<HTMLInputElement>('[name=bg]')) {
  radio.addEventListener('change', () => { stageBox.dataset.bg = radio.value; });
}
$('#fit').addEventListener('click', () => stage.fit());
$('#actual').addEventListener('click', () => stage.actual());
$('#zoom-in').addEventListener('click', () => stage.zoom(Math.SQRT2));
$('#zoom-out').addEventListener('click', () => stage.zoom(Math.SQRT1_2));

// Exporting.
for (const radio of document.querySelectorAll('[name=scale]')) radio.addEventListener('change', updateScale);
$('#save-png').addEventListener('click', async () => {
  if (!current) return;
  try {
    save(await png(), `${baseName()}${scale() === 1 ? '' : `@${scale()}x`}.png`);
  } catch (error) {
    report(error instanceof Error ? error.message : String(error), 'error');
  }
});
const copyPng = $<HTMLButtonElement>('#copy-png');
copyPng.addEventListener('click', async () => {
  if (!current) return;
  try {
    // Safari wants the clipboard item while the click is still being handled, so pass the promise.
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': png() })]);
    flash(copyPng, 'copied');
  } catch {
    flash(copyPng, 'failed');
  }
});
$('#save-svg').addEventListener('click', () => {
  if (current) save(new Blob([current.source], { type: 'image/svg+xml' }), `${baseName()}.svg`);
});
bindCopy($('#copy-uri'), () => (current ? dataUri(current.source) : ''));
bindCopy($('#copy-base64'), () => (current ? base64Uri(current.source) : ''));

// Source.
prettyBox.addEventListener('change', showSource);
bindCopy($('#copy-source'), sourceText);
