/**
 * PreCompact hook entry point for Claude Code.
 *
 * Auto-generates a handoff document before context compaction,
 * saving pipeline state so a resumed session can pick up where it left off.
 *
 * Per SESS-04: Automatically saves session state before compaction.
 * Per D-11: Handoff document has YAML frontmatter + 5 markdown sections.
 * Per D-12: Writes to .claude/codescope/sessions/{taskSlug}-handoff.md.
 *
 * CRITICAL: This module has ZERO imports from src/session/, src/graph/,
 * src/tools/, src/parser/, src/server.ts, or any module that transitively
 * imports better-sqlite3/graphology/web-tree-sitter (per D-01).
 */

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import type { PreCompactInput, PreCompactOutput } from "./lib/types.js";
import {
  findActiveTaskSlug,
  buildHandoffContent,
  writeHandoffFile,
} from "./lib/handoff-builder.js";

/**
 * Process a PreCompact hook event.
 *
 * Exported for testability -- the module-level stdin/stdout code is
 * guarded so this can be imported without side effects.
 */
export function processPreCompact(
  input: PreCompactInput,
  projectDir: string,
): PreCompactOutput {
  const bareOutput: PreCompactOutput = {
    hookSpecificOutput: { hookEventName: "PreCompact" },
  };

  // Guard: no execution directory = no active pipeline (Pitfall 4: silent no-op)
  const executionDir = join(projectDir, ".claude", "codescope", "execution");
  if (!existsSync(executionDir)) {
    return bareOutput;
  }

  // Find active task
  const taskSlug = findActiveTaskSlug(executionDir);
  if (!taskSlug) {
    return bareOutput;
  }

  // Build handoff document
  const taskExecutionDir = join(executionDir, taskSlug);
  const handoff = buildHandoffContent(projectDir, taskSlug, taskExecutionDir);

  // Write handoff file
  const sessionsDir = join(projectDir, ".claude", "codescope", "sessions");
  const handoffPath = writeHandoffFile(sessionsDir, taskSlug, handoff);

  return {
    hookSpecificOutput: {
      hookEventName: "PreCompact",
      additionalContext: `Session state saved to ${handoffPath}. Use /codescope:resume ${taskSlug} to continue.`,
    },
  };
}

// ---- CLI entry point (guarded for testability) ----

// Only execute when run directly, not when imported by tests
const isMainModule =
  typeof process !== "undefined" &&
  process.argv[1] &&
  import.meta.url &&
  (process.argv[1] === new URL(import.meta.url).pathname ||
    process.argv[1].endsWith("pre-compact.js") ||
    process.argv[1].endsWith("pre-compact.mjs"));

if (isMainModule) {
  try {
    const input: PreCompactInput = JSON.parse(readFileSync(0, "utf-8"));
    const projectDir = process.env.CLAUDE_PROJECT_DIR ?? input.cwd;
    const result = processPreCompact(input, projectDir);
    process.stdout.write(JSON.stringify(result));
    process.exit(0);
  } catch {
    // Hook errors must never block Claude -- exit 0 with bare output
    process.stdout.write(
      JSON.stringify({
        hookSpecificOutput: { hookEventName: "PreCompact" },
      }),
    );
    process.exit(0);
  }
}
