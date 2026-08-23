import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    // Multi-page: landing (index.html) + docs (docs.html).
    rollupOptions: {
      input: { main: "index.html", docs: "docs.html" },
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
