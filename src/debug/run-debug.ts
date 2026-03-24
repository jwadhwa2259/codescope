#!/usr/bin/env node
// ---------------------------------------------------------------------------
// CLI entry point for the debug pipeline.
// Called by the skill body via: node --import tsx/esm src/debug/run-debug.ts
// Per D-18: separate CLI for debug (findings -> fix plans)
//
// Matches run-verify.ts argument parsing pattern.
// ---------------------------------------------------------------------------

import * as fs from "node:fs";
import { runDebug } from "./debug-agent.js";
import { loadConfig } from "../config/loader.js";
import type { DebugOptions, DebugCallbacks } from "./types.js";
import type { EvalFinding } from "../eval/types.js";

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
  const findingsPath = (args.findingsPath as string) || "";
  const scopeContractPath = (args.scopeContractPath as string) || "";
  const planPath = (args.planPath as string) || "";
  const coordinationPath = (args.coordinationPath as string) || "";
  const reportPath = (args.reportPath as string) || "";
  const maxCyclesArg = (args.maxCycles as string) || "";
  const executionDir = (args.executionDir as string) || "";

  if (!taskSlug) {
    console.error(JSON.stringify({ error: "--task-slug is required" }));
    process.exit(1);
  }

  if (!findingsPath) {
    console.error(JSON.stringify({ error: "--findings-path is required" }));
    process.exit(1);
  }

  if (!scopeContractPath) {
    console.error(JSON.stringify({ error: "--scope-contract-path is required" }));
    process.exit(1);
  }

  if (!planPath) {
    console.error(JSON.stringify({ error: "--plan-path is required" }));
    process.exit(1);
  }

  if (!coordinationPath) {
    console.error(JSON.stringify({ error: "--coordination-path is required" }));
    process.exit(1);
  }

  if (!reportPath) {
    console.error(JSON.stringify({ error: "--report-path is required" }));
    process.exit(1);
  }

  // Load config for max cycles default
  const config = loadConfig(projectRoot);
  const maxCycles = maxCyclesArg
    ? parseInt(maxCyclesArg, 10)
    : config?.eval?.auto_debug_max_cycles ?? 3;

  // Read findings from --findings-path
  let findings: EvalFinding[];
  try {
    findings = JSON.parse(fs.readFileSync(findingsPath, "utf-8"));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(JSON.stringify({ error: `Failed to read findings: ${message}` }));
    process.exit(1);
  }

  // Build DebugOptions
  const debugOptions: DebugOptions = {
    projectRoot,
    taskSlug,
    findings,
    scopeContractPath,
    planPath,
    coordinationPath,
    reportPath,
    maxCycles,
    executionDir,
  };

  // Build stub callbacks (stderr dispatch protocol)
  const callbacks: DebugCallbacks = {
    dispatchFixAgent: async (prompt: string) => {
      console.error(JSON.stringify({ type: "dispatch_fix", prompt }));
      return { success: true, output: "" }; // Stub -- skill body dispatches actual agent
    },
    dispatchEvalAgent: async (prompt: string) => {
      console.error(JSON.stringify({ type: "dispatch_eval", prompt }));
      return "[]"; // Stub -- skill body dispatches actual LLM agent
    },
    dispatchVerifyAgent: async (changedFiles: string[]) => {
      console.error(JSON.stringify({ type: "dispatch_verify", changedFiles }));
      return { newIssues: 0 }; // Stub
    },
    onDesignDecision: async (decision) => {
      console.error(JSON.stringify({ type: "design_decision", decision }));
      return "option-a"; // Stub -- skill body handles user interaction
    },
    onProgress: (msg: string) => console.error(msg),
  };

  // Run debug loop
  const result = await runDebug(debugOptions, callbacks);

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
