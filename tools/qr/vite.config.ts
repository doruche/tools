import { defineConfig } from 'vite';

// Relative asset paths let the tool work under any sub-path, such as /uuid/.
export default defineConfig({ base: './' });
