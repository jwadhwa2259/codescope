import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

// Module under test -- will be created in GREEN phase
import { handleConventions } from "../../src/tools/conventions.js";

describe("codescope_conventions", () => {
  let tmpDir: string;
  let codescopePath: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "codescope-conventions-test-"),
    );
    codescopePath = path.join(tmpDir, ".claude", "codescope");
    fs.mkdirSync(codescopePath, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  /**
   * Helper: write bootstrap-meta.json + graph.db so isBootstrapped returns true.
   */
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

  /** Sample conventions.md content with structured convention blocks. */
  const SAMPLE_CONVENTIONS = `## Naming Conventions

**Convention:** camelCase for variables
**Adoption:** 92%
**Confidence:** HIGH-CONF
**Category:** naming
**Files:** src/utils/paths.ts, src/tools/helpers.ts, src/config/loader.ts
**Evidence:**
- src/utils/paths.ts:4 — const codescopePath = ...
- src/tools/helpers.ts:10 — const startMs = ...
- src/config/loader.ts:8 — const configData = ...

## Import Conventions

**Convention:** Named exports over default exports
**Adoption:** 85%
**Confidence:** HIGH-CONF
**Category:** imports
**Files:** src/tools/status.ts, src/tools/helpers.ts, src/server.ts
**Evidence:**
- src/tools/status.ts:1 — export function registerStatusTool
- src/tools/helpers.ts:1 — export function okResponse
- src/server.ts:3 — export function createServer

## Error Handling

**Convention:** try-catch with typed errors
**Adoption:** 45%
**Confidence:** LOW-CONF
**Category:** error-handling
**Files:** src/graph/builder.ts, src/agents/scout.ts
**Evidence:**
- src/graph/builder.ts:22 — try { ... } catch (e) { ... }
- src/agents/scout.ts:15 — try { ... } catch (e) { ... }
`;

  it("Test 7: Returns all conventions when no filter specified", async () => {
    setupBootstrapped();
    fs.writeFileSync(
      path.join(codescopePath, "conventions.md"),
      SAMPLE_CONVENTIONS,
    );

    const result = await handleConventions(tmpDir, {});
    const parsed = JSON.parse(result.content[0].text);

    expect(parsed.status).toBe("ok");
    expect(parsed.data.conventions).toHaveLength(3);
    expect(parsed.data.total).toBe(3);
    expect(parsed.data.filtered).toBe(3);
  });

  it("Test 8: Filters conventions by file_path (matches conventions whose files list includes the path)", async () => {
    setupBootstrapped();
    fs.writeFileSync(
      path.join(codescopePath, "conventions.md"),
      SAMPLE_CONVENTIONS,
    );

    const result = await handleConventions(tmpDir, {
      file_path: "src/tools/helpers.ts",
    });
    const parsed = JSON.parse(result.content[0].text);

    expect(parsed.status).toBe("ok");
    // helpers.ts appears in Naming and Import conventions, not Error Handling
    expect(parsed.data.conventions.length).toBe(2);
    expect(parsed.data.filtered).toBe(2);
    expect(parsed.data.total).toBe(3);
    const names = parsed.data.conventions.map(
      (c: { name: string }) => c.name,
    );
    expect(names).toContain("camelCase for variables");
    expect(names).toContain("Named exports over default exports");
  });

  it("Test 9: Filters conventions by module name", async () => {
    setupBootstrapped();
    fs.writeFileSync(
      path.join(codescopePath, "conventions.md"),
      SAMPLE_CONVENTIONS,
    );

    const result = await handleConventions(tmpDir, { module: "imports" });
    const parsed = JSON.parse(result.content[0].text);

    expect(parsed.status).toBe("ok");
    expect(parsed.data.conventions.length).toBe(1);
    expect(parsed.data.conventions[0].name).toBe(
      "Named exports over default exports",
    );
    expect(parsed.data.conventions[0].category).toBe("imports");
  });

  it("Test 10: Returns NOT_BOOTSTRAPPED error when not bootstrapped", async () => {
    // No graph.db created
    const result = await handleConventions(tmpDir, {});
    const parsed = JSON.parse(result.content[0].text);

    expect(parsed.status).toBe("error");
    expect(parsed.error.code).toBe("NOT_BOOTSTRAPPED");
    expect(parsed.error.recovery).toContain("bootstrap");
  });

  it("Test 11: Returns empty conventions message when conventions.md has no entries", async () => {
    setupBootstrapped();
    fs.writeFileSync(
      path.join(codescopePath, "conventions.md"),
      "# Conventions\n\nNo conventions detected yet.\n",
    );

    const result = await handleConventions(tmpDir, {});
    const parsed = JSON.parse(result.content[0].text);

    expect(parsed.status).toBe("ok");
    expect(parsed.data.conventions).toHaveLength(0);
    expect(parsed.data.message).toBe(
      "No conventions detected. This may indicate a very small codebase or highly varied coding patterns.",
    );
  });

  it("Test 12: Response includes adoption percentages and confidence levels", async () => {
    setupBootstrapped();
    fs.writeFileSync(
      path.join(codescopePath, "conventions.md"),
      SAMPLE_CONVENTIONS,
    );

    const result = await handleConventions(tmpDir, {});
    const parsed = JSON.parse(result.content[0].text);

    expect(parsed.status).toBe("ok");
    const firstConv = parsed.data.conventions[0];
    expect(firstConv).toHaveProperty("adoption_pct");
    expect(firstConv).toHaveProperty("confidence");
    expect(firstConv).toHaveProperty("category");
    expect(firstConv).toHaveProperty("evidence");
    expect(typeof firstConv.adoption_pct).toBe("number");
    expect(firstConv.adoption_pct).toBe(92);
    expect(firstConv.confidence).toBe("HIGH-CONF");
  });
});
