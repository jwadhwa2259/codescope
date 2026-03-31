/**
 * PostToolUse hook entry point for Claude Code.
 *
 * Reads pre-computed artifact files and reminds Claude of applicable
 * conventions and blast radius for the just-modified file.
 *
 * Per INJECT-02: Reminds Claude of conventions and warns on blast radius.
 * Per INJECT-04: Only triggers for files with centrality > 0.3 OR conventions.
 * Per INJECT-05: Silently no-ops when bootstrap data is missing.
 *
 * PostToolUse does NOT include danger zone warnings (already shown in PreToolUse).
 * Convention checking is advisory -- true validation is Phase 12 scope.
 * Blast radius expansion detection requires the next incremental rebuild.
 *
 * CRITICAL: This module has ZERO imports from src/graph/, src/tools/,
 * src/parser/, src/server.ts, or any module that transitively imports
 * better-sqlite3/graphology/web-tree-sitter (per D-01).
 */

import { readFileSync, existsSync } from "node:fs";
import { join, relative, resolve, isAbsolute } from "node:path";
import type { HookInput, PostToolUseOutput } from "./lib/types.js";
import { readAllArtifacts } from "./lib/artifact-reader.js";
import {
  composeBudgetedMessage,
  type InjectionItem,
} from "./lib/budget-composer.js";

/**
 * Process a PostToolUse hook event.
 *
 * Exported for testability -- the module-level stdin/stdout code is
 * guarded so this can be imported without side effects.
 */
export function processPostToolUse(
  input: HookInput,
  projectDir: string,
): PostToolUseOutput {
  const bareOutput: PostToolUseOutput = {
    hookSpecificOutput: { hookEventName: "PostToolUse" },
  };

  // Guard: no bootstrap data = silent no-op (D-14)
  const codescopeDir = join(projectDir, ".claude", "codescope");
  if (!existsSync(join(codescopeDir, "graph.db"))) {
    return bareOutput;
  }

  // Normalize file path to project-relative (Pitfall 5)
  const rawPath = input.tool_input.file_path;
  const absPath = isAbsolute(rawPath)
    ? rawPath
    : resolve(input.cwd, rawPath);
  const relPath = relative(projectDir, absPath).split("\\").join("/");

  // Read artifacts (skip missing per D-15)
  const artifacts = readAllArtifacts(join(codescopeDir, "injection"));

  // Check trigger threshold (D-08)
  const dzEntry = artifacts.dangerZones?.files[relPath];
  const convEntries = artifacts.conventions?.files[relPath];
  const centrality = dzEntry?.centrality ?? 0;
  const hasConventions = convEntries != null && convEntries.length > 0;
  const violations = artifacts.violations?.files[relPath];
  const hasViolations = violations != null && violations.length > 0;

  if (centrality <= 0.3 && !hasConventions && !hasViolations) {
    return bareOutput;
  }

  // Build injection items for PostToolUse (D-07, D-10)
  // NOTE: No danger zone in PostToolUse (already shown in PreToolUse)
  const items: InjectionItem[] = [];

  // Priority 1: Validation warnings (advisory, per D-10, D-15, D-24)
  if (violations && violations.length > 0) {
    const lines = [`[VALIDATION] ${violations.length} deviation(s) in ${relPath}:`];
    for (const v of violations.slice(0, 3)) {
      lines.push(`  - ${v.ruleId}: detected \`${v.detected}\`, expected \`${v.expected}\` (line ${v.line})`);
    }
    if (violations.length > 3) {
      lines.push(`  ... and ${violations.length - 3} more`);
    }
    items.push({ priority: 1, content: lines.join("\n") });
  }

  // Priority 2: Convention reminder (advisory, not validation)
  if (convEntries && convEntries.length > 0) {
    const lines = [
      `[CONVENTION REMINDER] File ${relPath} follows these conventions:`,
    ];
    for (const c of convEntries) {
      lines.push(
        `  - ${c.name} (${c.adoption_pct}% adoption, ${c.confidence})`,
      );
    }
    items.push({ priority: 2, content: lines.join("\n") });
  }

  // Priority 3: Blast radius warning (only if significant)
  const brEntry = artifacts.blastRadius?.files[relPath];
  if (brEntry && brEntry.totalAffected > 3) {
    const lines = [
      `[BLAST RADIUS WARNING] Changes to ${relPath} may affect ${brEntry.totalAffected} files`,
    ];
    if (brEntry.topAffected.length > 0) {
      lines.push(
        `  - Key dependents: ${brEntry.topAffected.slice(0, 3).join(", ")}`,
      );
    }
    items.push({ priority: 3, content: lines.join("\n") });
  }

  // Compose within budget
  const message = composeBudgetedMessage(items);

  return {
    hookSpecificOutput: {
      hookEventName: "PostToolUse",
      ...(message ? { additionalContext: message } : {}),
    },
  };
}

// ---- CLI entry point (guarded for testability) ----

const isMainModule =
  typeof process !== "undefined" &&
  process.argv[1] &&
  import.meta.url &&
  (process.argv[1] === new URL(import.meta.url).pathname ||
    process.argv[1].endsWith("post-tool-use.js"));

if (isMainModule) {
  try {
    const input: HookInput = JSON.parse(readFileSync(0, "utf-8"));
    const projectDir =
      process.env.CLAUDE_PROJECT_DIR ?? input.cwd;
    const result = processPostToolUse(input, projectDir);
    process.stdout.write(JSON.stringify(result));
    process.exit(0);
  } catch {
    // Hook errors must never block Claude -- exit 0 with bare output
    process.stdout.write(
      JSON.stringify({
        hookSpecificOutput: { hookEventName: "PostToolUse" },
      }),
    );
    process.exit(0);
  }
}
