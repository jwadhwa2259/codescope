// Stub - TDD RED phase
import type { SupportedLanguage } from "./languages.js";

export class ParserPool {
  async init(): Promise<void> {
    throw new Error("Not implemented");
  }

  async getParser(_lang: SupportedLanguage): Promise<any> {
    throw new Error("Not implemented");
  }

  incrementParseCount(_lang: SupportedLanguage): void {
    throw new Error("Not implemented");
  }

  getParseCount(_lang: SupportedLanguage): number {
    throw new Error("Not implemented");
  }

  destroy(): void {
    throw new Error("Not implemented");
  }
}
