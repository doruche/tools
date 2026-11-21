import { execFileSync } from 'node:child_process';
import { chmodSync, cpSync, existsSync, mkdtempSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { renderIndex } from '../site/index.ts';
import { readTools, type Tool } from './tools.ts';

const siteAssets = join(import.meta.dirname, '../site/assets');
// Top-level entries of a tool without a build step that are not published.
const sourceOnly = new Set(['tool.json', 'test', 'node_modules']);

/** Returns the folder whose contents are published at /<tool id>/. */
function produce(tool: Tool) {
  if (!tool.scripts.build) {
    return { from: tool.dir, filter: (path: string) => dirname(path) !== tool.dir || !sourceOnly.has(basename(path)) };
  }
  const dist = join(tool.dir, 'dist');
  // Clear old output so a build that writes nothing cannot republish it.
  rmSync(dist, { recursive: true, force: true });
  execFileSync('pnpm', ['run', 'build'], { cwd: tool.dir, stdio: 'inherit' });
  if (!existsSync(dist)) throw new Error(`${tool.dir}: its build script must write the tool to dist/`);
  return { from: dist, filter: () => true };
}

export function build(output = 'public') {
  const tools = readTools();
  const staging = mkdtempSync(resolve(output) + '-');
  try {
    for (const tool of tools) {
      const { from, filter } = produce(tool);
      if (!existsSync(join(from, 'index.html'))) throw new Error(`${tool.dir}: the published tool needs an index.html`);
      cpSync(from, join(staging, tool.id), { recursive: true, filter: path => path === from || filter(path) });
    }
    cpSync(siteAssets, join(staging, 'site'), { recursive: true });
    writeFileSync(join(staging, 'index.html'), renderIndex(tools));
    chmodSync(staging, 0o755);
    rmSync(output, { recursive: true, force: true });
    renameSync(staging, output);
  } finally {
    rmSync(staging, { recursive: true, force: true });
  }
  return tools;
}

if (import.meta.main) {
  const tools = build();
  console.log(`Built ${tools.length} tool${tools.length === 1 ? '' : 's'}: ${tools.map(tool => tool.id).join(', ')}`);
}
