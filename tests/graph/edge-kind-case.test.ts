/**
 * Tests that all SQL queries referencing edge kind use uppercase 'IMPORTS'
 * to match the producer in shared-builder.ts.
 *
 * Regression guard: no source file under src/ should contain lowercase
 * "kind = 'imports'" in any SQL query string.
 */

import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";

const SRC_DIR = path.resolve(__dirname, "../../src");

function readSource(relativePath: string): string {
  return fs.readFileSync(path.join(SRC_DIR, relativePath), "utf-8");
}

describe("Edge kind case consistency", () => {
  it("reference-index.ts uses uppercase IMPORTS in SQL queries", () => {
    const source = readSource("artifacts/reference-index.ts");
    expect(source).toContain("e.kind = 'IMPORTS'");
    expect(source).not.toContain("e.kind = 'imports'");
  });

  it("deterministic-scorecard.ts uses uppercase IMPORTS in SQL queries", () => {
    const source = readSource("eval/deterministic-scorecard.ts");
    expect(source).toContain("e.kind = 'IMPORTS'");
    expect(source).not.toContain("e.kind = 'imports'");
  });

  it("shared-builder.ts produces uppercase IMPORTS edge kind", () => {
    const source = readSource("graph/shared-builder.ts");
    expect(source).toContain('kind: "IMPORTS"');
  });

  it("no source file under src/ contains lowercase 'imports' in edge kind SQL queries", () => {
    const lowercasePattern = /kind\s*=\s*'imports'/g;

    function scanDir(dir: string): string[] {
      const hits: string[] = [];
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          hits.push(...scanDir(fullPath));
        } else if (entry.name.endsWith(".ts") && !entry.name.endsWith(".d.ts")) {
          const content = fs.readFileSync(fullPath, "utf-8");
          if (lowercasePattern.test(content)) {
            const relative = path.relative(SRC_DIR, fullPath);
            hits.push(relative);
          }
          // Reset lastIndex for global regex
          lowercasePattern.lastIndex = 0;
        }
      }
      return hits;
    }

    const filesWithLowercase = scanDir(SRC_DIR);
    expect(filesWithLowercase).toEqual([]);
  });
});
