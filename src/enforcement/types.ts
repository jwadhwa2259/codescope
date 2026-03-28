// ---------------------------------------------------------------------------
// Convention Enforcement Shared Types
// ---------------------------------------------------------------------------
// Types for the pre-commit convention enforcement engine.
// Used by rule-filter, pre-commit-check, and hook installation.
// ---------------------------------------------------------------------------

export type EnforcementSeverity = "suggest-only" | "warn" | "block";

export interface EnforcementFinding {
  ruleId: string;
  conventionName: string;
  file: string;
  line: number;
  message: string;
}

export interface EnforcementResult {
  exitCode: number; // 0 for suggest-only/warn, 2 for block with findings
  findings: EnforcementFinding[];
  summary: string; // "Checked N conventions against M staged files: K finding(s)"
  severity: EnforcementSeverity;
  output: string; // Formatted terminal output with ANSI colors
}
