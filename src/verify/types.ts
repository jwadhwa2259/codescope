// ---------------------------------------------------------------------------
// Verify Pipeline Shared Types
// ---------------------------------------------------------------------------
// All types exported from this module are consumed by blast-radius-diff.ts,
// report-writer.ts, static-verify.ts, runtime-verify.ts, and the verify
// MCP tool handler.
// ---------------------------------------------------------------------------

// ---- Severity & Status ----

/** Severity levels per D-02 */
export type Severity = "ERROR" | "WARN" | "INFO";

/** Check status for individual verification checks */
export type CheckStatus = "pass" | "fail" | "skipped" | "unavailable";

// ---- Convention Violation (D-04) ----

export interface ConventionViolation {
  file: string;
  line: number;
  convention: string;
  adoption: number; // percentage
  goldenFile: string | null; // path to golden file with line range
  message: string;
  severity: Severity; // always WARN per D-02
}

// ---- Blast Radius Diff (D-07, D-08, D-09, D-10) ----

export interface SurpriseFile {
  filePath: string;
  minHopDistance: number; // -1 = unconnected
  severity: Severity; // WARN for hops 1-2, ERROR for 3+ or unconnected
}

export interface SkipFile {
  filePath: string;
  severity: "INFO";
  reason: string;
}

export interface BlastRadiusDiffResult {
  surprises: SurpriseFile[];
  skips: SkipFile[];
  scopeDrift: string[]; // file paths with scope drift (WARN severity)
  timing_ms: number;
}

// ---- Code Review (D-23, D-24) ----

export interface ReviewFinding {
  file: string;
  line: number;
  description: string;
  severity: Severity; // WARN or INFO
}

// ---- Test Results (D-22) ----

export interface TestResult {
  status: CheckStatus;
  passed: number;
  failed: number;
  total: number;
  duration_ms: number;
  failures: Array<{
    testName: string;
    file: string;
    line: number;
    error: string;
  }>;
  rawOutputTail?: string; // last 500 lines per D-27
}

// ---- Smoke Results (D-12) ----

export interface SmokeResult {
  endpoint: string;
  method: string;
  expectedStatus: number;
  actualStatus: number | null;
  passed: boolean;
  severity: Severity; // INFO for pass, WARN for fail
}

// ---- Static Verify Agent (D-20) ----

export interface StaticVerifyOptions {
  projectRoot: string;
  taskSlug: string;
  changedFiles: string[];
  planPath: string;
  scopeContractPath: string;
}

export interface StaticVerifyResult {
  conventionViolations: ConventionViolation[];
  blastRadiusDiff: BlastRadiusDiffResult;
  codeReview: ReviewFinding[];
  timing: {
    convention_ms: number;
    blastRadius_ms: number;
    codeReview_ms: number;
  };
}

// ---- Runtime Verify Agent (D-20) ----

export interface RuntimeVerifyOptions {
  projectRoot: string;
  taskSlug: string;
  config: {
    build_command?: string;
    start_command?: string;
    health_check?: string;
    ready_signal?: string;
    timeout_seconds: number;
    tests: {
      unit?: string;
      integration?: string;
      e2e?: { tool: string; command?: string; config?: string };
    };
    auto_smoke: boolean;
    static_check: boolean;
    blast_radius_diff: boolean;
  };
  changedFiles: string[];
}

export interface RuntimeVerifyResult {
  build: {
    status: CheckStatus;
    command?: string;
    output?: string;
    exitCode?: number;
    duration_ms: number;
  };
  unitTests: TestResult;
  integrationTests: TestResult;
  e2e: TestResult;
  autoSmoke: SmokeResult[];
  timing: Record<string, number>;
}

// ---- Unified Verify Report (D-01) ----

export interface VerifyReport {
  taskSlug: string;
  taskDescription: string;
  date: string;
  static: StaticVerifyResult;
  runtime: RuntimeVerifyResult;
  totalDuration_ms: number;
}

// ---- Callbacks for LLM Sub-Agent Dispatch ----

export interface VerifyCallbacks {
  dispatchReviewAgent: (prompt: string) => Promise<string>;
  dispatchSmokeAgent: (prompt: string) => Promise<string>;
  onProgress: (message: string) => void;
}
