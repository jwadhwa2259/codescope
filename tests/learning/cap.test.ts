// ---------------------------------------------------------------------------
// Tests for learning cap enforcement
// ---------------------------------------------------------------------------
// Per 07-01-PLAN.md Task 1 behavior specifications.
// ---------------------------------------------------------------------------

import { describe, it, expect } from "vitest";
import type { LearningEntry } from "../../src/learning/types.js";
import {
  enforceCapWithEviction,
  countActiveEntries,
} from "../../src/learning/cap.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeEntry(overrides?: Partial<LearningEntry>): LearningEntry {
  return {
    title: "Test learning",
    status: "UNVERIFIED",
    type: "gotcha",
    discovered: "2026-03-01",
    expires: "2026-06-01",
    evidence: "test evidence",
    ...overrides,
  };
}

function makeEntries(count: number, overrides?: Partial<LearningEntry>): LearningEntry[] {
  return Array.from({ length: count }, (_, i) =>
    makeEntry({
      title: `Learning ${i + 1}`,
      discovered: `2026-01-${String(i + 1).padStart(2, "0")}`,
      ...overrides,
    }),
  );
}

// ---------------------------------------------------------------------------
// countActiveEntries tests
// ---------------------------------------------------------------------------

describe("countActiveEntries", () => {
  it("counts all entry types", () => {
    const entries = [
      makeEntry({ type: "gotcha" }),
      makeEntry({ type: "decision" }),
      makeEntry({ type: "pattern" }),
      makeEntry({ type: "ignore", status: "IGNORE" }),
      makeEntry({ type: "todo", status: "TODO" }),
    ];
    expect(countActiveEntries(entries)).toBe(5);
  });
});

// ---------------------------------------------------------------------------
// enforceCapWithEviction tests
// ---------------------------------------------------------------------------

describe("enforceCapWithEviction", () => {
  it("adds entry when under cap (49 entries + 1 new = 50)", () => {
    const current = makeEntries(49);
    const newEntries = [makeEntry({ title: "New learning" })];

    const result = enforceCapWithEviction(current, newEntries, 50);
    expect(result.entries).toHaveLength(50);
    expect(result.evicted).toHaveLength(0);
    expect(result.skipped).toHaveLength(0);
  });

  it("evicts oldest EXPIRED entry when at cap", () => {
    const current = [
      ...makeEntries(48),
      makeEntry({
        title: "Old expired",
        status: "EXPIRED",
        discovered: "2025-01-01",
      }),
      makeEntry({
        title: "Recent expired",
        status: "EXPIRED",
        discovered: "2026-02-15",
      }),
    ];
    const newEntries = [makeEntry({ title: "Brand new learning" })];

    const result = enforceCapWithEviction(current, newEntries, 50);
    expect(result.entries).toHaveLength(50);
    expect(result.evicted).toHaveLength(1);
    expect(result.evicted[0].title).toBe("Old expired");
    expect(result.entries.find((e) => e.title === "Brand new learning")).toBeDefined();
  });

  it("skips new entry when at cap with nothing expired", () => {
    const current = makeEntries(50);
    const newEntries = [makeEntry({ title: "Cannot add" })];

    const result = enforceCapWithEviction(current, newEntries, 50);
    expect(result.entries).toHaveLength(50);
    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0].title).toBe("Cannot add");
  });

  it("handles multiple new entries, evicting one expired per new", () => {
    const current = [
      ...makeEntries(48),
      makeEntry({
        title: "Expired A",
        status: "EXPIRED",
        discovered: "2025-06-01",
      }),
      makeEntry({
        title: "Expired B",
        status: "EXPIRED",
        discovered: "2025-07-01",
      }),
    ];
    const newEntries = [
      makeEntry({ title: "New A" }),
      makeEntry({ title: "New B" }),
    ];

    const result = enforceCapWithEviction(current, newEntries, 50);
    expect(result.entries).toHaveLength(50);
    expect(result.evicted).toHaveLength(2);
    expect(result.skipped).toHaveLength(0);
  });

  it("evicts the EARLIEST-discovered expired entry", () => {
    const current = [
      ...makeEntries(48),
      makeEntry({
        title: "Newer expired",
        status: "EXPIRED",
        discovered: "2026-02-01",
      }),
      makeEntry({
        title: "Oldest expired",
        status: "EXPIRED",
        discovered: "2025-01-01",
      }),
    ];
    const newEntries = [makeEntry({ title: "Fresh learning" })];

    const result = enforceCapWithEviction(current, newEntries, 50);
    expect(result.evicted).toHaveLength(1);
    expect(result.evicted[0].title).toBe("Oldest expired");
  });
});
