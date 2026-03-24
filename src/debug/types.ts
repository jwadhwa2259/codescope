// ---------------------------------------------------------------------------
// Debug Pipeline Shared Types
// ---------------------------------------------------------------------------
// All types exported from this module are consumed by fix-planner.ts,
// debug-agent.ts, and the debug CLI entry point.
//
// Per D-11, D-12, D-14, D-23, D-27.
// ---------------------------------------------------------------------------

import type { EvalFinding } from "../eval/types.js";

// ---- FixTask (D-11, D-23) ----

export interface FixTask {
  file: string;
  findings: EvalFinding[];
  goldenFileExcerpts: Map<string, string>;
}

// ---- DesignDecision (D-12, D-29) ----

export interface DesignDecision {
  finding: EvalFinding;
  options: Array<{
    id: string;
    description: string;
    impact: string;
  }>;
}

// ---- DebugOptions ----

export interface DebugOptions {
  projectRoot: string;
  taskSlug: string;
  findings: EvalFinding[];
  scopeContractPath: string;
  planPath: string;
  coordinationPath: string;
  reportPath: string;
  maxCycles: number;
  executionDir: string;
}

// ---- DebugResult (D-14, D-27) ----

export interface DebugResult {
  cyclesUsed: number;
  resolved: EvalFinding[];
  remaining: EvalFinding[];
  commits: Array<{ hash: string; findings: string[] }>;
  escalated: EvalFinding[];
  timing_ms: number;
}

// ---- DebugCallbacks ----

export interface DebugCallbacks {
  dispatchFixAgent: (
    prompt: string,
  ) => Promise<{ success: boolean; output?: string; error?: string }>;
  dispatchEvalAgent: (prompt: string) => Promise<string>;
  dispatchVerifyAgent: (
    changedFiles: string[],
  ) => Promise<{ newIssues: number }>;
  onDesignDecision: (decision: DesignDecision) => Promise<string>;
  onProgress: (message: string) => void;
}
