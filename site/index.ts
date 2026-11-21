import type { Tool } from '../scripts/tools.ts';

const escape = (value: string) => value.replace(/[&<>"']/g, char => `&#${char.charCodeAt(0)};`);

export function renderIndex(tools: Tool[]) {
  const items = tools.map(tool => `
      <li>
        <a href="${escape(tool.id)}/">
          <code>/${escape(tool.id)}</code>
          <span class="name">${escape(tool.name)}</span>
          <span class="description">${escape(tool.description)}</span>
        </a>
      </li>`).join('');
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>doruche's tools</title>
  <link rel="icon" href="site/favicon.svg">
  <link rel="stylesheet" href="site/style.css">
</head>
<body>
  <header class="masthead">
    <h1>doruche's tools</h1>
    <p>Small utilities that run entirely in your browser. Nothing you type leaves the page.</p>
  </header>
  <main>
    <ul class="tool-list">${items}
    </ul>
  </main>
  <footer class="colophon"><a href="https://github.com/doruche/tools">Source on GitHub</a></footer>
</body>
</html>
`;
}
