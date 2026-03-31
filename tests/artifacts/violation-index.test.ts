/**
 * Tests for the violation index builder.
 *
 * Verifies HIGH-CONF filtering, sparse output, type name checking,
 * and import path checking.
 */

import { describe, it, expect, afterEach, beforeEach } from "vitest";
import * as os from "node:os";
import * as path from "node:path";
import * as fs from "node:fs";
import { openDatabase, closeDatabase } from "../../src/graph/database.js";
import { createSchema } from "../../src/graph/schema.js";
import type { Database as DatabaseType } from "better-sqlite3";
import { buildViolationIndex } from "../../src/artifacts/violation-index.js";
import type { ViolationIndex } from "../../src/artifacts/types.js";

// ---- Helpers ----

function tmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "codescope-violindex-test-"));
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
 * Creates conventions.md with both HIGH-CONF and MEDIUM-CONF conventions.
 * The HIGH-CONF convention lists specific files in evidence;
 * files NOT in evidence are in the convention's scope but do NOT follow it.
 */
function createMixedConfidenceConventions(csDir: string): void {
  const content = `# Conventions

### Typed catch blocks

| Metric | Value |
|--------|-------|
| Adoption | 80% (4/5 files) |
| Confidence | HIGH-CONF |
| Trend | Stable |
| Category | error-handling |

**Evidence:**
- \`src/utils/helpers.ts:10\` -- typed catch
- \`src/utils/format.ts:5\` -- typed catch
- \`src/routes/users.ts:20\` -- typed catch
- \`src/routes/posts.ts:15\` -- typed catch

### Optional chaining

| Metric | Value |
|--------|-------|
| Adoption | 60% (3/5 files) |
| Confidence | MEDIUM-CONF |
| Trend | Increasing |
| Category | safety |

**Evidence:**
- \`src/utils/helpers.ts:25\` -- uses optional chain
- \`src/utils/format.ts:12\` -- uses optional chain
- \`src/routes/users.ts:30\` -- uses optional chain

### Named exports

| Metric | Value |
|--------|-------|
| Adoption | 85% (4/5 files) |
| Confidence | HIGH-CONF |
| Trend | Stable |
| Category | exports |

**Evidence:**
- \`src/utils/helpers.ts:1\` -- named export
- \`src/utils/format.ts:1\` -- named export
- \`src/routes/users.ts:1\` -- named export
- \`src/routes/posts.ts:1\` -- named export
`;
  fs.writeFileSync(path.join(csDir, "conventions.md"), content, "utf-8");
}

function insertTestNodes(db: DatabaseType): void {
  const insertNode = db.prepare(
    `INSERT INTO nodes (name, kind, file_path, start_line, end_line, language, loc, is_exported, is_test)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );

  // File nodes (5 files)
  insertNode.run("helpers.ts", "file", "src/utils/helpers.ts", 1, 50, "typescript", 50, 0, 0);
  insertNode.run("format.ts", "file", "src/utils/format.ts", 1, 40, "typescript", 40, 0, 0);
  insertNode.run("validate.ts", "file", "src/utils/validate.ts", 1, 60, "typescript", 60, 0, 0);
  insertNode.run("users.ts", "file", "src/routes/users.ts", 1, 80, "typescript", 80, 0, 0);
  insertNode.run("posts.ts", "file", "src/routes/posts.ts", 1, 70, "typescript", 70, 0, 0);

  // Type/interface nodes
  insertNode.run("UserConfig", "type", "src/utils/helpers.ts", 5, 10, "typescript", 5, 1, 0);
  insertNode.run("FormatOptions", "interface", "src/utils/format.ts", 3, 8, "typescript", 5, 1, 0);
}

function insertEdgesWithBrokenImport(db: DatabaseType): void {
  const insertNode = db.prepare(
    `INSERT INTO nodes (name, kind, file_path, start_line, end_line, language, loc, is_exported, is_test)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const insertEdge = db.prepare(
    `INSERT INTO edges (source_id, target_id, kind, weight) VALUES (?, ?, ?, ?)`,
  );

  // File nodes
  const f1 = Number(
    insertNode.run("index.ts", "file", "src/index.ts", 1, 30, "typescript", 30, 0, 0).lastInsertRowid,
  );
  const f2 = Number(
    insertNode.run("helper.ts", "file", "src/helper.ts", 1, 20, "typescript", 20, 0, 0).lastInsertRowid,
  );

  // Valid import
  insertEdge.run(f1, f2, "imports", 1.0);
}

// ---- Tests ----

describe("buildViolationIndex", () => {
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

  it("returns valid ViolationIndex shape with generated timestamp and files map", () => {
    const { db: testDb, csDir } = setupTestDb(projectDir);
    db = testDb;
    insertTestNodes(db);
    createMixedConfidenceConventions(csDir);

    const result: ViolationIndex = buildViolationIndex(db, csDir);

    expect(result.generated).toBeTruthy();
    expect(new Date(result.generated).toISOString()).toBe(result.generated);
    expect(typeof result.files).toBe("object");
  });

  it("only produces violations for HIGH-CONF conventions, not MEDIUM-CONF", () => {
    const { db: testDb, csDir } = setupTestDb(projectDir);
    db = testDb;
    insertTestNodes(db);
    createMixedConfidenceConventions(csDir);

    const result = buildViolationIndex(db, csDir);

    // All violations should reference HIGH-CONF rule names
    for (const violations of Object.values(result.files)) {
      for (const v of violations) {
        // Should not see "Optional chaining" (MEDIUM-CONF)
        expect(v.ruleId).not.toBe("Optional chaining");
      }
    }
  });

  it("files that follow all HIGH-CONF conventions do NOT get violation entries (sparse)", () => {
    const { db: testDb, csDir } = setupTestDb(projectDir);
    db = testDb;
    insertTestNodes(db);
    createMixedConfidenceConventions(csDir);

    const result = buildViolationIndex(db, csDir);

    // src/utils/helpers.ts and src/routes/users.ts appear in both HIGH-CONF conventions
    // so they should NOT have violations for those conventions
    // Only src/utils/validate.ts is missing from both HIGH-CONF conventions
    if (result.files["src/utils/helpers.ts"]) {
      // If present, should not have convention-deviation entries for "Typed catch blocks" or "Named exports"
      const convViolations = result.files["src/utils/helpers.ts"].filter(
        (v) => v.ruleId === "Typed catch blocks" || v.ruleId === "Named exports",
      );
      expect(convViolations).toHaveLength(0);
    }
  });

  it("files NOT following a HIGH-CONF convention get violation entries", () => {
    const { db: testDb, csDir } = setupTestDb(projectDir);
    db = testDb;
    insertTestNodes(db);
    createMixedConfidenceConventions(csDir);

    const result = buildViolationIndex(db, csDir);

    // src/utils/validate.ts is in the graph but NOT in evidence for either HIGH-CONF convention
    // It should have violation entries
    expect(result.files["src/utils/validate.ts"]).toBeDefined();
    const violations = result.files["src/utils/validate.ts"];
    expect(violations.length).toBeGreaterThan(0);

    // Should have violations for the HIGH-CONF conventions it's missing from
    const ruleIds = violations.map((v) => v.ruleId);
    expect(ruleIds).toContain("Typed catch blocks");
    expect(ruleIds).toContain("Named exports");
  });

  it("returns empty violations when conventions.md is missing", () => {
    const { db: testDb, csDir } = setupTestDb(projectDir);
    db = testDb;
    insertTestNodes(db);
    // No conventions.md created

    const result = buildViolationIndex(db, csDir);

    expect(result.generated).toBeTruthy();
    expect(Object.keys(result.files)).toHaveLength(0);
  });

  it("returns empty violations when all conventions are non-HIGH-CONF", () => {
    const { db: testDb, csDir } = setupTestDb(projectDir);
    db = testDb;
    insertTestNodes(db);

    // Only MEDIUM-CONF conventions
    const content = `# Conventions

### Optional chaining

| Metric | Value |
|--------|-------|
| Adoption | 60% (3/5 files) |
| Confidence | MEDIUM-CONF |
| Trend | Increasing |
| Category | safety |

**Evidence:**
- \`src/utils/helpers.ts:25\` -- uses optional chain
`;
    fs.writeFileSync(path.join(csDir, "conventions.md"), content, "utf-8");

    const result = buildViolationIndex(db, csDir);

    expect(Object.keys(result.files)).toHaveLength(0);
  });

  it("each ViolationEntry has ruleId, detected, expected, and line", () => {
    const { db: testDb, csDir } = setupTestDb(projectDir);
    db = testDb;
    insertTestNodes(db);
    createMixedConfidenceConventions(csDir);

    const result = buildViolationIndex(db, csDir);

    for (const violations of Object.values(result.files)) {
      for (const v of violations) {
        expect(typeof v.ruleId).toBe("string");
        expect(typeof v.detected).toBe("string");
        expect(typeof v.expected).toBe("string");
        expect(typeof v.line).toBe("number");
      }
    }
  });

  // ---- Finding 2: Language and role filtering ----

  it("Python file does NOT get flagged for a TypeScript-only convention", () => {
    const { db: testDb, csDir } = setupTestDb(projectDir);
    db = testDb;
    insertTestNodes(db);

    // Add a Python file node to the graph
    db.prepare(
      `INSERT INTO nodes (name, kind, file_path, start_line, end_line, language, loc, is_exported, is_test)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run("deploy.py", "file", "scripts/deploy.py", 1, 30, "python", 30, 0, 0);

    createMixedConfidenceConventions(csDir);

    const result = buildViolationIndex(db, csDir);

    // Python file should NOT be flagged for TS conventions
    expect(result.files["scripts/deploy.py"]).toBeUndefined();
  });

  it("test file does NOT get flagged for conventions", () => {
    const { db: testDb, csDir } = setupTestDb(projectDir);
    db = testDb;
    insertTestNodes(db);

    // Add a test file node
    db.prepare(
      `INSERT INTO nodes (name, kind, file_path, start_line, end_line, language, loc, is_exported, is_test)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run("helpers.test.ts", "file", "src/utils/helpers.test.ts", 1, 100, "typescript", 100, 0, 1);

    createMixedConfidenceConventions(csDir);

    const result = buildViolationIndex(db, csDir);

    // Test file should NOT be flagged
    expect(result.files["src/utils/helpers.test.ts"]).toBeUndefined();
  });

  it("config file does NOT get flagged for conventions", () => {
    const { db: testDb, csDir } = setupTestDb(projectDir);
    db = testDb;
    insertTestNodes(db);

    // Add a config file node
    db.prepare(
      `INSERT INTO nodes (name, kind, file_path, start_line, end_line, language, loc, is_exported, is_test)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run("vitest.config.ts", "file", "vitest.config.ts", 1, 20, "typescript", 20, 0, 0);

    createMixedConfidenceConventions(csDir);

    const result = buildViolationIndex(db, csDir);

    // Config file should NOT be flagged
    expect(result.files["vitest.config.ts"]).toBeUndefined();
  });

  it("only files matching convention language AND applicable role get violations", () => {
    const { db: testDb, csDir } = setupTestDb(projectDir);
    db = testDb;
    insertTestNodes(db);

    // Add files of various types
    const insertNode = db.prepare(
      `INSERT INTO nodes (name, kind, file_path, start_line, end_line, language, loc, is_exported, is_test)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    insertNode.run("deploy.py", "file", "scripts/deploy.py", 1, 30, "python", 30, 0, 0);
    insertNode.run("helpers.test.ts", "file", "tests/helpers.test.ts", 1, 100, "typescript", 100, 0, 1);
    insertNode.run("tsconfig.json", "file", "tsconfig.json", 1, 10, "json", 10, 0, 0);

    createMixedConfidenceConventions(csDir);

    const result = buildViolationIndex(db, csDir);

    // None of the added files should be flagged
    expect(result.files["scripts/deploy.py"]).toBeUndefined();
    expect(result.files["tests/helpers.test.ts"]).toBeUndefined();
    expect(result.files["tsconfig.json"]).toBeUndefined();

    // validate.ts (existing TS utility file not in evidence) SHOULD still be flagged
    expect(result.files["src/utils/validate.ts"]).toBeDefined();
  });

  // ---- Finding 3: VALID-02/VALID-03 dead code removed ----

  it("does NOT produce import-path-validity violations (VALID-03 removed)", () => {
    const { db: testDb, csDir } = setupTestDb(projectDir);
    db = testDb;
    insertTestNodes(db);
    insertEdgesWithBrokenImport(db);
    createMixedConfidenceConventions(csDir);

    const result = buildViolationIndex(db, csDir);

    // No violations should have ruleId "import-path-validity"
    for (const violations of Object.values(result.files)) {
      for (const v of violations) {
        expect(v.ruleId).not.toBe("import-path-validity");
      }
    }
  });

  it("validate.ts still gets violations when applicable but not in evidence", () => {
    const { db: testDb, csDir } = setupTestDb(projectDir);
    db = testDb;
    insertTestNodes(db);
    createMixedConfidenceConventions(csDir);

    const result = buildViolationIndex(db, csDir);

    // validate.ts is a TS utility file NOT in evidence -- should be flagged
    expect(result.files["src/utils/validate.ts"]).toBeDefined();
    const violations = result.files["src/utils/validate.ts"];
    expect(violations.length).toBeGreaterThan(0);

    const ruleIds = violations.map((v) => v.ruleId);
    expect(ruleIds).toContain("Typed catch blocks");
    expect(ruleIds).toContain("Named exports");
  });
});
