import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DOMParser, XMLSerializer } from '@xmldom/xmldom';
import { addNamespaces, base64Uri, dataUri, drawable, inspect, length, measure, open, type Parser, type Serializer } from '../src/svg.ts';

// Like a browser, refuse anything that is not well-formed rather than guessing.
const parser = new DOMParser({
  onError: (level, message) => { if (level !== 'warning') throw new Error(message); },
}) as unknown as Parser;
const serializer = new XMLSerializer() as unknown as Serializer;
const NS = 'xmlns="http://www.w3.org/2000/svg"';
const read = (source: string) => open(source, parser);

test('opens SVG and explains what is not', () => {
  assert.equal(read(`<svg ${NS}/>`).root.localName, 'svg');
  assert.throws(() => read(`<svg ${NS}><g></svg>`), /^Error: not valid XML: /);
  assert.throws(() => read('hello'), /not valid XML/);
  assert.throws(() => read('<html xmlns="http://www.w3.org/1999/xhtml"/>'), /XML with a <html> root, not SVG/);
});

test('adds the namespaces that SVG copied from HTML lacks', () => {
  assert.deepEqual(addNamespaces(`<svg ${NS}/>`).added, []);
  const fixed = addNamespaces('<?xml version="1.0"?>\n<svg width="2"><use xlink:href="#a"/></svg>');
  assert.deepEqual(fixed.added, ['xmlns', 'xmlns:xlink']);
  assert.match(fixed.source, /^<\?xml version="1.0"\?>\n<svg xmlns="http:\/\/www.w3.org\/2000\/svg" xmlns:xlink="[^"]+" width="2">/);
  const opened = read('<svg viewBox="0 0 1 1"><use xlink:href="#a"/></svg>');
  assert.deepEqual(opened.added, ['xmlns', 'xmlns:xlink']);
  assert.match(inspect(opened).warnings[0], /^has no xmlns or xmlns:xlink, so it only works inside an HTML page/);
  // An <svg> nested deeper is not the root tag, and an <svgfoo> tag is not <svg>.
  assert.deepEqual(addNamespaces('<svgfoo/>').added, []);
});

test('reads lengths in any absolute unit', () => {
  assert.equal(length('24'), 24);
  assert.equal(length(' 1.5e1px '), 15);
  assert.equal(length('1in'), 96);
  assert.equal(length('72pt'), 96);
  assert.ok(Math.abs(length('25.4mm')! - 96) < 1e-9);
  for (const unusable of ['100%', 'auto', '', null, '0', '-5', '3furlongs']) assert.equal(length(unusable), undefined);
});

test('measures the way browsers size an image', () => {
  const size = (attributes: string) => measure(read(`<svg ${NS} ${attributes}/>`).root);
  assert.deepEqual(size('width="24" height="16"'), { width: 24, height: 16, from: 'attributes' });
  assert.deepEqual(size('viewBox="0 0 100 50"'), { width: 100, height: 50, from: 'viewBox' });
  assert.deepEqual(size('width="200" viewBox="0,0,100,50"'), { width: 200, height: 100, from: 'attributes' });
  assert.deepEqual(size('height="100%" viewBox="0 0 100 50"'), { width: 100, height: 50, from: 'viewBox' });
  assert.deepEqual(size(''), { width: 300, height: 150, from: 'default' });
  assert.deepEqual(size('width="10"'), { width: 10, height: 150, from: 'attributes' });
});

test('gives the drawn copy a pixel size and, if needed, a viewBox', () => {
  const draw = (source: string) => {
    const { root } = read(source);
    return read(drawable(root, measure(root), serializer)).root;
  };
  const fixed = draw(`<svg ${NS} width="1in" height="0.5in"><rect width="96" height="48"/></svg>`);
  assert.equal(fixed.getAttribute('width'), '96');
  assert.equal(fixed.getAttribute('viewBox'), '0 0 96 48');
  const kept = draw(`<svg ${NS} viewBox="5 5 10 10" width="100%"/>`);
  assert.equal(kept.getAttribute('viewBox'), '5 5 10 10');
  assert.equal(kept.getAttribute('width'), '10');
});

test('counts elements and colours', () => {
  const report = inspect(read(`<svg ${NS} viewBox="0 0 24 24">
    <style>.a { fill: #FF0000 } rect:hover{stroke:blue}</style>
    <g fill="currentColor"><path d="M0 0" fill="none"/><path style="fill: #ff0000; stroke: url(#g)"/></g>
    <linearGradient id="g"><stop stop-color="#000"/></linearGradient>
  </svg>`));
  assert.equal(report.elements, 7);
  assert.deepEqual(report.tags.slice(0, 2), [['path', 2], ['svg', 1]]);
  assert.deepEqual(report.colours, [['#ff0000', 2], ['blue', 1], ['currentColor', 1], ['#000', 1]]);
  assert.deepEqual(report.warnings, []);
});

test('warns about what may differ outside this preview', () => {
  const warnings = inspect(read(`<svg ${NS} xmlns:xlink="http://www.w3.org/1999/xlink" onload="go()">
    <script>go()</script>
    <a xlink:href="javascript:go()"><text font-family="'Inter', sans-serif">hi</text></a>
    <image href="https://example.com/a.png"/>
    <image href="data:image/png;base64,AAAA"/>
    <rect fill="url(other.svg#paint)"/>
    <style>@import "fonts.css";</style>
    <foreignObject><div xmlns="http://www.w3.org/1999/xhtml"/></foreignObject>
  </svg>`)).warnings;
  assert.deepEqual(warnings, [
    'has scripts (1 <script> element, onload, 1 javascript: link); they do not run here, but would if the file is opened on its own',
    'loads 3 outside files, blocked here, so parts may be missing: https://example.com/a.png, other.svg#paint, fonts.css',
    'embeds 1 bitmap image (PNG, 1 KB), which blur when scaled up',
    'sets text in Inter; devices without that font show another',
    'has HTML inside <foreignObject>, which many editors and converters leave out',
    'has no viewBox, so it crops instead of scaling when resized; the preview and PNG add one',
  ]);
  assert.deepEqual(inspect(read(`<svg ${NS} viewBox="0 0 0 10"/>`)).warnings, [
    'has a viewBox ("0 0 0 10") that is not four numbers with a positive width and height',
  ]);
  // Fonts embedded with @font-face travel with the file.
  const embedded = inspect(read(`<svg ${NS} viewBox="0 0 1 1"><style>@font-face { font-family: X; src: url(data:font/woff2;base64,AA) }</style><text font-family="X">a</text></svg>`));
  assert.deepEqual(embedded.warnings, []);
});

test('writes compact data URIs that decode back to the image', () => {
  const source = '<?xml version="1.0"?>\n<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1">\n  <path fill="#0f766e" d="M0 0h1v1z"/>\n</svg>\n';
  const uri = dataUri(source);
  assert.equal(uri, "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1 1'%3E%3Cpath fill='%230f766e' d='M0 0h1v1z'/%3E%3C/svg%3E");
  // A source that already uses single quotes keeps its double quotes, encoded.
  assert.match(dataUri(`<svg ${NS}><text font-family="'A'">it's</text></svg>`), /%22/);
  const base64 = base64Uri('<svg>你好</svg>');
  assert.equal(Buffer.from(base64.split(',')[1], 'base64').toString(), '<svg>你好</svg>');
});
