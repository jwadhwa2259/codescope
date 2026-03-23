// Stub - TDD RED phase
export { ParserPool } from "./lifecycle.js";
export { extractFromSource, type ParseResult } from "./extract.js";
export type { ImportInfo, ExportInfo, ClassInfo, FunctionInfo, VariableInfo } from "./extract.js";
export { detectLanguage, isSupportedLanguage, type SupportedLanguage } from "./languages.js";

export async function parseFile(
  _filePath: string,
  _pool: any,
  _options?: { shallow?: boolean }
): Promise<any> {
  throw new Error("Not implemented");
}
