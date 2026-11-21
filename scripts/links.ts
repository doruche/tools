import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';

const external = /^(?:[a-z][a-z\d+.-]*:|\/\/|#)/i;
const reference = /\s(?:src|href)\s*=\s*(["'])(.*?)\1/gi;

function htmlFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return htmlFiles(path);
    return entry.name.endsWith('.html') ? [path] : [];
  });
}

/**
 * Lists src/href references in the HTML under `dir` that do not resolve to a
 * file in the published `root`. With `relativeOnly`, root-absolute paths such
 * as /app.js are reported too, because tools must work under any sub-path.
 */
export function brokenLinks(root: string, dir: string, { relativeOnly }: { relativeOnly: boolean }) {
  const problems: string[] = [];
  const files = statSync(dir).isDirectory() ? htmlFiles(dir) : [dir];
  for (const file of files) {
    const where = relative(root, file);
    for (const [, , value] of readFileSync(file, 'utf8').matchAll(reference)) {
      if (!value || external.test(value)) continue;
      if (value.startsWith('/') && relativeOnly) {
        problems.push(`${where}: "${value}" must be a relative path`);
        continue;
      }
      const path = decodeURIComponent(value.replace(/[?#].*$/, ''));
      const target = value.startsWith('/') ? join(root, path) : resolve(file, '..', path);
      const inside = target === resolve(root) || target.startsWith(resolve(root) + sep);
      const found = inside && existsSync(target)
        && (!statSync(target).isDirectory() || existsSync(join(target, 'index.html')));
      if (!found) problems.push(`${where}: "${value}" does not exist in the published site`);
    }
  }
  return problems;
}
