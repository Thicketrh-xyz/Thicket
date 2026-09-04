import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// Dev-only: the docs are one entry (docs.html) serving many paths, and Vite's
// static server would 404 on /docs/anything. Mirrors the Vercel rewrites.
const docsRoutes = {
  name: "docs-routes",
  configureServer(server) {
    server.middlewares.use((req, _res, next) => {
      const path = req.url.split("?")[0];
      // Never rewrite something that looks like a file. /nft serves a page, but
      // /nft/thumb/1.webp is an asset in public/ — routing that to the HTML is
      // why the artwork rendered as empty tiles.
      const isAsset = /\.[a-z0-9]+$/i.test(path);
      if (isAsset) { /* fall through to the static server */ }
      else if (/^\/docs(\/|$)/.test(path)) req.url = "/docs.html";
      else if (/^\/app(\/|$)/.test(path)) req.url = "/app.html";
      else if (/^\/nodes(\/|$)/.test(path)) req.url = "/nodes.html";
      else if (/^\/nft(\/|$)/.test(path)) req.url = "/nft.html";
      next();
    });
  },
};

export default defineConfig({
  plugins: [react(), tailwindcss(), docsRoutes],
  build: {
    // Multi-page: landing (index.html) + portal + docs + public node list.
    rollupOptions: {
      input: { main: "index.html", app: "app.html", docs: "docs.html", nodes: "nodes.html",
               nft: "nft.html" },
    },
  },
  server: {
    port: 5178,
    // Proxy coordinator API in dev so the app can call /api/* same-origin.
    proxy: {
      "/api": {
        target: "http://localhost:8000",
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api/, ""),
      },
    },
  },
});
