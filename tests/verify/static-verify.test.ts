import { describe, it, expect, beforeEach, vi } from "vitest";
import type {
  StaticVerifyResult,
  ConventionViolation,
  ReviewFinding,
  BlastRadiusDiffResult,
  VerifyCallbacks,
} from "../../src/verify/types.js";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

// Mock computeBlastRadiusDiff from blast-radius-diff
const mockBlastRadiusDiff: BlastRadiusDiffResult = {
  surprises: [],
  skips: [],
  scopeDrift: [],
  timing_ms: 5,
};

vi.mock("../../src/verify/blast-radius-diff.js", () => ({
  computeBlastRadiusDiff: vi.fn(async () => mockBlastRadiusDiff),
}));

// Mock getCodescopePath
vi.mock("../../src/utils/paths.js", () => ({
  getCodescopePath: vi.fn((projectRoot: string) => `${projectRoot}/.claude/codescope`),
}));

// Track fs reads and execFileSync/execSync calls
const mockFileContents = new Map<string, string>();
let mockExecCalls: Array<{ cmd: string; opts: unknown }> = [];
let mockExecResults = new Map<string, string>();
let mockExecErrors = new Map<string, { stdout: string; stderr: string; status: number }>();

vi.mock("node:fs", async () => {
  const actual = await vi.importActual<typeof import("node:fs")>("node:fs");
  return {
    ...actual,
    existsSync: vi.fn((filePath: unknown) => {
      const p = filePath as string;
      // Rule files and known mocked files
      if (mockFileContents.has(p)) return true;
      // Check rule file existence
      if (p.endsWith(".yml")) return mockFileContents.has(p);
      return actual.existsSync(p as string);
    }),
    readFileSync: vi.fn((filePath: unknown, encoding?: unknown) => {
      const p = filePath as string;
      if (mockFileContents.has(p)) {
        return mockFileContents.get(p)!;
      }
      return actual.readFileSync(p as string, encoding as string);
    }),
  };
});

vi.mock("node:child_process", () => {
  const handler = (cmd: string, opts?: unknown) => {
    mockExecCalls.push({ cmd, opts });

    // Check for error mock first
    for (const [pattern, errObj] of mockExecErrors) {
      if (cmd.includes(pattern)) {
        const err = new Error("Command failed") as Error & { stdout: string; stderr: string; status: number };
        err.stdout = errObj.stdout;
        err.stderr = errObj.stderr;
        err.status = errObj.status;
        throw err;
      }
    }

    // Check for result mock
    for (const [pattern, result] of mockExecResults) {
      if (cmd.includes(pattern)) {
        return result;
      }
    }

    return "";
  };

  return {
    execFileSync: vi.fn((file: string, args: string[], opts?: unknown) => {
      // Reconstruct cmd string so existing pattern matching continues to work
      const cmd = [file, ...args].join(" ");
      return handler(cmd, opts);
    }),
    execSync: vi.fn((cmd: string, opts?: unknown) => {
      return handler(cmd, opts);
    }),
  };
});

import { computeBlastRadiusDiff } from "../../src/verify/blast-radius-diff.js";
import { runStaticVerify } from "../../src/verify/static-verify.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeCallbacks(overrides?: Partial<VerifyCallbacks>): VerifyCallbacks {
  return {
    dispatchReviewAgent: overrides?.dispatchReviewAgent ?? vi.fn(async () => "[]"),
    dispatchSmokeAgent: overrides?.dispatchSmokeAgent ?? vi.fn(async () => "[]"),
    onProgress: overrides?.onProgress ?? vi.fn(),
  };
}

const PROJECT_ROOT = "/mock/project";
const CS_PATH = `${PROJECT_ROOT}/.claude/codescope`;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("runStaticVerify", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFileContents.clear();
    mockExecCalls = [];
    mockExecResults.clear();
    mockExecErrors.clear();
  });

  // Test 1: runStaticVerify returns StaticVerifyResult shape
  it("returns StaticVerifyResult with conventionViolations, blastRadiusDiff, codeReview, and timing", async () => {
    // Setup: empty conventions-enforced.md (no conventions)
    const callbacks = makeCallbacks();
    const result = await runStaticVerify(
      {
        projectRoot: PROJECT_ROOT,
        taskSlug: "test-task",
        changedFiles: ["src/foo.ts"],
        planPath: "/mock/plan.json",
        scopeContractPath: "/mock/scope.json",
      },
      callbacks,
    );

    expect(result).toHaveProperty("conventionViolations");
    expect(result).toHaveProperty("blastRadiusDiff");
    expect(result).toHaveProperty("codeReview");
    expect(result).toHaveProperty("timing");
    expect(result.timing).toHaveProperty("convention_ms");
    expect(result.timing).toHaveProperty("blastRadius_ms");
    expect(result.timing).toHaveProperty("codeReview_ms");
    expect(Array.isArray(result.conventionViolations)).toBe(true);
    expect(Array.isArray(result.codeReview)).toBe(true);
  });

  // Test 2: Convention compliance reads conventions-enforced.md and scans with ast-grep
  it("reads conventions-enforced.md and scans changed files with ast-grep rules", async () => {
    // Setup: one enforced convention with a matching rule file
    mockFileContents.set(`${CS_PATH}/conventions-enforced.md`, [
      "## Enforced Conventions",
      "",
      "**Convention:** Prefer Named Exports",
      "**Rule:** prefer-named-exports",
      "**Adoption:** 85%",
    ].join("\n"));

    mockFileContents.set(`${CS_PATH}/rules/typescript/prefer-named-exports.yml`, "rule content");
    mockFileContents.set(`${CS_PATH}/conventions.md`, "### Prefer Named Exports\n\n| Metric | Value |\n|--------|-------|\n| Adoption | 85% (17/20 files) |");
    mockFileContents.set(`${CS_PATH}/golden-files.md`, "# Golden Files\n\n1. `src/utils/helpers.ts` -- 5/7 conventions followed (71%)");

    // Mock changed files as existing
    mockFileContents.set("src/foo.ts", "export default function foo() {}");

    // ast-grep returns a match via non-zero exit (common pattern)
    mockExecErrors.set("sg scan", {
      stdout: JSON.stringify([{
        text: "export default function foo() {}",
        range: { start: { line: 5, column: 0 }, end: { line: 5, column: 31 } },
        file: "src/foo.ts",
        ruleId: "prefer-named-exports",
      }]),
      stderr: "",
      status: 1,
    });

    // Mock scope contract for code review prompt
    mockFileContents.set("/mock/scope.json", JSON.stringify({ inScope: [], outOfScope: [], affectedFiles: [] }));

    const callbacks = makeCallbacks();
    const result = await runStaticVerify(
      {
        projectRoot: PROJECT_ROOT,
        taskSlug: "test-task",
        changedFiles: ["src/foo.ts"],
        planPath: "/mock/plan.json",
        scopeContractPath: "/mock/scope.json",
      },
      callbacks,
    );

    expect(result.conventionViolations.length).toBeGreaterThan(0);
    // Verify ast-grep was called
    const sgCalls = mockExecCalls.filter((c) => c.cmd.includes("sg scan"));
    expect(sgCalls.length).toBeGreaterThan(0);
  });

  // Test 3: Convention violations include adoption percentage from conventions.md
  it("includes adoption percentage parsed from conventions.md", async () => {
    mockFileContents.set(`${CS_PATH}/conventions-enforced.md`, [
      "**Convention:** Prefer Named Exports",
      "**Rule:** prefer-named-exports",
    ].join("\n"));

    mockFileContents.set(`${CS_PATH}/conventions.md`, [
      "### Prefer Named Exports",
      "",
      "| Metric | Value |",
      "|--------|-------|",
      "| Adoption | 85% (17/20 files) |",
    ].join("\n"));

    mockFileContents.set(`${CS_PATH}/golden-files.md`, "# Golden Files\n");
    mockFileContents.set(`${CS_PATH}/rules/typescript/prefer-named-exports.yml`, "rule");
    mockFileContents.set("/mock/scope.json", "{}");
    mockFileContents.set("src/foo.ts", "export default foo");

    mockExecErrors.set("sg scan", {
      stdout: JSON.stringify([{
        text: "export default foo",
        range: { start: { line: 3, column: 0 }, end: { line: 3, column: 18 } },
        file: "src/foo.ts",
      }]),
      stderr: "",
      status: 1,
    });

    const callbacks = makeCallbacks();
    const result = await runStaticVerify(
      {
        projectRoot: PROJECT_ROOT,
        taskSlug: "t",
        changedFiles: ["src/foo.ts"],
        planPath: "/mock/plan.json",
        scopeContractPath: "/mock/scope.json",
      },
      callbacks,
    );

    expect(result.conventionViolations[0].adoption).toBe(85);
  });

  // Test 4: Convention violations include golden file path:line-range
  it("includes golden file path:line-range from golden-files.md (D-04)", async () => {
    mockFileContents.set(`${CS_PATH}/conventions-enforced.md`, [
      "**Convention:** Prefer Named Exports",
      "**Rule:** prefer-named-exports",
    ].join("\n"));

    mockFileContents.set(`${CS_PATH}/conventions.md`, [
      "### Prefer Named Exports",
      "",
      "| Metric | Value |",
      "|--------|-------|",
      "| Adoption | 90% (18/20 files) |",
    ].join("\n"));

    mockFileContents.set(`${CS_PATH}/golden-files.md`, [
      "# Golden Files",
      "",
      "1. `src/utils/helpers.ts` -- 5/7 conventions followed (71%)",
      "2. `src/api/routes.ts` -- 4/7 conventions followed (57%)",
    ].join("\n"));

    mockFileContents.set(`${CS_PATH}/rules/typescript/prefer-named-exports.yml`, "rule");
    mockFileContents.set("/mock/scope.json", "{}");
    mockFileContents.set("src/bar.ts", "export default something");

    mockExecErrors.set("sg scan", {
      stdout: JSON.stringify([{
        text: "export default",
        range: { start: { line: 10, column: 0 }, end: { line: 10, column: 14 } },
        file: "src/bar.ts",
      }]),
      stderr: "",
      status: 1,
    });

    const callbacks = makeCallbacks();
    const result = await runStaticVerify(
      {
        projectRoot: PROJECT_ROOT,
        taskSlug: "t",
        changedFiles: ["src/bar.ts"],
        planPath: "/mock/plan.json",
        scopeContractPath: "/mock/scope.json",
      },
      callbacks,
    );

    expect(result.conventionViolations[0].goldenFile).not.toBeNull();
    // Should be the top golden file path
    expect(result.conventionViolations[0].goldenFile).toContain("src/utils/helpers.ts");
  });

  // Test 5: Empty conventions-enforced.md returns empty violations
  it("returns empty violations when conventions-enforced.md is empty", async () => {
    mockFileContents.set(`${CS_PATH}/conventions-enforced.md`, "");
    mockFileContents.set("/mock/scope.json", "{}");

    const callbacks = makeCallbacks();
    const result = await runStaticVerify(
      {
        projectRoot: PROJECT_ROOT,
        taskSlug: "t",
        changedFiles: ["src/foo.ts"],
        planPath: "/mock/plan.json",
        scopeContractPath: "/mock/scope.json",
      },
      callbacks,
    );

    expect(result.conventionViolations).toEqual([]);
  });

  // Test 6: Missing conventions-enforced.md returns empty violations
  it("returns empty violations when conventions-enforced.md does not exist", async () => {
    // Don't set the file in mockFileContents — existsSync returns false
    mockFileContents.set("/mock/scope.json", "{}");

    const callbacks = makeCallbacks();
    const result = await runStaticVerify(
      {
        projectRoot: PROJECT_ROOT,
        taskSlug: "t",
        changedFiles: ["src/foo.ts"],
        planPath: "/mock/plan.json",
        scopeContractPath: "/mock/scope.json",
      },
      callbacks,
    );

    expect(result.conventionViolations).toEqual([]);
  });

  // Test 7: Code review prompt includes git diff, scope contract, conventions, golden file excerpts
  it("builds code review prompt with git diff, scope contract, conventions, and golden file excerpts (D-23)", async () => {
    mockFileContents.set(`${CS_PATH}/conventions-enforced.md`, [
      "**Convention:** Prefer Named Exports",
      "**Rule:** prefer-named-exports",
    ].join("\n"));
    mockFileContents.set(`${CS_PATH}/conventions.md`, "### Prefer Named Exports\n");
    mockFileContents.set(`${CS_PATH}/golden-files.md`, "# Golden Files\n\n1. `src/golden.ts` -- 5/7 (71%)\n");
    mockFileContents.set(`${CS_PATH}/rules/typescript/prefer-named-exports.yml`, "rule");
    mockFileContents.set("/mock/scope.json", '{"inScope": ["feature X"]}');

    // git diff returns something
    mockExecResults.set("git diff", "diff --git a/src/foo.ts\n+added line");

    // dispatchReviewAgent captures the prompt
    let capturedPrompt = "";
    const mockDispatch = vi.fn(async (prompt: string) => {
      capturedPrompt = prompt;
      return "[]";
    });

    const callbacks = makeCallbacks({ dispatchReviewAgent: mockDispatch });
    await runStaticVerify(
      {
        projectRoot: PROJECT_ROOT,
        taskSlug: "t",
        changedFiles: ["src/foo.ts"],
        planPath: "/mock/plan.json",
        scopeContractPath: "/mock/scope.json",
      },
      callbacks,
    );

    expect(mockDispatch).toHaveBeenCalledOnce();
    // Prompt should contain relevant sections
    expect(capturedPrompt).toContain("diff");
    expect(capturedPrompt).toContain("scope");
    expect(capturedPrompt).toContain("convention");
  });

  // Test 8: Code review prompt includes soft cap of 10 findings instruction
  it("includes soft cap of 10 findings instruction in code review prompt (D-24)", async () => {
    mockFileContents.set(`${CS_PATH}/conventions-enforced.md`, "");
    mockFileContents.set("/mock/scope.json", "{}");

    mockExecResults.set("git diff", "some diff");

    let capturedPrompt = "";
    const mockDispatch = vi.fn(async (prompt: string) => {
      capturedPrompt = prompt;
      return "[]";
    });

    const callbacks = makeCallbacks({ dispatchReviewAgent: mockDispatch });
    await runStaticVerify(
      {
        projectRoot: PROJECT_ROOT,
        taskSlug: "t",
        changedFiles: ["src/foo.ts"],
        planPath: "/mock/plan.json",
        scopeContractPath: "/mock/scope.json",
      },
      callbacks,
    );

    expect(capturedPrompt.toLowerCase()).toContain("soft cap");
    expect(capturedPrompt).toContain("10");
  });

  // Test 9: dispatchReviewAgent return value parsed into ReviewFinding[]
  it("parses dispatchReviewAgent return value into ReviewFinding[]", async () => {
    mockFileContents.set(`${CS_PATH}/conventions-enforced.md`, "");
    mockFileContents.set("/mock/scope.json", "{}");
    mockExecResults.set("git diff", "some diff");

    const findings: ReviewFinding[] = [
      { file: "src/foo.ts", line: 10, description: "Unused import", severity: "INFO" },
      { file: "src/foo.ts", line: 25, description: "Missing error handling", severity: "WARN" },
    ];

    const mockDispatch = vi.fn(async () => JSON.stringify(findings));
    const callbacks = makeCallbacks({ dispatchReviewAgent: mockDispatch });

    const result = await runStaticVerify(
      {
        projectRoot: PROJECT_ROOT,
        taskSlug: "t",
        changedFiles: ["src/foo.ts"],
        planPath: "/mock/plan.json",
        scopeContractPath: "/mock/scope.json",
      },
      callbacks,
    );

    expect(result.codeReview).toEqual(findings);
  });

  // Test 10: blastRadiusDiff field is populated by computeBlastRadiusDiff
  it("populates blastRadiusDiff by calling computeBlastRadiusDiff", async () => {
    mockFileContents.set(`${CS_PATH}/conventions-enforced.md`, "");
    mockFileContents.set("/mock/scope.json", "{}");
    mockExecResults.set("git diff", "");

    const callbacks = makeCallbacks();
    const result = await runStaticVerify(
      {
        projectRoot: PROJECT_ROOT,
        taskSlug: "t",
        changedFiles: ["src/foo.ts"],
        planPath: "/mock/plan.json",
        scopeContractPath: "/mock/scope.json",
      },
      callbacks,
    );

    expect(computeBlastRadiusDiff).toHaveBeenCalledWith(
      PROJECT_ROOT,
      "/mock/plan.json",
      "/mock/scope.json",
      ["src/foo.ts"],
    );
    expect(result.blastRadiusDiff).toBe(mockBlastRadiusDiff);
  });

  // Test 11: timing field tracks milliseconds for each check
  it("tracks timing in milliseconds for convention, blastRadius, and codeReview", async () => {
    mockFileContents.set(`${CS_PATH}/conventions-enforced.md`, "");
    mockFileContents.set("/mock/scope.json", "{}");
    mockExecResults.set("git diff", "");

    const callbacks = makeCallbacks();
    const result = await runStaticVerify(
      {
        projectRoot: PROJECT_ROOT,
        taskSlug: "t",
        changedFiles: ["src/foo.ts"],
        planPath: "/mock/plan.json",
        scopeContractPath: "/mock/scope.json",
      },
      callbacks,
    );

    expect(typeof result.timing.convention_ms).toBe("number");
    expect(typeof result.timing.blastRadius_ms).toBe("number");
    expect(typeof result.timing.codeReview_ms).toBe("number");
    expect(result.timing.convention_ms).toBeGreaterThanOrEqual(0);
    expect(result.timing.blastRadius_ms).toBeGreaterThanOrEqual(0);
    expect(result.timing.codeReview_ms).toBeGreaterThanOrEqual(0);
  });
});
