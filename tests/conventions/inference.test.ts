import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import {
  inferConventions,
  formatInferredConventions,
  type InferredConvention,
} from "../../src/conventions/inference.js";

describe("convention inference (R8)", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "codescope-inference-test-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function writeFile(relPath: string, content: string): void {
    const absPath = path.join(tmpDir, relPath);
    fs.mkdirSync(path.dirname(absPath), { recursive: true });
    fs.writeFileSync(absPath, content, "utf-8");
  }

  describe("import extension detection", () => {
    it("detects .js import extension convention when 80%+ use .js", () => {
      // Create 5 files where 4/5 use .js extension in relative imports
      for (let i = 0; i < 4; i++) {
        writeFile(`src/mod${i}.ts`, `import { foo } from "./utils.js";\nexport const x${i} = foo;\n`);
      }
      writeFile("src/mod4.ts", `import { foo } from "./utils";\nexport const x4 = foo;\n`);

      const sourceFiles = [
        "src/mod0.ts", "src/mod1.ts", "src/mod2.ts", "src/mod3.ts", "src/mod4.ts",
      ];

      const conventions = inferConventions(tmpDir, sourceFiles);
      const jsExtConv = conventions.find(c => c.name === "Import Extension: .js");
      expect(jsExtConv).toBeDefined();
      expect(jsExtConv!.adoptionPercent).toBe(80);
      expect(jsExtConv!.confidence).toBe("HIGH-CONF");
    });
  });

  describe("package ecosystem detection", () => {
    it("detects @effect/* package ecosystem when heavily imported", () => {
      // 5 files, 4 of which import from @effect packages
      writeFile("src/a.ts", `import { Effect } from "@effect/io";\nimport { pipe } from "@effect/data";\nexport const a = 1;\n`);
      writeFile("src/b.ts", `import { Layer } from "@effect/io";\nexport const b = 2;\n`);
      writeFile("src/c.ts", `import { Schema } from "@effect/schema";\nexport const c = 3;\n`);
      writeFile("src/d.ts", `import { Config } from "@effect/io";\nexport const d = 4;\n`);
      writeFile("src/e.ts", `export const e = 5;\n`);

      const sourceFiles = ["src/a.ts", "src/b.ts", "src/c.ts", "src/d.ts", "src/e.ts"];

      const conventions = inferConventions(tmpDir, sourceFiles);
      const effectConv = conventions.find(c => c.name.includes("@effect/io"));
      expect(effectConv).toBeDefined();
      expect(effectConv!.adoptionPercent).toBeGreaterThanOrEqual(40);
    });
  });

  describe("API pattern detection", () => {
    it("detects pipe() as a convention when used in 40%+ of files", () => {
      // 5 files, 3 use pipe()
      writeFile("src/a.ts", `import { pipe } from "fp-ts";\nconst x = pipe(1, add);\n`);
      writeFile("src/b.ts", `const y = pipe(2, multiply);\n`);
      writeFile("src/c.ts", `const z = pipe(3, subtract);\n`);
      writeFile("src/d.ts", `const w = 4;\n`);
      writeFile("src/e.ts", `const v = 5;\n`);

      const sourceFiles = ["src/a.ts", "src/b.ts", "src/c.ts", "src/d.ts", "src/e.ts"];

      const conventions = inferConventions(tmpDir, sourceFiles);
      const pipeConv = conventions.find(c => c.name === "API Pattern: pipe()");
      expect(pipeConv).toBeDefined();
      expect(pipeConv!.adoptionPercent).toBe(60); // 3/5 = 60%
    });
  });

  describe("filtering", () => {
    it("excludes generic language features from results", () => {
      // Create files with generic features that should NOT be reported
      for (let i = 0; i < 5; i++) {
        writeFile(`src/mod${i}.ts`, [
          `import { something } from "./other.js";`,
          `export const val = ${i};`,
          `const x = ${i};`,
          `function helper() { return ${i}; }`,
        ].join("\n"));
      }

      const sourceFiles = Array.from({ length: 5 }, (_, i) => `src/mod${i}.ts`);

      const conventions = inferConventions(tmpDir, sourceFiles);
      // Should NOT have conventions named "import", "export", "const", "function"
      const genericNames = conventions.filter(c =>
        ["import", "export", "const", "function", "return"].some(kw =>
          c.name.toLowerCase() === `api pattern: ${kw}()`
        )
      );
      expect(genericNames).toHaveLength(0);
    });

    it("filters out patterns below 40% adoption threshold", () => {
      // 10 files, only 2 use pipe() = 20% adoption -> should be filtered
      for (let i = 0; i < 10; i++) {
        if (i < 2) {
          writeFile(`src/mod${i}.ts`, `const x = pipe(${i}, add);\n`);
        } else {
          writeFile(`src/mod${i}.ts`, `export const x${i} = ${i};\n`);
        }
      }

      const sourceFiles = Array.from({ length: 10 }, (_, i) => `src/mod${i}.ts`);

      const conventions = inferConventions(tmpDir, sourceFiles);
      const pipeConv = conventions.find(c => c.name === "API Pattern: pipe()");
      expect(pipeConv).toBeUndefined();
    });
  });

  describe("edge cases", () => {
    it("returns empty array when no source files provided", () => {
      expect(inferConventions(tmpDir, [])).toEqual([]);
    });

    it("returns empty array when fewer than 3 non-test files", () => {
      writeFile("src/a.ts", `import { x } from "./b.js";\n`);
      writeFile("src/b.ts", `export const x = 1;\n`);

      const conventions = inferConventions(tmpDir, ["src/a.ts", "src/b.ts"]);
      expect(conventions).toEqual([]);
    });

    it("excludes test files from analysis", () => {
      // 4 files total but 2 are test files -> only 2 non-test (below threshold)
      writeFile("src/a.ts", `import { x } from "./b.js";\n`);
      writeFile("src/b.ts", `export const x = 1;\n`);
      writeFile("src/a.test.ts", `import { x } from "./a.js";\n`);
      writeFile("src/b.spec.ts", `import { x } from "./b.js";\n`);

      const conventions = inferConventions(tmpDir, [
        "src/a.ts", "src/b.ts", "src/a.test.ts", "src/b.spec.ts",
      ]);
      expect(conventions).toEqual([]);
    });

    it("returns empty when no project-specific patterns found", () => {
      // 4 files with no imports and no special calls
      for (let i = 0; i < 4; i++) {
        writeFile(`src/mod${i}.ts`, `export const x${i} = ${i};\n`);
      }

      const sourceFiles = Array.from({ length: 4 }, (_, i) => `src/mod${i}.ts`);

      const conventions = inferConventions(tmpDir, sourceFiles);
      expect(conventions).toEqual([]);
    });
  });

  describe("formatInferredConventions", () => {
    it("returns empty string for empty array", () => {
      expect(formatInferredConventions([])).toBe("");
    });

    it("produces canonical h3+table format parseable by parseDetectorConventions", () => {
      const conventions: InferredConvention[] = [{
        name: "Import Extension: .js",
        pattern: 'Relative imports use ".js" extension',
        frequency: 40,
        totalFiles: 50,
        adoptionPercent: 80,
        confidence: "HIGH-CONF",
        evidence: [
          { file: "src/a.ts", line: 1, snippet: 'import { foo } from "./bar.js"' },
        ],
      }];

      const md = formatInferredConventions(conventions);
      expect(md).toContain("### Import Extension: .js");
      expect(md).toContain("| Adoption | 80% (40/50 files) |");
      expect(md).toContain("| Confidence | HIGH-CONF |");
      expect(md).toContain("| Category | inferred |");
      expect(md).toContain("**Evidence:**");
      expect(md).toContain("`src/a.ts:1`");
    });
  });
});
