// ---------------------------------------------------------------------------
// Tests for src/execution/qualification.ts
// ---------------------------------------------------------------------------
// Per 13-01-PLAN.md Task 2 behavior specifications.
// Mocks execFileSync to control git and sg CLI outputs.
// ---------------------------------------------------------------------------

import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock node:child_process before importing the module under test
vi.mock("node:child_process", () => ({
  execFileSync: vi.fn(),
}));

import { execFileSync } from "node:child_process";
import { runQualification, type QualificationResult } from "../../src/execution/qualification.js";

const mockExecFileSync = vi.mocked(execFileSync);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function setupGitDiff(files: string[]): void {
  mockExecFileSync.mockImplementation((cmd: string, args?: readonly string[]) => {
    if (cmd === "git" && args && args[0] === "diff" && args[1] === "--name-only") {
      return files.join("\n") + "\n";
    }
    if (cmd === "git" && args && args[0] === "diff" && args[1] === "--stat") {
      return ` 3 files changed, 10 insertions(+), 5 deletions(-)\n`;
    }
    if (cmd === "sg" && args && args[0] === "--version") {
      throw new Error("sg not found");
    }
    return "";
  });
}

function setupGitDiffWithSg(
  files: string[],
  sgOutput: string | Error,
): void {
  mockExecFileSync.mockImplementation((cmd: string, args?: readonly string[]) => {
    if (cmd === "git" && args && args[0] === "diff" && args[1] === "--name-only") {
      return files.join("\n") + "\n";
    }
    if (cmd === "git" && args && args[0] === "diff" && args[1] === "--stat") {
      return ` 2 files changed, 8 insertions(+), 3 deletions(-)\n`;
    }
    if (cmd === "sg" && args && args[0] === "--version") {
      return "0.40.5\n";
    }
    if (cmd === "sg" && args && args[0] === "scan") {
      if (sgOutput instanceof Error) throw sgOutput;
      return sgOutput;
    }
    return "";
  });
}

// ---------------------------------------------------------------------------
// runQualification
// ---------------------------------------------------------------------------

describe("runQualification", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns qualified=true when git diff matches expected files", async () => {
    setupGitDiff(["src/auth.ts", "src/utils.ts"]);

    const result = await runQualification(
      ["src/auth.ts", "src/utils.ts"],
      "/project",
    );

    expect(result.qualified).toBe(true);
    expect(result.issues).toEqual([]);
    expect(result.actualFiles).toContain("src/auth.ts");
    expect(result.actualFiles).toContain("src/utils.ts");
  });

  it("returns qualified=false when no expected files were modified", async () => {
    setupGitDiff(["src/unrelated.ts"]);

    const result = await runQualification(
      ["src/auth.ts", "src/utils.ts"],
      "/project",
    );

    expect(result.qualified).toBe(false);
    expect(result.issues.length).toBeGreaterThan(0);
    expect(result.issues[0]).toContain("No expected files were modified");
  });

  it("returns qualified=true when at least one expected file matches", async () => {
    setupGitDiff(["src/auth.ts", "src/extra.ts"]);

    const result = await runQualification(
      ["src/auth.ts"],
      "/project",
    );

    expect(result.qualified).toBe(true);
    expect(result.issues).toEqual([]);
  });

  it("returns actualFiles from git diff output", async () => {
    setupGitDiff(["file-a.ts", "file-b.ts", "file-c.ts"]);

    const result = await runQualification(["file-a.ts"], "/project");

    expect(result.actualFiles).toEqual(["file-a.ts", "file-b.ts", "file-c.ts"]);
  });

  it("parses linesAdded and linesRemoved from git diff --stat", async () => {
    setupGitDiff(["src/auth.ts"]);

    const result = await runQualification(["src/auth.ts"], "/project");

    expect(result.linesAdded).toBe(10);
    expect(result.linesRemoved).toBe(5);
  });

  it("returns graceful result when git diff fails", async () => {
    mockExecFileSync.mockImplementation(() => {
      throw new Error("not a git repository");
    });

    const result = await runQualification(
      ["src/auth.ts"],
      "/not-a-repo",
    );

    expect(result.qualified).toBe(false);
    expect(result.issues).toContain("git diff failed -- unable to verify file changes");
    expect(result.actualFiles).toEqual([]);
    expect(result.linesAdded).toBe(0);
    expect(result.linesRemoved).toBe(0);
  });

  it("skips convention check when sg is not available (qualified based on file check only)", async () => {
    setupGitDiff(["src/auth.ts"]);

    const result = await runQualification(["src/auth.ts"], "/project");

    expect(result.qualified).toBe(true);
    expect(result.issues).toEqual([]);
  });

  it("returns qualified=false with violation descriptions when sg finds violations", async () => {
    const sgViolations = JSON.stringify([
      {
        file: "src/auth.ts",
        ruleId: "no-any",
        message: "Do not use any type",
      },
    ]);
    setupGitDiffWithSg(["src/auth.ts"], sgViolations);

    const result = await runQualification(["src/auth.ts"], "/project");

    expect(result.qualified).toBe(false);
    expect(result.issues.length).toBe(1);
    expect(result.issues[0]).toContain("Convention violation");
    expect(result.issues[0]).toContain("src/auth.ts");
    expect(result.issues[0]).toContain("no-any");
  });

  it("remains qualified when sg returns empty array", async () => {
    setupGitDiffWithSg(["src/auth.ts"], "[]");

    const result = await runQualification(["src/auth.ts"], "/project");

    expect(result.qualified).toBe(true);
    expect(result.issues).toEqual([]);
  });

  it("handles empty expectedFiles list gracefully", async () => {
    setupGitDiff(["src/auth.ts"]);

    const result = await runQualification([], "/project");

    // With empty expected files, no file match check is triggered
    expect(result.qualified).toBe(true);
    expect(result.actualFiles).toContain("src/auth.ts");
  });
});
