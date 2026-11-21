import { createServer } from 'node:http';
import sirv from 'sirv';

const port = Number(process.env.PORT ?? 4100);
const serve = sirv('public', { dev: true });
createServer((request, response) => serve(request, response, () => {
  response.writeHead(404).end('Not found');
}))
  .listen(port, '127.0.0.1', () => console.log(`Preview: http://127.0.0.1:${port}/`));
