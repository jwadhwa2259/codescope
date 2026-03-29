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

/** Minimal db interface compatible with better-sqlite3 Database.
 *  Uses `any` parameter types to accept both `{}` (better-sqlite3 default)
 *  and `unknown[]` without type conflict. */
export interface DbHandle {
  prepare: (sql: string) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    all: (...args: any[]) => unknown[];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    run: (...args: any[]) => unknown;
  };
}
