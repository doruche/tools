import { bindCopy } from '../kit/copy.js';
import { format, parse } from './convert.js';

const rows = [...document.querySelectorAll('.field')];
const customRow = document.getElementById('custom-field');
const customBase = document.getElementById('custom-base');
const uppercase = document.getElementById('uppercase');
const size = document.getElementById('size');

/** The last valid value, so options can re-render without re-parsing. */
let current = null;

for (let base = 2; base <= 36; base++) customBase.add(new Option(String(base), String(base)));
customBase.value = customRow.dataset.base;

const baseOf = row => Number(row.dataset.base);
const inputOf = row => row.querySelector('input');

function setError(row, message) {
  inputOf(row).setAttribute('aria-invalid', String(Boolean(message)));
  row.querySelector('.log').textContent = message;
}

function render(except) {
  for (const row of rows) {
    if (row === except) continue;
    setError(row, '');
    inputOf(row).value = current === null ? '' : format(current, baseOf(row), { uppercase: uppercase.checked });
  }
  if (current === null) {
    size.value = '';
  } else {
    const bits = current === 0n ? 1 : (current < 0n ? -current : current).toString(2).length;
    const bytes = Math.ceil(bits / 8);
    size.value = `${bits} bit${bits === 1 ? '' : 's'} · ${bytes} byte${bytes === 1 ? '' : 's'}${current < 0n ? ' (magnitude)' : ''}`;
  }
}

for (const row of rows) {
  inputOf(row).addEventListener('input', event => {
    try {
      current = parse(event.target.value, baseOf(row));
      setError(row, '');
      render(row);
    } catch (error) {
      setError(row, error.message);
    }
  });
  bindCopy(row.querySelector('.cmd'), () => inputOf(row).value);
}

customBase.addEventListener('change', () => {
  customRow.dataset.base = customBase.value;
  render();
});
uppercase.addEventListener('change', () => render());
