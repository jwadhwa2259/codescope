#!/usr/bin/env node
// ---------------------------------------------------------------------------
// CLI entry point for the verify pipeline.
// Called by the skill body via: node --import tsx/esm src/verify/run-verify.ts
//
// Supports phased execution for multi-step skill body invocation:
//   --phase static    Run static verify only (conventions, blast radius, code review)
//   --phase runtime   Run runtime verify only (build, tests, E2E, auto-smoke)
//   (no --phase)      Run both phases sequentially, generate unified report
//
// Matches run-orient.ts argument parsing pattern.
// ---------------------------------------------------------------------------

import * as fs from "node:fs";
import * as path from "node:path";
import { execSync } from "node:child_process";
import { runStaticVerify } from "./static-verify.js";
import { runRuntimeVerify } from "./runtime-verify.js";
import { writeVerifyReport } from "./report-writer.js";
import type {
  StaticVerifyOptions,
  RuntimeVerifyOptions,
  VerifyCallbacks,
  VerifyReport,
} from "./types.js";
import { loadConfig } from "../config/loader.js";

// ---------------------------------------------------------------------------
// Argument parsing (same pattern as run-orient.ts)
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
  const taskDescription = (args.taskDescription as string) || taskSlug;
  const planPath = (args.planPath as string) || "";
  const scopeContractPath = (args.scopeContractPath as string) || "";
  const phase = (args.phase as string) || "";
  const executionDir = (args.executionDir as string) || "";

  if (!taskSlug) {
    console.error(JSON.stringify({ error: "--task-slug is required" }));
    process.exit(1);
  }

  // Get changed files via git diff
  let changedFiles: string[] = [];
  try {
    const diffOutput = execSync("git diff --name-only HEAD", {
      encoding: "utf-8",
      cwd: projectRoot,
    }).trim();
    changedFiles = diffOutput.split("\n").filter(Boolean);
  } catch {
    // git diff may fail if no commits or not a git repo
  }

  // If no changed files, skip verification
  if (changedFiles.length === 0) {
    console.log(
      JSON.stringify({ status: "skipped", reason: "No changed files detected" }),
    );
    process.exit(0);
  }

  // Build stub callbacks (JSON output to stderr, no actual LLM dispatch)
  // Skill body handles dispatch and re-invocation with results
  const callbacks: VerifyCallbacks = {
    dispatchReviewAgent: async (prompt: string) => {
      console.error(JSON.stringify({ type: "dispatch_review", prompt }));
      return "[]"; // Empty findings -- skill body will dispatch actual agent
    },
    dispatchSmokeAgent: async (prompt: string) => {
      console.error(JSON.stringify({ type: "dispatch_smoke", prompt }));
      return ""; // Empty -- skill body handles
    },
    onProgress: (msg: string) => console.error(msg),
  };

  try {
    const startTime = Date.now();

    if (phase === "static") {
      // Static verify only
      const staticOptions: StaticVerifyOptions = {
        projectRoot,
        taskSlug,
        changedFiles,
        planPath,
        scopeContractPath,
      };
      const result = await runStaticVerify(staticOptions, callbacks);
      console.log(JSON.stringify(result));
      process.exit(0);
    }

    if (phase === "runtime") {
      // Runtime verify only
      const config = loadConfig(projectRoot);
      const runtimeOptions: RuntimeVerifyOptions = {
        projectRoot,
        taskSlug,
        config: {
          build_command: config?.verify?.build_command ?? config?.project?.build_command,
          start_command: config?.verify?.start_command,
          health_check: config?.verify?.health_check,
          ready_signal: config?.verify?.ready_signal,
          timeout_seconds: config?.verify?.timeout_seconds ?? 30,
          tests: {
            unit: config?.verify?.tests?.unit ?? config?.project?.test_command,
            integration: config?.verify?.tests?.integration,
            e2e: config?.verify?.tests?.e2e
              ? {
                  tool: config.verify.tests.e2e.tool,
                  command: config.verify.tests.e2e.command,
                  config: config.verify.tests.e2e.config,
                }
              : undefined,
          },
          auto_smoke: config?.verify?.auto_smoke ?? false,
          static_check: config?.verify?.static_check ?? true,
          blast_radius_diff: config?.verify?.blast_radius_diff ?? true,
        },
        changedFiles,
      };
      const result = await runRuntimeVerify(runtimeOptions, callbacks);
      console.log(JSON.stringify(result));
      process.exit(0);
    }

    // No --phase: run both phases sequentially, generate unified report
    // Phase 1: Static verify
    const staticOptions: StaticVerifyOptions = {
      projectRoot,
      taskSlug,
      changedFiles,
      planPath,
      scopeContractPath,
    };
    const staticResult = await runStaticVerify(staticOptions, callbacks);

    // Phase 2: Runtime verify
    const config = loadConfig(projectRoot);
    const runtimeOptions: RuntimeVerifyOptions = {
      projectRoot,
      taskSlug,
      config: {
        build_command: config?.verify?.build_command ?? config?.project?.build_command,
        start_command: config?.verify?.start_command,
        health_check: config?.verify?.health_check,
        ready_signal: config?.verify?.ready_signal,
        timeout_seconds: config?.verify?.timeout_seconds ?? 30,
        tests: {
          unit: config?.verify?.tests?.unit ?? config?.project?.test_command,
          integration: config?.verify?.tests?.integration,
          e2e: config?.verify?.tests?.e2e
            ? {
                tool: config.verify.tests.e2e.tool,
                command: config.verify.tests.e2e.command,
                config: config.verify.tests.e2e.config,
              }
            : undefined,
        },
        auto_smoke: config?.verify?.auto_smoke ?? false,
        static_check: config?.verify?.static_check ?? true,
        blast_radius_diff: config?.verify?.blast_radius_diff ?? true,
      },
      changedFiles,
    };
    const runtimeResult = await runRuntimeVerify(runtimeOptions, callbacks);

    // Assemble unified report
    const totalDuration_ms = Date.now() - startTime;
    const report: VerifyReport = {
      taskSlug,
      taskDescription,
      date: new Date().toISOString().split("T")[0],
      static: staticResult,
      runtime: runtimeResult,
      totalDuration_ms,
    };

    const reportPath = writeVerifyReport(projectRoot, report);
    console.log(JSON.stringify({ status: "complete", reportPath, report }));
    process.exit(0);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(JSON.stringify({ error: message }));
    process.exit(1);
  }
}

main();
