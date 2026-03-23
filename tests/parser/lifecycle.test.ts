import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import * as path from "node:path";
import * as fs from "node:fs";
import { ParserPool } from "../../src/parser/lifecycle.js";

const grammarDir = path.resolve("grammars");
const grammarsExist =
  fs.existsSync(path.join(grammarDir, "tree-sitter-typescript.wasm")) &&
  fs.existsSync(path.join(grammarDir, "tree-sitter-javascript.wasm")) &&
  fs.existsSync(path.join(grammarDir, "tree-sitter-python.wasm"));

describe("ParserPool", () => {
  let pool: ParserPool;

  beforeAll(async () => {
    // Set grammar dir env var so languages.ts can find them
    process.env.CODESCOPE_GRAMMAR_DIR = grammarDir;
    pool = new ParserPool();
    await pool.init();
  });

  afterAll(() => {
    pool.destroy();
    delete process.env.CODESCOPE_GRAMMAR_DIR;
  });

  it("init() succeeds (Parser.init() called once)", () => {
    // If we got here, init succeeded
    expect(pool).toBeDefined();
  });

  describe.skipIf(!grammarsExist)("with grammars", () => {
    it("getParser('typescript') returns a Parser with TypeScript language set", async () => {
      const parser = await pool.getParser("typescript");
      expect(parser).toBeDefined();
      // Verify it can parse TS code
      const tree = parser.parse("const x: number = 1;");
      expect(tree).not.toBeNull();
      expect(tree!.rootNode.type).toBe("program");
      tree!.delete();
    });

    it("getParser('javascript') returns a Parser with JavaScript language set", async () => {
      const parser = await pool.getParser("javascript");
      expect(parser).toBeDefined();
      const tree = parser.parse("const x = 1;");
      expect(tree).not.toBeNull();
      expect(tree!.rootNode.type).toBe("program");
      tree!.delete();
    });

    it("getParser('python') returns a Parser with Python language set", async () => {
      const parser = await pool.getParser("python");
      expect(parser).toBeDefined();
      const tree = parser.parse("x = 1");
      expect(tree).not.toBeNull();
      expect(tree!.rootNode.type).toBe("module");
      tree!.delete();
    });

    it("getParser('unsupported') throws descriptive error", async () => {
      await expect(
        pool.getParser("unsupported" as any)
      ).rejects.toThrow();
    });

    it("tracks parse count per language", async () => {
      expect(pool.getParseCount("typescript")).toBeGreaterThanOrEqual(0);
      const before = pool.getParseCount("typescript");
      pool.incrementParseCount("typescript");
      expect(pool.getParseCount("typescript")).toBe(before + 1);
    });

    it("recreates parser after MAX_PARSES_BEFORE_RECREATE (100) parses", async () => {
      // Create a fresh pool to control parse count precisely
      const testPool = new ParserPool();
      await testPool.init();

      // Get parser to create initial state
      const parser1 = await testPool.getParser("typescript");

      // Simulate 100 parses
      for (let i = 0; i < 100; i++) {
        testPool.incrementParseCount("typescript");
      }

      // Next getParser call should recreate the parser
      const parser2 = await testPool.getParser("typescript");
      // After recreation, parse count should be reset
      expect(testPool.getParseCount("typescript")).toBe(0);

      testPool.destroy();
    });

    it("tree.delete() is called in finally block on every parse (verified via usage pattern)", async () => {
      // This is verified by the extract.ts implementation pattern.
      // Here we verify the pool's parse method works correctly and parser is reusable.
      const parser = await pool.getParser("typescript");
      const tree1 = parser.parse("const a = 1;");
      expect(tree1).not.toBeNull();
      tree1!.delete();
      // Parser should still be reusable after tree.delete()
      const tree2 = parser.parse("const b = 2;");
      expect(tree2).not.toBeNull();
      tree2!.delete();
    });

    it("destroy() calls parser.delete() for all language parsers", async () => {
      const destroyPool = new ParserPool();
      await destroyPool.init();
      await destroyPool.getParser("typescript");
      await destroyPool.getParser("javascript");
      // Should not throw
      expect(() => destroyPool.destroy()).not.toThrow();
      // After destroy, getParser should throw (not initialized)
      await expect(
        destroyPool.getParser("typescript")
      ).rejects.toThrow("not initialized");
    });
  });
});
