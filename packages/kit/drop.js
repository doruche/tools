/**
 * Wires up the usual ways of opening one file: `[data-choose]` buttons that
 * open `input`, the input itself, and dropping a file anywhere on the page.
 * While a file is dragged over the page, `zone` and `<body>` get the
 * `dragging` class; kit.css uses it to highlight `.dropzone` and `.drop-target`.
 * @param {{ zone: HTMLElement, input: HTMLInputElement, onFile: (file: File) => void }} options
 */
export function bindDrop({ zone, input, onFile }) {
  for (const button of document.querySelectorAll('[data-choose]')) button.addEventListener('click', () => input.click());
  input.addEventListener('change', () => {
    const file = input.files?.[0];
    // Clearing the value lets the same file be chosen again.
    input.value = '';
    if (file) onFile(file);
  });

  // dragenter and dragleave fire for every child element, so count them.
  let depth = 0;
  const dragging = on => {
    zone.classList.toggle('dragging', on);
    document.body.classList.toggle('dragging', on);
  };
  document.addEventListener('dragenter', event => {
    if (!event.dataTransfer?.types.includes('Files')) return;
    depth++;
    dragging(true);
  });
  document.addEventListener('dragleave', () => {
    if (depth && --depth === 0) dragging(false);
  });
  document.addEventListener('dragover', event => event.preventDefault());
  document.addEventListener('drop', event => {
    event.preventDefault();
    depth = 0;
    dragging(false);
    const file = event.dataTransfer?.files[0];
    if (file) onFile(file);
  });
}
