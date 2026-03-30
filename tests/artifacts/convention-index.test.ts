/**
 * Tests for the canonical convention parser and convention index builder.
 *
 * The convention detector writes h3 headings + markdown tables, NOT bold-field format.
 * These tests verify the canonical parser handles the ACTUAL detector output.
 */

import { describe, it, expect } from "vitest";
import { parseDetectorConventions } from "../../src/conventions/parser.js";

// Realistic detector output matching generateConventionsMarkdown() format
const DETECTOR_OUTPUT = `---
generated: "2026-03-30T12:00:00.000Z"
generator: "convention-detector"
phase: 2
total_rules_evaluated: 12
total_conventions_detected: 3
false_positive_target: "<5%"
---

# Conventions

### Arrow Functions for Callbacks

| Metric | Value |
|--------|-------|
| Adoption | 85% (17/20 files) |
| Confidence | HIGH-CONF |
| Trend | Stable |
| Category | async |

**Evidence:**
- \`src/utils/helper.ts:15\` -- Uses arrow function for callback
- \`src/routes/api.ts:42\` -- Arrow in Promise chain

### Explicit Return Types

| Metric | Value |
|--------|-------|
| Adoption | 72% (36/50 files) |
| Confidence | MEDIUM-CONF |
| Trend | Increasing |
| Category | types |

**Evidence:**
- \`src/models/user.ts:10\` -- Function with explicit return type
- \`src/models/user.ts:25\` -- Method with return type annotation
- \`src/services/auth.ts:8\` -- Export function typed

### [CONFLICT] Import Style

Both patterns exceed 20% adoption. Resolution recommended before enforcement.

### Barrel Exports

| Metric | Value |
|--------|-------|
| Adoption | 60% (12/20 files) |
| Confidence | HIGH-CONF |
| Trend | Stable |
| Category | imports |

**Evidence:**
- \`src/index.ts:1\` -- Re-exports from module
`;

describe("parseDetectorConventions", () => {
  it("parses h3 heading + markdown table format", () => {
    const result = parseDetectorConventions(DETECTOR_OUTPUT);
    const arrow = result.find((c) => c.name === "Arrow Functions for Callbacks");
    expect(arrow).toBeDefined();
    expect(arrow!.adoption_pct).toBe(85);
    expect(arrow!.confidence).toBe("HIGH-CONF");
    expect(arrow!.category).toBe("async");
  });

  it("extracts file paths from evidence lines", () => {
    const result = parseDetectorConventions(DETECTOR_OUTPUT);
    const arrow = result.find((c) => c.name === "Arrow Functions for Callbacks");
    expect(arrow).toBeDefined();
    expect(arrow!.files).toContain("src/utils/helper.ts");
    expect(arrow!.files).toContain("src/routes/api.ts");
    expect(arrow!.files).toHaveLength(2);
  });

  it("strips YAML frontmatter and does not produce a convention from it", () => {
    const result = parseDetectorConventions(DETECTOR_OUTPUT);
    // Should NOT have any convention named "generated", "generator", "phase", etc.
    const fmConv = result.find(
      (c) =>
        c.name.includes("generated") ||
        c.name.includes("generator") ||
        c.name.includes("phase"),
    );
    expect(fmConv).toBeUndefined();
  });

  it("skips conventions with [CONFLICT] prefix", () => {
    const result = parseDetectorConventions(DETECTOR_OUTPUT);
    const conflict = result.find((c) => c.name.includes("CONFLICT"));
    expect(conflict).toBeUndefined();
    const importStyle = result.find((c) => c.name.includes("Import Style"));
    expect(importStyle).toBeUndefined();
  });

  it("parses multiple conventions from one document", () => {
    const result = parseDetectorConventions(DETECTOR_OUTPUT);
    // Should have 3: Arrow, Explicit Return, Barrel (CONFLICT is skipped)
    expect(result).toHaveLength(3);
    expect(result.map((c) => c.name)).toEqual([
      "Arrow Functions for Callbacks",
      "Explicit Return Types",
      "Barrel Exports",
    ]);
  });

  it("deduplicates file paths from multiple evidence lines in same file", () => {
    const result = parseDetectorConventions(DETECTOR_OUTPUT);
    const explicit = result.find((c) => c.name === "Explicit Return Types");
    expect(explicit).toBeDefined();
    // src/models/user.ts appears twice in evidence but should be deduplicated
    expect(explicit!.files.filter((f) => f === "src/models/user.ts")).toHaveLength(1);
    expect(explicit!.files).toContain("src/services/auth.ts");
  });

  it("collects evidence strings", () => {
    const result = parseDetectorConventions(DETECTOR_OUTPUT);
    const arrow = result.find((c) => c.name === "Arrow Functions for Callbacks");
    expect(arrow).toBeDefined();
    expect(arrow!.evidence).toHaveLength(2);
    expect(arrow!.evidence[0]).toContain("src/utils/helper.ts:15");
  });

  it("handles empty content", () => {
    const result = parseDetectorConventions("");
    expect(result).toEqual([]);
  });

  it("handles content with only frontmatter", () => {
    const content = `---
generated: "2026-03-30"
---

# Conventions

No conventions detected.
`;
    const result = parseDetectorConventions(content);
    expect(result).toEqual([]);
  });
});
