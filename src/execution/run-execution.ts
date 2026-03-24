#!/usr/bin/env node
// ---------------------------------------------------------------------------
// CLI entry point for the execution engine.
// Called by the skill body via: node --import tsx/esm src/execution/run-execution.ts
//
// Reads the execution plan from disk, detects agent teams availability,
// prepares agent invocations, and outputs the execution result as JSON.
//
// NOTE: The dispatchAgent callback is a stub here. Actual agent dispatch
// happens from the skill body which uses the Agent tool.
// ---------------------------------------------------------------------------

import * as fs from "node:fs";
import * as path from "node:path";
import { runExecution } from "./orchestrator.js";
import { loadConfig } from "../config/loader.js";
import type { AgentInvocation } from "./agent-spawner.js";

// ---------------------------------------------------------------------------
// Argument parsing
// ---------------------------------------------------------------------------

function parseArgs(): Record<string, string> {
  const args: Record<string, string> = {};
  const argv = process.argv.slice(2);

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith("--") && i + 1 < argv.length) {
      const key = arg.slice(2).replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
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

  const projectRoot = args.projectRoot || process.cwd();
  const taskSlug = args.taskSlug || "";
  const planPath = args.planPath || "";
  const verbosity = (args.verbosity || "brief") as "brief" | "detailed";

  if (!taskSlug) {
    console.error(JSON.stringify({ error: "--task-slug is required" }));
    process.exit(1);
  }

  if (!planPath) {
    console.error(JSON.stringify({ error: "--plan-path is required" }));
    process.exit(1);
  }

  if (!fs.existsSync(planPath)) {
    console.error(JSON.stringify({ error: `Plan file not found: ${planPath}` }));
    process.exit(1);
  }

  // Load config for max concurrent agents
  let maxConcurrent = 3;
  try {
    const config = loadConfig(projectRoot);
    if (config?.execute?.max_agents_concurrent) {
      maxConcurrent = config.execute.max_agents_concurrent;
    }
  } catch {
    // Non-fatal, use default
  }

  try {
    const result = await runExecution(
      {
        projectRoot,
        taskSlug,
        planPath,
        maxConcurrent,
        verbosity,
      },
      {
        // Stub dispatchAgent: actual dispatch happens from skill body
        // The skill body reads the invocations and spawns agents via Agent tool
        dispatchAgent: async (invocation: AgentInvocation) => {
          // In CLI mode, we log the invocation for the skill body to pick up
          return {
            success: true,
            output: `Agent ${invocation.name} invocation prepared (dispatch from skill body)`,
          };
        },
        onProgress: (message: string) => {
          // Write progress to stderr so JSON output on stdout stays clean
          process.stderr.write(`${message}\n`);
        },
      },
    );

    console.log(JSON.stringify(result));
    process.exit(result.status === "failed" ? 1 : 0);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(JSON.stringify({ error: message }));
    process.exit(1);
  }
}

main();
