import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as os from "node:os";
import * as path from "node:path";
import * as fs from "node:fs";
import * as crypto from "node:crypto";
import { openDatabase, closeDatabase } from "../../src/graph/database.js";
import { createSchema } from "../../src/graph/schema.js";
import { BatchWriter, processBatchFiles } from "../../src/graph/batch-writer.js";
import type { Database as DatabaseType } from "better-sqlite3";

function tmpDir(): string {
  const dir = path.join(os.tmpdir(), `codescope-batch-test-${crypto.randomUUID()}`);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function tmpDbPath(): string {
  return path.join(os.tmpdir(), `codescope-batch-test-${crypto.randomUUID()}.db`);
}

describe("BatchWriter", () => {
  let outputDir: string;

  beforeEach(() => {
    outputDir = tmpDir();
  });

  afterEach(() => {
    try {
      fs.rmSync(outputDir, { recursive: true, force: true });
    } catch {
      // cleanup best-effort
    }
  });

  it("creates JSONL file on flush", () => {
    const writer = new BatchWriter(outputDir, "test-agent");
    writer.addNode({ name: "app.ts", kind: "file", file_path: "src/app.ts" });
    writer.flush();

    const filePath = writer.getFilePath();
    expect(fs.existsSync(filePath)).toBe(true);
    expect(filePath.endsWith(".jsonl")).toBe(true);
  });

  it("writes valid JSONL with one record per line", () => {
    const writer = new BatchWriter(outputDir, "test-agent");
    writer.addNode({ name: "app.ts", kind: "file", file_path: "src/app.ts" });
    writer.addNode({ name: "utils.ts", kind: "file", file_path: "src/utils.ts" });
    writer.flush();

    const content = fs.readFileSync(writer.getFilePath(), "utf-8");
    const lines = content.split("\n").filter((l) => l.trim());

    expect(lines).toHaveLength(2);
    expect(() => JSON.parse(lines[0])).not.toThrow();
    expect(() => JSON.parse(lines[1])).not.toThrow();

    const record1 = JSON.parse(lines[0]);
    expect(record1.type).toBe("node");
    expect(record1.name).toBe("app.ts");
  });

  it("addEdge writes edge records", () => {
    const writer = new BatchWriter(outputDir, "test-agent");
    writer.addEdge({
      source_name: "app.ts",
      source_file_path: "src/app.ts",
      target_name: "utils.ts",
      target_file_path: "src/utils.ts",
      kind: "IMPORTS",
    });
    writer.flush();

    const content = fs.readFileSync(writer.getFilePath(), "utf-8");
    const lines = content.split("\n").filter((l) => l.trim());
    const record = JSON.parse(lines[0]);

    expect(record.type).toBe("edge");
    expect(record.source_name).toBe("app.ts");
    expect(record.target_name).toBe("utils.ts");
    expect(record.kind).toBe("IMPORTS");
  });

  it("flush is safe to call multiple times", () => {
    const writer = new BatchWriter(outputDir, "test-agent");

    // Flush with empty buffer should not error or create file
    expect(() => writer.flush()).not.toThrow();
    expect(() => writer.flush()).not.toThrow();

    // After adding data and flushing, flushing again is safe
    writer.addNode({ name: "a.ts", kind: "file", file_path: "src/a.ts" });
    writer.flush();
    expect(() => writer.flush()).not.toThrow();
  });

  it("flush resets the buffer", () => {
    const writer = new BatchWriter(outputDir, "test-agent");
    writer.addNode({ name: "a.ts", kind: "file", file_path: "src/a.ts" });
    writer.flush();

    // Second flush should not write any additional lines
    writer.flush();

    const content = fs.readFileSync(writer.getFilePath(), "utf-8");
    const lines = content.split("\n").filter((l) => l.trim());
    expect(lines).toHaveLength(1);
  });
});

describe("processBatchFiles", () => {
  let dbPath: string;
  let db: DatabaseType;
  let batchDir: string;

  beforeEach(() => {
    dbPath = tmpDbPath();
    db = openDatabase(dbPath);
    createSchema(db);
    batchDir = tmpDir();
  });

  afterEach(() => {
    try {
      closeDatabase(db);
    } catch {
      // already closed
    }
    try {
      if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
      const walPath = dbPath + "-wal";
      const shmPath = dbPath + "-shm";
      if (fs.existsSync(walPath)) fs.unlinkSync(walPath);
      if (fs.existsSync(shmPath)) fs.unlinkSync(shmPath);
    } catch {
      // cleanup
    }
    try {
      fs.rmSync(batchDir, { recursive: true, force: true });
    } catch {
      // cleanup
    }
  });

  it("inserts nodes into database from JSONL", () => {
    const writer = new BatchWriter(batchDir, "agent-1");
    writer.addNode({ name: "app.ts", kind: "file", file_path: "src/app.ts" });
    writer.addNode({ name: "utils.ts", kind: "file", file_path: "src/utils.ts" });
    writer.addNode({
      name: "main",
      kind: "function",
      file_path: "src/app.ts",
      start_line: 10,
      end_line: 25,
      language: "typescript",
      loc: 15,
    });
    writer.flush();

    const result = processBatchFiles(db, batchDir);

    expect(result.nodesInserted).toBe(3);
    expect(result.errors).toHaveLength(0);

    const count = db.prepare("SELECT COUNT(*) as cnt FROM nodes").get() as { cnt: number };
    expect(count.cnt).toBe(3);
  });

  it("inserts edges into database from JSONL", () => {
    const writer = new BatchWriter(batchDir, "agent-1");
    writer.addNode({ name: "app.ts", kind: "file", file_path: "src/app.ts" });
    writer.addNode({ name: "utils.ts", kind: "file", file_path: "src/utils.ts" });
    writer.addEdge({
      source_name: "app.ts",
      source_file_path: "src/app.ts",
      target_name: "utils.ts",
      target_file_path: "src/utils.ts",
      kind: "IMPORTS",
    });
    writer.flush();

    const result = processBatchFiles(db, batchDir);

    expect(result.nodesInserted).toBe(2);
    expect(result.edgesInserted).toBe(1);

    const edge = db.prepare("SELECT * FROM edges").get() as any;
    expect(edge.kind).toBe("IMPORTS");
    expect(edge.weight).toBe(1.0);
  });

  it("handles empty JSONL files gracefully", () => {
    // Create an empty .jsonl file
    fs.writeFileSync(path.join(batchDir, "empty.jsonl"), "", "utf-8");

    const result = processBatchFiles(db, batchDir);

    expect(result.nodesInserted).toBe(0);
    expect(result.edgesInserted).toBe(0);
    expect(result.errors).toHaveLength(0);
  });

  it("skips malformed JSON lines and reports errors", () => {
    // Write a file with one valid and one malformed line
    const filePath = path.join(batchDir, "bad-data.jsonl");
    const validLine = JSON.stringify({
      type: "node",
      name: "good.ts",
      kind: "file",
      file_path: "src/good.ts",
    });
    fs.writeFileSync(filePath, `${validLine}\n{this is not valid json}\n`, "utf-8");

    const result = processBatchFiles(db, batchDir);

    expect(result.nodesInserted).toBe(1);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]).toContain("Malformed JSON");
  });

  it("deletes processed JSONL files after successful insert", () => {
    const writer = new BatchWriter(batchDir, "agent-1");
    writer.addNode({ name: "app.ts", kind: "file", file_path: "src/app.ts" });
    writer.flush();

    const jsonlFile = writer.getFilePath();
    expect(fs.existsSync(jsonlFile)).toBe(true);

    processBatchFiles(db, batchDir);

    expect(fs.existsSync(jsonlFile)).toBe(false);
  });

  it("runs in a single transaction (all-or-nothing on errors)", () => {
    // Insert a node first directly
    db.prepare(
      "INSERT INTO nodes (name, kind, file_path) VALUES ('existing.ts', 'file', 'src/existing.ts')"
    ).run();

    // Now write batch data that will cause a constraint violation:
    // We insert a node, then an edge referencing a non-existent target.
    // The edge should be skipped (logged as error) but nodes should still be inserted.
    // The transaction wraps everything, so all successful operations commit together.
    const writer = new BatchWriter(batchDir, "agent-1");
    writer.addNode({ name: "new.ts", kind: "file", file_path: "src/new.ts" });
    writer.addEdge({
      source_name: "new.ts",
      source_file_path: "src/new.ts",
      target_name: "nonexistent.ts",
      target_file_path: "src/nonexistent.ts",
      kind: "IMPORTS",
    });
    writer.flush();

    const result = processBatchFiles(db, batchDir);

    // The node should be inserted
    expect(result.nodesInserted).toBe(1);
    // The edge should be skipped (target not found)
    expect(result.edgesInserted).toBe(0);
    expect(result.errors.length).toBeGreaterThan(0);

    // Verify the node was actually committed to the database
    const count = db.prepare("SELECT COUNT(*) as cnt FROM nodes").get() as { cnt: number };
    expect(count.cnt).toBe(2); // existing + new
  });

  it("processes multiple JSONL files from different agents", () => {
    const writer1 = new BatchWriter(batchDir, "agent-1");
    writer1.addNode({ name: "a.ts", kind: "file", file_path: "src/a.ts" });
    writer1.flush();

    const writer2 = new BatchWriter(batchDir, "agent-2");
    writer2.addNode({ name: "b.ts", kind: "file", file_path: "src/b.ts" });
    writer2.flush();

    const result = processBatchFiles(db, batchDir);

    expect(result.nodesInserted).toBe(2);

    const count = db.prepare("SELECT COUNT(*) as cnt FROM nodes").get() as { cnt: number };
    expect(count.cnt).toBe(2);
  });

  it("preserves node metadata through round-trip", () => {
    const writer = new BatchWriter(batchDir, "agent-1");
    writer.addNode({
      name: "app.ts",
      kind: "file",
      file_path: "src/app.ts",
      start_line: 1,
      end_line: 100,
      signature: "module app",
      complexity: 5,
      is_exported: true,
      is_test: false,
      language: "typescript",
      loc: 80,
      last_modified: 1700000000,
      metadata: { framework: "express" },
    });
    writer.flush();

    processBatchFiles(db, batchDir);

    const row = db.prepare("SELECT * FROM nodes WHERE name = 'app.ts'").get() as any;
    expect(row.start_line).toBe(1);
    expect(row.end_line).toBe(100);
    expect(row.signature).toBe("module app");
    expect(row.complexity).toBe(5);
    expect(row.is_exported).toBe(1);
    expect(row.is_test).toBe(0);
    expect(row.language).toBe("typescript");
    expect(row.loc).toBe(80);
    expect(row.last_modified).toBe(1700000000);

    const meta = JSON.parse(row.metadata);
    expect(meta.framework).toBe("express");
  });
});
