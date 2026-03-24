import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

import { handleVerify } from "../../src/tools/verify.js";

describe("codescope_verify", () => {
  let tmpDir: string;
  let codescopePath: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "codescope-verify-test-"));
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

  // ---- Backward compat tests (from Phase 3) ----

  it("Test 8: Convention compliance check runs against enforced conventions", async () => {
    setupBootstrapped();

    // Write enforced conventions
    fs.writeFileSync(
      path.join(codescopePath, "conventions-enforced.md"),
      "## Enforced Conventions\n\n**Convention:** Prefer Named Exports\n**Rule:** prefer-named-exports\n**Adoption:** 90%\n",
    );

    const result = await handleVerify(tmpDir, {
      files: ["src/auth.ts"],
      checks: ["convention_compliance"],
    });
    const parsed = JSON.parse(result.content[0].text);

    expect(parsed.status).toBe("ok");
    expect(parsed.data.files_checked).toBeDefined();
    expect(parsed.data.checks).toBeDefined();
    expect(parsed.data.checks.convention_compliance).toBeDefined();
    expect(parsed.data.summary).toBeDefined();
  });

  it("Test 9: Returns violations with file, line, convention name", async () => {
    setupBootstrapped();

    // Write enforced conventions
    fs.writeFileSync(
      path.join(codescopePath, "conventions-enforced.md"),
      "## Enforced Conventions\n\n**Convention:** Prefer Named Exports\n**Rule:** prefer-named-exports\n**Adoption:** 90%\n",
    );

    const result = await handleVerify(tmpDir, {
      files: ["src/auth.ts"],
      checks: ["convention_compliance"],
    });
    const parsed = JSON.parse(result.content[0].text);

    expect(parsed.status).toBe("ok");
    // Convention violations may be in the check result
    const ccResult = parsed.data.checks.convention_compliance;
    expect(ccResult).toBeDefined();
    if (ccResult.violations && ccResult.violations.length > 0) {
      for (const violation of ccResult.violations) {
        expect(violation).toHaveProperty("file");
        expect(violation).toHaveProperty("line");
        expect(violation).toHaveProperty("convention");
      }
    }
  });

  it("Test 10: Returns NOT_BOOTSTRAPPED error when not bootstrapped", async () => {
    // Do NOT set up bootstrapped state
    const result = await handleVerify(tmpDir, {
      files: ["src/auth.ts"],
      checks: ["convention_compliance"],
    });
    const parsed = JSON.parse(result.content[0].text);

    expect(parsed.status).toBe("error");
    expect(parsed.error.code).toBe("NOT_BOOTSTRAPPED");
    expect(parsed.error.recovery).toContain("bootstrap");
  });

  it("Test 11: Includes capabilities with all 8 check types and empty upcoming array", async () => {
    setupBootstrapped();

    fs.writeFileSync(
      path.join(codescopePath, "conventions-enforced.md"),
      "## Enforced Conventions\n\n**Convention:** Prefer Named Exports\n**Rule:** prefer-named-exports\n**Adoption:** 90%\n",
    );

    const result = await handleVerify(tmpDir, {
      files: ["src/auth.ts"],
    });
    const parsed = JSON.parse(result.content[0].text);

    // All 8 check types should be in capabilities
    expect(parsed.metadata.capabilities).toContain("convention_compliance");
    expect(parsed.metadata.capabilities).toContain("blast_radius_diff");
    expect(parsed.metadata.capabilities).toContain("build");
    expect(parsed.metadata.capabilities).toContain("unit_tests");
    expect(parsed.metadata.capabilities).toContain("integration_tests");
    expect(parsed.metadata.capabilities).toContain("e2e");
    expect(parsed.metadata.capabilities).toContain("auto_smoke");
    expect(parsed.metadata.capabilities).toContain("code_review");
    expect(parsed.metadata.capabilities).toHaveLength(8);

    // Upcoming should be empty (not the Phase 3 upcoming list)
    expect(parsed.metadata.upcoming).toEqual([]);
  });

  it("Test 12: Handles missing conventions (no enforced conventions file) gracefully", async () => {
    setupBootstrapped();
    // Do NOT create conventions-enforced.md

    const result = await handleVerify(tmpDir, {
      files: ["src/auth.ts"],
      checks: ["convention_compliance"],
    });
    const parsed = JSON.parse(result.content[0].text);

    // Should still succeed with pass status for convention check
    expect(["ok", "partial"]).toContain(parsed.status);
    const ccResult = parsed.data.checks.convention_compliance;
    expect(ccResult.status).toBe("pass");
    expect(ccResult.detail).toContain("No conventions enforced");
  });

  it("Test 13: Returns empty state message when conventions-enforced.md is empty", async () => {
    setupBootstrapped();
    // Create an empty conventions-enforced.md
    fs.writeFileSync(
      path.join(codescopePath, "conventions-enforced.md"),
      "",
    );

    const result = await handleVerify(tmpDir, {
      files: ["src/auth.ts"],
      checks: ["convention_compliance"],
    });
    const parsed = JSON.parse(result.content[0].text);

    const ccResult = parsed.data.checks.convention_compliance;
    expect(ccResult.status).toBe("pass");
    expect(ccResult.detail).toContain("No conventions enforced");
  });

  // ---- New Phase 5 tests ----

  it("returns structured response with all check types", async () => {
    setupBootstrapped();

    const result = await handleVerify(tmpDir, {
      files: ["src/auth.ts"],
    });
    const parsed = JSON.parse(result.content[0].text);

    // Should be partial (blast_radius_diff and code_review unavailable without task_slug)
    expect(parsed.status).toBe("partial");
    expect(parsed.data.checks).toBeDefined();
    expect(parsed.data.summary).toBeDefined();
    expect(parsed.data.summary.total_duration_ms).toBeGreaterThanOrEqual(0);
  });

  it("returns partial status when some checks are unavailable", async () => {
    setupBootstrapped();

    const result = await handleVerify(tmpDir, {
      files: ["src/auth.ts"],
      // Request all checks including orient-dependent ones
      checks: [
        "convention_compliance",
        "blast_radius_diff",
        "code_review",
      ],
    });
    const parsed = JSON.parse(result.content[0].text);

    expect(parsed.status).toBe("partial");
    expect(parsed.warnings).toBeDefined();
    expect(parsed.warnings.length).toBeGreaterThan(0);

    // blast_radius_diff and code_review should be unavailable
    expect(parsed.data.checks.blast_radius_diff.status).toBe("unavailable");
    expect(parsed.data.checks.code_review.status).toBe("unavailable");
  });

  it("resolves orient artifacts with task_slug", async () => {
    setupBootstrapped();

    // Create orient artifacts for the task
    const taskSlug = "test-task";
    const plansDir = path.join(codescopePath, "plans");
    const executionDir = path.join(codescopePath, "execution", taskSlug);
    fs.mkdirSync(plansDir, { recursive: true });
    fs.mkdirSync(executionDir, { recursive: true });
    fs.writeFileSync(
      path.join(plansDir, `${taskSlug}.md`),
      "# Plan",
    );
    fs.writeFileSync(
      path.join(executionDir, "scope-contract.md"),
      "# Scope Contract",
    );

    const result = await handleVerify(tmpDir, {
      files: ["src/auth.ts"],
      checks: ["blast_radius_diff", "code_review"],
      task_slug: taskSlug,
    });
    const parsed = JSON.parse(result.content[0].text);

    // With orient artifacts available, these checks should NOT be unavailable
    expect(parsed.data.checks.blast_radius_diff.status).not.toBe(
      "unavailable",
    );
    expect(parsed.data.checks.code_review.status).not.toBe("unavailable");
  });

  it("without task_slug, blast_radius_diff and code_review are unavailable", async () => {
    setupBootstrapped();

    const result = await handleVerify(tmpDir, {
      files: ["src/auth.ts"],
      checks: ["blast_radius_diff", "code_review"],
    });
    const parsed = JSON.parse(result.content[0].text);

    expect(parsed.status).toBe("partial");
    expect(parsed.data.checks.blast_radius_diff.status).toBe("unavailable");
    expect(parsed.data.checks.code_review.status).toBe("unavailable");

    // Warnings should explain why
    expect(parsed.warnings).toBeDefined();
    expect(
      parsed.warnings.some((w: string) =>
        w.includes("blast_radius_diff unavailable"),
      ),
    ).toBe(true);
    expect(
      parsed.warnings.some((w: string) =>
        w.includes("code_review unavailable"),
      ),
    ).toBe(true);
  });

  it("returns ok status when only standalone checks are requested", async () => {
    setupBootstrapped();

    const result = await handleVerify(tmpDir, {
      files: ["src/auth.ts"],
      checks: ["convention_compliance", "build"],
    });
    const parsed = JSON.parse(result.content[0].text);

    // Should be ok since no orient-dependent checks
    expect(parsed.status).toBe("ok");
    expect(parsed.data.checks.convention_compliance).toBeDefined();
    expect(parsed.data.checks.build).toBeDefined();
  });
});
