import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

// Dev needs inline scripts for React Fast Refresh; the production bundle does not.
const strictScriptCsp = {
  name: 'strict-script-csp',
  apply: 'build' as const,
  transformIndexHtml: (html: string) => html.replace("script-src 'self' 'unsafe-inline'", "script-src 'self'"),
};

export default defineConfig({
  plugins: [react(), strictScriptCsp],
  root: 'src',
  base: './',
  publicDir: path.resolve(__dirname, 'public'),
  build: {
    outDir: path.resolve(__dirname, 'dist-renderer'),
    emptyOutDir: true,
    chunkSizeWarningLimit: 2000,
  },
  server: { port: 5273 },
});
