import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));
const project = fileURLToPath(new URL('..', import.meta.url));

export default defineConfig({
  root,
  oxc: { jsx: { runtime: 'automatic' } },
  publicDir: fileURLToPath(new URL('../public', import.meta.url)),
  server: { host: '0.0.0.0', port: 3004, strictPort: true, fs: { allow: [project] } },
  preview: { host: '0.0.0.0', port: 3004, strictPort: true },
  build: { outDir: fileURLToPath(new URL('../.avatar-preview', import.meta.url)), emptyOutDir: true },
});
