/**
 * Shared artifact type definitions for injection index files.
 *
 * These types define the JSON structure of pre-computed index files
 * written to .claude/codescope/injection/ for hook scripts to consume.
 * All indexes are keyed by relative file path for O(1) lookup.
 *
 * Per D-13: Hook scripts read these JSON files instead of querying
 * the graph database directly, keeping hook execution under 50ms.
 */

// ---- Danger Zone Index ----

/** Per-file entry in the danger zone index. */
export interface DangerZoneFileEntry {
  /** Normalized in-degree centrality (0-1). */
  centrality: number;
  /** Multi-signal risk score (0-1). */
  riskScore: number;
  /** Number of distinct graph communities this file's neighbors touch. */
  communitiesTouched: number;
  /** Human-readable risk reasons. */
  reasons: string[];
}

/** Top-level danger zone index structure. */
export interface DangerZoneIndex {
  /** ISO 8601 timestamp of when this index was generated. */
  generated: string;
  /** Per-file danger zone data, keyed by relative file path. */
  files: Record<string, DangerZoneFileEntry>;
}

// ---- Convention Index ----

/** Per-convention entry within a file's convention list. */
export interface ConventionFileEntry {
  /** Human-readable convention name. */
  name: string;
  /** Adoption percentage (0-100). */
  adoption_pct: number;
  /** Confidence level. */
  confidence: string;
  /** Convention category (e.g., "error-handling", "imports"). */
  category: string;
}

/** Top-level convention index structure. */
export interface ConventionIndex {
  /** ISO 8601 timestamp of when this index was generated. */
  generated: string;
  /** Per-file convention lists, keyed by relative file path. */
  files: Record<string, ConventionFileEntry[]>;
}

// ---- Blast Radius Index ----

/** Per-file entry in the blast radius index. */
export interface BlastRadiusFileEntry {
  /** Total number of affected nodes from BFS traversal. */
  totalAffected: number;
  /** Count of affected nodes by risk level. */
  byRisk: { red: number; orange: number; yellow: number; green: number };
  /** Top 5 affected file paths (excluding the file itself), sorted by hop. */
  topAffected: string[];
}

/** Top-level blast radius index structure. */
export interface BlastRadiusIndex {
  /** ISO 8601 timestamp of when this index was generated. */
  generated: string;
  /** Per-file blast radius data, keyed by relative file path. */
  files: Record<string, BlastRadiusFileEntry>;
}

// ---- Reference Index ----

/** Per-file entry in the reference index. */
export interface ReferenceFileEntry {
  /** Path to the most similar same-role file. */
  referencePath: string;
  /** Human-readable role label (e.g., "utility", "route-handler"). */
  roleLabel: string;
  /** Similarity score (0-1). */
  score: number;
}

/** Top-level reference index structure. */
export interface ReferenceIndex {
  /** ISO 8601 timestamp of when this index was generated. */
  generated: string;
  /** Per-file reference data, keyed by relative file path. */
  files: Record<string, ReferenceFileEntry>;
}

// ---- Violation Index ----

/** Single violation entry for a file. */
export interface ViolationEntry {
  /** Rule or check that detected the deviation. */
  ruleId: string;
  /** What was actually found in the file. */
  detected: string;
  /** What was expected based on conventions. */
  expected: string;
  /** Line number where the deviation was found (0 if file-level). */
  line: number;
}

/** Top-level violation index structure. */
export interface ViolationIndex {
  /** ISO 8601 timestamp of when this index was generated. */
  generated: string;
  /** Per-file violation lists, keyed by relative file path. Sparse: files with no violations are omitted. */
  files: Record<string, ViolationEntry[]>;
}
