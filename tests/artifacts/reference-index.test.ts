/**
 * Tests for the reference index builder.
 *
 * Verifies 4-signal weighted similarity, noise file exclusion,
 * role-based scoping, and self-reference prevention.
 */

import { describe, it, expect, afterEach, beforeEach } from "vitest";
import * as os from "node:os";
import * as path from "node:path";
import * as fs from "node:fs";
import { openDatabase, closeDatabase } from "../../src/graph/database.js";
import { createSchema } from "../../src/graph/schema.js";
import type { Database as DatabaseType } from "better-sqlite3";
import { buildReferenceIndex } from "../../src/artifacts/reference-index.js";
import type { ReferenceIndex } from "../../src/artifacts/types.js";

// ---- Helpers ----

function tmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "codescope-refindex-test-"));
}

function setupTestDb(dir: string): { db: DatabaseType; csDir: string } {
  const csDir = path.join(dir, ".claude", "codescope");
  fs.mkdirSync(csDir, { recursive: true });
  const dbPath = path.join(csDir, "graph.db");
  const db = openDatabase(dbPath);
  createSchema(db);
  return { db, csDir };
}

/**
 * Inserts a graph with utility and route-handler files for role-scoped testing.
 * Creates nodes and edges so similarity signals can differentiate files.
 */
function insertRoleScopedGraph(db: DatabaseType): void {
  const insertNode = db.prepare(
    `INSERT INTO nodes (name, kind, file_path, start_line, end_line, language, loc, is_exported, is_test)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const insertEdge = db.prepare(
    `INSERT INTO edges (source_id, target_id, kind, weight) VALUES (?, ?, ?, ?)`,
  );

  // Utility files (should match against each other)
  const u1 = Number(
    insertNode.run("helpers.ts", "file", "src/utils/helpers.ts", 1, 50, "typescript", 50, 0, 0).lastInsertRowid,
  );
  const u2 = Number(
    insertNode.run("format.ts", "file", "src/utils/format.ts", 1, 40, "typescript", 40, 0, 0).lastInsertRowid,
  );
  const u3 = Number(
    insertNode.run("validate.ts", "file", "src/utils/validate.ts", 1, 60, "typescript", 60, 0, 0).lastInsertRowid,
  );

  // Route handler files (should match against each other)
  const r1 = Number(
    insertNode.run("users.ts", "file", "src/routes/users.ts", 1, 80, "typescript", 80, 0, 0).lastInsertRowid,
  );
  const r2 = Number(
    insertNode.run("posts.ts", "file", "src/routes/posts.ts", 1, 70, "typescript", 70, 0, 0).lastInsertRowid,
  );

  // Test file (noise -- should be excluded)
  const t1 = Number(
    insertNode.run("helpers.test.ts", "file", "src/utils/helpers.test.ts", 1, 100, "typescript", 100, 0, 1).lastInsertRowid,
  );

  // Config file (noise)
  const c1 = Number(
    insertNode.run("vitest.config.ts", "file", "vitest.config.ts", 1, 20, "typescript", 20, 0, 0).lastInsertRowid,
  );

  // Edges: utilities import each other
  insertEdge.run(u1, u2, "imports", 1.0);
  insertEdge.run(u1, u3, "imports", 1.0);
  insertEdge.run(u2, u3, "imports", 1.0);

  // Route handlers import utilities
  insertEdge.run(r1, u1, "imports", 1.0);
  insertEdge.run(r1, u2, "imports", 1.0);
  insertEdge.run(r2, u1, "imports", 1.0);

  // Route handlers import each other
  insertEdge.run(r1, r2, "imports", 1.0);

  // Test imports utility
  insertEdge.run(t1, u1, "imports", 1.0);

  // Communities
  const insertCommunity = db.prepare(
    `INSERT INTO communities (node_id, community_id, modularity_class) VALUES (?, ?, ?)`,
  );
  insertCommunity.run(u1, 0, "src/utils");
  insertCommunity.run(u2, 0, "src/utils");
  insertCommunity.run(u3, 0, "src/utils");
  insertCommunity.run(r1, 1, "src/routes");
  insertCommunity.run(r2, 1, "src/routes");
  insertCommunity.run(t1, 0, "src/utils");
  insertCommunity.run(c1, 2, "root");
}

function createConventionsWithFiles(csDir: string): void {
  const content = `# Conventions

### Error handling with typed catch

| Metric | Value |
|--------|-------|
| Adoption | 85% (17/20 files) |
| Confidence | HIGH-CONF |
| Trend | Stable |
| Category | error-handling |

**Evidence:**
- \`src/utils/helpers.ts:10\` -- typed catch
- \`src/utils/format.ts:5\` -- typed catch
- \`src/routes/users.ts:20\` -- typed catch

### Named imports

| Metric | Value |
|--------|-------|
| Adoption | 90% (18/20 files) |
| Confidence | HIGH-CONF |
| Trend | Stable |
| Category | imports |

**Evidence:**
- \`src/utils/helpers.ts:1\` -- named import
- \`src/utils/format.ts:1\` -- named import
- \`src/utils/validate.ts:1\` -- named import
- \`src/routes/users.ts:1\` -- named import
- \`src/routes/posts.ts:1\` -- named import
`;
  fs.writeFileSync(path.join(csDir, "conventions.md"), content, "utf-8");
}

// ---- Tests ----

describe("buildReferenceIndex", () => {
  let projectDir: string;
  let db: DatabaseType | null = null;

  beforeEach(() => {
    projectDir = tmpDir();
  });

  afterEach(() => {
    try {
      if (db) closeDatabase(db);
    } catch {
      // already closed
    }
    db = null;
    if (projectDir && fs.existsSync(projectDir)) {
      fs.rmSync(projectDir, { recursive: true, force: true });
    }
  });

  it("returns valid ReferenceIndex shape with generated timestamp and files map", () => {
    const { db: testDb, csDir } = setupTestDb(projectDir);
    db = testDb;
    insertRoleScopedGraph(db);
    createConventionsWithFiles(csDir);

    const result: ReferenceIndex = buildReferenceIndex(db, csDir);

    expect(result.generated).toBeTruthy();
    expect(new Date(result.generated).toISOString()).toBe(result.generated);
    expect(typeof result.files).toBe("object");
  });

  it("excludes noise files (test, config) from both candidates and results", () => {
    const { db: testDb, csDir } = setupTestDb(projectDir);
    db = testDb;
    insertRoleScopedGraph(db);
    createConventionsWithFiles(csDir);

    const result = buildReferenceIndex(db, csDir);

    // Test files and config files should not appear as keys
    const keys = Object.keys(result.files);
    expect(keys.every((k) => !k.includes(".test."))).toBe(true);
    expect(keys.every((k) => !k.includes("vitest.config"))).toBe(true);

    // Noise files should not appear as referencePath values
    const refPaths = Object.values(result.files).map((e) => e.referencePath);
    expect(refPaths.every((p) => !p.includes(".test."))).toBe(true);
    expect(refPaths.every((p) => !p.includes("vitest.config"))).toBe(true);
  });

  it("scopes by role: utility files reference utility files, route-handlers reference route-handlers", () => {
    const { db: testDb, csDir } = setupTestDb(projectDir);
    db = testDb;
    insertRoleScopedGraph(db);
    createConventionsWithFiles(csDir);

    const result = buildReferenceIndex(db, csDir);

    // Utility files should reference other utility files
    for (const [filePath, entry] of Object.entries(result.files)) {
      if (filePath.includes("src/utils/")) {
        expect(entry.referencePath).toMatch(/src\/utils\//);
        expect(entry.roleLabel).toBe("utility");
      }
    }

    // Route handler files should reference other route handler files
    for (const [filePath, entry] of Object.entries(result.files)) {
      if (filePath.includes("src/routes/")) {
        expect(entry.referencePath).toMatch(/src\/routes\//);
        expect(entry.roleLabel).toBe("route-handler");
      }
    }
  });

  it("does not allow a file to reference itself", () => {
    const { db: testDb, csDir } = setupTestDb(projectDir);
    db = testDb;
    insertRoleScopedGraph(db);
    createConventionsWithFiles(csDir);

    const result = buildReferenceIndex(db, csDir);

    for (const [filePath, entry] of Object.entries(result.files)) {
      expect(entry.referencePath).not.toBe(filePath);
    }
  });

  it("returns empty files map when graph has zero nodes", () => {
    const { db: testDb, csDir } = setupTestDb(projectDir);
    db = testDb;
    // No nodes inserted
    createConventionsWithFiles(csDir);

    const result = buildReferenceIndex(db, csDir);

    expect(result.generated).toBeTruthy();
    expect(Object.keys(result.files)).toHaveLength(0);
  });

  it("each entry has referencePath, roleLabel, and score (0-1)", () => {
    const { db: testDb, csDir } = setupTestDb(projectDir);
    db = testDb;
    insertRoleScopedGraph(db);
    createConventionsWithFiles(csDir);

    const result = buildReferenceIndex(db, csDir);

    for (const entry of Object.values(result.files)) {
      expect(typeof entry.referencePath).toBe("string");
      expect(entry.referencePath.length).toBeGreaterThan(0);
      expect(typeof entry.roleLabel).toBe("string");
      expect(typeof entry.score).toBe("number");
      expect(entry.score).toBeGreaterThanOrEqual(0);
      expect(entry.score).toBeLessThanOrEqual(1);
    }
  });
});
