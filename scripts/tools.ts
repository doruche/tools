import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';

const text = z.string().trim().min(1);
const manifestSchema = z.strictObject({
  name: text,
  description: text,
});

const idPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
// Top-level paths the site itself uses, so a tool cannot take them.
const reserved = new Set(['site', 'kit']);

export type Tool = {
  id: string;
  dir: string;
  name: string;
  description: string;
  /** Script names from the tool's own package.json, if it has one. */
  scripts: Record<string, string>;
};

function readJson(file: string): unknown {
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch (error) {
    throw new Error(`${file}: ${error instanceof Error ? error.message : error}`);
  }
}

export function readTools(root = 'tools'): Tool[] {
  if (!existsSync(root)) return [];
  return readdirSync(root, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(({ name: id }) => {
      const dir = join(root, id);
      if (!idPattern.test(id)) throw new Error(`${dir}: tool folder names use lowercase letters, digits and hyphens`);
      if (reserved.has(id)) throw new Error(`${dir}: /${id}/ is used by the site`);

      const manifestFile = join(dir, 'tool.json');
      if (!existsSync(manifestFile)) throw new Error(`${dir}: missing tool.json`);
      const result = manifestSchema.safeParse(readJson(manifestFile));
      if (!result.success) throw new Error(`${manifestFile}: ${z.prettifyError(result.error)}`);

      const packageFile = join(dir, 'package.json');
      const pkg = existsSync(packageFile) ? readJson(packageFile) as { scripts?: Record<string, string> } : {};
      return { id, dir, ...result.data, scripts: pkg.scripts ?? {} };
    })
    .sort((a, b) => a.id.localeCompare(b.id, 'en'));
}
