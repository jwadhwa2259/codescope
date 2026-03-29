import { defineConfig } from "tsdown";
export default defineConfig([
  {
    entry: [
      "src/server.ts",
      "src/hooks/pre-tool-use.ts",
      "src/hooks/post-tool-use.ts",
      "src/hooks/pre-compact.ts",
      "src/hooks/session-start.ts",
      "src/enforcement/pre-commit-check.ts",
      "src/session/handoff-generator.ts",
      "src/session/handoff-parser.ts",
      "src/session/session-cleanup.ts",
      "src/dashboard/server.ts",
    ],
    format: "esm",
    outDir: "dist",
    external: ["better-sqlite3"],
    clean: true,
  },
  {
    entry: ["src/dashboard/client/app.ts"],
    format: "esm",
    outDir: "dist/dashboard",
    platform: "browser",
    noExternal: [/(.*)/],
    clean: false,
  },
  {
    entry: ["src/cli/cli.ts"],
    format: "esm",
    outDir: "dist",
    external: ["better-sqlite3"],
    clean: false,
    banner: { js: "#!/usr/bin/env node" },
  },
]);
