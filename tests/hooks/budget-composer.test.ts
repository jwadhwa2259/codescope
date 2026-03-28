import { describe, it, expect } from "vitest";
import {
  estimateTokens,
  composeBudgetedMessage,
  MAX_TOKENS,
  type InjectionItem,
} from "../../src/hooks/lib/budget-composer.js";

describe("budget-composer", () => {
  describe("estimateTokens", () => {
    it("returns 0 for empty string", () => {
      expect(estimateTokens("")).toBe(0);
    });

    it("returns 2 for 'hello' (5 chars / 4 rounded up)", () => {
      expect(estimateTokens("hello")).toBe(2);
    });

    it("returns correct estimate for longer string", () => {
      // 100 chars -> 25 tokens
      const text = "a".repeat(100);
      expect(estimateTokens(text)).toBe(25);
    });

    it("rounds up for non-divisible lengths", () => {
      // 5 chars -> ceil(5/4) = 2
      expect(estimateTokens("abcde")).toBe(2);
      // 7 chars -> ceil(7/4) = 2
      expect(estimateTokens("abcdefg")).toBe(2);
      // 9 chars -> ceil(9/4) = 3
      expect(estimateTokens("abcdefghi")).toBe(3);
    });
  });

  describe("MAX_TOKENS", () => {
    it("is 500", () => {
      expect(MAX_TOKENS).toBe(500);
    });
  });

  describe("composeBudgetedMessage", () => {
    it("returns empty string when no items provided", () => {
      expect(composeBudgetedMessage([])).toBe("");
    });

    it("returns all items joined by double newline when they fit within budget", () => {
      const items: InjectionItem[] = [
        { priority: 1, content: "danger zone warning" },
        { priority: 2, content: "convention reminder" },
        { priority: 3, content: "blast radius info" },
      ];
      const result = composeBudgetedMessage(items);
      expect(result).toContain("danger zone warning");
      expect(result).toContain("convention reminder");
      expect(result).toContain("blast radius info");
      expect(result).toBe(
        "danger zone warning\n\nconvention reminder\n\nblast radius info"
      );
    });

    it("truncates lowest-priority items when exceeding budget", () => {
      // Create items that exceed a small budget
      const items: InjectionItem[] = [
        { priority: 1, content: "A".repeat(400) }, // 100 tokens
        { priority: 2, content: "B".repeat(400) }, // 100 tokens
        { priority: 3, content: "C".repeat(400) }, // 100 tokens
      ];
      // With a 150-token budget, only priority 1 fits
      const result = composeBudgetedMessage(items, 150);
      expect(result).toContain("A".repeat(400));
      expect(result).not.toContain("B".repeat(400));
      expect(result).not.toContain("C".repeat(400));
    });

    it("includes priority 1 (danger zone) before priority 2 (conventions)", () => {
      const items: InjectionItem[] = [
        { priority: 2, content: "conventions" },
        { priority: 1, content: "danger zone" },
        { priority: 3, content: "blast radius" },
      ];
      const result = composeBudgetedMessage(items);
      const dzIndex = result.indexOf("danger zone");
      const convIndex = result.indexOf("conventions");
      const brIndex = result.indexOf("blast radius");
      expect(dzIndex).toBeLessThan(convIndex);
      expect(convIndex).toBeLessThan(brIndex);
    });

    it("respects default MAX_TOKENS budget", () => {
      // Create a single huge item exceeding 500 tokens (2000+ chars)
      const hugeItem: InjectionItem = {
        priority: 1,
        content: "X".repeat(2100), // 525 tokens
      };
      const smallItem: InjectionItem = {
        priority: 2,
        content: "small",
      };
      const result = composeBudgetedMessage([hugeItem, smallItem]);
      // Neither should be included since the huge one doesn't fit
      // and the small one could fit alone
      expect(result).not.toContain("X".repeat(2100));
      expect(result).toBe("small");
    });
  });
});
