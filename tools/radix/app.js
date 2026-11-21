import { format, parse } from './convert.js';

const rows = [...document.querySelectorAll('.row')];
const customRow = document.getElementById('custom-row');
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
  row.querySelector('.error').textContent = message;
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
  row.querySelector('.copy').addEventListener('click', async event => {
    const button = event.currentTarget;
    const value = inputOf(row).value;
    if (!value) return;
    await navigator.clipboard.writeText(value);
    button.textContent = 'Copied';
    setTimeout(() => { button.textContent = 'Copy'; }, 1200);
  });
}

customBase.addEventListener('change', () => {
  customRow.dataset.base = customBase.value;
  render();
});
uppercase.addEventListener('change', () => render());
