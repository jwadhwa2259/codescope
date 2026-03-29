// ---------------------------------------------------------------------------
// Orient Pipeline Shared Types
// ---------------------------------------------------------------------------

import type { CostTier } from "../utils/tokens.js";

// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// All types exported from this module are consumed by clarification.ts,
// analysis.ts, research.ts, planner.ts, validation.ts, and pipeline.ts.
// ---------------------------------------------------------------------------

// ---- Ambiguity & Clarification ----

export type AmbiguityLevel = "HIGH" | "MEDIUM" | "LOW";

export interface AmbiguityAssessment {
  level: AmbiguityLevel;
  matchedNodes: number;
  communitiesSpanned: number;
  dangerZonesInScope: number;
  reasons: string[];
}

export type QuestionTopic =
  | "scope_boundary"
  | "convention_conflict"
  | "danger_zone"
  | "test_coverage";

export interface ClarificationQuestion {
  topic: QuestionTopic;
  question: string;
  context: string;
}

// ---- Scope Contract ----

export interface AffectedFile {
  filePath: string;
  risk: "HIGH" | "MEDIUM" | "LOW";
  centrality: number;
  community: string | null;
}

export interface RiskFlag {
  filePath: string;
  reason: string;
}

export interface ScopeContract {
  task: string;
  taskSlug: string;
  createdAt: string;
  status: "APPROVED" | "REJECTED" | "PENDING";
  inScope: string[];
  outOfScope: string[];
  affectedFiles: AffectedFile[];
  assumptions: string[];
  conventionsInScope: string[];
  riskFlags: RiskFlag[];
}

// ---- Clarification Result ----

export interface ClarificationResult {
  needsClarification: boolean;
  ambiguityLevel: AmbiguityLevel;
  questions: ClarificationQuestion[];
  scopeContract: ScopeContract | null;
  durationMs: number;
}

// ---- Analysis Result ----

export interface AnalysisResult {
  affectedFiles: AffectedFile[];
  blastRadiusFiles: Array<{
    filePath: string;
    hopDistance: number;
    riskLevel: string;
  }>;
  conventionMatches: string[];
  testFiles: string[];
  crossCommunityImpact: Array<{
    communityId: number;
    nodeCount: number;
    affectedCount: number;
  }>;
  durationMs: number;
}

// ---- Research ----

export interface ResearchTopic {
  name: string;
  impactScore: number;
  source: "context7" | "web_search" | "skipped";
  reason?: string;
}

export interface ResearchOutput {
  completedAt: string;
  topicsResearched: number;
  topicsSkipped: number;
  topics: ResearchTopic[];
  outputPath: string;
  durationMs: number;
}

// ---- Execution Plan ----

export interface AgentAssignment {
  name: string;
  wave: number;
  task: string;
  exclusiveWriteFiles: string[];
  readOnlyFiles: string[];
  conventions: string[];
  goldenFiles: Array<{ path: string; lines: string }>;
  dependsOn: string[];
  estimatedTokens: number;
  timeoutSeconds: number;
  costTier?: CostTier;
}

export interface ExecutionWave {
  waveNumber: number;
  agents: string[];
  mode: "parallel" | "sequential";
}

export interface ValidationCheck {
  name: string;
  status: "PASS" | "FAIL" | "AUTO-FIXED" | "WARNING";
  detail?: string;
}

export interface ExecutionPlan {
  taskSlug: string;
  createdAt: string;
  status: "APPROVED" | "REJECTED" | "EDITED" | "PENDING";
  strategy: "sequential" | "parallel" | "wave-based";
  estimatedAgents: number;
  estimatedTotalTokens: number;
  agents: AgentAssignment[];
  waves: ExecutionWave[];
  validationResults: ValidationCheck[];
  removedByUser: string[];
}

// ---- Validation Result ----

export interface ValidationResult {
  passed: boolean;
  checks: ValidationCheck[];
  autoFixAttempts: number;
}

// ---- Pipeline ----

export interface PipelineOptions {
  projectRoot: string;
  task: string;
  taskSlug: string;
  noConfirm?: boolean;
  noClarify?: boolean;
  onProgress?: (message: string) => void;
  onGate?: (
    gate: "scope" | "plan",
    artifact: string,
  ) => Promise<"approve" | "edit" | "reject">;
}

export interface PipelineResult {
  status: "approved" | "rejected" | "error";
  scopeContractPath: string | null;
  planPath: string | null;
  executionDir: string;
  error?: string;
}
