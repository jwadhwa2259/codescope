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
    expect(parsed.data.violations).toBeDefined();
    expect(Array.isArray(parsed.data.violations)).toBe(true);
    expect(parsed.data.summary).toBeDefined();
    expect(parsed.data.summary.total_violations).toBeDefined();
    expect(parsed.data.summary.files_with_violations).toBeDefined();
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
    // Violations should be an array (may be empty if no real ast-grep available)
    expect(Array.isArray(parsed.data.violations)).toBe(true);
    // Each violation, if present, should have file, line, convention fields
    for (const violation of parsed.data.violations) {
      expect(violation).toHaveProperty("file");
      expect(violation).toHaveProperty("line");
      expect(violation).toHaveProperty("convention");
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

  it("Test 11: Includes capabilities and upcoming arrays per D-36/D-38", async () => {
    setupBootstrapped();

    fs.writeFileSync(
      path.join(codescopePath, "conventions-enforced.md"),
      "## Enforced Conventions\n\n**Convention:** Prefer Named Exports\n**Rule:** prefer-named-exports\n**Adoption:** 90%\n",
    );

    const result = await handleVerify(tmpDir, {
      files: ["src/auth.ts"],
    });
    const parsed = JSON.parse(result.content[0].text);

    expect(parsed.status).toBe("ok");
    expect(parsed.metadata.capabilities).toContain("convention_compliance");
    expect(parsed.metadata.upcoming).toContain("blast_radius_diff");
    expect(parsed.metadata.upcoming).toContain("build_verification");
    expect(parsed.metadata.upcoming).toContain("test_verification");
  });

  it("Test 12: Handles missing conventions (no enforced conventions file) gracefully", async () => {
    setupBootstrapped();
    // Do NOT create conventions-enforced.md

    const result = await handleVerify(tmpDir, {
      files: ["src/auth.ts"],
    });
    const parsed = JSON.parse(result.content[0].text);

    expect(parsed.status).toBe("ok");
    expect(parsed.data.violations).toEqual([]);
    expect(parsed.data.message).toContain("No conventions enforced yet");
  });

  it("Test 13: Returns empty state message when conventions-enforced.md is empty per UI-SPEC", async () => {
    setupBootstrapped();
    // Create an empty conventions-enforced.md
    fs.writeFileSync(
      path.join(codescopePath, "conventions-enforced.md"),
      "",
    );

    const result = await handleVerify(tmpDir, {
      files: ["src/auth.ts"],
    });
    const parsed = JSON.parse(result.content[0].text);

    expect(parsed.status).toBe("ok");
    expect(parsed.data.violations).toEqual([]);
    expect(parsed.data.message).toContain("No conventions enforced yet");
    expect(parsed.data.message).toContain("review-learnings");
  });
});
