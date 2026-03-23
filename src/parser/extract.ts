// Stub - TDD RED phase
import type { SupportedLanguage } from "./languages.js";
import type { ParserPool } from "./lifecycle.js";

export interface ImportInfo {
  source: string;
  specifiers: string[];
  line: number;
  isDefault: boolean;
  isNamespace: boolean;
}

export interface ExportInfo {
  name: string;
  kind: "function" | "class" | "variable" | "type" | "interface" | "enum" | "default" | "re-export";
  line: number;
}

export interface ClassInfo {
  name: string;
  methods: string[];
  properties: string[];
  startLine: number;
  endLine: number;
  isExported: boolean;
}

export interface FunctionInfo {
  name: string;
  params: string[];
  startLine: number;
  endLine: number;
  isExported: boolean;
  isAsync: boolean;
}

export interface VariableInfo {
  name: string;
  isExported: boolean;
  line: number;
}

export interface ParseResult {
  imports: ImportInfo[];
  exports: ExportInfo[];
  classes: ClassInfo[];
  functions: FunctionInfo[];
  variables: VariableInfo[];
  errors: string[];
}

export async function extractFromSource(
  _source: string,
  _language: SupportedLanguage,
  _pool: ParserPool,
  _options?: { shallow?: boolean }
): Promise<ParseResult> {
  throw new Error("Not implemented");
}
