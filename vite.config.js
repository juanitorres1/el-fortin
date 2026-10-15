// Vite multipágina: cada página es su propio HTML (las URLs y los links compartidos siguen iguales) con React adentro.
// El <head> de las 5 páginas sale de src/site.js: el HTML solo marca dónde va con <!--head-->.
import { basename, resolve } from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { PAGES, headTags } from './src/site.js';

function siteHead() {
  return {
    name: 'fortin-head',
    transformIndexHtml: {
      order: 'pre',
      handler(html, ctx) {
        const page = PAGES.find((p) => p.file === basename(ctx.filename));
        if (!page) throw new Error(`${ctx.filename} no está en src/site.js`);
        return html.replace('<!--head-->', headTags(page));
      },
    },
  };
}

export default defineConfig({
  base: './', // rutas relativas: funciona en juanitorres1.github.io/el-fortin/ y en localhost
  plugins: [react(), siteHead()],
  server: { port: 5173, strictPort: true },
  build: {
    rollupOptions: { input: Object.fromEntries(PAGES.map((p) => [p.key, resolve(import.meta.dirname, p.file)])) },
  },
});
