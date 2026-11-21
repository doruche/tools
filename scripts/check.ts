import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { readTools } from './tools.ts';

// Each tool owns its checks: run its `check` script if it has one,
// otherwise run any tests in its test/ folder with Node's test runner.
const failures: string[] = [];
function run(label: string, command: string, args: string[], cwd?: string) {
  console.log(`\n▸ ${label}`);
  try {
    execFileSync(command, args, { cwd, stdio: 'inherit' });
  } catch {
    failures.push(label);
  }
}

run('framework tests', process.execPath, ['--test', 'test/']);
for (const tool of readTools()) {
  if (tool.scripts.check) run(tool.id, 'pnpm', ['run', 'check'], tool.dir);
  else if (existsSync(join(tool.dir, 'test'))) run(tool.id, process.execPath, ['--test', join(tool.dir, 'test/')]);
}

if (failures.length) {
  console.error(`\nChecks failed: ${failures.join(', ')}`);
  process.exitCode = 1;
}
