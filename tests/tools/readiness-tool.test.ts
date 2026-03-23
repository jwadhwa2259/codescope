import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

// Module under test -- will be created in GREEN phase
import { handleReadiness } from "../../src/tools/readiness-tool.js";

describe("codescope_readiness", () => {
  let tmpDir: string;
  let codescopePath: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "codescope-readiness-test-"),
    );
    codescopePath = path.join(tmpDir, ".claude", "codescope");
    fs.mkdirSync(codescopePath, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function setupBootstrapped(): void {
    fs.writeFileSync(path.join(codescopePath, "graph.db"), "");
    fs.writeFileSync(
      path.join(codescopePath, "bootstrap-meta.json"),
      JSON.stringify({
        last_bootstrap: new Date().toISOString(),
        duration_ms: 5000,
        mode: "full",
        version: "0.1.0",
      }),
    );
  }

  /** Sample readiness.md following the UI-SPEC format */
  const SAMPLE_READINESS = `# AI Readiness Score: B+ (87%)

## Overall Assessment
This codebase is well-prepared for AI-assisted development with strong conventions and type safety.

## Dimension Scores

| Dimension | Score | Grade | Delta | What This Means for AI |
|-----------|-------|-------|-------|------------------------|
| Convention Coverage | 92% | A- | +5% | Strong conventions let AI match existing patterns reliably. |
| Type Safety | 85% | B | +3% | Good type coverage helps AI infer intent from signatures. |
| Test Coverage Proxy | 78% | C+ | -2% | Moderate test coverage gives AI some safety net for changes. |
| Import Graph Health | 93% | A | +1% | Clean import graph means AI can trace dependencies accurately. |

## Top 3 Improvements
1. Add type annotations to 15 untyped utility functions in src/utils/ -- improves Type Safety
2. Add unit tests for src/graph/analytics.ts -- improves Test Coverage Proxy
3. Extract shared constants into src/constants/ -- improves Convention Coverage
`;

  it("Test 1: Returns structured readiness score from readiness.md (overall grade, percent, dimensions)", async () => {
    setupBootstrapped();
    fs.writeFileSync(
      path.join(codescopePath, "readiness.md"),
      SAMPLE_READINESS,
    );

    const result = await handleReadiness(tmpDir);
    const parsed = JSON.parse(result.content[0].text);

    expect(parsed.status).toBe("ok");
    expect(parsed.data.overall.grade).toBe("B+");
    expect(parsed.data.overall.percent).toBe(87);
    expect(parsed.data.dimensions).toBeDefined();
    expect(parsed.data.dimensions.convention_coverage).toBeDefined();
    expect(parsed.data.dimensions.type_safety).toBeDefined();
    expect(parsed.data.dimensions.test_coverage_proxy).toBeDefined();
    expect(parsed.data.dimensions.import_graph_health).toBeDefined();
  });

  it("Test 2: Returns NOT_BOOTSTRAPPED error when not bootstrapped", async () => {
    // No graph.db
    const result = await handleReadiness(tmpDir);
    const parsed = JSON.parse(result.content[0].text);

    expect(parsed.status).toBe("error");
    expect(parsed.error.code).toBe("NOT_BOOTSTRAPPED");
    expect(parsed.error.recovery).toContain("bootstrap");
  });

  it("Test 3: Returns error when readiness.md does not exist (bootstrap ran but readiness not computed)", async () => {
    setupBootstrapped();
    // No readiness.md

    const result = await handleReadiness(tmpDir);
    const parsed = JSON.parse(result.content[0].text);

    expect(parsed.status).toBe("error");
    expect(parsed.error.code).toBe("NODE_NOT_FOUND");
    expect(parsed.error.message).toContain("Readiness score not yet computed");
    expect(parsed.error.recovery).toContain("bootstrap");
  });

  it("Test 4: Parses dimension scores including delta values", async () => {
    setupBootstrapped();
    fs.writeFileSync(
      path.join(codescopePath, "readiness.md"),
      SAMPLE_READINESS,
    );

    const result = await handleReadiness(tmpDir);
    const parsed = JSON.parse(result.content[0].text);

    const cc = parsed.data.dimensions.convention_coverage;
    expect(cc.percent).toBe(92);
    expect(cc.grade).toBe("A-");
    expect(cc.delta).toBe("+5%");

    const ts = parsed.data.dimensions.type_safety;
    expect(ts.percent).toBe(85);
    expect(ts.grade).toBe("B");
    expect(ts.delta).toBe("+3%");

    const tcp = parsed.data.dimensions.test_coverage_proxy;
    expect(tcp.percent).toBe(78);
    expect(tcp.grade).toBe("C+");
    expect(tcp.delta).toBe("-2%");

    const igh = parsed.data.dimensions.import_graph_health;
    expect(igh.percent).toBe(93);
    expect(igh.grade).toBe("A");
    expect(igh.delta).toBe("+1%");
  });

  it("Test 5: Response includes improvements array", async () => {
    setupBootstrapped();
    fs.writeFileSync(
      path.join(codescopePath, "readiness.md"),
      SAMPLE_READINESS,
    );

    const result = await handleReadiness(tmpDir);
    const parsed = JSON.parse(result.content[0].text);

    expect(parsed.data.improvements).toBeDefined();
    expect(Array.isArray(parsed.data.improvements)).toBe(true);
    expect(parsed.data.improvements).toHaveLength(3);
    expect(parsed.data.improvements[0]).toContain("type annotations");
  });

  it("Test 6: Response follows D-17 format with metadata", async () => {
    setupBootstrapped();
    fs.writeFileSync(
      path.join(codescopePath, "readiness.md"),
      SAMPLE_READINESS,
    );

    const result = await handleReadiness(tmpDir);
    const parsed = JSON.parse(result.content[0].text);

    expect(parsed.status).toBe("ok");
    expect(parsed.metadata).toBeDefined();
    expect(parsed.metadata).toHaveProperty("last_bootstrap");
    expect(parsed.metadata).toHaveProperty("staleness");
    expect(parsed.metadata).toHaveProperty("query_ms");
    expect(typeof parsed.metadata.query_ms).toBe("number");
  });
});
