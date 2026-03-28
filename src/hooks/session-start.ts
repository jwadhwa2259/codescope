/**
 * SessionStart hook entry point for Claude Code.
 *
 * Injects handoff summary as additionalContext when a session resumes,
 * giving Claude immediate context about where work stopped.
 *
 * Per D-18: Injects handoff summary on session resume.
 * Per SESS-03: Session continuity through handoff documents.
 * Per Pitfall 6: Staleness check for outdated handoffs.
 *
 * CRITICAL: This module has ZERO imports from src/session/, src/graph/,
 * src/tools/, src/parser/, src/server.ts, or any module that transitively
 * imports better-sqlite3/graphology/web-tree-sitter (per D-01).
 */

import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { execSync } from "node:child_process";
import type { SessionStartInput, SessionStartOutput } from "./lib/types.js";

/**
 * Process a SessionStart hook event.
 *
 * Exported for testability -- the module-level stdin/stdout code is
 * guarded so this can be imported without side effects.
 */
export function processSessionStart(
  input: SessionStartInput,
  projectDir: string,
): SessionStartOutput {
  const bareOutput: SessionStartOutput = {
    hookSpecificOutput: { hookEventName: "SessionStart" },
  };

  // Guard: no sessions directory = no handoff available
  const sessionsDir = join(projectDir, ".claude", "codescope", "sessions");
  if (!existsSync(sessionsDir)) {
    return bareOutput;
  }

  // Find most recent handoff file
  let handoffFiles: { name: string; mtime: number }[];
  try {
    handoffFiles = readdirSync(sessionsDir)
      .filter((f) => f.endsWith("-handoff.md"))
      .map((f) => {
        try {
          const stat = statSync(join(sessionsDir, f));
          return { name: f, mtime: stat.mtimeMs };
        } catch {
          return { name: f, mtime: 0 };
        }
      })
      .sort((a, b) => b.mtime - a.mtime);
  } catch {
    return bareOutput;
  }

  if (handoffFiles.length === 0) {
    return bareOutput;
  }

  // Read the most recent handoff
  const latestHandoff = handoffFiles[0].name;
  let content: string;
  try {
    content = readFileSync(join(sessionsDir, latestHandoff), "utf-8");
  } catch {
    return bareOutput;
  }

  // Extract key fields from YAML frontmatter using simple regex
  const taskSlug = extractFrontmatterField(content, "task_slug") ?? "unknown";
  const pipelinePhase =
    extractFrontmatterField(content, "pipeline_phase") ?? "unknown";
  const wavePosition =
    extractFrontmatterField(content, "wave_position") ?? "N/A";
  const timestamp = extractFrontmatterField(content, "timestamp") ?? "unknown";

  // Extract completed work lines (lines starting with [x])
  const completedLines = content
    .split("\n")
    .filter((l) => l.trim().startsWith("- [x]"))
    .map((l) => l.trim())
    .join("\n");

  // Build additionalContext summary
  let additionalContext = [
    `[SESSION RESUME] Continuing task: ${taskSlug}`,
    `Phase: ${pipelinePhase} | Wave: ${wavePosition}`,
    `Last saved: ${timestamp}`,
    "",
    completedLines || "(No completed work recorded)",
    "",
    `Resume: /codescope:resume ${taskSlug}`,
  ].join("\n");

  // Check staleness (Pitfall 6)
  const stalenessPrefix = checkStaleness(timestamp, projectDir);
  if (stalenessPrefix) {
    additionalContext = stalenessPrefix + additionalContext;
  }

  return {
    hookSpecificOutput: {
      hookEventName: "SessionStart",
      additionalContext,
    },
  };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function extractFrontmatterField(
  content: string,
  field: string,
): string | null {
  const pattern = new RegExp(`^${field}:\\s*(.+)$`, "m");
  const match = pattern.exec(content);
  return match ? match[1].trim() : null;
}

/**
 * Check if the handoff is stale (older than 3 days with >5 commits since).
 * Returns a warning prefix or null.
 */
function checkStaleness(
  timestamp: string,
  projectDir: string,
): string | null {
  try {
    const handoffDate = new Date(timestamp);
    const now = new Date();
    const daysDiff =
      (now.getTime() - handoffDate.getTime()) / (1000 * 60 * 60 * 24);

    if (daysDiff <= 3) {
      return null;
    }

    // Check git log for commits since the handoff
    const gitOutput = execSync(
      `git log --oneline --since="${timestamp}" 2>/dev/null`,
      { cwd: projectDir, encoding: "utf-8", timeout: 5000 },
    );

    const commitCount = gitOutput
      .trim()
      .split("\n")
      .filter((l) => l.trim().length > 0).length;

    if (commitCount > 5) {
      return `[STALE HANDOFF] Codebase has changed since this handoff was created. Consider '/codescope:resume --fresh'.\n\n`;
    }

    return null;
  } catch {
    // Git not available or other error -- skip staleness check
    return null;
  }
}

// ---- CLI entry point (guarded for testability) ----

// Only execute when run directly, not when imported by tests
const isMainModule =
  typeof process !== "undefined" &&
  process.argv[1] &&
  import.meta.url &&
  (process.argv[1] === new URL(import.meta.url).pathname ||
    process.argv[1].endsWith("session-start.js") ||
    process.argv[1].endsWith("session-start.mjs"));

if (isMainModule) {
  try {
    const input: SessionStartInput = JSON.parse(readFileSync(0, "utf-8"));
    const projectDir = process.env.CLAUDE_PROJECT_DIR ?? input.cwd;
    const result = processSessionStart(input, projectDir);
    process.stdout.write(JSON.stringify(result));
    process.exit(0);
  } catch {
    // Hook errors must never block Claude -- exit 0 with bare output
    process.stdout.write(
      JSON.stringify({
        hookSpecificOutput: { hookEventName: "SessionStart" },
      }),
    );
    process.exit(0);
  }
}
