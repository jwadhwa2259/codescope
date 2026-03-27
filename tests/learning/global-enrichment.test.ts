// ---------------------------------------------------------------------------
// Tests for global memory enrichment (3-strike auto-enrichment)
// ---------------------------------------------------------------------------
// Per 07-01-PLAN.md Task 2 behavior specifications and D-21.
// ---------------------------------------------------------------------------

import { describe, it, expect } from "vitest";
import type { LearningEntry, GlobalEnrichmentEntry } from "../../src/learning/types.js";
import {
  detectRepeatedIgnores,
  buildEnrichmentUpdates,
} from "../../src/learning/global-enrichment.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeIgnoreEntry(overrides?: Partial<LearningEntry>): LearningEntry {
  return {
    title: "IGNORE: Test pattern",
    status: "IGNORE",
    type: "ignore",
    discovered: "2026-03-01",
    expires: "",
    evidence: "",
    pattern: "Test pattern",
    scope: "*",
    criterion: "convention_adherence",
    context: "Ignored at eval gate for task `test-task`",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// detectRepeatedIgnores tests
// ---------------------------------------------------------------------------

describe("detectRepeatedIgnores", () => {
  it("finds patterns ignored 3+ times across different pipeline runs", () => {
    const entries: LearningEntry[] = [
      makeIgnoreEntry({
        criterion: "convention_adherence",
        pattern: "Missing error boundary",
        context: "Ignored at eval gate for task `task-1`",
      }),
      makeIgnoreEntry({
        criterion: "convention_adherence",
        pattern: "Missing error boundary",
        context: "Ignored at eval gate for task `task-2`",
      }),
      makeIgnoreEntry({
        criterion: "convention_adherence",
        pattern: "Missing error boundary",
        context: "Ignored at eval gate for task `task-3`",
      }),
    ];

    const result = detectRepeatedIgnores(entries, 3);
    expect(result).toHaveLength(1);
    expect(result[0].key).toContain("Missing error boundary");
    expect(result[0].count).toBe(3);
  });

  it("does NOT flag patterns ignored only 1-2 times", () => {
    const entries: LearningEntry[] = [
      makeIgnoreEntry({
        criterion: "convention_adherence",
        pattern: "Missing error boundary",
        context: "Ignored at eval gate for task `task-1`",
      }),
      makeIgnoreEntry({
        criterion: "convention_adherence",
        pattern: "Missing error boundary",
        context: "Ignored at eval gate for task `task-2`",
      }),
    ];

    const result = detectRepeatedIgnores(entries, 3);
    expect(result).toHaveLength(0);
  });

  it("filters out non-ignore entries", () => {
    const entries: LearningEntry[] = [
      {
        title: "Some gotcha",
        status: "UNVERIFIED",
        type: "gotcha",
        discovered: "2026-03-01",
        expires: "2026-06-01",
        evidence: "test",
      },
      makeIgnoreEntry({
        criterion: "convention_adherence",
        pattern: "Missing error boundary",
        context: "Ignored at eval gate for task `task-1`",
      }),
    ];

    const result = detectRepeatedIgnores(entries, 3);
    expect(result).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// buildEnrichmentUpdates tests
// ---------------------------------------------------------------------------

describe("buildEnrichmentUpdates", () => {
  it("produces GlobalEnrichmentEntry array for patterns that crossed threshold", () => {
    const repeatedPatterns = [
      {
        key: "convention_adherence:Missing error boundary",
        criterion: "convention_adherence",
        pattern: "Missing error boundary",
        count: 3,
      },
    ];

    const result = buildEnrichmentUpdates(repeatedPatterns, []);
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe("ignore_pattern");
    expect(result[0].value).toBe("convention_adherence:Missing error boundary");
    expect(result[0].source).toContain("3 pipeline runs");
  });

  it("deduplicates against existing global ignore patterns", () => {
    const repeatedPatterns = [
      {
        key: "convention_adherence:Missing error boundary",
        criterion: "convention_adherence",
        pattern: "Missing error boundary",
        count: 3,
      },
    ];

    const existingGlobal: GlobalEnrichmentEntry[] = [
      {
        type: "ignore_pattern",
        value: "convention_adherence:Missing error boundary",
        source: "already-added",
        recordedDate: "2026-03-01",
      },
    ];

    const result = buildEnrichmentUpdates(repeatedPatterns, existingGlobal);
    expect(result).toHaveLength(0);
  });

  it("includes patterns not already in global ignores", () => {
    const repeatedPatterns = [
      {
        key: "convention_adherence:Missing error boundary",
        criterion: "convention_adherence",
        pattern: "Missing error boundary",
        count: 4,
      },
      {
        key: "correctness:No null check",
        criterion: "correctness",
        pattern: "No null check",
        count: 3,
      },
    ];

    const existingGlobal: GlobalEnrichmentEntry[] = [
      {
        type: "ignore_pattern",
        value: "convention_adherence:Missing error boundary",
        source: "already-added",
        recordedDate: "2026-03-01",
      },
    ];

    const result = buildEnrichmentUpdates(repeatedPatterns, existingGlobal);
    expect(result).toHaveLength(1);
    expect(result[0].value).toBe("correctness:No null check");
  });
});
