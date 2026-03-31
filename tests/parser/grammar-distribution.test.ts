import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { getGrammarDir, validateGrammars } from "../../src/parser/languages.js";

describe("Grammar distribution", () => {
  const REQUIRED_GRAMMARS = [
    "tree-sitter-typescript.wasm",
    "tree-sitter-tsx.wasm",
    "tree-sitter-javascript.wasm",
    "tree-sitter-python.wasm",
  ];

  it("grammar directory exists", () => {
    const dir = getGrammarDir();
    expect(fs.existsSync(dir)).toBe(true);
  });

  it.each(REQUIRED_GRAMMARS)("%s exists in grammar directory", (file) => {
    const grammarPath = path.join(getGrammarDir(), file);
    expect(
      fs.existsSync(grammarPath),
      `Missing ${file} — plugin will fail to parse files. ` +
        `Ensure grammars/*.wasm are committed (not gitignored).`,
    ).toBe(true);
  });

  it("validateGrammars() reports all present", () => {
    const result = validateGrammars();
    expect(result.ok).toBe(true);
    expect(result.missing).toEqual([]);
  });

  it("WASM files are non-empty", () => {
    for (const file of REQUIRED_GRAMMARS) {
      const grammarPath = path.join(getGrammarDir(), file);
      const stat = fs.statSync(grammarPath);
      expect(stat.size).toBeGreaterThan(1000);
    }
  });
});
