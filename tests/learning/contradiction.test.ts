// ---------------------------------------------------------------------------
// Tests for contradiction detection
// ---------------------------------------------------------------------------
// Per 07-01-PLAN.md Task 2 behavior specifications.
// ---------------------------------------------------------------------------

import { describe, it, expect, vi } from "vitest";
import type { LearningEntry, ContradictionResult } from "../../src/learning/types.js";
import {
  checkContradictions,
  buildContradictionPrompt,
} from "../../src/learning/contradiction.js";

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

// ---------------------------------------------------------------------------
// checkContradictions tests
// ---------------------------------------------------------------------------

describe("checkContradictions", () => {
  it("returns empty array with no existing learnings", async () => {
    const newEntry = makeEntry({ title: "Use async/await everywhere" });
    const result = await checkContradictions(newEntry, []);
    expect(result).toEqual([]);
  });

  it("flags new learning that contradicts existing via heuristic (use X vs avoid X)", async () => {
    const newEntry = makeEntry({ title: "Use async/await everywhere" });
    const existing = [
      makeEntry({ title: "Avoid async/await in hot paths" }),
    ];

    const results = await checkContradictions(newEntry, existing);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].isContradiction).toBe(true);
    expect(results[0].contradicts).toBe("Avoid async/await in hot paths");
  });

  it("uses provided LLM callback for semantic comparison", async () => {
    const newEntry = makeEntry({ title: "Always validate input at controllers" });
    const existing = [
      makeEntry({ title: "Skip input validation for internal services" }),
    ];

    const mockLlm = vi.fn().mockResolvedValue(
      JSON.stringify({ isContradiction: true, reason: "Direct conflict on input validation" }),
    );

    const results = await checkContradictions(newEntry, existing, mockLlm);
    expect(mockLlm).toHaveBeenCalled();
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].isContradiction).toBe(true);
  });

  it("does not flag unrelated learnings", async () => {
    const newEntry = makeEntry({ title: "Use path.join for file paths" });
    const existing = [
      makeEntry({ title: "Prefer vitest over jest" }),
    ];

    const results = await checkContradictions(newEntry, existing);
    expect(results).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// buildContradictionPrompt tests
// ---------------------------------------------------------------------------

describe("buildContradictionPrompt", () => {
  it("produces strict prompt requiring DIRECT contradiction", () => {
    const a = makeEntry({ title: "Use sync calls", evidence: "perf analysis" });
    const b = makeEntry({ title: "Prefer async calls", evidence: "scalability" });

    const prompt = buildContradictionPrompt(a, b);
    expect(prompt).toContain("DIRECTLY contradict");
    expect(prompt).toContain("Use sync calls");
    expect(prompt).toContain("Prefer async calls");
    expect(prompt).toContain("isContradiction");
  });
});

describe("checkContradictions - ContradictionResult shape", () => {
  it("returns ContradictionResult with correct fields", async () => {
    const newEntry = makeEntry({ title: "Use callbacks for IO" });
    const existing = [
      makeEntry({ title: "Avoid callbacks for IO" }),
    ];

    const results = await checkContradictions(newEntry, existing);
    expect(results.length).toBe(1);
    expect(results[0]).toHaveProperty("isContradiction", true);
    expect(results[0]).toHaveProperty("contradicts", "Avoid callbacks for IO");
    expect(results[0]).toHaveProperty("evidence");
    expect(typeof results[0].evidence).toBe("string");
  });
});
