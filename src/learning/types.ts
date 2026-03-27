// ---------------------------------------------------------------------------
// Learning System Shared Types
// ---------------------------------------------------------------------------
// Per D-05 schema: type definitions for the learning lifecycle engine.
// Used by parser, decay, contradiction, cap, manager, and global enrichment.
// ---------------------------------------------------------------------------

export type LearningStatus =
  | "UNVERIFIED"
  | "VERIFIED"
  | "CONTRADICTED"
  | "EXPIRED"
  | "IGNORE"
  | "TODO";

export type LearningType =
  | "gotcha"
  | "decision"
  | "pattern"
  | "ignore"
  | "todo";

export interface LearningEntry {
  title: string;
  status: LearningStatus;
  type: LearningType;
  discovered: string; // ISO date YYYY-MM-DD
  expires: string; // ISO date YYYY-MM-DD (computed from type + decay config)
  evidence: string; // file:line or description from pipeline
  note?: string; // user annotation (added during review)
  pattern?: string; // For IGNORE entries
  scope?: string; // For IGNORE entries
  criterion?: string; // For IGNORE/TODO entries
  file?: string; // For TODO entries
  severity?: string; // For TODO entries
  contradicts?: string; // For CONTRADICTED entries -- what it contradicts
  context?: string; // Additional context (e.g., task slug)
}

export interface LearningsFrontmatter {
  generated: string;
  generator: string;
  phase: number;
  total_learnings: number;
}

export interface ParsedLearnings {
  frontmatter: Partial<LearningsFrontmatter>;
  entries: LearningEntry[];
  rawSections: Map<string, string>; // Preserve ## sections like "## Ignore Patterns"
}

export interface DecayConfig {
  gotchas: number; // days
  decisions: number; // days
}

export interface CapResult {
  entries: LearningEntry[];
  evicted: LearningEntry[];
  skipped: LearningEntry[];
}

export interface ContradictionResult {
  isContradiction: boolean;
  contradicts: string; // what it contradicts (learning title or code pattern description)
  evidence: string; // description of the conflict
}

export interface GlobalEnrichmentEntry {
  type: "tech_stack" | "ignore_pattern" | "cross_project_gotcha";
  value: string;
  source: string; // which project/pipeline run
  recordedDate: string;
}
