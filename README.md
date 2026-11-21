# doruche's tools

Small browser-only utilities, published at [tools.doruche.cc](https://tools.doruche.cc/). Each tool lives at `/<tool>/`, and the home page lists them all.

## Development

Use Node 26 and the pnpm version in `package.json`.

```sh
pnpm install --frozen-lockfile
pnpm run check     # type checks and every tool's tests
pnpm run preview   # build into public/ and serve it at http://127.0.0.1:4100/
```

A tool with its own dev server, such as `uuid`, can also be run directly: `pnpm --filter @doruche-tools/uuid dev`.

## Adding a tool

Create `tools/<tool>/`. The folder name becomes the URL, so use lowercase letters, digits and hyphens. Every tool needs a `tool.json`:

```json
{
  "name": "Base converter",
  "description": "One sentence shown on the home page."
}
```

A tool then takes one of two forms:

- **No build step.** Everything in the folder is published as is, except `tool.json` and `test/`. Tests in `test/` run with `node --test`. See `tools/radix`.
- **Its own build.** Add a `package.json` with a `build` script that writes the tool to `dist/`, and optionally a `check` script. The tool keeps its own dependencies, so tools never have to share a toolchain. See `tools/uuid`, which uses Vite and TypeScript.

Either way, the published tool needs an `index.html` and must use relative paths, because it is served from `/<tool>/`. Tools are independent: none of them should depend on the home page or on another tool. `pnpm run build` stops with an error if a tool breaks these rules.

## Deployment

Pushes to `main` build the site and publish `public/` to GitHub Pages. The custom domain is set in the repository's Pages settings, not in the source.
