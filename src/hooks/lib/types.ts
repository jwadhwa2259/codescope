/**
 * Hook-specific type definitions for Claude Code hooks.
 *
 * IMPORTANT: These types are DUPLICATED from src/artifacts/types.ts
 * intentionally for build isolation. Hook scripts must NOT import from
 * src/artifacts/ which may transitively import heavy modules
 * (better-sqlite3, graphology, web-tree-sitter).
 *
 * Per D-01, ARCHITECTURE.md Anti-Pattern 2: hooks only import from
 * node:fs, node:path, node:process, and files within src/hooks/lib/.
 */

// ---- Claude Code Hook Input/Output Types ----

/** Claude Code hook input (received on stdin as JSON). */
export interface HookInput {
  session_id: string;
  transcript_path: string;
  cwd: string;
  permission_mode: string;
  hook_event_name: "PreToolUse" | "PostToolUse";
  tool_name: string;
  tool_input: {
    file_path: string;
    content?: string;
    old_string?: string;
    new_string?: string;
  };
  tool_response?: unknown;
  tool_use_id: string;
}

/** PreToolUse hook output (written to stdout as JSON). */
export interface PreToolUseOutput {
  hookSpecificOutput: {
    hookEventName: "PreToolUse";
    additionalContext?: string;
  };
}

/** PostToolUse hook output (written to stdout as JSON). */
export interface PostToolUseOutput {
  hookSpecificOutput: {
    hookEventName: "PostToolUse";
    additionalContext?: string;
  };
}

// ---- Duplicated Artifact Types (build isolation) ----

/** Per-file entry in the danger zone index. */
export interface DangerZoneFileEntry {
  centrality: number;
  riskScore: number;
  communitiesTouched: number;
  reasons: string[];
}

/** Top-level danger zone index structure. */
export interface DangerZoneIndex {
  generated: string;
  files: Record<string, DangerZoneFileEntry>;
}

/** Per-convention entry within a file's convention list. */
export interface ConventionFileEntry {
  name: string;
  adoption_pct: number;
  confidence: string;
  category: string;
}

/** Top-level convention index structure. */
export interface ConventionIndex {
  generated: string;
  files: Record<string, ConventionFileEntry[]>;
}

/** Per-file entry in the blast radius index. */
export interface BlastRadiusFileEntry {
  totalAffected: number;
  byRisk: { red: number; orange: number; yellow: number; green: number };
  topAffected: string[];
}

/** Top-level blast radius index structure. */
export interface BlastRadiusIndex {
  generated: string;
  files: Record<string, BlastRadiusFileEntry>;
}
