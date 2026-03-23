import { describe, it, expect, beforeAll, afterAll } from "vitest";
import * as path from "node:path";
import * as fs from "node:fs";
import { ParserPool } from "../../src/parser/lifecycle.js";
import { extractFromSource, type ParseResult } from "../../src/parser/extract.js";

const grammarDir = path.resolve("grammars");
const grammarsExist =
  fs.existsSync(path.join(grammarDir, "tree-sitter-typescript.wasm")) &&
  fs.existsSync(path.join(grammarDir, "tree-sitter-javascript.wasm")) &&
  fs.existsSync(path.join(grammarDir, "tree-sitter-python.wasm"));

describe.skipIf(!grammarsExist)("extractFromSource", () => {
  let pool: ParserPool;

  beforeAll(async () => {
    process.env.CODESCOPE_GRAMMAR_DIR = grammarDir;
    pool = new ParserPool();
    await pool.init();
  });

  afterAll(() => {
    pool.destroy();
    delete process.env.CODESCOPE_GRAMMAR_DIR;
  });

  describe("TypeScript extraction", () => {
    it("returns imports array for `import { foo } from \"bar\"`", async () => {
      const result = await extractFromSource(
        'import { foo } from "bar";',
        "typescript",
        pool
      );
      expect(result.imports).toHaveLength(1);
      expect(result.imports[0].source).toBe("bar");
      expect(result.imports[0].specifiers).toContain("foo");
    });

    it("returns exports array for `export function foo() {}`", async () => {
      const result = await extractFromSource(
        "export function foo() {}",
        "typescript",
        pool
      );
      expect(result.exports.length).toBeGreaterThanOrEqual(1);
      expect(result.exports.some((e) => e.name === "foo")).toBe(true);
      expect(result.functions.length).toBeGreaterThanOrEqual(1);
      expect(result.functions[0].name).toBe("foo");
      expect(result.functions[0].isExported).toBe(true);
    });

    it("returns classes array for `class Foo { method() {} }`", async () => {
      const result = await extractFromSource(
        "export class Foo { method() {} }",
        "typescript",
        pool
      );
      expect(result.classes).toHaveLength(1);
      expect(result.classes[0].name).toBe("Foo");
      expect(result.classes[0].methods).toContain("method");
      expect(result.classes[0].isExported).toBe(true);
    });

    it("returns functions array for `function bar(x: string) {}`", async () => {
      const result = await extractFromSource(
        "function bar(x: string) {}",
        "typescript",
        pool
      );
      expect(result.functions).toHaveLength(1);
      expect(result.functions[0].name).toBe("bar");
      expect(result.functions[0].params).toContain("x");
    });

    it("returns variables array for `export const baz = 1`", async () => {
      const result = await extractFromSource(
        "export const baz = 1;",
        "typescript",
        pool
      );
      expect(result.variables.length).toBeGreaterThanOrEqual(1);
      expect(result.variables.some((v) => v.name === "baz")).toBe(true);
      expect(result.variables.find((v) => v.name === "baz")!.isExported).toBe(
        true
      );
    });
  });

  describe("Python extraction", () => {
    it("handles `from os import path` -> imports[0].source === 'os'", async () => {
      const result = await extractFromSource(
        "from os import path",
        "python",
        pool
      );
      expect(result.imports).toHaveLength(1);
      expect(result.imports[0].source).toBe("os");
      expect(result.imports[0].specifiers).toContain("path");
    });

    it("handles `def my_func(a, b):` -> functions[0].name === 'my_func'", async () => {
      const result = await extractFromSource(
        "def my_func(a, b):\n    pass",
        "python",
        pool
      );
      expect(result.functions).toHaveLength(1);
      expect(result.functions[0].name).toBe("my_func");
      expect(result.functions[0].params).toContain("a");
      expect(result.functions[0].params).toContain("b");
    });

    it("handles `class MyClass:` -> classes[0].name === 'MyClass'", async () => {
      const result = await extractFromSource(
        "class MyClass:\n    pass",
        "python",
        pool
      );
      expect(result.classes).toHaveLength(1);
      expect(result.classes[0].name).toBe("MyClass");
    });

    it("handles `import json` -> imports with source 'json'", async () => {
      const result = await extractFromSource("import json", "python", pool);
      expect(result.imports).toHaveLength(1);
      expect(result.imports[0].source).toBe("json");
    });
  });

  describe("Edge cases", () => {
    it("returns empty arrays for file with only comments", async () => {
      const result = await extractFromSource(
        "// This is a comment\n// Another comment",
        "typescript",
        pool
      );
      expect(result.imports).toHaveLength(0);
      expect(result.exports).toHaveLength(0);
      expect(result.classes).toHaveLength(0);
      expect(result.functions).toHaveLength(0);
      expect(result.variables).toHaveLength(0);
    });

    it("with shallow=true only extracts top-level declarations (no descent into class bodies for methods)", async () => {
      const result = await extractFromSource(
        "export class Widget { render() {} update() {} }",
        "typescript",
        pool,
        { shallow: true }
      );
      expect(result.classes).toHaveLength(1);
      expect(result.classes[0].name).toBe("Widget");
      // In shallow mode, methods should not be extracted
      expect(result.classes[0].methods).toHaveLength(0);
    });

    it("parseFile on syntactically invalid code does not throw (returns partial result per D-35)", async () => {
      const result = await extractFromSource(
        "const x = ; function foo() {} class Bar {",
        "typescript",
        pool
      );
      // Should not throw, and should return partial results
      expect(result).toBeDefined();
      expect(result.errors.length).toBeGreaterThan(0);
      // Should still extract what it can
      expect(result.functions.length).toBeGreaterThanOrEqual(1);
    });

    it("returns empty arrays for empty source", async () => {
      const result = await extractFromSource("", "typescript", pool);
      expect(result.imports).toHaveLength(0);
      expect(result.exports).toHaveLength(0);
      expect(result.classes).toHaveLength(0);
      expect(result.functions).toHaveLength(0);
      expect(result.variables).toHaveLength(0);
    });
  });
});
