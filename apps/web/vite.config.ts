import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  optimizeDeps: {
    // Pre-bundle MathLive at startup so opening the equation editor doesn't reload the page.
    include: ["mathlive"],
    // MathJax's on-demand font ranges import the font module by relative path. Serving
    // MathJax unbundled keeps them and our import on the same module instance.
    exclude: ["@mathjax/src", "@mathjax/mathjax-newcm-font"],
  },
  server: {
    port: 5173,
    // The tutor API runs as a separate Hono server in dev.
    proxy: {
      "/api": "http://localhost:8787",
    },
  },
});
