// ---------------------------------------------------------------------------
// Shared types for the CodeScope execution engine
// ---------------------------------------------------------------------------

/**
 * Handoff signal sent between parallel agents via SendMessage.
 * Per D-35 and UI-SPEC SendMessage protocol.
 */
export interface HandoffSignal {
  type: "ready" | "done" | "blocked";
  files: string[];
  detail: string;
}

/**
 * Discovery signal broadcast by agents to share findings.
 * Per D-35 and UI-SPEC SendMessage protocol.
 */
export interface DiscoverySignal {
  type: "discovery";
  category: "api_change" | "new_utility" | "pattern" | "warning";
  detail: string;
  files: string[];
}

/**
 * Signals that appear in the coordination log.
 * Per UI-SPEC coordination log format.
 */
export type CoordinationSignal =
  | "started"
  | "ready"
  | "discovery"
  | "done"
  | "failed"
  | "skipped";

/**
 * A single entry in the coordination log (append-only markdown table row).
 * Per D-28, D-29, D-30.
 */
export interface CoordinationEntry {
  timestamp: string;
  agent: string;
  signal: CoordinationSignal;
  files: string[];
  detail: string;
}

/**
 * Result of a single agent's execution.
 */
export interface AgentResult {
  name: string;
  status: "complete" | "failed" | "skipped";
  durationMs: number;
  filesChanged: string[];
  linesAdded: number;
  linesRemoved: number;
  error?: string;
  retried: boolean;
  changeReportPath?: string;
}

/**
 * Agent teams feature availability detection result.
 * Per D-42, D-43.
 */
export interface TeamsAvailability {
  available: boolean;
  reason:
    | "env_var_set"
    | "env_var_missing"
    | "settings_json_set"
    | "probe_failed";
}

/**
 * Options for executing an agent plan.
 * Follows the BootstrapOptions pattern from bootstrap/orchestrator.ts.
 */
export interface ExecutionOptions {
  projectRoot: string;
  taskSlug: string;
  planPath: string;
  maxConcurrent: number;
  verbosity: "brief" | "detailed";
  onProgress?: (message: string) => void;
}

/**
 * Result of a full execution run.
 * Follows the BootstrapResult pattern from bootstrap/orchestrator.ts.
 */
export interface ExecutionResult {
  status: "complete" | "partial" | "failed";
  agents: AgentResult[];
  summaryPath: string;
  coordinationPath: string;
  durationMs: number;
  mode: "sequential" | "parallel" | "wave-based";
  tokensEstimate: number;
}
