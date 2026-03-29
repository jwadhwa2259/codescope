export type RiskTier = "HIGH" | "MEDIUM" | "LOW";

export interface ParsedConvention {
  name: string;
  adoption_pct: number;
  confidence: string;
  category: string;
  files: string[];
  evidence: string[];
}

export interface DiffResolution {
  files: string[];
  diffText: string;
  source: string;
}

export interface DiffError {
  error: true;
  code: string;
  message: string;
  recovery: string;
}

/** Minimal db interface matching better-sqlite3 prepare/all pattern used by graph query functions */
export interface DbHandle {
  prepare: (sql: string) => { all: (...args: unknown[]) => unknown[] };
}
