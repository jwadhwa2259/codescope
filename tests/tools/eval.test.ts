// ---------------------------------------------------------------------------
// Tests for codescope_eval MCP tool
// ---------------------------------------------------------------------------
// Per 06-03-PLAN.md Task 2 behavior specifications.
// ---------------------------------------------------------------------------

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

// Mock modules before importing handler
vi.mock("../../src/tools/helpers.js", async (importOriginal) => {
  const original = await importOriginal<typeof import("../../src/tools/helpers.js")>();
  return {
    ...original,
    isBootstrapped: vi.fn(),
    buildMetadata: vi.fn(() => ({
      last_bootstrap: "2026-03-24T10:00:00Z",
      staleness: "fresh" as const,
      query_ms: 100,
      capabilities: [
        "scope_compliance",
        "convention_adherence",
        "completeness",
        "correctness",
      ],
      upcoming: [],
    })),
  };
});

vi.mock("../../src/config/loader.js", () => ({
  loadConfig: vi.fn(() => ({
    eval: {
      mode: "interactive",
      auto_debug_max_cycles: 3,
      criteria: {
        scope_compliance: true,
        convention_adherence: true,
        completeness: true,
        correctness: true,
      },
    },
  })),
}));

vi.mock("../../src/eval/ignore-filter.js", () => ({
  loadIgnorePatterns: vi.fn(() => []),
}));

import { handleEval, registerEvalTool } from "../../src/tools/eval.js";
import { isBootstrapped, buildMetadata } from "../../src/tools/helpers.js";
import { loadConfig } from "../../src/config/loader.js";
import { loadIgnorePatterns } from "../../src/eval/ignore-filter.js";

// ---------------------------------------------------------------------------
// Setup/teardown
// ---------------------------------------------------------------------------

describe("codescope_eval", () => {
  let tmpDir: string;
  let codescopePath: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "codescope-eval-test-"));
    codescopePath = path.join(tmpDir, ".claude", "codescope");
    fs.mkdirSync(codescopePath, { recursive: true });

    // Reset mocks
    vi.mocked(isBootstrapped).mockReturnValue(true);
    vi.mocked(loadConfig).mockReturnValue({
      eval: {
        mode: "interactive",
        auto_debug_max_cycles: 3,
        criteria: {
          scope_compliance: true,
          convention_adherence: true,
          completeness: true,
          correctness: true,
        },
      },
    } as any);
    vi.mocked(loadIgnorePatterns).mockReturnValue([]);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  // ---- Bootstrap guard ----

  it("returns error response when not bootstrapped (code NOT_BOOTSTRAPPED)", async () => {
    vi.mocked(isBootstrapped).mockReturnValue(false);

    const result = await handleEval(tmpDir, { files: ["src/foo.ts"] });
    const parsed = JSON.parse(result.content[0].text);

    expect(parsed.status).toBe("error");
    expect(parsed.error.code).toBe("NOT_BOOTSTRAPPED");
    expect(parsed.error.message).toContain("No bootstrap data found");
    expect(parsed.error.recovery).toContain("/codescope:bootstrap");
  });

  // ---- Ok response ----

  it("returns ok response with criteria results and summary for valid input", async () => {
    // Setup scope contract so orient-dependent criteria are available
    const orientDir = path.join(codescopePath, "orient");
    fs.mkdirSync(orientDir, { recursive: true });
    fs.writeFileSync(path.join(orientDir, "scope-contract.md"), "# Scope Contract\n");

    const result = await handleEval(tmpDir, {
      files: ["src/foo.ts", "src/bar.ts"],
    });
    const parsed = JSON.parse(result.content[0].text);

    expect(parsed.status).toBe("ok");
    expect(parsed.data.files_evaluated).toBe(2);
    expect(parsed.data.criteria).toBeDefined();
    expect(parsed.data.summary).toBeDefined();
    expect(parsed.data.summary.overall_status).toBeDefined();
    expect(parsed.data.summary.total_findings).toBeDefined();
    expect(parsed.data.summary.errors).toBeDefined();
    expect(parsed.data.summary.warnings).toBeDefined();
    expect(parsed.data.summary.info).toBeDefined();
    expect(parsed.data.summary.skipped_criteria).toBeDefined();
  });

  // ---- Partial response for missing orient artifacts ----

  it("returns partial response when orient artifacts missing (scope_compliance and completeness unavailable per D-31)", async () => {
    // No scope contract file -> orient-dependent criteria unavailable

    const result = await handleEval(tmpDir, {
      files: ["src/foo.ts"],
    });
    const parsed = JSON.parse(result.content[0].text);

    expect(parsed.status).toBe("partial");
    expect(parsed.data.criteria.scope_compliance.status).toBe("unavailable");
    expect(parsed.data.criteria.scope_compliance.reason).toBeDefined();
    expect(parsed.data.criteria.completeness.status).toBe("unavailable");
    expect(parsed.data.criteria.completeness.reason).toBeDefined();
    // Non-orient-dependent criteria should be available
    expect(parsed.data.criteria.convention_adherence).toBeDefined();
    expect(parsed.data.criteria.correctness).toBeDefined();
    expect(parsed.warnings).toBeDefined();
    expect(parsed.warnings.length).toBeGreaterThan(0);
  });

  // ---- Filtering by checks parameter ----

  it("filters checks to only requested criteria when checks parameter provided", async () => {
    const orientDir = path.join(codescopePath, "orient");
    fs.mkdirSync(orientDir, { recursive: true });
    fs.writeFileSync(path.join(orientDir, "scope-contract.md"), "# Scope Contract\n");

    const result = await handleEval(tmpDir, {
      files: ["src/foo.ts"],
      checks: ["convention_adherence", "correctness"],
    });
    const parsed = JSON.parse(result.content[0].text);

    expect(parsed.status).toBe("ok");
    // Only requested criteria should be present
    expect(parsed.data.criteria.convention_adherence).toBeDefined();
    expect(parsed.data.criteria.correctness).toBeDefined();
    // Non-requested criteria should not be present
    expect(parsed.data.criteria.scope_compliance).toBeUndefined();
    expect(parsed.data.criteria.completeness).toBeUndefined();
  });

  // ---- Default to all enabled criteria ----

  it("uses all enabled criteria when checks not provided", async () => {
    const orientDir = path.join(codescopePath, "orient");
    fs.mkdirSync(orientDir, { recursive: true });
    fs.writeFileSync(path.join(orientDir, "scope-contract.md"), "# Scope Contract\n");

    const result = await handleEval(tmpDir, {
      files: ["src/foo.ts"],
    });
    const parsed = JSON.parse(result.content[0].text);

    // All 4 enabled criteria should be present
    expect(parsed.data.criteria.scope_compliance).toBeDefined();
    expect(parsed.data.criteria.convention_adherence).toBeDefined();
    expect(parsed.data.criteria.completeness).toBeDefined();
    expect(parsed.data.criteria.correctness).toBeDefined();
  });

  // ---- Metadata ----

  it("response includes metadata with capabilities array", async () => {
    const orientDir = path.join(codescopePath, "orient");
    fs.mkdirSync(orientDir, { recursive: true });
    fs.writeFileSync(path.join(orientDir, "scope-contract.md"), "# Scope Contract\n");

    const result = await handleEval(tmpDir, {
      files: ["src/foo.ts"],
    });
    const parsed = JSON.parse(result.content[0].text);

    expect(parsed.metadata).toBeDefined();
    expect(parsed.metadata.capabilities).toEqual([
      "scope_compliance",
      "convention_adherence",
      "completeness",
      "correctness",
    ]);
  });

  // ---- Response schema validation ----

  it("response data matches UI-SPEC schema (files_evaluated, criteria, summary)", async () => {
    const orientDir = path.join(codescopePath, "orient");
    fs.mkdirSync(orientDir, { recursive: true });
    fs.writeFileSync(path.join(orientDir, "scope-contract.md"), "# Scope Contract\n");

    const result = await handleEval(tmpDir, {
      files: ["src/foo.ts", "src/bar.ts", "src/baz.ts"],
    });
    const parsed = JSON.parse(result.content[0].text);

    expect(parsed.data).toHaveProperty("files_evaluated");
    expect(parsed.data).toHaveProperty("criteria");
    expect(parsed.data).toHaveProperty("summary");
    expect(parsed.data.files_evaluated).toBe(3);
    expect(parsed.data.summary).toHaveProperty("overall_status");
    expect(parsed.data.summary).toHaveProperty("total_findings");
    expect(parsed.data.summary).toHaveProperty("errors");
    expect(parsed.data.summary).toHaveProperty("warnings");
    expect(parsed.data.summary).toHaveProperty("info");
    expect(parsed.data.summary).toHaveProperty("skipped_criteria");
  });

  // ---- Deterministic mode DB path ----

  it("deterministic mode opens graph.db via getGraphDbPath (not codescope.db)", async () => {
    // Create graph.db at the correct getGraphDbPath location with real graph data
    const graphDbPath = path.join(codescopePath, "graph.db");
    const Database = (await import("better-sqlite3")).default;
    const setupDb = new Database(graphDbPath);
    setupDb.exec(`CREATE TABLE IF NOT EXISTS nodes (
      id INTEGER PRIMARY KEY,
      name TEXT,
      kind TEXT,
      file_path TEXT,
      start_line INTEGER,
      end_line INTEGER,
      language TEXT,
      loc INTEGER,
      is_exported INTEGER,
      is_test INTEGER
    )`);
    setupDb.exec(`CREATE TABLE IF NOT EXISTS edges (
      id INTEGER PRIMARY KEY,
      source_id INTEGER,
      target_id INTEGER,
      kind TEXT,
      weight REAL
    )`);
    // Insert graph data so import correctness query returns non-trivial results
    setupDb.exec(`INSERT INTO nodes (id, name, kind, file_path, start_line, end_line, language, loc, is_exported, is_test) VALUES (1, 'foo.ts', 'file', 'src/foo.ts', 1, 50, 'typescript', 50, 0, 0)`);
    setupDb.exec(`INSERT INTO nodes (id, name, kind, file_path, start_line, end_line, language, loc, is_exported, is_test) VALUES (2, 'bar.ts', 'file', 'src/bar.ts', 1, 30, 'typescript', 30, 0, 0)`);
    setupDb.exec(`INSERT INTO edges (source_id, target_id, kind, weight) VALUES (1, 2, 'imports', 1.0)`);
    setupDb.close();

    // Ensure codescope.db does NOT exist (the buggy path)
    const wrongDbPath = path.join(codescopePath, "codescope.db");
    expect(fs.existsSync(wrongDbPath)).toBe(false);

    const result = await handleEval(tmpDir, {
      files: ["src/foo.ts"],
      mode: "deterministic",
    });
    const parsed = JSON.parse(result.content[0].text);

    expect(parsed.status).toBe("ok");
    expect(parsed.data).toHaveProperty("scorecard");
    // Key assertion: import correctness should show total > 0, proving graph.db was opened
    // With the bug (opening codescope.db which doesn't exist), db=null => total=0
    expect(parsed.data.scorecard.importCorrectness.total).toBeGreaterThan(0);
  });

  it("deterministic mode degrades gracefully when graph.db does not exist", async () => {
    // Don't create any DB file -- graph.db should not exist
    const graphDbPath = path.join(codescopePath, "graph.db");
    expect(fs.existsSync(graphDbPath)).toBe(false);

    const result = await handleEval(tmpDir, {
      files: ["src/foo.ts"],
      mode: "deterministic",
    });
    const parsed = JSON.parse(result.content[0].text);

    // Should still return ok with scorecard (all 100% fallback)
    expect(parsed.status).toBe("ok");
    expect(parsed.data.scorecard.composite.percent).toBe(100);
    expect(parsed.data.scorecard.composite.grade).toBe("A");
  });

  // ---- Tool registration ----

  it("registerEvalTool registers tool with correct name, description, and zod schema", () => {
    const mockServer = {
      tool: vi.fn(),
    };

    registerEvalTool(mockServer as any, tmpDir);

    expect(mockServer.tool).toHaveBeenCalledTimes(1);

    const [name, description, schema, handler] = mockServer.tool.mock.calls[0];
    expect(name).toBe("codescope_eval");
    expect(description).toContain("Evaluate code changes");
    expect(schema).toHaveProperty("files");
    expect(schema).toHaveProperty("checks");
    expect(schema).toHaveProperty("task_slug");
  });
});
