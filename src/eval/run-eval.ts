#!/usr/bin/env node
// ---------------------------------------------------------------------------
// CLI entry point for the eval pipeline.
// Called by the skill body via: node --import tsx/esm src/eval/run-eval.ts
// Per D-18: separate CLI for eval (verify results -> findings)
// Note: Large diff chunking (D-22) and LLM retry (D-26) are handled
// internally by runEval() -- this CLI just passes through to it.
//
// Matches run-verify.ts argument parsing pattern.
// ---------------------------------------------------------------------------

import * as fs from "node:fs";
import { runEval } from "./eval-agent.js";
import { appendEvalSection } from "./report-appender.js";
import { loadIgnorePatterns } from "./ignore-filter.js";
import { loadConfig } from "../config/loader.js";
import type { EvalOptions, EvalCallbacks } from "./types.js";

// ---------------------------------------------------------------------------
// Argument parsing (same pattern as run-verify.ts)
// ---------------------------------------------------------------------------

function parseArgs(): Record<string, string | boolean> {
  const args: Record<string, string | boolean> = {};
  const argv = process.argv.slice(2);

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith("--") && i + 1 < argv.length) {
      const key = arg.slice(2).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
      args[key] = argv[++i];
    }
  }

  return args;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const args = parseArgs();

  const projectRoot = (args.projectRoot as string) || process.cwd();
  const taskSlug = (args.taskSlug as string) || "";
  const reportPath = (args.reportPath as string) || "";
  const scopeContractPath = (args.scopeContractPath as string) || "";
  const planPath = (args.planPath as string) || "";
  const coordinationPath = (args.coordinationPath as string) || "";
  const researchPath = (args.researchPath as string) || null;
  const executionDir = (args.executionDir as string) || "";
  const verifyResultsPath = (args.verifyResultsPath as string) || "";

  if (!taskSlug) {
    console.error(JSON.stringify({ error: "--task-slug is required" }));
    process.exit(1);
  }

  if (!reportPath) {
    console.error(JSON.stringify({ error: "--report-path is required" }));
    process.exit(1);
  }

  // Load config for eval criteria and model name
  const config = loadConfig(projectRoot);
  const evalConfig = config?.eval ?? {
    mode: "interactive" as const,
    auto_debug_max_cycles: 3,
    criteria: {
      scope_compliance: true,
      convention_adherence: true,
      completeness: true,
      correctness: true,
    },
  };

  // Load verify results from disk
  let verifyResult: { static: unknown; runtime: unknown };
  if (verifyResultsPath) {
    try {
      verifyResult = JSON.parse(fs.readFileSync(verifyResultsPath, "utf-8"));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(JSON.stringify({ error: `Failed to read verify results: ${message}` }));
      process.exit(1);
    }
  } else {
    // Try to read from the report path JSON sidecar
    const jsonPath = reportPath.replace(/\.md$/, ".json");
    try {
      verifyResult = JSON.parse(fs.readFileSync(jsonPath, "utf-8"));
    } catch {
      // Provide empty verify result structure as fallback
      verifyResult = {
        static: {
          conventionViolations: [],
          blastRadiusDiff: { surprises: [], skips: [], scopeDrift: [], timing_ms: 0 },
          codeReview: [],
          timing: { conventions_ms: 0, blastRadius_ms: 0, codeReview_ms: 0 },
        },
        runtime: {
          build: null,
          tests: { unit: null, integration: null, e2e: null },
          autoSmoke: null,
          timing: {},
        },
      };
    }
  }

  // Load ignore patterns from learnings.md
  const ignorePatterns = loadIgnorePatterns(projectRoot);

  // Build EvalOptions
  const evalOptions: EvalOptions = {
    projectRoot,
    taskSlug,
    verifyResult: verifyResult as EvalOptions["verifyResult"],
    scopeContractPath,
    planPath,
    coordinationPath,
    researchPath,
    enabledCriteria: evalConfig.criteria,
    ignorePatterns,
  };

  // Build stub callbacks (stderr dispatch protocol per D-18)
  const callbacks: EvalCallbacks = {
    dispatchEvalAgent: async (prompt: string) => {
      console.error(JSON.stringify({ type: "dispatch_eval", prompt }));
      return "[]"; // Stub -- skill body dispatches actual LLM agent
    },
    onProgress: (msg: string) => console.error(msg),
  };

  // Run eval -- runEval handles chunking (D-22) and retry (D-26) internally
  const result = await runEval(evalOptions, callbacks);

  // Append eval section to report
  const modelName = config?.agents?.eval_judge?.model ?? "inherited";
  appendEvalSection(reportPath, result, modelName);

  // Output result JSON
  console.log(JSON.stringify({ status: "complete", result }));
  process.exit(0);
}

// ---------------------------------------------------------------------------
// Entry
// ---------------------------------------------------------------------------

main().catch((err) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error(JSON.stringify({ error: message }));
  process.exit(1);
});
