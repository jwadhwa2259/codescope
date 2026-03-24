// ---------------------------------------------------------------------------
// Tests for ignore-filter.ts
// ---------------------------------------------------------------------------
// Per 06-01-PLAN.md Task 2 behavior specifications.
// ---------------------------------------------------------------------------

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import type { EvalFinding, IgnorePattern } from "../../src/eval/types.js";
import {
  loadIgnorePatterns,
  filterFindings,
  appendIgnoreEntry,
  appendTodoEntry,
} from "../../src/eval/ignore-filter.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "eval-ignore-test-"));
  // Create .claude/codescope structure
  fs.mkdirSync(path.join(tmpDir, ".claude", "codescope"), { recursive: true });
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function makeFinding(overrides?: Partial<EvalFinding>): EvalFinding {
  return {
    id: "eval-scope_compliance-src-handler-ts-40",
    criterion: "scope_compliance",
    category: "missing_implementation",
    file: "src/handler.ts",
    line: 42,
    description: "Missing error handling in handler",
    severity: "ERROR",
    evidence: "No try-catch block around async operation",
    ...overrides,
  };
}

function writeLearningsFile(content: string): void {
  fs.writeFileSync(
    path.join(tmpDir, ".claude", "codescope", "learnings.md"),
    content,
    "utf-8",
  );
}

function readLearningsFile(): string {
  return fs.readFileSync(
    path.join(tmpDir, ".claude", "codescope", "learnings.md"),
    "utf-8",
  );
}

// ---------------------------------------------------------------------------
// loadIgnorePatterns
// ---------------------------------------------------------------------------

describe("loadIgnorePatterns", () => {
  it("reads IGNORE entries from learnings.md JSON code block", () => {
    writeLearningsFile(`# Learnings

## Ignore Patterns

\`\`\`json
[
  {
    "pattern": "callback pattern",
    "scope": "*",
    "criterion": "convention_adherence",
    "created": "2026-03-24",
    "reason": "Intentional in legacy code"
  }
]
\`\`\`
`);

    const patterns = loadIgnorePatterns(tmpDir);
    expect(patterns).toHaveLength(1);
    expect(patterns[0].pattern).toBe("callback pattern");
    expect(patterns[0].criterion).toBe("convention_adherence");
  });

  it("returns empty array when learnings.md has no ignore section", () => {
    writeLearningsFile("# Learnings\n\nSome other content.\n");

    const patterns = loadIgnorePatterns(tmpDir);
    expect(patterns).toEqual([]);
  });

  it("returns empty array when learnings.md does not exist", () => {
    // Don't create learnings.md
    const patterns = loadIgnorePatterns(tmpDir);
    expect(patterns).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// filterFindings
// ---------------------------------------------------------------------------

describe("filterFindings", () => {
  it("removes findings matching ignore pattern (criterion + scope glob + description substring)", () => {
    const findings = [
      makeFinding({
        criterion: "convention_adherence",
        description: "Uses callback pattern instead of async/await",
        file: "src/handler.ts",
      }),
    ];

    const patterns: IgnorePattern[] = [
      {
        pattern: "callback pattern",
        scope: "src/**",
        criterion: "convention_adherence",
        created: "2026-03-24",
        reason: "test",
      },
    ];

    const result = filterFindings(findings, patterns);
    expect(result).toHaveLength(0);
  });

  it("keeps findings that don't match any ignore pattern", () => {
    const findings = [
      makeFinding({
        criterion: "scope_compliance",
        description: "Out of scope modification",
        file: "src/handler.ts",
      }),
    ];

    const patterns: IgnorePattern[] = [
      {
        pattern: "callback pattern",
        scope: "src/**",
        criterion: "convention_adherence",
        created: "2026-03-24",
        reason: "test",
      },
    ];

    const result = filterFindings(findings, patterns);
    expect(result).toHaveLength(1);
  });

  it("requires all 3 conditions to match", () => {
    const findings = [
      makeFinding({
        criterion: "convention_adherence",
        description: "Uses callback pattern",
        file: "tests/handler.test.ts", // different path
      }),
    ];

    // Pattern scope is src/** which won't match tests/**
    const patterns: IgnorePattern[] = [
      {
        pattern: "callback pattern",
        scope: "src/**",
        criterion: "convention_adherence",
        created: "2026-03-24",
        reason: "test",
      },
    ];

    const result = filterFindings(findings, patterns);
    expect(result).toHaveLength(1); // Not filtered because scope doesn't match
  });
});

// ---------------------------------------------------------------------------
// appendIgnoreEntry
// ---------------------------------------------------------------------------

describe("appendIgnoreEntry", () => {
  it("writes structured IGNORE markdown entry to learnings.md", () => {
    writeLearningsFile("# Learnings\n");

    const finding = makeFinding({
      criterion: "convention_adherence",
      description: "Uses callbacks instead of async/await",
    });

    appendIgnoreEntry(tmpDir, finding, "test-task-slug");

    const content = readLearningsFile();
    expect(content).toContain("### IGNORE: Uses callbacks instead of async/await");
    expect(content).toContain("**Status:** IGNORE");
    expect(content).toContain("**Pattern:**");
    expect(content).toContain("**Criterion:** `convention_adherence`");
    expect(content).toContain("**Context:** Ignored at eval gate for task `test-task-slug`");
  });

  it("updates the JSON code block under Ignore Patterns section", () => {
    writeLearningsFile("# Learnings\n");

    const finding = makeFinding({
      criterion: "convention_adherence",
      description: "Uses callbacks",
    });

    appendIgnoreEntry(tmpDir, finding, "test-task");

    const content = readLearningsFile();
    expect(content).toContain("## Ignore Patterns");
    expect(content).toContain("```json");
  });
});

// ---------------------------------------------------------------------------
// appendTodoEntry
// ---------------------------------------------------------------------------

describe("appendTodoEntry", () => {
  it("writes structured TODO markdown entry to learnings.md", () => {
    writeLearningsFile("# Learnings\n");

    const finding = makeFinding({
      description: "Missing error handling",
      file: "src/handler.ts",
      line: 42,
      severity: "ERROR",
      criterion: "completeness",
      evidence: "No try-catch around async call",
    });

    appendTodoEntry(tmpDir, finding, "test-task-slug");

    const content = readLearningsFile();
    expect(content).toContain("### TODO: Missing error handling");
    expect(content).toContain("**Status:** TODO");
    expect(content).toContain("**File:** `src/handler.ts:42`");
    expect(content).toContain("**Severity:** ERROR");
    expect(content).toContain("**Criterion:** `completeness`");
    expect(content).toContain("**Evidence:** No try-catch around async call");
    expect(content).toContain(
      "**Context:** Deferred at eval gate for task `test-task-slug`",
    );
  });
});
