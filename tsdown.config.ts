import { defineConfig } from "tsdown";
export default defineConfig({
  entry: ["src/server.ts"],
  format: "esm",
  outDir: "dist",
  external: ["better-sqlite3"],
  clean: true,
});
