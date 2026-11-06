import { build } from 'vite';
import { copyFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root = fileURLToPath(new URL('../', import.meta.url));
await build({
  configFile: false,
  root,
  base: './',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'chrome155',
    rollupOptions: {
      input: {
        index: path.join(root, 'index.html'),
        finished: path.join(root, 'finished.html'),
        waiting: path.join(root, 'waiting.html'),
        background: path.join(root, 'src/background/index.ts'),
      },
      output: { entryFileNames: '[name].js', chunkFileNames: 'chunks/[name]-[hash].js' },
    },
  },
});
await build({
  configFile: false,
  root,
  build: {
    outDir: 'dist',
    emptyOutDir: false,
    target: 'chrome155',
    lib: {
      entry: path.join(root, 'src/controller/content.ts'),
      name: 'VideoDisplayer',
      formats: ['iife'],
      fileName: () => 'content.js',
    },
  },
});
await mkdir(path.join(root, 'dist'), { recursive: true });
await copyFile(path.join(root, 'manifest.json'), path.join(root, 'dist/manifest.json'));
