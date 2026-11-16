import { defineConfig, lazyPlugins } from "vite-plus";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";

export default defineConfig({
  server: { port: 3000 },
  /* Start's plugin must come before React's. Prerendering writes the page as
     static HTML, so the build in dist/client can be served by any static host. */
  /* The 3D ship view (three.js) is a ~1 MB chunk, loaded only when a grid has placements. */
  build: { chunkSizeWarningLimit: 1100 },
  plugins: lazyPlugins(() => [tanstackStart({ prerender: { enabled: true } }), viteReact()]),
  test: {
    include: ["test/**/*.test.ts"],
  },
  fmt: {
    printWidth: 120,
    ignorePatterns: ["src/routeTree.gen.ts"],
  },
  lint: {
    ignorePatterns: ["src/routeTree.gen.ts"],
    jsPlugins: [{ name: "vite-plus", specifier: "vite-plus/oxlint-plugin" }],
    rules: { "vite-plus/prefer-vite-plus-imports": "error" },
    options: { typeAware: true, typeCheck: true },
  },
});
