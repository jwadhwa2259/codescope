import { describe, it, expect } from "vitest";
import {
  getVerifiedRuleIds,
  buildRuleIdLookup,
  RULE_NAME_TO_ID,
  RULE_ID_TO_NAME,
} from "../../src/enforcement/rule-filter.js";

// ---------------------------------------------------------------------------
// Test data: learnings.md content snippets
// ---------------------------------------------------------------------------

const VERIFIED_PATTERN_LEARNINGS = `---
generated: "2026-03-28"
generator: "learning-synthesizer"
phase: 1
total_learnings: 2
---

# Learnings

## Entries

### Prefer Named Exports
- **Status:** VERIFIED
- **Type:** pattern
- **Discovered:** 2026-03-20
- **Expires:** 2026-06-20
- **Evidence:** src/utils/index.ts:1

### Default Export
- **Status:** UNVERIFIED
- **Type:** pattern
- **Discovered:** 2026-03-20
- **Expires:** 2026-06-20
- **Evidence:** src/App.tsx:1
`;

const MIXED_STATUS_LEARNINGS = `---
generated: "2026-03-28"
generator: "learning-synthesizer"
phase: 1
total_learnings: 4
---

# Learnings

## Entries

### Prefer Named Exports
- **Status:** VERIFIED
- **Type:** pattern
- **Discovered:** 2026-03-20
- **Expires:** 2026-06-20
- **Evidence:** src/utils/index.ts:1

### Default Export
- **Status:** CONTRADICTED
- **Type:** pattern
- **Discovered:** 2026-03-20
- **Expires:** 2026-06-20
- **Evidence:** src/App.tsx:1

### Async/Await Functions
- **Status:** EXPIRED
- **Type:** pattern
- **Discovered:** 2026-01-01
- **Expires:** 2026-03-01
- **Evidence:** src/api.ts:5

### Custom Error Classes
- **Status:** VERIFIED
- **Type:** pattern
- **Discovered:** 2026-03-20
- **Expires:** 2026-06-20
- **Evidence:** src/errors.ts:1
`;

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

const UNKNOWN_TITLE_LEARNINGS = `---
generated: "2026-03-28"
generator: "learning-synthesizer"
phase: 1
total_learnings: 1
---

# Learnings

## Entries

### Some Unknown Convention
- **Status:** VERIFIED
- **Type:** pattern
- **Discovered:** 2026-03-20
- **Expires:** 2026-06-20
- **Evidence:** src/foo.ts:1
`;

const VERIFIED_GOTCHA_LEARNINGS = `---
generated: "2026-03-28"
generator: "learning-synthesizer"
phase: 1
total_learnings: 1
---

# Learnings

## Entries

### Prefer Named Exports
- **Status:** VERIFIED
- **Type:** gotcha
- **Discovered:** 2026-03-20
- **Expires:** 2026-06-20
- **Evidence:** src/utils/index.ts:1
`;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("rule-filter", () => {
  describe("getVerifiedRuleIds", () => {
    it("returns only rule IDs for entries with status=VERIFIED and type=pattern", () => {
      const result = getVerifiedRuleIds(VERIFIED_PATTERN_LEARNINGS);
      expect(result).toEqual(["prefer-named-exports"]);
    });

    it("returns empty array when no VERIFIED patterns exist", () => {
      const result = getVerifiedRuleIds(NO_VERIFIED_LEARNINGS);
      expect(result).toEqual([]);
    });

    it("filters out UNVERIFIED, CONTRADICTED, EXPIRED entries", () => {
      const result = getVerifiedRuleIds(MIXED_STATUS_LEARNINGS);
      // Only "Prefer Named Exports" (VERIFIED) and "Custom Error Classes" (VERIFIED)
      expect(result).toEqual(["prefer-named-exports", "custom-error-class"]);
    });

    it("maps learning title to ruleId via RULE_NAME_TO_ID", () => {
      const result = getVerifiedRuleIds(VERIFIED_PATTERN_LEARNINGS);
      expect(result).toContain("prefer-named-exports");
      // Verify the mapping exists
      expect(RULE_NAME_TO_ID.get("Prefer Named Exports")).toBe("prefer-named-exports");
    });

    it("handles learning titles that don't match any known rule (skips them)", () => {
      const result = getVerifiedRuleIds(UNKNOWN_TITLE_LEARNINGS);
      expect(result).toEqual([]);
    });

    it("returns empty array for empty input", () => {
      const result = getVerifiedRuleIds("");
      expect(result).toEqual([]);
    });

    it("only includes pattern type, not gotcha type even if VERIFIED", () => {
      const result = getVerifiedRuleIds(VERIFIED_GOTCHA_LEARNINGS);
      expect(result).toEqual([]);
    });
  });

  describe("buildRuleIdLookup", () => {
    it("creates bidirectional map from RULE_METADATA", () => {
      const lookup = buildRuleIdLookup();
      expect(lookup.nameToId.get("Prefer Named Exports")).toBe("prefer-named-exports");
      expect(lookup.idToName.get("prefer-named-exports")).toBe("Prefer Named Exports");
      expect(lookup.nameToId.get("Default Export")).toBe("detect-default-export");
      expect(lookup.idToName.get("detect-default-export")).toBe("Default Export");
    });
  });

  describe("RULE_NAME_TO_ID", () => {
    it("contains 18 entries (one per ast-grep rule)", () => {
      expect(RULE_NAME_TO_ID.size).toBe(18);
    });

    it("maps all expected convention names", () => {
      expect(RULE_NAME_TO_ID.get("Prefer Named Exports")).toBe("prefer-named-exports");
      expect(RULE_NAME_TO_ID.get("Default Export")).toBe("detect-default-export");
      expect(RULE_NAME_TO_ID.get("Async/Await Functions")).toBe("detect-async-await");
      expect(RULE_NAME_TO_ID.get("Promise .then() Chains")).toBe("detect-promise-then");
      expect(RULE_NAME_TO_ID.get("Custom Error Classes")).toBe("custom-error-class");
      expect(RULE_NAME_TO_ID.get("Throw String Literals")).toBe("throw-string-literal");
      expect(RULE_NAME_TO_ID.get("Named Imports")).toBe("named-imports");
      expect(RULE_NAME_TO_ID.get("Barrel/Namespace Imports")).toBe("barrel-imports");
      expect(RULE_NAME_TO_ID.get("Functional React Components")).toBe("functional-component");
      expect(RULE_NAME_TO_ID.get("Class React Components")).toBe("class-component");
      expect(RULE_NAME_TO_ID.get("Arrow Function Exports")).toBe("arrow-function-export");
      expect(RULE_NAME_TO_ID.get("Function Declaration Exports")).toBe("function-declaration-export");
      expect(RULE_NAME_TO_ID.get("Interface Declarations")).toBe("interface-over-type");
      expect(RULE_NAME_TO_ID.get("Type Alias Declarations")).toBe("type-over-interface");
      expect(RULE_NAME_TO_ID.get("Explicit Return Types")).toBe("explicit-return-type");
      expect(RULE_NAME_TO_ID.get("Python Type Hints")).toBe("python-type-hints");
      expect(RULE_NAME_TO_ID.get("Python Docstrings")).toBe("python-docstrings");
      expect(RULE_NAME_TO_ID.get("Python Class Inheritance")).toBe("python-class-inheritance");
    });
  });

  describe("RULE_ID_TO_NAME", () => {
    it("contains 18 entries (one per ast-grep rule)", () => {
      expect(RULE_ID_TO_NAME.size).toBe(18);
    });

    it("is the inverse of RULE_NAME_TO_ID", () => {
      for (const [name, id] of RULE_NAME_TO_ID) {
        expect(RULE_ID_TO_NAME.get(id)).toBe(name);
      }
    });
  });
});
