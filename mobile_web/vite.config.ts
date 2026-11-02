import react from "@vitejs/plugin-react";
import { resolve } from "node:path";
import { defineConfig } from "vite";

// Builds into Rails' public/ so /m serves it without a Node runtime.
// Fixed file names: the Rails shell cache-busts with the bundle's mtime.
export default defineConfig({
  plugins: [react()],
  publicDir: "public",
  base: "/m-app/",
  build: {
    outDir: resolve(__dirname, "../public/m-app"),
    emptyOutDir: true,
    sourcemap: true,
    rollupOptions: {
      input: resolve(__dirname, "src/main.tsx"),
      output: {
        entryFileNames: "index.js",
        chunkFileNames: "chunk-[hash].js",
        assetFileNames: (info) => (info.name?.endsWith(".css") ? "index.css" : "[name]-[hash][extname]"),
      },
    },
  },
});
