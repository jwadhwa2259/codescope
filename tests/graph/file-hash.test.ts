import { describe, it, expect, afterEach } from "vitest";
import * as os from "node:os";
import * as path from "node:path";
import * as fs from "node:fs";
import * as crypto from "node:crypto";
import { openDatabase, closeDatabase } from "../../src/graph/database.js";
import type { Database as DatabaseType } from "better-sqlite3";
import {
  computeFileHash,
  getStaleFiles,
  updateFileHash,
  removeFileHash,
} from "../../src/graph/file-hash.js";

function tmpDbPath(): string {
  return path.join(os.tmpdir(), `codescope-hash-test-${crypto.randomUUID()}.db`);
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

describe("File hashing module (src/graph/file-hash.ts)", () => {
  let dbPath: string;
  let db: DatabaseType | null = null;
  let tmpDir: string;

  function createTestDb(): DatabaseType {
    dbPath = tmpDbPath();
    db = openDatabase(dbPath);
    return db;
  }

  afterEach(() => {
    try {
      if (db) closeDatabase(db);
    } catch {
      // already closed
    }
    db = null;
    if (dbPath) cleanupDb(dbPath);
  });

  describe("computeFileHash", () => {
    afterEach(() => {
      // Clean up tmp files created during tests
      if (tmpDir && fs.existsSync(tmpDir)) {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    });

    it("returns a 64-character hex SHA-256 string for an existing file", () => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "hash-test-"));
      const filePath = path.join(tmpDir, "test.ts");
      fs.writeFileSync(filePath, 'export const x = 42;\n', "utf-8");

      const hash = computeFileHash(filePath);

      expect(hash).not.toBeNull();
      expect(hash!).toHaveLength(64);
      expect(hash!).toMatch(/^[0-9a-f]{64}$/);
    });

    it("returns null for a non-existent file", () => {
      const hash = computeFileHash("/tmp/nonexistent-file-" + crypto.randomUUID() + ".ts");
      expect(hash).toBeNull();
    });

    it("returns different hashes for different file contents", () => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "hash-test-"));
      const file1 = path.join(tmpDir, "a.ts");
      const file2 = path.join(tmpDir, "b.ts");
      fs.writeFileSync(file1, "const a = 1;\n", "utf-8");
      fs.writeFileSync(file2, "const b = 2;\n", "utf-8");

      const hash1 = computeFileHash(file1);
      const hash2 = computeFileHash(file2);

      expect(hash1).not.toBeNull();
      expect(hash2).not.toBeNull();
      expect(hash1).not.toBe(hash2);
    });

    it("returns the same hash for identical file contents", () => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "hash-test-"));
      const file1 = path.join(tmpDir, "a.ts");
      const file2 = path.join(tmpDir, "b.ts");
      const content = "const same = true;\n";
      fs.writeFileSync(file1, content, "utf-8");
      fs.writeFileSync(file2, content, "utf-8");

      const hash1 = computeFileHash(file1);
      const hash2 = computeFileHash(file2);

      expect(hash1).toBe(hash2);
    });
  });

  describe("getStaleFiles", () => {
    afterEach(() => {
      if (tmpDir && fs.existsSync(tmpDir)) {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    });

    it("returns empty array when all stored hashes match current files", () => {
      const testDb = createTestDb();
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "stale-test-"));
      const filePath = path.join(tmpDir, "fresh.ts");
      fs.writeFileSync(filePath, "const x = 1;\n", "utf-8");

      const hash = computeFileHash(filePath)!;
      updateFileHash(testDb, "fresh.ts", hash);

      const stale = getStaleFiles(testDb, ["fresh.ts"], tmpDir);
      expect(stale).toEqual([]);
    });

    it("returns file path when stored hash differs from current content", () => {
      const testDb = createTestDb();
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "stale-test-"));
      const filePath = path.join(tmpDir, "changed.ts");
      fs.writeFileSync(filePath, "const x = 1;\n", "utf-8");

      // Store an old hash
      updateFileHash(testDb, "changed.ts", "0".repeat(64));

      const stale = getStaleFiles(testDb, ["changed.ts"], tmpDir);
      expect(stale).toContain("changed.ts");
    });

    it("returns file path when file has no stored hash (new file, lazy population)", () => {
      const testDb = createTestDb();
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "stale-test-"));
      const filePath = path.join(tmpDir, "new-file.ts");
      fs.writeFileSync(filePath, "export default {};\n", "utf-8");

      // No hash stored for this file
      const stale = getStaleFiles(testDb, ["new-file.ts"], tmpDir);
      expect(stale).toContain("new-file.ts");
    });

    it("returns file path when stored hash exists but file was deleted from disk", () => {
      const testDb = createTestDb();
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "stale-test-"));

      // Store a hash for a file that doesn't exist on disk
      updateFileHash(testDb, "deleted.ts", "a".repeat(64));

      const stale = getStaleFiles(testDb, ["deleted.ts"], tmpDir);
      expect(stale).toContain("deleted.ts");
    });
  });

  describe("updateFileHash", () => {
    it("inserts a new row when file_path not in table", () => {
      const testDb = createTestDb();
      const hash = "abcdef".repeat(10) + "abcd"; // 64 chars

      updateFileHash(testDb, "src/new.ts", hash);

      const row = testDb.prepare("SELECT content_hash, updated_at FROM file_hashes WHERE file_path = ?").get("src/new.ts") as {
        content_hash: string;
        updated_at: number;
      } | undefined;
      expect(row).toBeDefined();
      expect(row!.content_hash).toBe(hash);
      expect(row!.updated_at).toBeGreaterThan(0);
    });

    it("updates existing row when file_path already exists", () => {
      const testDb = createTestDb();
      const hash1 = "a".repeat(64);
      const hash2 = "b".repeat(64);

      updateFileHash(testDb, "src/existing.ts", hash1);
      updateFileHash(testDb, "src/existing.ts", hash2);

      const row = testDb.prepare("SELECT content_hash FROM file_hashes WHERE file_path = ?").get("src/existing.ts") as {
        content_hash: string;
      } | undefined;
      expect(row).toBeDefined();
      expect(row!.content_hash).toBe(hash2);

      // Should only have one row, not two
      const count = testDb.prepare("SELECT COUNT(*) as c FROM file_hashes WHERE file_path = ?").get("src/existing.ts") as { c: number };
      expect(count.c).toBe(1);
    });
  });

  describe("removeFileHash", () => {
    it("deletes the row for a given file_path", () => {
      const testDb = createTestDb();
      const hash = "c".repeat(64);

      updateFileHash(testDb, "src/remove-me.ts", hash);

      // Verify it exists
      const before = testDb.prepare("SELECT COUNT(*) as c FROM file_hashes WHERE file_path = ?").get("src/remove-me.ts") as { c: number };
      expect(before.c).toBe(1);

      removeFileHash(testDb, "src/remove-me.ts");

      const after = testDb.prepare("SELECT COUNT(*) as c FROM file_hashes WHERE file_path = ?").get("src/remove-me.ts") as { c: number };
      expect(after.c).toBe(0);
    });
  });
});
