import { createServer } from 'node:http';
import { watch } from 'chokidar';
import sirv from 'sirv';
import { build } from './build.ts';

// Builds into public/, serves it, and rebuilds whenever a source file changes.
const port = Number(process.env.PORT ?? 4100);
const serve = sirv('public', { dev: true });

function rebuild() {
  try {
    const tools = build();
    console.log(`Built ${tools.map(tool => tool.id).join(', ')} at ${new Date().toLocaleTimeString()}`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
  }
}

let timer: NodeJS.Timeout | undefined;
watch(['tools', 'packages', 'site'], {
  ignoreInitial: true,
  ignored: path => /(^|[/\\])(node_modules|dist)([/\\]|$)/.test(path),
}).on('all', () => {
  clearTimeout(timer);
  timer = setTimeout(rebuild, 150);
});

rebuild();
createServer((request, response) => serve(request, response, () => {
  response.writeHead(404).end('Not found');
})).listen(port, '127.0.0.1', () => console.log(`Preview: http://127.0.0.1:${port}/`));
