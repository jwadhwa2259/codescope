import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from "vitest";
import * as os from "node:os";
import * as path from "node:path";
import * as fs from "node:fs";
import * as crypto from "node:crypto";
import { openDatabase, closeDatabase } from "../../src/graph/database.js";
import { createSchema } from "../../src/graph/schema.js";
import type { Database as DatabaseType } from "better-sqlite3";
import { buildGraph, type BuildGraphOptions, type BuildGraphResult } from "../../src/graph/builder.js";

const grammarDir = path.resolve("grammars");
const grammarsExist =
  fs.existsSync(path.join(grammarDir, "tree-sitter-typescript.wasm")) &&
  fs.existsSync(path.join(grammarDir, "tree-sitter-javascript.wasm")) &&
  fs.existsSync(path.join(grammarDir, "tree-sitter-python.wasm"));

function tmpDir(): string {
  const dir = path.join(os.tmpdir(), `codescope-builder-test-${crypto.randomUUID()}`);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function tmpDbPath(): string {
  return path.join(os.tmpdir(), `codescope-builder-test-${crypto.randomUUID()}.db`);
}

function cleanupDb(dbPath: string): void {
  try {
    if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
    const walPath = dbPath + "-wal";
    const shmPath = dbPath + "-shm";
    if (fs.existsSync(walPath)) fs.unlinkSync(walPath);
    if (fs.existsSync(shmPath)) fs.unlinkSync(shmPath);
  } catch {
    // cleanup best-effort
  }
}

/**
 * Creates a fixture directory with TypeScript files that import each other.
 * Structure:
 *   src/
 *     app.ts        - imports from ./utils, exports greet function
 *     utils.ts      - exports helper function, imports from ./types
 *     types.ts      - exports interface and constant
 *     node_modules/
 *       dep.ts      - should be ignored
 *     broken.xyz    - unsupported extension, should be ignored
 */
function createFixtureDir(): string {
  const root = tmpDir();
  const srcDir = path.join(root, "src");
  fs.mkdirSync(srcDir, { recursive: true });

  // app.ts - imports from utils
  fs.writeFileSync(
    path.join(srcDir, "app.ts"),
    `import { helper } from "./utils";

export function greet(name: string): string {
  return helper(name);
}

export class App {
  run(): void {
    console.log("running");
  }
}
`,
    "utf-8"
  );

  // utils.ts - imports from types, exports helper
  fs.writeFileSync(
    path.join(srcDir, "utils.ts"),
    `import { Config } from "./types";

export function helper(name: string): string {
  return "Hello, " + name;
}

export const VERSION = "1.0.0";
`,
    "utf-8"
  );

  // types.ts - exports interface and constant
  fs.writeFileSync(
    path.join(srcDir, "types.ts"),
    `export interface Config {
  name: string;
  debug: boolean;
}

export const DEFAULT_NAME = "World";
`,
    "utf-8"
  );

  // node_modules directory with a file (should be skipped)
  const nmDir = path.join(srcDir, "node_modules");
  fs.mkdirSync(nmDir, { recursive: true });
  fs.writeFileSync(
    path.join(nmDir, "dep.ts"),
    `export const dep = true;`,
    "utf-8"
  );

  // Unsupported extension (should be skipped)
  fs.writeFileSync(
    path.join(srcDir, "broken.xyz"),
    `this is not a supported file`,
    "utf-8"
  );

  return root;
}

describe.skipIf(!grammarsExist)("buildGraph", () => {
  let fixtureDir: string;
  let dbPath: string;
  let batchDir: string;

  beforeAll(() => {
    process.env.CODESCOPE_GRAMMAR_DIR = grammarDir;
  });

  afterAll(() => {
    delete process.env.CODESCOPE_GRAMMAR_DIR;
  });

  beforeEach(() => {
    fixtureDir = createFixtureDir();
    dbPath = tmpDbPath();
    batchDir = tmpDir();
  });

  afterEach(() => {
    try {
      fs.rmSync(fixtureDir, { recursive: true, force: true });
    } catch { /* cleanup */ }
    cleanupDb(dbPath);
    try {
      fs.rmSync(batchDir, { recursive: true, force: true });
    } catch { /* cleanup */ }
  });

  it("produces correct node count (file nodes + function nodes + class nodes)", async () => {
    const result = await buildGraph({
      projectRoot: fixtureDir,
      dbPath,
      batchDir,
    });

    // 3 file nodes (app.ts, utils.ts, types.ts)
    // 2 function nodes (greet, helper)
    // 1 class node (App)
    // 2 exported variables (VERSION, DEFAULT_NAME) -- these are exported so they get nodes
    // Config is an interface, not extracted as a variable
    expect(result.nodesCreated).toBeGreaterThanOrEqual(6);

    // Verify the database has file nodes
    const db = openDatabase(dbPath);
    try {
      const fileNodes = db
        .prepare("SELECT * FROM nodes WHERE kind = 'file'")
        .all() as any[];
      expect(fileNodes).toHaveLength(3);

      const functionNodes = db
        .prepare("SELECT * FROM nodes WHERE kind = 'function'")
        .all() as any[];
      expect(functionNodes.length).toBeGreaterThanOrEqual(2);
    } finally {
      closeDatabase(db);
    }
  });

  it("creates IMPORTS edges between files that import from each other", async () => {
    await buildGraph({
      projectRoot: fixtureDir,
      dbPath,
      batchDir,
    });

    const db = openDatabase(dbPath);
    try {
      const importEdges = db
        .prepare("SELECT e.*, sn.file_path as src_path, tn.file_path as tgt_path FROM edges e JOIN nodes sn ON e.source_id = sn.id JOIN nodes tn ON e.target_id = tn.id WHERE e.kind = 'IMPORTS'")
        .all() as any[];

      // app.ts imports from utils.ts, utils.ts imports from types.ts
      expect(importEdges.length).toBeGreaterThanOrEqual(2);
    } finally {
      closeDatabase(db);
    }
  });

  it("creates CONTAINS edges from file nodes to their function/class children", async () => {
    await buildGraph({
      projectRoot: fixtureDir,
      dbPath,
      batchDir,
    });

    const db = openDatabase(dbPath);
    try {
      const containsEdges = db
        .prepare("SELECT e.*, sn.name as src_name, tn.name as tgt_name FROM edges e JOIN nodes sn ON e.source_id = sn.id JOIN nodes tn ON e.target_id = tn.id WHERE e.kind = 'CONTAINS'")
        .all() as any[];

      // app.ts CONTAINS greet, App
      // utils.ts CONTAINS helper
      expect(containsEdges.length).toBeGreaterThanOrEqual(3);
    } finally {
      closeDatabase(db);
    }
  });

  it("skips files in DEFAULT_IGNORE directories (node_modules, dist, .git)", async () => {
    const result = await buildGraph({
      projectRoot: fixtureDir,
      dbPath,
      batchDir,
    });

    const db = openDatabase(dbPath);
    try {
      // Should not have any node with file_path containing node_modules
      const nmNodes = db
        .prepare("SELECT * FROM nodes WHERE file_path LIKE '%node_modules%'")
        .all() as any[];
      expect(nmNodes).toHaveLength(0);
    } finally {
      closeDatabase(db);
    }
  });

  it("handles files with parse errors gracefully (logs error, continues)", async () => {
    // Create a file with broken syntax
    const srcDir = path.join(fixtureDir, "src");
    fs.writeFileSync(
      path.join(srcDir, "broken.ts"),
      `export function {{{{{ totally broken syntax
      not valid at all!!!
      `,
      "utf-8"
    );

    const result = await buildGraph({
      projectRoot: fixtureDir,
      dbPath,
      batchDir,
    });

    // Should still process the valid files
    expect(result.filesProcessed).toBeGreaterThanOrEqual(3);
    // The broken file may or may not create a file node, but should not crash
    expect(result.nodesCreated).toBeGreaterThanOrEqual(6);
  });

  it("walkSourceFiles returns only files with supported extensions (.ts, .js, .py)", async () => {
    // The .xyz file should be excluded
    const result = await buildGraph({
      projectRoot: fixtureDir,
      dbPath,
      batchDir,
    });

    const db = openDatabase(dbPath);
    try {
      const allFileNodes = db
        .prepare("SELECT * FROM nodes WHERE kind = 'file'")
        .all() as any[];

      // Only .ts files, no .xyz
      for (const node of allFileNodes) {
        expect(
          node.file_path.endsWith(".ts") ||
          node.file_path.endsWith(".js") ||
          node.file_path.endsWith(".py")
        ).toBe(true);
      }
    } finally {
      closeDatabase(db);
    }
  });

  it("produces IMPORTS edges for TypeScript project without tsconfig.json", async () => {
    // Create a fresh fixture with no tsconfig.json
    const noTsconfigRoot = tmpDir();
    const noTsconfigSrc = path.join(noTsconfigRoot, "src");
    fs.mkdirSync(noTsconfigSrc, { recursive: true });

    // index.ts imports from ./utils via relative path
    fs.writeFileSync(
      path.join(noTsconfigSrc, "index.ts"),
      `import { helper } from "./utils";\n\nexport function main(): string {\n  return helper("world");\n}\n`,
      "utf-8",
    );

    // utils.ts exports helper, imports from ./config
    fs.writeFileSync(
      path.join(noTsconfigSrc, "utils.ts"),
      `import { prefix } from "./config";\n\nexport function helper(name: string): string {\n  return prefix + name;\n}\n`,
      "utf-8",
    );

    // config.ts exports prefix
    fs.writeFileSync(
      path.join(noTsconfigSrc, "config.ts"),
      `export const prefix = "Hello, ";\n`,
      "utf-8",
    );

    // No tsconfig.json exists in noTsconfigRoot

    const noTsconfigDbPath = tmpDbPath();
    const noTsconfigBatchDir = tmpDir();

    try {
      const result = await buildGraph({
        projectRoot: noTsconfigRoot,
        dbPath: noTsconfigDbPath,
        batchDir: noTsconfigBatchDir,
      });

      // Must have processed all 3 files
      expect(result.filesProcessed).toBe(3);

      // Critical: IMPORTS edges must be > 0 even without tsconfig.json
      // index.ts -> utils.ts and utils.ts -> config.ts = at least 2 IMPORTS edges
      expect(result.edgesCreated).toBeGreaterThanOrEqual(2);

      // Verify in DB
      const db = openDatabase(noTsconfigDbPath);
      try {
        const importEdges = db
          .prepare("SELECT COUNT(*) as count FROM edges e JOIN nodes sn ON e.source_id = sn.id JOIN nodes tn ON e.target_id = tn.id WHERE e.kind = 'IMPORTS'")
          .get() as { count: number };
        expect(importEdges.count).toBeGreaterThanOrEqual(2);
      } finally {
        closeDatabase(db);
      }
    } finally {
      cleanupDb(noTsconfigDbPath);
      try { fs.rmSync(noTsconfigRoot, { recursive: true, force: true }); } catch { /* cleanup */ }
      try { fs.rmSync(noTsconfigBatchDir, { recursive: true, force: true }); } catch { /* cleanup */ }
    }
  });

  it("buildGraph result includes correct filesProcessed, nodesCreated, edgesCreated counts", async () => {
    const result = await buildGraph({
      projectRoot: fixtureDir,
      dbPath,
      batchDir,
    });

    expect(result.filesProcessed).toBe(3); // app.ts, utils.ts, types.ts
    expect(result.nodesCreated).toBeGreaterThanOrEqual(6);
    expect(result.edgesCreated).toBeGreaterThanOrEqual(2);
    expect(result.durationMs).toBeGreaterThan(0);
    expect(result.errors).toBeDefined();
    expect(Array.isArray(result.errors)).toBe(true);
  });
});
