import path from "node:path";
import contentCollections from "@content-collections/vite";
import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, type PluginOption } from "vite";

export default defineConfig({
  plugins: [
    tailwindcss(),
    tanstackRouter({}),
    react(),
    contentCollections() as PluginOption,
  ],
  resolve: {
    alias: {
      // `import.meta.dirname` is the ESM equivalent of `__dirname`, which is
      // not defined in this package ("type": "module").
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
});
