// ---------------------------------------------------------------------------
// Tests for src/utils/tokens.ts
// ---------------------------------------------------------------------------
// Per 13-01-PLAN.md Task 1 behavior specifications.
// ---------------------------------------------------------------------------

import { describe, it, expect } from "vitest";
import {
  tokenEstimate,
  classifyCostTier,
  type CostTier,
} from "../../src/utils/tokens.js";

// ---------------------------------------------------------------------------
// tokenEstimate
// ---------------------------------------------------------------------------

describe("tokenEstimate", () => {
  it("returns Math.ceil(length / 4) for 'hello world'", () => {
    // "hello world" is 11 chars -> Math.ceil(11/4) = 3
    expect(tokenEstimate("hello world")).toBe(3);
  });

  it("returns 0 for empty string", () => {
    expect(tokenEstimate("")).toBe(0);
  });

  it("returns 1 for a single character", () => {
    // 1 char -> Math.ceil(1/4) = 1
    expect(tokenEstimate("a")).toBe(1);
  });

  it("returns exact division for strings divisible by 4", () => {
    // "abcd" is 4 chars -> Math.ceil(4/4) = 1
    expect(tokenEstimate("abcd")).toBe(1);
  });

  it("rounds up for non-divisible lengths", () => {
    // "abcde" is 5 chars -> Math.ceil(5/4) = 2
    expect(tokenEstimate("abcde")).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// classifyCostTier
// ---------------------------------------------------------------------------

describe("classifyCostTier", () => {
  it("returns LIGHT for 0 tokens", () => {
    expect(classifyCostTier(0)).toBe("LIGHT");
  });

  it("returns LIGHT for 15000 tokens", () => {
    expect(classifyCostTier(15_000)).toBe("LIGHT");
  });

  it("returns LIGHT for 19999 tokens (just below boundary)", () => {
    expect(classifyCostTier(19_999)).toBe("LIGHT");
  });

  it("returns MODERATE for 20000 tokens (lower boundary)", () => {
    expect(classifyCostTier(20_000)).toBe("MODERATE");
  });

  it("returns MODERATE for 50000 tokens (upper boundary)", () => {
    expect(classifyCostTier(50_000)).toBe("MODERATE");
  });

  it("returns HEAVY for 50001 tokens (just above boundary)", () => {
    expect(classifyCostTier(50_001)).toBe("HEAVY");
  });

  it("returns HEAVY for 100000 tokens", () => {
    expect(classifyCostTier(100_000)).toBe("HEAVY");
  });
});
