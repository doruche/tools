/**
 * Reading an SVG file: parsing, measuring and listing what is inside.
 * Only core DOM methods are used, so tests can run it on xmldom.
 */

export const SVG_NS = 'http://www.w3.org/2000/svg';

export type Parser = { parseFromString(source: string, type: 'image/svg+xml'): Document };
export type Serializer = { serializeToString(node: Node): string };

export type Opened = {
  /** The source as given, with any namespaces it was missing added. */
  source: string;
  doc: Document;
  root: Element;
  /** Namespace declarations that had to be added, such as `xmlns`. */
  added: string[];
};

/**
 * SVG copied out of an HTML page often lacks `xmlns`, and sometimes `xmlns:xlink`.
 * HTML forgives that but an SVG file does not, so add them to the root tag.
 */
export function addNamespaces(source: string): { source: string; added: string[] } {
  const tag = /<svg(?=[\s/>])([^>]*)>/.exec(source);
  if (!tag) return { source, added: [] };
  const attributes = tag[1];
  const added: string[] = [];
  if (!/\sxmlns\s*=/.test(attributes)) added.push(`xmlns="${SVG_NS}"`);
  if (/\bxlink:/.test(source) && !/\sxmlns:xlink\s*=/.test(attributes)) added.push('xmlns:xlink="http://www.w3.org/1999/xlink"');
  if (!added.length) return { source, added };
  const at = tag.index + 4;
  return { source: `${source.slice(0, at)} ${added.join(' ')}${source.slice(at)}`, added: added.map(text => text.split('=')[0]) };
}

/** Turns the parser's report into one line, such as `line 3, column 5: …`. */
function describeParseError(text: string) {
  const trimmed = text
    .replace(/^This page contains the following errors:/, '')
    .replace(/Below is a rendering of the page up to the first error\.?\s*$/, '')
    .trim();
  const firefox = /^XML Parsing Error:\s*(.*)$/m.exec(trimmed);
  if (firefox) {
    const where = /Line Number (\d+), Column (\d+)/.exec(trimmed);
    return `${where ? `line ${where[1]}, column ${where[2]}: ` : ''}${firefox[1]}`;
  }
  return trimmed.split('\n')[0]
    .replace(/^error on line (\d+) at column (\d+):\s*/, 'line $1, column $2: ')
    // Chromium names elements as {namespace}name.
    .replace(/\{[^}]*\}/g, '');
}

/** Parses `source` as SVG, or throws an Error saying why it is not. */
export function open(text: string, parser: Parser): Opened {
  const { source, added } = addNamespaces(text);
  let doc: Document;
  try {
    doc = parser.parseFromString(source, 'image/svg+xml');
  } catch (error) {
    throw new Error(`not valid XML: ${error instanceof Error ? error.message.split('\n')[0] : error}`);
  }
  const failure = doc.getElementsByTagName('parsererror')[0];
  if (failure) throw new Error(`not valid XML: ${describeParseError(failure.textContent ?? '')}`);
  const root = doc.documentElement;
  if (!root) throw new Error('empty document');
  if (root.localName !== 'svg' || root.namespaceURI !== SVG_NS) throw new Error(`XML with a <${root.nodeName}> root, not SVG`);
  return { source, doc, root, added };
}

// Absolute CSS units in pixels; em and ex assume the usual 16px font.
const units: Record<string, number> = { '': 1, px: 1, pt: 4 / 3, pc: 16, in: 96, cm: 96 / 2.54, mm: 96 / 25.4, q: 96 / 101.6, em: 16, rem: 16, ex: 8 };

/** A length attribute in pixels, or undefined for percentages, `auto` and anything unusable. */
export function length(value: string | null): number | undefined {
  const match = /^\s*([+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?)\s*([a-z]*)\s*$/i.exec(value ?? '');
  if (!match) return undefined;
  const scale = units[match[2].toLowerCase()];
  const pixels = Number(match[1]) * (scale ?? NaN);
  return pixels > 0 && Number.isFinite(pixels) ? pixels : undefined;
}

export type ViewBox = { x: number; y: number; width: number; height: number };

/** The root's viewBox; null when it is missing, undefined when it is present but unusable. */
export function viewBox(root: Element): ViewBox | null | undefined {
  if (!root.hasAttribute('viewBox')) return null;
  const numbers = (root.getAttribute('viewBox') ?? '').trim().split(/[\s,]+/).map(Number);
  if (numbers.length !== 4 || numbers.some(n => !Number.isFinite(n))) return undefined;
  const [x, y, width, height] = numbers;
  return width > 0 && height > 0 ? { x, y, width, height } : undefined;
}

export type Size = {
  width: number;
  height: number;
  /** Where the size came from: the width and height attributes, the viewBox, or the browser default. */
  from: 'attributes' | 'viewBox' | 'default';
};

/** The size the image shows at by default, in CSS pixels, worked out the way browsers do. */
export function measure(root: Element): Size {
  const width = length(root.getAttribute('width'));
  const height = length(root.getAttribute('height'));
  if (width && height) return { width, height, from: 'attributes' };
  const box = viewBox(root);
  if (box) {
    const ratio = box.height / box.width;
    if (width) return { width, height: width * ratio, from: 'attributes' };
    if (height) return { width: height / ratio, height, from: 'attributes' };
    return { width: box.width, height: box.height, from: 'viewBox' };
  }
  return { width: width ?? 300, height: height ?? 150, from: width || height ? 'attributes' : 'default' };
}

/**
 * The SVG to draw: the root gets a pixel width and height so every browser
 * knows its size, and a viewBox if it has none so that it scales when zoomed.
 */
export function drawable(root: Element, size: Size, serializer: Serializer) {
  const copy = root.cloneNode(true) as Element;
  const width = String(round(size.width));
  const height = String(round(size.height));
  // Without a viewBox, user units are pixels, so the box matches the size exactly.
  if (viewBox(root) === null) copy.setAttribute('viewBox', `0 0 ${width} ${height}`);
  copy.setAttribute('width', width);
  copy.setAttribute('height', height);
  return serializer.serializeToString(copy);
}

/** Up to three decimals, without trailing zeros. */
export const round = (value: number) => Math.round(value * 1000) / 1000;

const colourProperties = new Set(['fill', 'stroke', 'stop-color', 'flood-color', 'lighting-color', 'color']);
const notColours = new Set(['none', 'transparent', 'inherit', 'initial', 'unset', 'revert', 'context-fill', 'context-stroke']);
const urlPattern = /url\(\s*(["']?)(.*?)\1\s*\)/gi;
const genericFonts = new Set(['serif', 'sans-serif', 'monospace', 'cursive', 'fantasy', 'system-ui', 'ui-serif', 'ui-sans-serif', 'ui-monospace', 'math', 'emoji', 'inherit']);

export type Report = {
  size: Size;
  /** The viewBox attribute as written, or null when there is none. */
  viewBox: string | null;
  elements: number;
  /** Element names with how often each appears, most frequent first. */
  tags: [string, number][];
  /** Colours used, most frequent first. */
  colours: [string, number][];
  warnings: string[];
};

function count<T>(map: Map<T, number>, key: T) {
  map.set(key, (map.get(key) ?? 0) + 1);
}
const byCount = <T>(map: Map<T, number>) => [...map].sort((a, b) => b[1] - a[1]);
const plural = (n: number, word: string, many = `${word}s`) => `${n} ${n === 1 ? word : many}`;
function listed(values: Iterable<string>, limit = 3) {
  const all = [...values];
  return all.length > limit ? `${all.slice(0, limit).join(', ')}, …` : all.join(', ');
}
function bytes(size: number) {
  return size < 1024 * 1024 ? `${Math.max(1, Math.round(size / 1024))} KB` : `${(size / 1024 / 1024).toFixed(1)} MB`;
}

/** Lists what is inside the document and anything that may make it look or behave differently elsewhere. */
export function inspect({ root, added }: Pick<Opened, 'root' | 'added'>): Report {
  const tags = new Map<string, number>();
  const colours = new Map<string, number>();
  const fonts = new Set<string>();
  const events = new Set<string>();
  const outside = new Set<string>();
  const bitmaps = new Map<string, number>();
  let bitmapBytes = 0;
  let scripts = 0;
  let scriptLinks = 0;
  let texts = 0;
  let foreign = 0;
  let embeddedFonts = false;

  const colour = (value: string) => {
    const trimmed = value.replace(/\s*!important\s*$/i, '').trim();
    const lower = trimmed.toLowerCase();
    if (!trimmed || notColours.has(lower) || lower.startsWith('url(') || lower.startsWith('var(')) return;
    count(colours, lower === 'currentcolor' ? 'currentColor' : lower);
  };
  const font = (value: string) => {
    for (const family of value.split(',')) {
      const name = family.trim().replace(/^(["'])(.*)\1$/, '$2');
      if (name && !genericFonts.has(name.toLowerCase())) fonts.add(name);
    }
  };
  const reference = (value: string, element?: string) => {
    const target = value.trim();
    if (!target || target.startsWith('#')) return;
    if (/^javascript:/i.test(target)) scriptLinks++;
    else if (/^data:/i.test(target)) {
      const type = /^data:image\/([\w.+-]+)/i.exec(target)?.[1].toLowerCase();
      if (element === 'image' && type && !type.startsWith('svg')) {
        count(bitmaps, type === 'jpg' ? 'JPEG' : type.toUpperCase());
        // Base64 stores 3 bytes in every 4 characters.
        bitmapBytes += /;base64,/i.test(target) ? (target.length - target.indexOf(',') - 1) * 3 / 4 : target.length;
      }
    } else outside.add(target.length > 60 ? `${target.slice(0, 57)}…` : target);
  };
  // Declarations in style attributes and <style> sheets.
  const css = (text: string) => {
    for (const [, property, value] of text.matchAll(/(?:^|[;{\s])([a-z-]+)\s*:\s*([^;{}]+)/gi)) {
      const name = property.toLowerCase();
      if (colourProperties.has(name)) colour(value);
      else if (name === 'font-family') font(value);
    }
    for (const [, , target] of text.matchAll(urlPattern)) reference(target);
    for (const [, , target] of text.matchAll(/@import\s+(["'])(.*?)\1/gi)) reference(target);
    if (/@font-face/i.test(text)) embeddedFonts = true;
  };

  const visit = (element: Element) => {
    const name = element.namespaceURI === SVG_NS ? element.localName : element.nodeName;
    count(tags, name);
    if (element.namespaceURI === SVG_NS) {
      if (name === 'script') scripts++;
      else if (name === 'text') texts++;
      else if (name === 'foreignObject') foreign++;
      else if (name === 'style') css(element.textContent ?? '');
    }
    for (let i = 0; i < element.attributes.length; i++) {
      const { name: attribute, localName, value } = element.attributes[i];
      const lower = attribute.toLowerCase();
      if (/^on/.test(lower)) events.add(lower);
      else if (localName === 'href') reference(value, name);
      else if (lower === 'style') css(value);
      else {
        if (colourProperties.has(lower)) colour(value);
        else if (lower === 'font-family') font(value);
        // fill="url(other.svg#paint)" and the like.
        for (const [, , target] of value.matchAll(urlPattern)) reference(target);
      }
    }
    for (let i = 0; i < element.childNodes.length; i++) {
      const child = element.childNodes[i];
      if (child.nodeType === 1) visit(child as Element);
    }
  };
  visit(root);

  const warnings: string[] = [];
  const box = viewBox(root);
  if (added.length) warnings.push(`has no ${added.join(' or ')}, so it only works inside an HTML page; the preview and exports add it`);
  if (scripts || events.size || scriptLinks) {
    const parts = [
      scripts ? plural(scripts, '<script> element') : '',
      events.size ? listed(events) : '',
      scriptLinks ? plural(scriptLinks, 'javascript: link') : '',
    ].filter(Boolean);
    warnings.push(`has scripts (${parts.join(', ')}); they do not run here, but would if the file is opened on its own`);
  }
  if (outside.size) warnings.push(`loads ${plural(outside.size, 'outside file')}, blocked here, so parts may be missing: ${listed(outside)}`);
  if (bitmaps.size) {
    const total = [...bitmaps.values()].reduce((a, b) => a + b, 0);
    warnings.push(`embeds ${plural(total, 'bitmap image')} (${[...bitmaps.keys()].join(', ')}, ${bytes(bitmapBytes)}), which blur when scaled up`);
  }
  if (texts && !embeddedFonts) {
    warnings.push(fonts.size
      ? `sets text in ${listed(fonts)}; devices without ${fonts.size === 1 ? 'that font' : 'those fonts'} show another`
      : 'sets text in the default font, which differs between devices');
  }
  if (foreign) warnings.push('has HTML inside <foreignObject>, which many editors and converters leave out');
  if (box === undefined) warnings.push(`has a viewBox ("${root.getAttribute('viewBox')}") that is not four numbers with a positive width and height`);
  else if (box === null) warnings.push('has no viewBox, so it crops instead of scaling when resized; the preview and PNG add one');

  let elements = 0;
  for (const [, n] of tags) elements += n;
  return { size: measure(root), viewBox: root.getAttribute('viewBox'), elements, tags: byCount(tags), colours: byCount(colours), warnings };
}

/**
 * The source as a compact `data:` URI for CSS and HTML. Characters that are
 * safe in a quoted url() stay readable; the rest are percent-encoded.
 */
export function dataUri(source: string) {
  let text = source.replace(/^\s*<\?xml[^>]*\?>/, '').replace(/>\s*\n\s*</g, '><').trim();
  // Single quotes inside let the URI sit in double quotes without escaping.
  if (!text.includes("'")) text = text.replaceAll('"', "'");
  const encoded = encodeURIComponent(text).replace(/%(20|3D|3A|2F|2C|3B|40)/g, (_, hex: string) => String.fromCharCode(parseInt(hex, 16)));
  return `data:image/svg+xml,${encoded}`;
}

/** The source as a base64 `data:` URI. */
export function base64Uri(source: string) {
  const data = new TextEncoder().encode(source);
  let binary = '';
  for (let i = 0; i < data.length; i += 0x8000) binary += String.fromCharCode(...data.subarray(i, i + 0x8000));
  return `data:image/svg+xml;base64,${btoa(binary)}`;
}
