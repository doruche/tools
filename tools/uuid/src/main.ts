import '@doruche-tools/kit/kit.css';
import './style.css';
import { bindCopy } from '@doruche-tools/kit/copy.js';
import { createUuidV7, formatUuid, uuidV4 } from './uuid.ts';

const form = document.querySelector<HTMLFormElement>('#options')!;
const output = document.querySelector<HTMLOListElement>('#output')!;
const nextV7 = createUuidV7();

/** Raw UUIDs, kept so format options apply without generating new ones. */
let ids: string[] = [];

function options() {
  const data = new FormData(form);
  return {
    version: data.get('version') === '7' ? 7 : 4,
    count: Math.min(1000, Math.max(1, Math.trunc(Number(data.get('count'))) || 1)),
    uppercase: data.has('uppercase'),
    hyphens: data.has('hyphens'),
  };
}

function formatted() {
  const { uppercase, hyphens } = options();
  return ids.map(id => formatUuid(id, { uppercase, hyphens }));
}

function show() {
  output.replaceChildren(...formatted().map(text => Object.assign(document.createElement('li'), { textContent: text })));
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
bindCopy(document.querySelector<HTMLButtonElement>('#copy')!, () => formatted().join('\n'));

generate();
