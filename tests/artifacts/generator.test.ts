import { describe, it, expect, afterEach, beforeEach } from "vitest";
import * as os from "node:os";
import * as path from "node:path";
import * as fs from "node:fs";
import * as crypto from "node:crypto";
import { openDatabase, closeDatabase } from "../../src/graph/database.js";
import { createSchema } from "../../src/graph/schema.js";
import type { Database as DatabaseType } from "better-sqlite3";
import { buildDangerZoneIndex } from "../../src/artifacts/danger-zone-index.js";
import { buildConventionIndex } from "../../src/artifacts/convention-index.js";
import { buildBlastRadiusIndex } from "../../src/artifacts/blast-radius-index.js";
import {
  generateInjectionArtifacts,
  writeArtifactAtomic,
  INJECTION_DIR,
} from "../../src/artifacts/generator.js";
import type {
  DangerZoneIndex,
  DangerZoneFileEntry,
  ConventionIndex,
  ConventionFileEntry,
  BlastRadiusIndex,
  BlastRadiusFileEntry,
} from "../../src/artifacts/types.js";

// ---- Helpers ----

function tmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), `codescope-artifact-test-`));
}

function setupTestDb(dir: string): { db: DatabaseType; dbPath: string } {
  const csDir = path.join(dir, ".claude", "codescope");
  fs.mkdirSync(csDir, { recursive: true });
  const dbPath = path.join(csDir, "graph.db");
  const db = openDatabase(dbPath);
  createSchema(db);
  return { db, dbPath };
}

/**
 * Inserts test nodes and edges into the database to simulate a real graph.
 *
 * Creates 5 file nodes with various import edges to test centrality,
 * community detection, and blast radius calculations.
 */
function insertTestGraph(db: DatabaseType): void {
  const insertNode = db.prepare(
    `INSERT INTO nodes (name, kind, file_path, start_line, end_line, language, loc, is_exported, is_test)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  const insertEdge = db.prepare(
    `INSERT INTO edges (source_id, target_id, kind, weight) VALUES (?, ?, ?, ?)`
  );

  // File nodes: 5 files forming a dependency graph
  const f1 = Number(insertNode.run("index.ts", "file", "src/index.ts", 1, 50, "typescript", 50, 0, 0).lastInsertRowid);
  const f2 = Number(insertNode.run("auth.ts", "file", "src/auth.ts", 1, 100, "typescript", 100, 0, 0).lastInsertRowid);
  const f3 = Number(insertNode.run("db.ts", "file", "src/db.ts", 1, 200, "typescript", 200, 0, 0).lastInsertRowid);
  const f4 = Number(insertNode.run("utils.ts", "file", "src/utils.ts", 1, 30, "typescript", 30, 0, 0).lastInsertRowid);
  const f5 = Number(insertNode.run("routes.ts", "file", "src/routes.ts", 1, 150, "typescript", 150, 0, 0).lastInsertRowid);

  // Function nodes (non-file, should be excluded from danger zone / blast radius file-level indexes)
  const fn1 = Number(insertNode.run("login", "function", "src/auth.ts", 5, 20, "typescript", 15, 1, 0).lastInsertRowid);
  const fn2 = Number(insertNode.run("query", "function", "src/db.ts", 5, 30, "typescript", 25, 1, 0).lastInsertRowid);

  // Edges: index -> auth, index -> db, auth -> db, auth -> utils, routes -> auth, routes -> db
  insertEdge.run(f1, f2, "IMPORTS", 1.0); // index -> auth
  insertEdge.run(f1, f3, "IMPORTS", 1.0); // index -> db
  insertEdge.run(f2, f3, "IMPORTS", 1.0); // auth -> db
  insertEdge.run(f2, f4, "IMPORTS", 1.0); // auth -> utils
  insertEdge.run(f5, f2, "IMPORTS", 1.0); // routes -> auth
  insertEdge.run(f5, f3, "IMPORTS", 1.0); // routes -> db

  // CONTAINS edges
  insertEdge.run(f2, fn1, "CONTAINS", 1.0); // auth contains login
  insertEdge.run(f3, fn2, "CONTAINS", 1.0); // db contains query

  // Community assignments
  const insertCommunity = db.prepare(
    `INSERT INTO communities (node_id, community_id, modularity_class) VALUES (?, ?, ?)`
  );
  insertCommunity.run(f1, 0, "src");
  insertCommunity.run(f2, 0, "src");
  insertCommunity.run(f3, 1, "src/db");
  insertCommunity.run(f4, 0, "src");
  insertCommunity.run(f5, 0, "src");
  insertCommunity.run(fn1, 0, "src");
  insertCommunity.run(fn2, 1, "src/db");
}

/**
 * Creates a mock conventions.md file with 2 conventions referencing test file paths.
 */
function createMockConventions(csDir: string): void {
  const conventionsContent = `# Detected Conventions

## Error Handling

**Convention:** Try-catch with typed errors
**Adoption:** 85%
**Confidence:** HIGH-CONF
**Category:** error-handling
**Files:** src/auth.ts, src/db.ts, src/routes.ts
**Evidence:**
- src/auth.ts:10 -- Uses typed catch block
- src/db.ts:15 -- Wraps query in try-catch

## Import Style

**Convention:** Named imports over default
**Adoption:** 92%
**Confidence:** HIGH-CONF
**Category:** imports
**Files:** src/index.ts, src/auth.ts, src/utils.ts
**Evidence:**
- src/index.ts:1 -- Uses named import
- src/auth.ts:1 -- Uses named import
`;
  fs.writeFileSync(path.join(csDir, "conventions.md"), conventionsContent, "utf-8");
}

// ---- Tests ----

describe("Artifact generation pipeline (src/artifacts/)", () => {
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

  describe("buildDangerZoneIndex", () => {
    it("returns DangerZoneIndex with generated ISO string and files Record keyed by relative path", () => {
      const { db: testDb } = setupTestDb(projectDir);
      db = testDb;
      insertTestGraph(db);

      const result: DangerZoneIndex = buildDangerZoneIndex(db);

      expect(result.generated).toBeTruthy();
      // Should be a valid ISO date
      expect(new Date(result.generated).toISOString()).toBe(result.generated);
      expect(typeof result.files).toBe("object");
      // Should have file entries keyed by relative path
      expect(Object.keys(result.files).length).toBeGreaterThan(0);
      // Check that keys are relative paths (e.g., "src/auth.ts")
      const keys = Object.keys(result.files);
      expect(keys.some((k) => k.startsWith("src/"))).toBe(true);
    });

    it("includes centrality, riskScore, communitiesTouched, reasons for each file node", () => {
      const { db: testDb } = setupTestDb(projectDir);
      db = testDb;
      insertTestGraph(db);

      const result = buildDangerZoneIndex(db);

      // db.ts has the most incoming edges, so it should be in the index
      for (const [filePath, entry] of Object.entries(result.files)) {
        expect(entry).toHaveProperty("centrality");
        expect(entry).toHaveProperty("riskScore");
        expect(entry).toHaveProperty("communitiesTouched");
        expect(entry).toHaveProperty("reasons");
        expect(typeof entry.centrality).toBe("number");
        expect(typeof entry.riskScore).toBe("number");
        expect(typeof entry.communitiesTouched).toBe("number");
        expect(Array.isArray(entry.reasons)).toBe(true);
      }
    });

    it("only includes file nodes (kind === 'file'), not function/class nodes", () => {
      const { db: testDb } = setupTestDb(projectDir);
      db = testDb;
      insertTestGraph(db);

      const result = buildDangerZoneIndex(db);

      // Function names should not appear as keys
      expect(result.files).not.toHaveProperty("login");
      expect(result.files).not.toHaveProperty("query");

      // File paths should appear
      expect(Object.keys(result.files).length).toBe(5); // 5 file nodes
    });
  });

  describe("buildConventionIndex", () => {
    it("returns ConventionIndex with generated ISO string and files Record", () => {
      const csDir = path.join(projectDir, ".claude", "codescope");
      fs.mkdirSync(csDir, { recursive: true });
      createMockConventions(csDir);

      const result: ConventionIndex = buildConventionIndex(csDir);

      expect(result.generated).toBeTruthy();
      expect(new Date(result.generated).toISOString()).toBe(result.generated);
      expect(typeof result.files).toBe("object");
    });

    it("parses conventions.md and maps conventions to their matchingFiles", () => {
      const csDir = path.join(projectDir, ".claude", "codescope");
      fs.mkdirSync(csDir, { recursive: true });
      createMockConventions(csDir);

      const result = buildConventionIndex(csDir);

      // src/auth.ts should have 2 conventions
      expect(result.files["src/auth.ts"]).toBeDefined();
      expect(result.files["src/auth.ts"].length).toBe(2);

      // src/db.ts should have 1 convention (error handling only)
      expect(result.files["src/db.ts"]).toBeDefined();
      expect(result.files["src/db.ts"].length).toBe(1);
      expect(result.files["src/db.ts"][0].name).toBe("Try-catch with typed errors");

      // src/utils.ts should have 1 convention (import style)
      expect(result.files["src/utils.ts"]).toBeDefined();
      expect(result.files["src/utils.ts"].length).toBe(1);
      expect(result.files["src/utils.ts"][0].name).toBe("Named imports over default");

      // Each convention entry should have the right shape
      const entry = result.files["src/auth.ts"][0];
      expect(entry).toHaveProperty("name");
      expect(entry).toHaveProperty("adoption_pct");
      expect(entry).toHaveProperty("confidence");
      expect(entry).toHaveProperty("category");
    });

    it("handles missing conventions.md gracefully (returns empty files Record)", () => {
      const csDir = path.join(projectDir, ".claude", "codescope");
      fs.mkdirSync(csDir, { recursive: true });
      // No conventions.md created

      const result = buildConventionIndex(csDir);

      expect(result.generated).toBeTruthy();
      expect(Object.keys(result.files)).toHaveLength(0);
    });
  });

  describe("buildBlastRadiusIndex", () => {
    it("returns BlastRadiusIndex with per-file totalAffected, byRisk breakdown, and topAffected list", () => {
      const { db: testDb } = setupTestDb(projectDir);
      db = testDb;
      insertTestGraph(db);

      const result: BlastRadiusIndex = buildBlastRadiusIndex(db);

      expect(result.generated).toBeTruthy();
      expect(typeof result.files).toBe("object");

      // At least some files with centrality > 0.1 should have entries
      const entries = Object.values(result.files);
      expect(entries.length).toBeGreaterThan(0);

      for (const entry of entries) {
        expect(entry).toHaveProperty("totalAffected");
        expect(entry).toHaveProperty("byRisk");
        expect(entry.byRisk).toHaveProperty("red");
        expect(entry.byRisk).toHaveProperty("orange");
        expect(entry.byRisk).toHaveProperty("yellow");
        expect(entry.byRisk).toHaveProperty("green");
        expect(entry).toHaveProperty("topAffected");
        expect(Array.isArray(entry.topAffected)).toBe(true);
        expect(entry.topAffected.length).toBeLessThanOrEqual(5);
      }
    });

    it("only computes blast radius for file nodes with centrality > 0.1", () => {
      const { db: testDb } = setupTestDb(projectDir);
      db = testDb;
      insertTestGraph(db);

      const result = buildBlastRadiusIndex(db);

      // Files with 0 in-degree (or very low) should NOT be in the index
      // With 5 files + 2 functions = 7 nodes, centrality normalization:
      // Files with no incoming edges (like index.ts, routes.ts) may have centrality <= 0.1
      // db.ts has the most imports (3 incoming), so should be included
      const keys = Object.keys(result.files);
      // Not all 5 files should be in the blast radius index
      expect(keys.length).toBeLessThan(5);
    });
  });

  describe("writeArtifactAtomic", () => {
    it("writes to .tmp first then renames (final file exists with correct content)", () => {
      const filePath = path.join(projectDir, "test-artifact.json");
      const data = { test: true, value: 42 };

      writeArtifactAtomic(filePath, data);

      expect(fs.existsSync(filePath)).toBe(true);
      const content = JSON.parse(fs.readFileSync(filePath, "utf-8"));
      expect(content).toEqual(data);

      // No .tmp file should remain
      expect(fs.existsSync(filePath + ".tmp")).toBe(false);
    });
  });

  describe("generateInjectionArtifacts", () => {
    it("creates injection/ directory and writes all 3 JSON files", async () => {
      const { db: testDb } = setupTestDb(projectDir);
      db = testDb;
      insertTestGraph(db);

      // Create conventions.md for the convention index
      const csDir = path.join(projectDir, ".claude", "codescope");
      createMockConventions(csDir);

      await generateInjectionArtifacts(projectDir, db);

      const injectionDir = path.join(csDir, INJECTION_DIR);
      expect(fs.existsSync(injectionDir)).toBe(true);

      // All 3 files should exist
      const dangerZonesPath = path.join(injectionDir, "danger-zones.json");
      const conventionsPath = path.join(injectionDir, "conventions.json");
      const blastRadiusPath = path.join(injectionDir, "blast-radius.json");

      expect(fs.existsSync(dangerZonesPath)).toBe(true);
      expect(fs.existsSync(conventionsPath)).toBe(true);
      expect(fs.existsSync(blastRadiusPath)).toBe(true);

      // Verify JSON structure
      const dz = JSON.parse(fs.readFileSync(dangerZonesPath, "utf-8"));
      expect(dz).toHaveProperty("generated");
      expect(dz).toHaveProperty("files");

      const conv = JSON.parse(fs.readFileSync(conventionsPath, "utf-8"));
      expect(conv).toHaveProperty("generated");
      expect(conv).toHaveProperty("files");

      const br = JSON.parse(fs.readFileSync(blastRadiusPath, "utf-8"));
      expect(br).toHaveProperty("generated");
      expect(br).toHaveProperty("files");
    });

    it("skips gracefully when graph.db has zero nodes (no files written)", async () => {
      const { db: testDb } = setupTestDb(projectDir);
      db = testDb;
      // No nodes inserted -- empty graph

      await generateInjectionArtifacts(projectDir, db);

      const csDir = path.join(projectDir, ".claude", "codescope");
      const injectionDir = path.join(csDir, INJECTION_DIR);

      // Injection directory should not exist (or should have no files)
      if (fs.existsSync(injectionDir)) {
        const files = fs.readdirSync(injectionDir);
        expect(files).toHaveLength(0);
      }
    });
  });

  describe("INJECTION_DIR constant", () => {
    it("equals 'injection'", () => {
      expect(INJECTION_DIR).toBe("injection");
    });
  });
});
