import { Parser } from "web-tree-sitter";
import { type SupportedLanguage, loadLanguage } from "./languages.js";
import type { Language } from "web-tree-sitter";

const MAX_PARSES_BEFORE_RECREATE = 100;

interface LanguageState {
  parser: Parser;
  language: Language;
  parseCount: number;
}

export { MAX_PARSES_BEFORE_RECREATE };

export class ParserPool {
  private parsers = new Map<SupportedLanguage, LanguageState>();
  private initialized = false;

  async init(): Promise<void> {
    if (this.initialized) return;
    await Parser.init();
    this.initialized = true;
  }

  async getParser(lang: SupportedLanguage): Promise<Parser> {
    if (!this.initialized) {
      throw new Error("ParserPool not initialized. Call init() first.");
    }

    let state = this.parsers.get(lang);
    if (!state) {
      const language = await loadLanguage(lang);
      const parser = new Parser();
      parser.setLanguage(language);
      state = { parser, language, parseCount: 0 };
      this.parsers.set(lang, state);
    }

    // Recreate parser after N parses to prevent memory leaks (D-34)
    if (state.parseCount >= MAX_PARSES_BEFORE_RECREATE) {
      state.parser.delete();
      const newParser = new Parser();
      newParser.setLanguage(state.language);
      state.parser = newParser;
      state.parseCount = 0;
    }

    return state.parser;
  }

  incrementParseCount(lang: SupportedLanguage): void {
    const state = this.parsers.get(lang);
    if (state) state.parseCount++;
  }

  getParseCount(lang: SupportedLanguage): number {
    return this.parsers.get(lang)?.parseCount ?? 0;
  }

  destroy(): void {
    for (const [, state] of this.parsers) {
      state.parser.delete();
    }
    this.parsers.clear();
    this.initialized = false;
  }
}
