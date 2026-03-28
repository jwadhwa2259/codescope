import { describe, it, expect, afterEach, beforeEach } from "vitest";
import * as os from "node:os";
import * as path from "node:path";
import * as fs from "node:fs";
import * as crypto from "node:crypto";
import { openDatabase, closeDatabase } from "../../src/graph/database.js";
import { createSchema } from "../../src/graph/schema.js";
import type { Database as DatabaseType } from "better-sqlite3";
import {
  computeFileHash,
  updateFileHash,
} from "../../src/graph/file-hash.js";
import { getGraph, invalidateCache } from "../../src/graph/cache.js";
import { buildGraph } from "../../src/graph/builder.js";

// Check if grammar WASM files exist (needed for tree-sitter parsing)
const grammarDir = path.resolve("grammars");
const grammarsExist =
  fs.existsSync(path.join(grammarDir, "tree-sitter-typescript.wasm")) &&
  fs.existsSync(path.join(grammarDir, "tree-sitter-javascript.wasm"));

function cleanupDir(dirPath: string): void {
  try {
    if (dirPath && fs.existsSync(dirPath)) {
      fs.rmSync(dirPath, { recursive: true, force: true });
    }
  } catch {
    // cleanup best-effort
  }
}

describe.skipIf(!grammarsExist)("Staleness integration (end-to-end)", () => {
  let tmpDir: string;

  beforeEach(() => {
    invalidateCache();
  });

  afterEach(() => {
    invalidateCache();
    if (tmpDir) cleanupDir(tmpDir);
  });

  it("modify a file on disk, call getGraph with that file, verify updated data returned", async () => {
    // Setup: create a temp project with a source file
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "staleness-int-"));
    const srcDir = path.join(tmpDir, "src");
    const codescopePath = path.join(tmpDir, ".claude", "codescope");
    const batchDir = path.join(codescopePath, "batches");
    const dbPath = path.join(codescopePath, "graph.db");

    fs.mkdirSync(srcDir, { recursive: true });
    fs.mkdirSync(batchDir, { recursive: true });

    // Create initial source file with function "original"
    const sourceFile = path.join(srcDir, "target.ts");
    fs.writeFileSync(sourceFile, `export function original() {\n  return 1;\n}\n`, "utf-8");

    // Build the graph using the real builder
    await buildGraph({
      projectRoot: tmpDir,
      dbPath,
      batchDir,
      ignorePatterns: [],
    });

    // Store the initial hash
    const db = openDatabase(dbPath);
    try {
      const hash = computeFileHash(sourceFile)!;
      updateFileHash(db, "src/target.ts", hash);
    } finally {
      closeDatabase(db);
    }

    // Load graph and verify original function exists
    const firstLoad = await getGraph(tmpDir, ["src/target.ts"]);
    let hasOriginal = false;
    firstLoad.graph.forEachNode((_id: string, attrs: Record<string, unknown>) => {
      if (attrs.name === "original" && attrs.kind === "function") {
        hasOriginal = true;
      }
    });
    expect(hasOriginal).toBe(true);

    // Modify the file: replace "original" with "updated"
    fs.writeFileSync(sourceFile, `export function updated() {\n  return 2;\n}\n`, "utf-8");

    // Invalidate cache to force reload
    invalidateCache();

    // Call getGraph with the modified file -- should detect staleness and rebuild
    const secondLoad = await getGraph(tmpDir, ["src/target.ts"]);

    // The "updated" function should now exist
    let hasUpdated = false;
    secondLoad.graph.forEachNode((_id: string, attrs: Record<string, unknown>) => {
      if (attrs.name === "updated" && attrs.kind === "function") {
        hasUpdated = true;
      }
    });
    expect(hasUpdated).toBe(true);

    // The "original" function should no longer exist
    let stillHasOriginal = false;
    secondLoad.graph.forEachNode((_id: string, attrs: Record<string, unknown>) => {
      if (attrs.name === "original" && attrs.kind === "function") {
        stillHasOriginal = true;
      }
    });
    expect(stillHasOriginal).toBe(false);
  });

  it("getGraph without queriedFiles returns cached data without staleness check", async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "staleness-int-"));
    const srcDir = path.join(tmpDir, "src");
    const codescopePath = path.join(tmpDir, ".claude", "codescope");
    const batchDir = path.join(codescopePath, "batches");
    const dbPath = path.join(codescopePath, "graph.db");

    fs.mkdirSync(srcDir, { recursive: true });
    fs.mkdirSync(batchDir, { recursive: true });

    fs.writeFileSync(path.join(srcDir, "simple.ts"), `export const x = 1;\n`, "utf-8");

    await buildGraph({
      projectRoot: tmpDir,
      dbPath,
      batchDir,
      ignorePatterns: [],
    });

    // First call loads from db
    const first = await getGraph(tmpDir);
    // Second call returns cached (same reference)
    const second = await getGraph(tmpDir);

    expect(first.graph).toBe(second.graph);
    expect(first.centralities).toBe(second.centralities);
  });

  it("getGraph with queriedFiles scopes staleness check to those files only", async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "staleness-int-"));
    const srcDir = path.join(tmpDir, "src");
    const codescopePath = path.join(tmpDir, ".claude", "codescope");
    const batchDir = path.join(codescopePath, "batches");
    const dbPath = path.join(codescopePath, "graph.db");

    fs.mkdirSync(srcDir, { recursive: true });
    fs.mkdirSync(batchDir, { recursive: true });

    // Create two files
    fs.writeFileSync(path.join(srcDir, "a.ts"), `export function funcA() {}\n`, "utf-8");
    fs.writeFileSync(path.join(srcDir, "b.ts"), `export function funcB() {}\n`, "utf-8");

    await buildGraph({
      projectRoot: tmpDir,
      dbPath,
      batchDir,
      ignorePatterns: [],
    });

    // Store hashes for both files
    const db = openDatabase(dbPath);
    try {
      updateFileHash(db, "src/a.ts", computeFileHash(path.join(srcDir, "a.ts"))!);
      updateFileHash(db, "src/b.ts", computeFileHash(path.join(srcDir, "b.ts"))!);
    } finally {
      closeDatabase(db);
    }

    // Modify file a.ts but query with b.ts scope -- should NOT trigger rebuild of a.ts
    invalidateCache();
    fs.writeFileSync(path.join(srcDir, "a.ts"), `export function funcAModified() {}\n`, "utf-8");

    // Query only b.ts -- a.ts staleness should not be checked
    const result = await getGraph(tmpDir, ["src/b.ts"]);

    // funcA should still be in the graph (old version) since we didn't check a.ts
    let hasFuncA = false;
    result.graph.forEachNode((_id: string, attrs: Record<string, unknown>) => {
      if (attrs.name === "funcA" && attrs.kind === "function") {
        hasFuncA = true;
      }
    });
    expect(hasFuncA).toBe(true);
  });
});
