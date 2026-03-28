import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { EnforcementSeverity } from "../../src/enforcement/types.js";

// ---------------------------------------------------------------------------
// Mocks -- must be declared before import of module under test
// ---------------------------------------------------------------------------

// Mock node:child_process
vi.mock("node:child_process", () => ({
  execFileSync: vi.fn(),
}));

// Mock node:fs
vi.mock("node:fs", () => ({
  readFileSync: vi.fn(),
  existsSync: vi.fn(),
}));

// Import mocked modules so we can control behavior
import { execFileSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { runPreCommitCheck } from "../../src/enforcement/pre-commit-check.js";

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

const VERIFIED_LEARNINGS = `---
generated: "2026-03-28"
generator: "learning-synthesizer"
phase: 1
total_learnings: 1
---

# Learnings

## Entries

### Prefer Named Exports
- **Status:** VERIFIED
- **Type:** pattern
- **Discovered:** 2026-03-20
- **Expires:** 2026-06-20
- **Evidence:** src/utils/index.ts:1
`;

const SG_MATCH_OUTPUT = JSON.stringify([
  {
    file: "src/foo.ts",
    range: {
      start: { line: 4, column: 0 },
      end: { line: 4, column: 30 },
    },
    text: "export const foo = 42",
    ruleId: "prefer-named-exports",
  },
]);

const NO_VERIFIED_LEARNINGS = `---
generated: "2026-03-28"
generator: "learning-synthesizer"
phase: 1
total_learnings: 1
---

# Learnings

## Entries

### Default Export
- **Status:** UNVERIFIED
- **Type:** pattern
- **Discovered:** 2026-03-20
- **Expires:** 2026-06-20
- **Evidence:** src/App.tsx:1
`;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function setupMocks(opts: {
  learningsContent?: string | null;
  configSeverity?: EnforcementSeverity;
  ruleFileExists?: boolean;
  sgAvailable?: boolean;
  sgOutput?: string | null;
}): void {
  const {
    learningsContent = VERIFIED_LEARNINGS,
    ruleFileExists = true,
    sgAvailable = true,
    sgOutput = SG_MATCH_OUTPUT,
  } = opts;

  const mockedExistsSync = existsSync as ReturnType<typeof vi.fn>;
  const mockedReadFileSync = readFileSync as ReturnType<typeof vi.fn>;
  const mockedExecFileSync = execFileSync as ReturnType<typeof vi.fn>;

  // existsSync: learnings file, rule files
  mockedExistsSync.mockImplementation((filePath: string) => {
    if (typeof filePath === "string" && filePath.endsWith("learnings.md")) {
      return learningsContent !== null;
    }
    if (typeof filePath === "string" && filePath.endsWith(".yml")) {
      return ruleFileExists;
    }
    return false;
  });

  // readFileSync: learnings file
  mockedReadFileSync.mockImplementation((filePath: string) => {
    if (typeof filePath === "string" && filePath.endsWith("learnings.md")) {
      return learningsContent ?? "";
    }
    return "";
  });

  // execFileSync: sg --version and sg scan
  mockedExecFileSync.mockImplementation(
    (cmd: string, args: string[]) => {
      if (cmd === "sg" && args[0] === "--version") {
        if (!sgAvailable) {
          throw new Error("ENOENT: sg not found");
        }
        return "0.40.5";
      }
      if (cmd === "sg" && args[0] === "scan") {
        if (sgOutput === null) {
          // No matches -- sg returns exit code 1 with empty stdout
          const err = new Error("sg scan exited with code 1") as Error & { stdout: string };
          err.stdout = "[]";
          throw err;
        }
        // sg returns exit code 1 when matches found, stdout has JSON
        const err = new Error("sg scan exited with code 1") as Error & { stdout: string };
        err.stdout = sgOutput;
        throw err;
      }
      return "";
    },
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("pre-commit-check", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns exitCode 0 and empty findings when no VERIFIED conventions exist", () => {
    setupMocks({ learningsContent: NO_VERIFIED_LEARNINGS });

    const result = runPreCommitCheck(["src/foo.ts"], "/project", {
      severity: "suggest-only",
    });

    expect(result.exitCode).toBe(0);
    expect(result.findings).toEqual([]);
    expect(result.summary).toContain("No VERIFIED conventions");
  });

  it("returns exitCode 0 with findings for suggest-only severity", () => {
    setupMocks({ configSeverity: "suggest-only" });

    const result = runPreCommitCheck(["src/foo.ts"], "/project", {
      severity: "suggest-only",
    });

    expect(result.exitCode).toBe(0);
    expect(result.findings.length).toBeGreaterThan(0);
    expect(result.severity).toBe("suggest-only");
    expect(result.output).toContain("[INFO]");
  });

  it("returns exitCode 0 with yellow-banner output for warn severity", () => {
    setupMocks({});

    const result = runPreCommitCheck(["src/foo.ts"], "/project", {
      severity: "warn",
    });

    expect(result.exitCode).toBe(0);
    expect(result.findings.length).toBeGreaterThan(0);
    expect(result.severity).toBe("warn");
    expect(result.output).toContain("[WARN]");
    // Yellow ANSI escape code
    expect(result.output).toContain("\x1b[33m");
  });

  it("returns exitCode 2 with red-banner output for block severity with findings", () => {
    setupMocks({});

    const result = runPreCommitCheck(["src/foo.ts"], "/project", {
      severity: "block",
    });

    expect(result.exitCode).toBe(2);
    expect(result.findings.length).toBeGreaterThan(0);
    expect(result.severity).toBe("block");
    expect(result.output).toContain("[BLOCK]");
    // Red ANSI escape code
    expect(result.output).toContain("\x1b[31m");
  });

  it("returns exitCode 0 for block severity with zero findings", () => {
    setupMocks({ sgOutput: null });

    const result = runPreCommitCheck(["src/foo.ts"], "/project", {
      severity: "block",
    });

    expect(result.exitCode).toBe(0);
    expect(result.findings).toEqual([]);
  });

  it('summary line contains "Checked N conventions against M staged files: K finding(s)"', () => {
    setupMocks({});

    const result = runPreCommitCheck(["src/foo.ts", "src/bar.ts"], "/project", {
      severity: "suggest-only",
    });

    // Should match "Checked 1 conventions against 2 staged files: 1 finding(s)"
    expect(result.summary).toMatch(
      /Checked \d+ conventions? against \d+ staged files?: \d+ finding\(s\)/,
    );
  });

  it("skips rule files that don't exist on disk", () => {
    setupMocks({ ruleFileExists: false });

    const result = runPreCommitCheck(["src/foo.ts"], "/project", {
      severity: "suggest-only",
    });

    // No rule files found, so no findings
    expect(result.exitCode).toBe(0);
    expect(result.findings).toEqual([]);
  });

  it("exits 0 with warning when sg CLI is not available", () => {
    setupMocks({ sgAvailable: false });

    const result = runPreCommitCheck(["src/foo.ts"], "/project", {
      severity: "block",
    });

    expect(result.exitCode).toBe(0);
    expect(result.output).toContain("[WARN]");
    expect(result.output).toContain("sg");
    expect(result.output).toContain("not found");
  });

  it("returns early with exitCode 0 when learnings.md does not exist", () => {
    setupMocks({ learningsContent: null });

    const result = runPreCommitCheck(["src/foo.ts"], "/project", {
      severity: "block",
    });

    expect(result.exitCode).toBe(0);
    expect(result.summary).toContain("No learnings found");
  });
});
