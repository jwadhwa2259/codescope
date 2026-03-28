// ---------------------------------------------------------------------------
// Session Continuity Shared Types
// ---------------------------------------------------------------------------
// Per D-10/D-11/D-12: type definitions for handoff document generation,
// parsing, and session lifecycle management.
// Used by handoff-generator, handoff-parser, and session-cleanup.
// ---------------------------------------------------------------------------

export type PipelinePhase =
  | "clarification"
  | "scope-contract"
  | "research"
  | "analysis-and-planning"
  | "execution"
  | "verification"
  | "evaluation"
  | "learning-capture";

export interface HandoffFrontmatter {
  task_slug: string;
  pipeline_phase: PipelinePhase;
  wave_position: string; // e.g., "2/3" or "N/A"
  timestamp: string; // ISO 8601
  orient_dir: string; // absolute path to execution dir
  config_path: string; // path to config.yml
}

export interface HandoffData {
  frontmatter: HandoffFrontmatter;
  completedWork: string[]; // ["[x] Clarification (scope-contract.md written)", ...]
  remainingTasks: string[]; // ["[ ] Verification", ...]
  keyDecisions: string[]; // ["Using JWT middleware...", ...]
  activeFindings: string[]; // ["WARN: blast radius exceeded", ...]
  resumeCommand: string; // "/codescope:resume {taskSlug}"
}

/** Status of each pipeline artifact on disk. */
export interface ArtifactStatus {
  clarification: boolean;
  scopeContract: boolean;
  research: boolean;
  analysis: boolean;
  plan: boolean;
  coordination: boolean;
  verifyReport: boolean;
  evalReport: boolean;
}
