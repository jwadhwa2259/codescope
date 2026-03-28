import { defineConfig } from "tsdown";
export default defineConfig({
  entry: [
    "src/server.ts",
    "src/hooks/pre-tool-use.ts",
    "src/hooks/post-tool-use.ts",
  ],
  format: "esm",
  outDir: "dist",
  external: ["better-sqlite3"],
  clean: true,
});
