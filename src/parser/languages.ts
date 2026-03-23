import { Parser, Language } from "web-tree-sitter";
import * as path from "node:path";
import * as fs from "node:fs";

export type SupportedLanguage = "typescript" | "tsx" | "javascript" | "python";

const GRAMMAR_FILES: Record<SupportedLanguage, string> = {
  typescript: "tree-sitter-typescript.wasm",
  tsx: "tree-sitter-tsx.wasm",
  javascript: "tree-sitter-javascript.wasm",
  python: "tree-sitter-python.wasm",
};

const loadedLanguages = new Map<SupportedLanguage, Language>();

export function getGrammarDir(): string {
  return (
    process.env.CODESCOPE_GRAMMAR_DIR ??
    path.join(import.meta.dirname ?? __dirname, "..", "grammars")
  );
}

export async function loadLanguage(lang: SupportedLanguage): Promise<Language> {
  const cached = loadedLanguages.get(lang);
  if (cached) return cached;

  const grammarFile = GRAMMAR_FILES[lang];
  if (!grammarFile) {
    throw new Error(
      `Unsupported language: ${lang}. Supported: ${Object.keys(GRAMMAR_FILES).join(", ")}`
    );
  }

  const grammarPath = path.join(getGrammarDir(), grammarFile);
  if (!fs.existsSync(grammarPath)) {
    throw new Error(
      `Failed to load ${lang} grammar from ${grammarPath}: File not found. ` +
        `Run 'npm run build:grammars' or reinstall the CodeScope plugin.`
    );
  }

  const language = await Language.load(grammarPath);
  loadedLanguages.set(lang, language);
  return language;
}

export function isSupportedLanguage(lang: string): lang is SupportedLanguage {
  return lang in GRAMMAR_FILES;
}

export function detectLanguage(filePath: string): SupportedLanguage | null {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case ".ts":
      return "typescript";
    case ".tsx":
      return "tsx";
    case ".js":
    case ".mjs":
    case ".cjs":
      return "javascript";
    case ".jsx":
      return "javascript"; // JSX parsed as JavaScript
    case ".py":
      return "python";
    default:
      return null;
  }
}
