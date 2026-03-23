import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

// Module under test -- will be created in GREEN phase
import { handleRecall } from "../../src/tools/recall.js";

describe("codescope_recall", () => {
  let tmpDir: string;
  let codescopePath: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "codescope-recall-test-"));
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

  it("Test 1: Returns combined context from overview.md, conventions.md, learnings.md when all exist", async () => {
    setupBootstrapped();
    fs.writeFileSync(
      path.join(codescopePath, "overview.md"),
      "## Architecture\nThe project uses a modular architecture.\n\n## Imports\nAll imports use ESM.\n",
    );
    fs.writeFileSync(
      path.join(codescopePath, "conventions.md"),
      "## Naming\nUse camelCase for variables.\n\n## Imports\nPrefer named exports over default.\n",
    );
    fs.writeFileSync(
      path.join(codescopePath, "learnings.md"),
      "## Gotchas\nWatch out for circular deps.\n\n## Imports\nAlways add .js extension for ESM.\n",
    );

    const result = await handleRecall(tmpDir, { topic: "imports" });
    const parsed = JSON.parse(result.content[0].text);

    expect(parsed.status).toBe("ok");
    expect(parsed.data.overview).toContain("Imports");
    expect(parsed.data.conventions).toContain("Imports");
    expect(parsed.data.learnings).toContain("Imports");
  });

  it("Test 2: Returns partial result with warnings when some artifacts missing", async () => {
    setupBootstrapped();
    fs.writeFileSync(
      path.join(codescopePath, "overview.md"),
      "## Structure\nProject structure details.\n",
    );
    // conventions.md and learnings.md do NOT exist

    const result = await handleRecall(tmpDir, { topic: "structure" });
    const parsed = JSON.parse(result.content[0].text);

    expect(parsed.status).toBe("partial");
    expect(parsed.warnings).toBeDefined();
    expect(parsed.warnings.length).toBeGreaterThan(0);
    expect(parsed.data.overview).toContain("Structure");
  });

  it("Test 3: Filters sections by topic keyword (case-insensitive match on H2 headings and content)", async () => {
    setupBootstrapped();
    fs.writeFileSync(
      path.join(codescopePath, "overview.md"),
      "## Authentication\nJWT tokens are used.\n\n## Database\nPostgreSQL with Prisma.\n",
    );
    fs.writeFileSync(
      path.join(codescopePath, "conventions.md"),
      "## Naming\ncamelCase everywhere.\n\n## Auth Patterns\nUse middleware.\n",
    );
    fs.writeFileSync(
      path.join(codescopePath, "learnings.md"),
      "## Testing\nUse vitest.\n\n## Security\nAuthentication uses refresh tokens.\n",
    );

    const result = await handleRecall(tmpDir, { topic: "auth" });
    const parsed = JSON.parse(result.content[0].text);

    expect(parsed.status).toBe("ok");
    // Should match "Authentication" in overview (case-insensitive)
    expect(parsed.data.overview).toContain("Authentication");
    // Should match "Auth Patterns" in conventions
    expect(parsed.data.conventions).toContain("Auth Patterns");
    // Should match "Authentication" in learnings content
    expect(parsed.data.learnings).toContain("Authentication");
    // Should NOT contain unrelated sections
    expect(parsed.data.overview).not.toContain("Database");
  });

  it("Test 4: Returns NOT_BOOTSTRAPPED error when graph.db does not exist", async () => {
    // No graph.db created
    const result = await handleRecall(tmpDir, { topic: "anything" });
    const parsed = JSON.parse(result.content[0].text);

    expect(parsed.status).toBe("error");
    expect(parsed.error.code).toBe("NOT_BOOTSTRAPPED");
    expect(parsed.error.recovery).toContain("bootstrap");
  });

  it("Test 5: Response follows D-17 format with staleness metadata", async () => {
    setupBootstrapped();
    fs.writeFileSync(
      path.join(codescopePath, "overview.md"),
      "## Overview\nGeneral info.\n",
    );
    fs.writeFileSync(path.join(codescopePath, "conventions.md"), "## Conv\nInfo.\n");
    fs.writeFileSync(path.join(codescopePath, "learnings.md"), "## Learn\nInfo.\n");

    const result = await handleRecall(tmpDir, { topic: "overview" });
    const parsed = JSON.parse(result.content[0].text);

    expect(parsed.status).toBe("ok");
    expect(parsed.metadata).toBeDefined();
    expect(parsed.metadata).toHaveProperty("last_bootstrap");
    expect(parsed.metadata).toHaveProperty("staleness");
    expect(parsed.metadata).toHaveProperty("query_ms");
    expect(typeof parsed.metadata.query_ms).toBe("number");
  });

  it("Test 6: Returns empty data with note when topic matches nothing", async () => {
    setupBootstrapped();
    fs.writeFileSync(
      path.join(codescopePath, "overview.md"),
      "## Architecture\nModular design.\n",
    );
    fs.writeFileSync(
      path.join(codescopePath, "conventions.md"),
      "## Naming\ncamelCase.\n",
    );
    fs.writeFileSync(
      path.join(codescopePath, "learnings.md"),
      "## Testing\nUse vitest.\n",
    );

    const result = await handleRecall(tmpDir, { topic: "xyznonexistent" });
    const parsed = JSON.parse(result.content[0].text);

    expect(parsed.status).toBe("ok");
    // When no sections match, include summary (first 20 lines) from each file
    expect(parsed.data.overview).toBeTruthy();
    expect(parsed.data.conventions).toBeTruthy();
    expect(parsed.data.learnings).toBeTruthy();
  });
});
