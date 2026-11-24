import { bindCopy } from '../kit/copy.js';
import { formats, isTimeZone, parse, relative } from './time.js';

const input = document.getElementById('input');
const readAs = document.getElementById('read-as');
const zoneInput = document.getElementById('zone');
const zoneError = document.getElementById('zone-error');
const list = document.getElementById('formats');
const rows = [...list.querySelectorAll('[data-key]')];

const localZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
const zones = ['UTC', ...Intl.supportedValuesOf('timeZone').filter(zone => zone !== 'UTC')];
document.getElementById('zones').append(...zones.map(zone => new Option(zone)));
zoneInput.value = localZone;

/** The zone last typed correctly; a half-typed name keeps the previous one. */
let zone = localZone;
/** The instant shown, or null when the input is empty or unreadable. */
let shown = null;
const relativeCell = list.querySelector('[data-key="relative"] dd');

function render() {
  let result = null;
  try {
    result = parse(input.value, zone);
    input.setAttribute('aria-invalid', 'false');
    readAs.className = 'log';
    readAs.textContent = result ? `read as ${result.as}` : '';
  } catch (error) {
    input.setAttribute('aria-invalid', 'true');
    readAs.className = 'log error';
    readAs.textContent = error.message;
  }
  shown = result?.ns ?? null;
  list.hidden = !result;
  if (!result) return;
  const values = formats(result.ns, zone);
  for (const row of rows) {
    if (row.dataset.key in values) row.querySelector('dd').textContent = values[row.dataset.key];
  }
  tick();
}

/** Only the distance from now changes as time passes, so only it is redrawn every second. */
function tick() {
  if (shown !== null) relativeCell.textContent = relative(shown, Date.now());
}
setInterval(tick, 1000);

function now() {
  input.value = String(Math.floor(Date.now() / 1000));
  render();
}

input.addEventListener('input', render);
zoneInput.addEventListener('input', () => {
  const name = zoneInput.value.trim();
  const known = isTimeZone(name);
  zoneInput.setAttribute('aria-invalid', String(!known));
  zoneError.textContent = known ? '' : 'not a time zone; pick one from the list, such as Europe/Berlin';
  if (!known) return;
  zone = name;
  render();
});
document.getElementById('now').addEventListener('click', now);
for (const row of rows) {
  const button = row.querySelector('.cmd');
  if (button) bindCopy(button, () => row.querySelector('dd').textContent);
}

now();
