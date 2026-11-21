import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

const script = join(import.meta.dirname, '../scripts/build.ts');

function write(file: string, content: string) {
  mkdirSync(join(file, '..'), { recursive: true });
  writeFileSync(file, content);
}

test('publishes plain and built tools and keeps the last good build', t => {
  const root = mkdtempSync(join(tmpdir(), 'tools-build-test-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const build = () => execFileSync(process.execPath, [script], { cwd: root, stdio: 'pipe' });
  const manifest = (name: string) => JSON.stringify({ name, description: `${name} <does> things` });

  write(join(root, 'tools/plain/tool.json'), manifest('Plain'));
  write(join(root, 'tools/plain/index.html'), 'plain');
  write(join(root, 'tools/plain/assets/test/kept.txt'), 'nested test folders are published');
  write(join(root, 'tools/plain/test/plain.test.js'), '');
  write(join(root, 'tools/built/tool.json'), manifest('Built'));
  write(join(root, 'tools/built/make.js'),
    "import { mkdirSync, writeFileSync } from 'node:fs'; mkdirSync('dist', { recursive: true }); writeFileSync('dist/index.html', 'built');");
  write(join(root, 'tools/built/package.json'), JSON.stringify({ type: 'module', scripts: { build: 'node make.js' } }));
  build();

  const out = join(root, 'public');
  assert.equal(readFileSync(join(out, 'plain/index.html'), 'utf8'), 'plain');
  assert.ok(existsSync(join(out, 'plain/assets/test/kept.txt')));
  assert.ok(!existsSync(join(out, 'plain/tool.json')));
  assert.ok(!existsSync(join(out, 'plain/test')));
  assert.equal(readFileSync(join(out, 'built/index.html'), 'utf8'), 'built');
  assert.ok(!existsSync(join(out, 'built/make.js')));
  assert.ok(existsSync(join(out, 'site/style.css')));
  const index = readFileSync(join(out, 'index.html'), 'utf8');
  assert.match(index, /href="built\/"[\s\S]*href="plain\/"/);
  assert.match(index, /Plain &#60;does&#62; things/);

  const broken = (setup: () => void, message: RegExp, undo: () => void) => {
    setup();
    assert.throws(build, message);
    assert.equal(readFileSync(join(out, 'plain/index.html'), 'utf8'), 'plain');
    undo();
  };
  broken(() => write(join(root, 'tools/Bad_Name/tool.json'), manifest('Bad')), /lowercase letters, digits and hyphens/,
    () => rmSync(join(root, 'tools/Bad_Name'), { recursive: true }));
  broken(() => write(join(root, 'tools/site/tool.json'), manifest('Site')), /\/site\/ is used by the site/,
    () => rmSync(join(root, 'tools/site'), { recursive: true }));
  broken(() => mkdirSync(join(root, 'tools/empty')), /tools\/empty: missing tool\.json/,
    () => rmSync(join(root, 'tools/empty'), { recursive: true }));
  broken(() => write(join(root, 'tools/plain/tool.json'), '{"name": "Plain"}'), /tool\.json[\s\S]*description/,
    () => write(join(root, 'tools/plain/tool.json'), manifest('Plain')));
  broken(() => write(join(root, 'tools/built/make.js'), ''), /its build script must write the tool to dist\//,
    () => {});
});
