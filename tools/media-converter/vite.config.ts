import { statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

// The download progress needs the core's real size: GitHub Pages serves it compressed.
const wasmSize = statSync(fileURLToPath(import.meta.resolve('@ffmpeg/core/wasm'))).size;

// Relative asset paths let the tool work under any sub-path, such as /media-converter/.
export default defineConfig({
  base: './',
  define: { __CORE_WASM_SIZE__: String(wasmSize) },
  // ffmpeg.wasm starts its worker with new URL('./worker.js', import.meta.url),
  // which pre-bundling would break during development.
  optimizeDeps: { exclude: ['@ffmpeg/ffmpeg'] },
});
