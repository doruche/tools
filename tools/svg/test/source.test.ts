import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DOMParser } from '@xmldom/xmldom';
import { highlight, pretty } from '../src/source.ts';

const parse = (source: string) => new DOMParser().parseFromString(source, 'image/svg+xml') as unknown as Document;

test('re-indents elements but leaves text content as written', () => {
  const doc = parse('<svg xmlns="http://www.w3.org/2000/svg"><!-- logo --><g id="a"><path d="M0 0" title="a &quot;b&quot; &amp; c"/></g><text x="1">a <tspan>b</tspan>  c</text><style>\n.a{fill:red}\n</style></svg>');
  assert.equal(pretty(doc), [
    '<svg xmlns="http://www.w3.org/2000/svg">',
    '  <!-- logo -->',
    '  <g id="a">',
    '    <path d="M0 0" title="a &quot;b&quot; &amp; c"/>',
    '  </g>',
    '  <text x="1">a <tspan>b</tspan>  c</text>',
    '  <style>',
    '.a{fill:red}',
    '</style>',
    '</svg>',
  ].join('\n'));
});

test('pretty output parses back to the same document', () => {
  const source = '<svg xmlns="http://www.w3.org/2000/svg" xmlns:x="urn:x"><x:meta a="1&#10;2"/><g>\n\n<rect/></g></svg>';
  const again = parse(pretty(parse(source)));
  assert.equal(again.documentElement.getElementsByTagName('x:meta')[0].getAttribute('a'), '1\n2');
  assert.equal(again.documentElement.getElementsByTagName('rect').length, 1);
});

test('highlights tags, attributes, values and comments, line by line', () => {
  const source = '<?xml version="1.0"?>\n<svg a="1"\n  b=\'2\'>\n<!-- a\nb --><g/>text</svg>';
  const lines = highlight(source);
  assert.equal(lines.map(line => line.map(token => token.text).join('')).join('\n'), source);
  assert.deepEqual(lines[1], [
    { kind: 'punct', text: '<' }, { kind: 'tag', text: 'svg' }, { kind: 'text', text: ' ' },
    { kind: 'attr', text: 'a' }, { kind: 'punct', text: '=' }, { kind: 'value', text: '"1"' },
  ]);
  assert.deepEqual(lines[0], [{ kind: 'meta', text: '<?xml version="1.0"?>' }]);
  assert.deepEqual(lines[3], [{ kind: 'comment', text: '<!-- a' }]);
  assert.deepEqual(lines[4].map(token => token.kind), ['comment', 'punct', 'tag', 'punct', 'text', 'punct', 'tag', 'punct']);
});

test('highlights broken source without losing any of it', () => {
  for (const source of ['<svg a="unclosed', '<!-- open', 'a < b', '<', '<svg x=>']) {
    assert.equal(highlight(source).flat().map(token => token.text).join(''), source);
  }
});
