// ---------------------------------------------------------------------------
// Eval Pipeline Shared Types
// ---------------------------------------------------------------------------
// All types exported from this module are consumed by eval-agent.ts,
// report-appender.ts, ignore-filter.ts, and the eval MCP tool handler.
//
// Per D-06, EVAL-03, and 06-RESEARCH.md code examples.
// ---------------------------------------------------------------------------

import type { Severity, StaticVerifyResult, RuntimeVerifyResult } from "../verify/types.js";

// ---- Eval Criteria & Finding Categories ----

export type FindingCategory =
  | "missing_implementation"
  | "incorrect_implementation"
  | "design_decision";

export type EvalCriterion =
  | "scope_compliance"
  | "convention_adherence"
  | "completeness"
  | "correctness";

// ---- EvalFinding (D-06) ----

export interface EvalFinding {
  id: string;
  criterion: EvalCriterion;
  category: FindingCategory;
  file: string;
  line: number;
  description: string;
  severity: Severity;
  evidence: string;
  goldenFileRef?: string;
}

// ---- EvalCriterionResult (D-02) ----

export interface EvalCriterionResult {
  criterion: EvalCriterion;
  status: "PASS" | "FAIL" | "SKIPPED";
  findings: EvalFinding[];
  detail?: string;
}

// ---- IgnorePattern (D-10) ----

export interface IgnorePattern {
  pattern: string;
  scope: string;
  criterion: EvalCriterion;
  created: string;
  reason: string;
}

// ---- EvalOptions (D-03) ----

export interface EvalOptions {
  projectRoot: string;
  taskSlug: string;
  verifyResult: { static: StaticVerifyResult; runtime: RuntimeVerifyResult };
  scopeContractPath: string;
  planPath: string;
  coordinationPath: string;
  researchPath: string | null;
  enabledCriteria: Record<EvalCriterion, boolean>;
  ignorePatterns: IgnorePattern[];
}

// ---- EvalResult (D-02) ----

export interface EvalResult {
  criteria: EvalCriterionResult[];
  findings: EvalFinding[];
  overallStatus: "PASS" | "FAIL";
  timing_ms: number;
}

// ---- EvalCallbacks ----

export interface EvalCallbacks {
  dispatchEvalAgent: (prompt: string) => Promise<string>;
  onProgress: (message: string) => void;
}

// ---- DebugCycleResult (D-14) ----

export interface DebugCycleResult {
  maxCycles: number;
  findingsTargeted: number;
  fixPlans: Array<{
    description: string;
    files: string[];
    findingsAddressed: string[];
    result: "fixed" | "partially fixed" | "failed";
    commitHash?: string;
    commitMessage?: string;
  }>;
  reVerify: { filesVerified: number; newIssues: number };
  reEval: {
    findingsEvaluated: number;
    resolved: number;
    remaining: number;
    newFromFix: number;
  };
}
