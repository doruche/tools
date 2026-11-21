import './style.css';
import { createUuidV7, formatUuid, uuidV4 } from './uuid.ts';

const form = document.querySelector<HTMLFormElement>('#controls')!;
const output = document.querySelector<HTMLTextAreaElement>('#output')!;
const status = document.querySelector<HTMLOutputElement>('#status')!;
const nextV7 = createUuidV7();

/** Raw UUIDs, kept so format options apply without generating new ones. */
let ids: string[] = [];

function options() {
  const data = new FormData(form);
  const count = Math.min(1000, Math.max(1, Math.trunc(Number(data.get('count'))) || 1));
  return {
    version: data.get('version') === '7' ? 7 : 4,
    count,
    uppercase: data.has('uppercase'),
    hyphens: data.has('hyphens'),
  };
}

function show() {
  const { uppercase, hyphens } = options();
  output.value = ids.map(id => formatUuid(id, { uppercase, hyphens })).join('\n');
  output.rows = Math.min(Math.max(ids.length, 3), 16);
  status.value = '';
}

function generate() {
  const { version, count } = options();
  ids = Array.from({ length: count }, version === 7 ? nextV7 : () => uuidV4());
  show();
}

form.addEventListener('change', event => {
  const name = (event.target as HTMLInputElement).name;
  if (name === 'uppercase' || name === 'hyphens') show();
  else generate();
});
form.addEventListener('submit', event => {
  event.preventDefault();
  generate();
});
document.querySelector('#generate')!.addEventListener('click', generate);
document.querySelector('#copy')!.addEventListener('click', async () => {
  await navigator.clipboard.writeText(output.value);
  status.value = `Copied ${ids.length} UUID${ids.length === 1 ? '' : 's'}`;
});

generate();
