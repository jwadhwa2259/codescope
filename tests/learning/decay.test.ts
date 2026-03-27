// ---------------------------------------------------------------------------
// Tests for learning decay engine
// ---------------------------------------------------------------------------
// Per 07-01-PLAN.md Task 1 behavior specifications.
// ---------------------------------------------------------------------------

import { describe, it, expect } from "vitest";
import type { LearningEntry, DecayConfig } from "../../src/learning/types.js";
import { computeExpiry, isExpired, runDecay } from "../../src/learning/decay.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const DEFAULT_DECAY: DecayConfig = { gotchas: 90, decisions: 180 };

function makeEntry(overrides?: Partial<LearningEntry>): LearningEntry {
  return {
    title: "Test learning",
    status: "UNVERIFIED",
    type: "gotcha",
    discovered: "2026-01-01",
    expires: "2026-04-01",
    evidence: "test evidence",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// computeExpiry tests
// ---------------------------------------------------------------------------

describe("computeExpiry", () => {
  it("computes 90-day expiry for gotcha type", () => {
    const result = computeExpiry("gotcha", new Date("2026-01-01"), DEFAULT_DECAY);
    expect(result).toBe("2026-04-01");
  });

  it("computes 180-day expiry for decision type", () => {
    const result = computeExpiry("decision", new Date("2026-01-01"), DEFAULT_DECAY);
    expect(result).toBe("2026-06-30");
  });

  it("uses decisions (180) decay for pattern type since patterns are long-lived", () => {
    const result = computeExpiry("pattern", new Date("2026-01-01"), DEFAULT_DECAY);
    expect(result).toBe("2026-06-30");
  });

  it("returns empty string for ignore type (no expiry)", () => {
    const result = computeExpiry("ignore", new Date("2026-01-01"), DEFAULT_DECAY);
    expect(result).toBe("");
  });

  it("returns empty string for todo type (no expiry)", () => {
    const result = computeExpiry("todo", new Date("2026-01-01"), DEFAULT_DECAY);
    expect(result).toBe("");
  });
});

// ---------------------------------------------------------------------------
// isExpired tests
// ---------------------------------------------------------------------------

describe("isExpired", () => {
  it("returns true when expires date <= now", () => {
    const entry = makeEntry({ expires: "2026-03-01" });
    const now = new Date("2026-03-15");
    expect(isExpired(entry, now)).toBe(true);
  });

  it("returns false when expires date > now", () => {
    const entry = makeEntry({ expires: "2026-06-01" });
    const now = new Date("2026-03-15");
    expect(isExpired(entry, now)).toBe(false);
  });

  it("returns false for entries without expires field", () => {
    const entry = makeEntry({ expires: "" });
    const now = new Date("2026-03-15");
    expect(isExpired(entry, now)).toBe(false);
  });

  it("returns true when expires date equals now (same day)", () => {
    const entry = makeEntry({ expires: "2026-03-15" });
    const now = new Date("2026-03-15");
    expect(isExpired(entry, now)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// runDecay tests
// ---------------------------------------------------------------------------

describe("runDecay", () => {
  it("marks UNVERIFIED entry past expires as EXPIRED", () => {
    const entries = [
      makeEntry({
        status: "UNVERIFIED",
        expires: "2026-02-01",
      }),
    ];
    const now = new Date("2026-03-15");
    const result = runDecay(entries, DEFAULT_DECAY, now);
    expect(result[0].status).toBe("EXPIRED");
  });

  it("does NOT mark IGNORE entries as EXPIRED", () => {
    const entries = [
      makeEntry({
        status: "IGNORE",
        type: "ignore",
        expires: "",
      }),
    ];
    const now = new Date("2026-03-15");
    const result = runDecay(entries, DEFAULT_DECAY, now);
    expect(result[0].status).toBe("IGNORE");
  });

  it("does NOT mark TODO entries as EXPIRED", () => {
    const entries = [
      makeEntry({
        status: "TODO",
        type: "todo",
        expires: "",
      }),
    ];
    const now = new Date("2026-03-15");
    const result = runDecay(entries, DEFAULT_DECAY, now);
    expect(result[0].status).toBe("TODO");
  });

  it("does NOT change VERIFIED entries to EXPIRED", () => {
    const entries = [
      makeEntry({
        status: "VERIFIED",
        expires: "2026-01-01",
      }),
    ];
    const now = new Date("2026-03-15");
    const result = runDecay(entries, DEFAULT_DECAY, now);
    expect(result[0].status).toBe("VERIFIED");
  });

  it("marks CONTRADICTED entry past expires as EXPIRED", () => {
    const entries = [
      makeEntry({
        status: "CONTRADICTED",
        expires: "2026-02-01",
        contradicts: "Some other learning",
      }),
    ];
    const now = new Date("2026-03-15");
    const result = runDecay(entries, DEFAULT_DECAY, now);
    expect(result[0].status).toBe("EXPIRED");
  });

  it("preserves entries that are not past expiry", () => {
    const entries = [
      makeEntry({
        status: "UNVERIFIED",
        expires: "2026-06-01",
      }),
    ];
    const now = new Date("2026-03-15");
    const result = runDecay(entries, DEFAULT_DECAY, now);
    expect(result[0].status).toBe("UNVERIFIED");
  });
});
