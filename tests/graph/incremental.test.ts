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
  getStaleFiles,
} from "../../src/graph/file-hash.js";
import {
  rebuildStaleFiles,
  removeDeletedFile,
} from "../../src/graph/incremental.js";
import { invalidateCache } from "../../src/graph/cache.js";

// Check if grammar WASM files exist (needed for tree-sitter parsing)
const grammarDir = path.resolve("grammars");
const grammarsExist =
  fs.existsSync(path.join(grammarDir, "tree-sitter-typescript.wasm")) &&
  fs.existsSync(path.join(grammarDir, "tree-sitter-javascript.wasm"));

function tmpDbPath(): string {
  return path.join(os.tmpdir(), `codescope-incr-test-${crypto.randomUUID()}.db`);
}

function cleanupDb(dbPath: string): void {
  try {
    if (dbPath && fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
    const walPath = dbPath + "-wal";
    const shmPath = dbPath + "-shm";
    if (fs.existsSync(walPath)) fs.unlinkSync(walPath);
    if (fs.existsSync(shmPath)) fs.unlinkSync(shmPath);
  } catch {
    // cleanup best-effort
  }
}

/**
 * Insert a file node plus function nodes and edges directly into the database
 * (simulates what buildGraph would produce).
 */
function insertFileWithNodes(
  db: DatabaseType,
  filePath: string,
  functionNames: string[],
): void {
  const basename = path.basename(filePath);
  const insertNode = db.prepare(
    `INSERT INTO nodes (name, kind, file_path, start_line, end_line, language, loc, is_exported, is_test)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  const insertEdge = db.prepare(
    `INSERT INTO edges (source_id, target_id, kind, weight) VALUES (?, ?, ?, ?)`
  );

  // Insert file node
  const fileResult = insertNode.run(basename, "file", filePath, 1, 10, "typescript", 10, 0, 0);
  const fileId = Number(fileResult.lastInsertRowid);

  // Insert function nodes + CONTAINS edges
  for (let i = 0; i < functionNames.length; i++) {
    const funcResult = insertNode.run(functionNames[i], "function", filePath, i + 2, i + 5, "typescript", 3, 1, 0);
    const funcId = Number(funcResult.lastInsertRowid);
    insertEdge.run(fileId, funcId, "CONTAINS", 1.0);
  }
}

describe("Incremental reparse engine (src/graph/incremental.ts)", () => {
  let dbPath: string;
  let db: DatabaseType | null = null;
  let tmpDir: string;

  beforeEach(() => {
    process.env.CODESCOPE_GRAMMAR_DIR = grammarDir;
    invalidateCache();
  });

  afterEach(() => {
    delete process.env.CODESCOPE_GRAMMAR_DIR;
    try {
      if (db) closeDatabase(db);
    } catch {
      // already closed
    }
    db = null;
    if (dbPath) cleanupDb(dbPath);
    if (tmpDir && fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it.skipIf(!grammarsExist)("rebuildStaleFiles for a changed file deletes old nodes/edges and inserts fresh ones", async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "incr-test-"));
    dbPath = path.join(tmpDir, ".claude", "codescope", "graph.db");
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });

    // Create a TS source file
    const srcDir = path.join(tmpDir, "src");
    fs.mkdirSync(srcDir, { recursive: true });
    fs.writeFileSync(path.join(srcDir, "hello.ts"), `export function hello() {\n  return "world";\n}\n`, "utf-8");

    db = openDatabase(dbPath);
    createSchema(db);

    // Insert old data for this file
    insertFileWithNodes(db, "src/hello.ts", ["oldFunc"]);

    // Verify old data exists
    const oldNodes = (db.prepare("SELECT COUNT(*) as c FROM nodes WHERE file_path = ?").get("src/hello.ts") as { c: number }).c;
    expect(oldNodes).toBeGreaterThan(0);

    // Mark as stale and rebuild
    const result = await rebuildStaleFiles(db, ["src/hello.ts"], tmpDir);

    expect(result.rebuilt).toBe(1);
    expect(result.removed).toBe(0);

    // Old function should be gone, new "hello" function should exist
    const oldFunc = db.prepare("SELECT id FROM nodes WHERE name = 'oldFunc'").get();
    expect(oldFunc).toBeUndefined();

    // New function node "hello" should exist
    const newFunc = db.prepare("SELECT id FROM nodes WHERE name = 'hello' AND kind = 'function'").get();
    expect(newFunc).toBeDefined();
  });

  it.skipIf(!grammarsExist)("rebuildStaleFiles preserves nodes/edges for unchanged files", async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "incr-test-"));
    dbPath = path.join(tmpDir, ".claude", "codescope", "graph.db");
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });

    const srcDir = path.join(tmpDir, "src");
    fs.mkdirSync(srcDir, { recursive: true });
    fs.writeFileSync(path.join(srcDir, "changed.ts"), `export function changed() {}\n`, "utf-8");

    db = openDatabase(dbPath);
    createSchema(db);

    // Insert data for both a changed file and an unchanged file
    insertFileWithNodes(db, "src/changed.ts", ["changedFunc"]);
    insertFileWithNodes(db, "src/preserved.ts", ["preservedFunc"]);

    // Only rebuild changed.ts
    await rebuildStaleFiles(db, ["src/changed.ts"], tmpDir);

    // preserved.ts nodes should still exist
    const preserved = db.prepare("SELECT id FROM nodes WHERE name = 'preservedFunc'").get();
    expect(preserved).toBeDefined();
  });

  it.skipIf(!grammarsExist)("rebuildStaleFiles updates the file hash in file_hashes after rebuild", async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "incr-test-"));
    dbPath = path.join(tmpDir, ".claude", "codescope", "graph.db");
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });

    const srcDir = path.join(tmpDir, "src");
    fs.mkdirSync(srcDir, { recursive: true });
    const filePath = path.join(srcDir, "hashme.ts");
    fs.writeFileSync(filePath, `export const x = 1;\n`, "utf-8");

    db = openDatabase(dbPath);
    createSchema(db);

    // No initial hash
    const beforeHash = db.prepare("SELECT content_hash FROM file_hashes WHERE file_path = ?").get("src/hashme.ts");
    expect(beforeHash).toBeUndefined();

    await rebuildStaleFiles(db, ["src/hashme.ts"], tmpDir);

    // Hash should now be stored
    const afterHash = db.prepare("SELECT content_hash FROM file_hashes WHERE file_path = ?").get("src/hashme.ts") as { content_hash: string } | undefined;
    expect(afterHash).toBeDefined();
    expect(afterHash!.content_hash).toHaveLength(64);
  });

  it("rebuildStaleFiles for a deleted file removes all its nodes and its hash", async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "incr-test-"));
    dbPath = path.join(tmpDir, ".claude", "codescope", "graph.db");
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });

    db = openDatabase(dbPath);
    createSchema(db);

    // Insert data for a file that doesn't exist on disk
    insertFileWithNodes(db, "src/deleted.ts", ["deletedFunc"]);
    updateFileHash(db, "src/deleted.ts", "a".repeat(64));

    const result = await rebuildStaleFiles(db, ["src/deleted.ts"], tmpDir);

    expect(result.removed).toBe(1);
    expect(result.rebuilt).toBe(0);

    // No nodes should remain for this file
    const nodes = (db.prepare("SELECT COUNT(*) as c FROM nodes WHERE file_path = ?").get("src/deleted.ts") as { c: number }).c;
    expect(nodes).toBe(0);

    // No hash should remain
    const hash = db.prepare("SELECT content_hash FROM file_hashes WHERE file_path = ?").get("src/deleted.ts");
    expect(hash).toBeUndefined();
  });

  it.skipIf(!grammarsExist)("rebuildStaleFiles completes in under 2 seconds for a single file", async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "incr-test-"));
    dbPath = path.join(tmpDir, ".claude", "codescope", "graph.db");
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });

    const srcDir = path.join(tmpDir, "src");
    fs.mkdirSync(srcDir, { recursive: true });

    // Create a non-trivial TS file (~50 lines)
    const lines: string[] = [];
    for (let i = 0; i < 10; i++) {
      lines.push(`export function func${i}(x: number): number {\n  return x * ${i};\n}\n`);
    }
    fs.writeFileSync(path.join(srcDir, "perf.ts"), lines.join("\n"), "utf-8");

    db = openDatabase(dbPath);
    createSchema(db);

    const start = Date.now();
    await rebuildStaleFiles(db, ["src/perf.ts"], tmpDir);
    const elapsed = Date.now() - start;

    expect(elapsed).toBeLessThan(2000);
  });

  it("removeDeletedFile removes all nodes for the file and its file_hash entry", () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "incr-test-"));
    dbPath = path.join(tmpDir, ".claude", "codescope", "graph.db");
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });

    db = openDatabase(dbPath);
    createSchema(db);

    insertFileWithNodes(db, "src/to-remove.ts", ["removeMe"]);
    updateFileHash(db, "src/to-remove.ts", "b".repeat(64));

    removeDeletedFile(db, "src/to-remove.ts");

    const nodes = (db.prepare("SELECT COUNT(*) as c FROM nodes WHERE file_path = ?").get("src/to-remove.ts") as { c: number }).c;
    expect(nodes).toBe(0);

    const hash = db.prepare("SELECT content_hash FROM file_hashes WHERE file_path = ?").get("src/to-remove.ts");
    expect(hash).toBeUndefined();
  });
});
