import type { Tool } from '../scripts/tools.ts';

const escape = (value: string) => value.replace(/[&<>"']/g, char => `&#${char.charCodeAt(0)};`);

/** `base` is "" on the home page and "/" on the 404 page, which can be served at any path. */
function page(base: string, title: string, body: string, head = '') {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title}</title>
  <link rel="icon" href="${base}kit/favicon.svg">
  <link rel="stylesheet" href="${base}kit/kit.css">
  <link rel="stylesheet" href="${base}site/style.css">${head}
</head>
<body>
${body}
  <footer class="colophon"><a href="https://github.com/doruche/tools">source</a></footer>
</body>
</html>
`;
}

function toolList(tools: Tool[], base: string) {
  const items = tools.map(tool => `
      <li>
        <a href="${base}${escape(tool.id)}/">
          <code>/${escape(tool.id)}</code>
          <span class="name">${escape(tool.name)}</span>
          <span class="description">${escape(tool.description)}</span>
        </a>
      </li>`).join('');
  return `<ul class="tool-list">${items}
    </ul>`;
}

export function renderIndex(tools: Tool[]) {
  return page('', "doruche's tools", `  <header class="page-header">
    <h1>doruche's tools</h1>
    <p>Small utilities that run entirely in your browser. Nothing you type leaves the page.</p>
  </header>
  <main>
    ${toolList(tools, '')}
  </main>`);
}

export function renderNotFound(tools: Tool[]) {
  return page('/', "Not found · doruche's tools", `  <header class="page-header">
    <h1 id="command">cd /</h1>
    <p class="not-found">command not found: <span id="path">this page</span></p>
  </header>
  <main>
    <p class="hint">Available tools:</p>
    ${toolList(tools, '/')}
  </main>`, `
  <script type="module">
    const path = decodeURIComponent(location.pathname);
    document.getElementById('command').textContent = path;
    document.getElementById('path').textContent = path;
  </script>`);
}
