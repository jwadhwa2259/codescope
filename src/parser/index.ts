import { ParserPool } from "./lifecycle.js";
import { extractFromSource, type ParseResult } from "./extract.js";
import { detectLanguage, type SupportedLanguage } from "./languages.js";
import * as fs from "node:fs";

export { ParserPool, type ParseResult, type SupportedLanguage };
export type {
  ImportInfo,
  ExportInfo,
  ClassInfo,
  FunctionInfo,
  VariableInfo,
} from "./extract.js";
export { extractFromSource } from "./extract.js";
export { detectLanguage, isSupportedLanguage } from "./languages.js";

const LARGE_FILE_BYTES = 500 * 1024; // 500KB
const LARGE_FILE_LINES = 10000;

export { LARGE_FILE_BYTES, LARGE_FILE_LINES };

export async function parseFile(
  filePath: string,
  pool: ParserPool,
  options?: { shallow?: boolean }
): Promise<ParseResult | null> {
  const lang = detectLanguage(filePath);
  if (!lang) return null;

  let source: string;
  try {
    const stat = fs.statSync(filePath);
    if (stat.size > LARGE_FILE_BYTES) {
      // Shallow parse for large files (D-37)
      source = fs.readFileSync(filePath, "utf-8");
      return extractFromSource(source, lang, pool, { shallow: true });
    }
    source = fs.readFileSync(filePath, "utf-8");
  } catch (err) {
    // Skip files that can't be read (D-35)
    return {
      imports: [],
      exports: [],
      classes: [],
      functions: [],
      variables: [],
      errors: [`Failed to read ${filePath}: ${err}`],
    };
  }

  const lineCount = source.split("\n").length;
  const shallow = options?.shallow ?? lineCount > LARGE_FILE_LINES;

  return extractFromSource(source, lang, pool, { shallow });
}
