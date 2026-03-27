#!/usr/bin/env node
// ---------------------------------------------------------------------------
// CLI entry point for the learning capture pipeline step.
// Called by the skill body via:
//   node --import tsx/esm src/learning/run-learning-capture.ts \
//     --project-root "$(pwd)" --task-slug "{slug}" \
//     --scope-contract-path "{path}" --coordination-path "{path}" \
//     --report-path "{path}" --execution-dir "{dir}"
//
// Matches run-eval.ts argument parsing pattern.
// Per D-30: Step 7 in orient skill body (learning capture).
// ---------------------------------------------------------------------------

import * as path from "node:path";
import { loadConfig } from "../config/loader.js";
import { runLearningSynthesizer } from "../agents/learning-synthesizer.js";
import { getCodescopePath } from "../utils/paths.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface LearningCaptureArgs {
  projectRoot: string;
  taskSlug: string;
  scopeContractPath: string;
  planPath: string;
  coordinationPath: string;
  reportPath: string;
  executionDir: string;
}

export interface LearningCaptureResult {
  status: "complete" | "skipped" | "error";
  reason?: string;
  newLearnings?: number;
  contradicted?: number;
  skipped?: number;
  capStatus?: string;
  error?: string;
}

// ---------------------------------------------------------------------------
// Argument parsing (same pattern as run-eval.ts)
// ---------------------------------------------------------------------------

/**
 * Parse CLI arguments into a structured object.
 * Accepts either process.argv.slice(2) or a custom array for testing.
 */
export function parseArgs(
  argv?: string[],
): LearningCaptureArgs {
  const rawArgs = argv ?? process.argv.slice(2);
  const args: Record<string, string> = {};

  for (let i = 0; i < rawArgs.length; i++) {
    const arg = rawArgs[i];
    if (arg.startsWith("--") && i + 1 < rawArgs.length) {
      const key = arg.slice(2).replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
      args[key] = rawArgs[++i];
    }
  }

  return {
    projectRoot: args.projectRoot || process.cwd(),
    taskSlug: args.taskSlug || "",
    scopeContractPath: args.scopeContractPath || "",
    planPath: args.planPath || "",
    coordinationPath: args.coordinationPath || "",
    reportPath: args.reportPath || "",
    executionDir: args.executionDir || "",
  };
}

// ---------------------------------------------------------------------------
// Main logic (exported for testing)
// ---------------------------------------------------------------------------

/**
 * Run the learning capture pipeline step.
 *
 * 1. Load config and check learning.auto_capture
 * 2. If auto_capture is false, return skipped status
 * 3. Build synthesizer options from args
 * 4. Call runLearningSynthesizer with stderr dispatch protocol
 * 5. Return structured result
 */
export async function runLearningCapture(
  args: LearningCaptureArgs,
): Promise<LearningCaptureResult> {
  // 1. Load config
  const config = loadConfig(args.projectRoot);

  // 2. Check auto_capture setting
  if (config && config.learning.auto_capture === false) {
    return {
      status: "skipped",
      reason: "auto_capture disabled",
    };
  }

  // 3. Build synthesizer options
  const csPath = getCodescopePath(args.projectRoot);
  const decayConfig = config?.learning?.confidence_decay ?? {
    gotchas: 90,
    decisions: 180,
  };
  const maxActive = config?.learning?.max_active_learnings ?? 50;

  // Stub dispatchSynthesizer: emits stderr JSON dispatch request
  // The skill body intercepts this, dispatches Agent tool, and pipes the
  // LLM response back. For the CLI stub, return empty array.
  const dispatchSynthesizer = async (prompt: string): Promise<string> => {
    console.error(JSON.stringify({ type: "dispatch_learning", prompt }));
    return "[]";
  };

  // 4. Call runLearningSynthesizer
  const result = await runLearningSynthesizer({
    projectRoot: args.projectRoot,
    outputDir: csPath,
    coordinationLogPath: args.coordinationPath || undefined,
    evalReportPath: args.reportPath || undefined,
    verifyReportPath: args.reportPath || undefined,
    scopeContractPath: args.scopeContractPath || undefined,
    decayConfig,
    maxActive,
    dispatchSynthesizer,
  });

  // 5. Return structured result
  return {
    status: "complete",
    newLearnings: result.newLearnings ?? 0,
    contradicted: result.contradicted ?? 0,
    skipped: result.skipped ?? 0,
    capStatus: result.capStatus ?? `0/${maxActive} active`,
  };
}

// ---------------------------------------------------------------------------
// CLI Entry (only runs when executed directly)
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const args = parseArgs();

  if (!args.taskSlug) {
    console.error(JSON.stringify({ error: "--task-slug is required" }));
    process.exit(1);
  }

  try {
    const result = await runLearningCapture(args);
    console.log(JSON.stringify(result));
    process.exit(0);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.log(JSON.stringify({ status: "error", error: message }));
    process.exit(1);
  }
}

// Detect if this file is the entry point (not imported as a module)
const isMainModule =
  typeof process !== "undefined" &&
  process.argv[1] &&
  (process.argv[1].endsWith("run-learning-capture.ts") ||
    process.argv[1].endsWith("run-learning-capture.js"));

if (isMainModule) {
  main().catch((err) => {
    const message = err instanceof Error ? err.message : String(err);
    console.error(JSON.stringify({ error: message }));
    process.exit(1);
  });
}
