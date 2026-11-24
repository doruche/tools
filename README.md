# doruche's tools

Small browser-only utilities, published at [tools.doruche.cc](https://tools.doruche.cc/). Each tool lives at `/<tool>/`, and the home page lists them all.

## Development

Use Node 26 and the pnpm version in `package.json`.

```sh
pnpm install --frozen-lockfile
pnpm run check   # type checks and every tool's tests
pnpm run dev     # serve the site at http://127.0.0.1:4100/ and rebuild on every change
pnpm run build   # build the site into public/
```

## Adding a tool

Create `tools/<tool>/`. The folder name becomes the URL, so use lowercase letters, digits and hyphens. Name a tool after its subject when it covers all of it, such as `qr`, and after its subject and job when it does one thing in a large subject, such as `media-converter`. Every tool needs a `tool.json`:

```json
{
  "name": "Base converter",
  "description": "One sentence shown on the home page."
}
```

A tool then takes one of two forms:

- **No build step.** Everything in the folder is published as is, except `tool.json`, `test/`, `package.json`, `tsconfig.json`, `README.md` and `node_modules/`. Tests in `test/` run with `node --test`. See `tools/radix`.
- **Its own build.** Add a `package.json` with a `build` script that writes the tool to `dist/`, and optionally a `check` script. The tool keeps its own dependencies, so tools never have to share a toolchain. See `tools/uuid`, which uses Vite and TypeScript.

Either way, the published tool needs an `index.html` and must use relative paths, because it is served from `/<tool>/`. Tools are independent: none of them should depend on the home page or on another tool. `pnpm run build` stops with an error if a tool breaks these rules, including when its HTML refers to a file that is not in the published site.

## Shared kit

`packages/kit` holds an optional shared look: colours, command-line styled controls (`.term`, `.flag`, `.check`, `.choice`, `.cmd`, `.log`, `.lines`), a drop zone and `file`-style summary line for tools that open a file (`.dropzone`, `.file-line`), a favicon, and two helpers: `bindCopy` in `copy.js` and `bindDrop` in `drop.js`. It is published at `/kit/`.

- A tool without a build step links it with relative paths, such as `../kit/kit.css` and `../kit/copy.js`.
- A tool with a build step depends on `@doruche-tools/kit` and bundles it, so it does not rely on `/kit/` at all.

The home page and the 404 page live in `site/`.

## Deployment

Pushes to `main` build the site and publish `public/` to GitHub Pages. The custom domain is set in the repository's Pages settings, not in the source.
