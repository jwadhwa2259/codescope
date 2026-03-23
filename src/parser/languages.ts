// Stub - TDD RED phase
export type SupportedLanguage = "typescript" | "tsx" | "javascript" | "python";

export function getGrammarDir(): string {
  throw new Error("Not implemented");
}

export async function loadLanguage(_lang: SupportedLanguage): Promise<any> {
  throw new Error("Not implemented");
}

export function isSupportedLanguage(_lang: string): _lang is SupportedLanguage {
  throw new Error("Not implemented");
}

export function detectLanguage(_filePath: string): SupportedLanguage | null {
  throw new Error("Not implemented");
}
