/**
 * Makes `button` copy the text returned by `getText`, then shows `copied`
 * (or `failed`) in place of its label for a moment.
 * @param {HTMLButtonElement} button
 * @param {() => string} getText
 */
export function bindCopy(button, getText) {
  const label = button.textContent;
  let timer;
  button.addEventListener('click', async () => {
    const text = getText();
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      button.textContent = 'copied';
    } catch {
      button.textContent = 'failed';
    }
    clearTimeout(timer);
    timer = setTimeout(() => { button.textContent = label; }, 1200);
  });
}
