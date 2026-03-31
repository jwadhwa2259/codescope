/**
 * Tests that synthesis.ts and analysis.ts use the canonical
 * parseDetectorConventions parser from conventions/parser.ts,
 * not local convention parsing duplicates.
 *
 * Also integration-tests that the h3+table format flows correctly
 * through both consumers.
 */

import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";

const SRC_DIR = path.resolve(__dirname, "../../src");

function readSource(relativePath: string): string {
  return fs.readFileSync(path.join(SRC_DIR, relativePath), "utf-8");
}

describe("Convention parser consumers", () => {
  describe("synthesis.ts source code checks", () => {
    it("imports parseDetectorConventions", () => {
      const source = readSource("bootstrap/synthesis.ts");
      expect(source).toContain("parseDetectorConventions");
    });

    it("does NOT contain a local parseConventionsMd function", () => {
      const source = readSource("bootstrap/synthesis.ts");
      expect(source).not.toMatch(/function\s+parseConventionsMd/);
    });
  });

  describe("analysis.ts source code checks", () => {
    it("imports parseDetectorConventions", () => {
      const source = readSource("orient/analysis.ts");
      expect(source).toContain("parseDetectorConventions");
    });

    it("does NOT split on /^## /m (old format)", () => {
      const source = readSource("orient/analysis.ts");
      // Should not contain the old ## splitting pattern
      expect(source).not.toContain('split(/^## /m)');
    });
  });

  describe("canonical parser integration", () => {
    // Sample h3+table format content -- matches what the detector actually writes
    const sampleConventionsMd = `# Conventions

### Async/Await Pattern

| Metric | Value |
|--------|-------|
| Adoption | 85% (17/20 files) |
| Confidence | HIGH-CONF |
| Trend | Stable |
| Category | async |

**Evidence:**
- \`src/bootstrap/synthesis.ts:52\` -- uses async/await
- \`src/orient/analysis.ts:112\` -- uses async/await

### Named Exports Only

| Metric | Value |
|--------|-------|
| Adoption | 92% (23/25 files) |
| Confidence | HIGH-CONF |
| Trend | Stable |
| Category | exports |

**Evidence:**
- \`src/graph/shared-builder.ts:51\` -- uses named export
- \`src/conventions/parser.ts:46\` -- uses named export
`;

    it("parseDetectorConventions correctly parses h3+table format", async () => {
      // Dynamic import to get the actual parser
      const { parseDetectorConventions } = await import(
        "../../src/conventions/parser.js"
      );
      const parsed = parseDetectorConventions(sampleConventionsMd);

      expect(parsed).toHaveLength(2);

      expect(parsed[0].name).toBe("Async/Await Pattern");
      expect(parsed[0].adoption_pct).toBe(85);
      expect(parsed[0].confidence).toBe("HIGH-CONF");
      expect(parsed[0].category).toBe("async");
      expect(parsed[0].files).toContain("src/bootstrap/synthesis.ts");
      expect(parsed[0].files).toContain("src/orient/analysis.ts");

      expect(parsed[1].name).toBe("Named Exports Only");
      expect(parsed[1].adoption_pct).toBe(92);
      expect(parsed[1].confidence).toBe("HIGH-CONF");
      expect(parsed[1].category).toBe("exports");
    });
  });
});
