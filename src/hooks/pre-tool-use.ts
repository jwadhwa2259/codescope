/**
 * PreToolUse hook entry point for Claude Code.
 *
 * Reads pre-computed artifact files and injects context into Claude's
 * reasoning on every Edit/Write operation. Delivers proactive warnings
 * about danger zones, conventions, and blast radius.
 *
 * Per INJECT-01: Injects file-specific conventions, blast radius, and
 * danger zone warnings into Claude's context.
 * Per INJECT-03: Stays within 500-token budget with priority queue.
 * Per INJECT-04: Only triggers for files with centrality > 0.3 OR conventions.
 * Per INJECT-05: Silently no-ops when bootstrap data is missing.
 *
 * CRITICAL: This module has ZERO imports from src/graph/, src/tools/,
 * src/parser/, src/server.ts, or any module that transitively imports
 * better-sqlite3/graphology/web-tree-sitter (per D-01).
 */

import { readFileSync, existsSync } from "node:fs";
import { join, relative, resolve, isAbsolute } from "node:path";
import type {
  HookInput,
  PreToolUseOutput,
  ConventionFileEntry,
} from "./lib/types.js";
import { readAllArtifacts } from "./lib/artifact-reader.js";
import {
  composeBudgetedMessage,
  type InjectionItem,
} from "./lib/budget-composer.js";

/** Confidence sort order: HIGH-CONF first. */
const CONFIDENCE_ORDER: Record<string, number> = {
  "HIGH-CONF": 0,
  "MEDIUM-CONF": 1,
  "LOW-CONF": 2,
};

/**
 * Process a PreToolUse hook event.
 *
 * Exported for testability -- the module-level stdin/stdout code is
 * guarded so this can be imported without side effects.
 */
export function processPreToolUse(
  input: HookInput,
  projectDir: string,
): PreToolUseOutput {
  const bareOutput: PreToolUseOutput = {
    hookSpecificOutput: { hookEventName: "PreToolUse" },
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

  if (centrality <= 0.3 && !hasConventions) {
    return bareOutput;
  }

  // Build injection items (D-04 priority queue)
  const items: InjectionItem[] = [];

  // Priority 1: Danger zone warnings
  if (dzEntry && dzEntry.riskScore > 0.1) {
    const lines = [
      `[DANGER ZONE] ${relPath} (risk: ${dzEntry.riskScore.toFixed(2)})`,
    ];
    for (const reason of dzEntry.reasons) {
      lines.push(`  - ${reason}`);
    }
    items.push({ priority: 1, content: lines.join("\n") });
  }

  // Priority 2: Conventions
  if (convEntries && convEntries.length > 0) {
    const sorted = [...convEntries].sort((a, b) => {
      return (
        (CONFIDENCE_ORDER[a.confidence] ?? 2) -
        (CONFIDENCE_ORDER[b.confidence] ?? 2)
      );
    });
    const lines = ["[CONVENTIONS]"];
    for (const c of sorted) {
      lines.push(
        `  - ${c.name} (${c.adoption_pct}% adoption, ${c.confidence})`,
      );
    }
    items.push({ priority: 2, content: lines.join("\n") });
  }

  // Priority 3: Blast radius summary
  const brEntry = artifacts.blastRadius?.files[relPath];
  if (brEntry && brEntry.totalAffected > 1) {
    const lines = [
      `[BLAST RADIUS] ${brEntry.totalAffected} files affected`,
      `  - Red: ${brEntry.byRisk.red}, Orange: ${brEntry.byRisk.orange}, Yellow: ${brEntry.byRisk.yellow}, Green: ${brEntry.byRisk.green}`,
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
      hookEventName: "PreToolUse",
      ...(message ? { additionalContext: message } : {}),
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
    process.argv[1].endsWith("pre-tool-use.js"));

if (isMainModule) {
  try {
    const input: HookInput = JSON.parse(readFileSync(0, "utf-8"));
    const projectDir =
      process.env.CLAUDE_PROJECT_DIR ?? input.cwd;
    const result = processPreToolUse(input, projectDir);
    process.stdout.write(JSON.stringify(result));
    process.exit(0);
  } catch {
    // Hook errors must never block Claude -- exit 0 with bare output
    process.stdout.write(
      JSON.stringify({
        hookSpecificOutput: { hookEventName: "PreToolUse" },
      }),
    );
    process.exit(0);
  }
}
