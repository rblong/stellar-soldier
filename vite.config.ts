import { defineConfig } from 'vite';
import { cpSync } from 'node:fs';
import { resolve } from 'node:path';

// Dev serves the optional local pack. Builds copy only the original combat assets.
export default defineConfig({
  base: './',
  server: { port: 5180, strictPort: true },
  build: { copyPublicDir: false },
  plugins: [{
    name: 'original-assets-only',
    closeBundle() {
      cpSync(resolve('public/assets/combat'), resolve('dist/assets/combat'), { recursive: true });
    },
  }],
});
