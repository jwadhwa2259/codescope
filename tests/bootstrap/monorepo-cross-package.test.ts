/**
 * Integration test: monorepo cross-package import resolution.
 *
 * This test uses the REAL buildGraph (no mocks) to verify that
 * building a graph from the repo root with workspace aliases
 * correctly resolves cross-package imports and produces edges.
 *
 * Requires tree-sitter WASM grammars in grammars/ directory.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { buildGraph } from "../../src/graph/builder.js";
import { discoverWorkspacePackages, buildWorkspaceAliases } from "../../src/resolver/workspace.js";
import { openDatabase, closeDatabase } from "../../src/graph/database.js";

const grammarDir = path.resolve("grammars");
const grammarsExist =
  fs.existsSync(path.join(grammarDir, "tree-sitter-typescript.wasm")) &&
  fs.existsSync(path.join(grammarDir, "tree-sitter-javascript.wasm"));

describe.skipIf(!grammarsExist)(
  "monorepo cross-package import resolution (integration)",
  () => {
    let testRoot: string;
    let dbPath: string;
    let batchDir: string;

    beforeEach(() => {
      // Set grammar dir so parser can find WASM files
      process.env.CODESCOPE_GRAMMAR_DIR = grammarDir;

      testRoot = fs.mkdtempSync(
        path.join(os.tmpdir(), "codescope-mono-cross-pkg-"),
      );

      // Create workspace structure:
      // packages/core/package.json  (name: @test/core)
      // packages/core/src/index.ts  (export function coreHelper)
      // packages/ui/package.json    (name: @test/ui)
      // packages/ui/src/index.ts    (import { coreHelper } from "@test/core")

      // Root package.json
      fs.writeFileSync(
        path.join(testRoot, "package.json"),
        JSON.stringify({
          name: "test-monorepo",
          private: true,
          workspaces: ["packages/*"],
        }),
      );

      // pnpm-workspace.yaml
      fs.writeFileSync(
        path.join(testRoot, "pnpm-workspace.yaml"),
        "packages:\n  - packages/*\n",
      );

      // packages/core
      const coreSrc = path.join(testRoot, "packages", "core", "src");
      fs.mkdirSync(coreSrc, { recursive: true });
      fs.writeFileSync(
        path.join(testRoot, "packages", "core", "package.json"),
        JSON.stringify({
          name: "@test/core",
          main: "src/index.ts",
          exports: { ".": "./src/index.ts" },
        }),
      );
      fs.writeFileSync(
        path.join(coreSrc, "index.ts"),
        `export function coreHelper(): string {\n  return "hello";\n}\n`,
      );

      // packages/ui
      const uiSrc = path.join(testRoot, "packages", "ui", "src");
      fs.mkdirSync(uiSrc, { recursive: true });
      fs.writeFileSync(
        path.join(testRoot, "packages", "ui", "package.json"),
        JSON.stringify({
          name: "@test/ui",
          main: "src/index.ts",
          exports: { ".": "./src/index.ts" },
        }),
      );
      fs.writeFileSync(
        path.join(uiSrc, "index.ts"),
        `import { coreHelper } from "@test/core";\n\nexport function render(): string {\n  return coreHelper();\n}\n`,
      );

      // DB and batch dirs
      const csDir = path.join(testRoot, ".claude", "codescope");
      fs.mkdirSync(csDir, { recursive: true });
      dbPath = path.join(csDir, "graph.db");
      batchDir = path.join(csDir, "batch");
      fs.mkdirSync(batchDir, { recursive: true });
    });

    afterEach(() => {
      delete process.env.CODESCOPE_GRAMMAR_DIR;
      fs.rmSync(testRoot, { recursive: true, force: true });
    });

    it("cross-package imports produce edges when projectRoot is repo root", async () => {
      // Build workspace aliases (simulating what orchestrator does)
      const packages = discoverWorkspacePackages(testRoot, ["packages/*"]);
      const aliases = buildWorkspaceAliases(testRoot, packages);

      // Should have found both packages
      expect(Object.keys(aliases)).toContain("@test/core");
      expect(Object.keys(aliases)).toContain("@test/ui");

      // Build graph from repo root with workspace aliases
      const result = await buildGraph({
        projectRoot: testRoot,
        dbPath,
        batchDir,
        workspaceAliases: aliases,
      });

      // Should have file nodes for BOTH packages
      expect(result.filesProcessed).toBeGreaterThanOrEqual(2);

      // Should have edges -- cross-package imports should be resolved
      expect(result.edgesCreated).toBeGreaterThan(0);

      // Verify edge data in DB: at least one IMPORTS edge should exist
      const db = openDatabase(dbPath);
      try {
        const importEdges = db
          .prepare("SELECT COUNT(*) as count FROM edges WHERE kind = 'IMPORTS'")
          .get() as { count: number };
        expect(importEdges.count).toBeGreaterThan(0);

        // Verify nodes from both packages exist
        const coreNodes = db
          .prepare(
            "SELECT COUNT(*) as count FROM nodes WHERE file_path LIKE 'packages/core/%'",
          )
          .get() as { count: number };
        const uiNodes = db
          .prepare(
            "SELECT COUNT(*) as count FROM nodes WHERE file_path LIKE 'packages/ui/%'",
          )
          .get() as { count: number };
        expect(coreNodes.count).toBeGreaterThan(0);
        expect(uiNodes.count).toBeGreaterThan(0);
      } finally {
        closeDatabase(db);
      }
    });

    it("per-service graph (packages/ui only) produces 0 cross-package edges", async () => {
      // Build graph from packages/ui only (per-service approach -- the old behavior)
      const uiRoot = path.join(testRoot, "packages", "ui");
      const uiDbPath = path.join(uiRoot, ".codescope", "graph.db");
      const uiBatchDir = path.join(uiRoot, ".codescope", "batch");
      fs.mkdirSync(path.dirname(uiDbPath), { recursive: true });
      fs.mkdirSync(uiBatchDir, { recursive: true });

      const result = await buildGraph({
        projectRoot: uiRoot,
        dbPath: uiDbPath,
        batchDir: uiBatchDir,
        // No workspace aliases -- per-service build doesn't have them
      });

      // Should process ui files
      expect(result.filesProcessed).toBeGreaterThanOrEqual(1);

      // Should have 0 IMPORTS edges because @test/core resolves outside packages/ui
      const db = openDatabase(uiDbPath);
      try {
        const importEdges = db
          .prepare("SELECT COUNT(*) as count FROM edges WHERE kind = 'IMPORTS'")
          .get() as { count: number };
        expect(importEdges.count).toBe(0);
      } finally {
        closeDatabase(db);
      }
    });
  },
);
