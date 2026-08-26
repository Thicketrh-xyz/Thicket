import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// Dev-only: the docs are one entry (docs.html) serving many paths, and Vite's
// static server would 404 on /docs/anything. Mirrors the Vercel rewrites.
const docsRoutes = {
  name: "docs-routes",
  configureServer(server) {
    server.middlewares.use((req, _res, next) => {
      if (/^\/docs(\/|$)/.test(req.url.split("?")[0])) req.url = "/docs.html";
      else if (/^\/app(\/|$)/.test(req.url.split("?")[0])) req.url = "/app.html";
      next();
    });
  },
};

export default defineConfig({
  plugins: [react(), tailwindcss(), docsRoutes],
  build: {
    // Multi-page: landing (index.html) + docs (docs.html).
    rollupOptions: {
      input: { main: "index.html", app: "app.html", docs: "docs.html" },
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
