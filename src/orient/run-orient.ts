#!/usr/bin/env node
// ---------------------------------------------------------------------------
// CLI entry point for the orient pipeline.
// Called by the skill body via: node --import tsx/esm src/orient/run-orient.ts
//
// Supports phased execution for multi-step skill body invocation:
//   --phase clarification     Run ambiguity detection + question generation
//   --phase scope-contract    Generate scope contract from user answers
//   --phase research          Extract research topics + build research prompt
//   --phase analysis-and-planning  Run analysis + build planner prompt
//   --check-only              Verify bootstrap exists
//   (no --phase)              Run full pipeline non-interactively
// ---------------------------------------------------------------------------

import * as fs from "node:fs";
import * as path from "node:path";
import { slugifyTask, runOrientPipeline } from "./pipeline.js";
import {
  runClarification,
  extractKeywordsFromTask,
  buildScopeContract,
  writeScopeContractArtifact,
} from "./clarification.js";
import { runAnalysis, writeAnalysisArtifact } from "./analysis.js";
import { runResearch } from "./research.js";
import { runPlanner, parsePlanOutput, writePlanArtifact } from "./planner.js";
import { validatePlan, autoFixPlan } from "./validation.js";
import { loadConfig } from "../config/loader.js";
import { getCodescopePath, getGraphDbPath } from "../utils/paths.js";

// ---------------------------------------------------------------------------
// Argument parsing
// ---------------------------------------------------------------------------

function parseArgs(): Record<string, string | boolean> {
  const args: Record<string, string | boolean> = {};
  const argv = process.argv.slice(2);

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--check-only") {
      args.checkOnly = true;
    } else if (arg === "--no-confirm") {
      args.noConfirm = true;
    } else if (arg === "--no-clarify") {
      args.noClarify = true;
    } else if (arg.startsWith("--") && i + 1 < argv.length) {
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
  const task = (args.task as string) || "";
  const phase = (args.phase as string) || "";
  const taskSlugArg = (args.taskSlug as string) || "";
  const answers = (args.answers as string) || "";
  const checkOnly = args.checkOnly === true;
  const noConfirm = args.noConfirm === true;
  const noClarify = args.noClarify === true;

  // --check-only: verify bootstrap exists
  if (checkOnly) {
    const bootstrapped = fs.existsSync(getGraphDbPath(projectRoot));
    console.log(JSON.stringify({ bootstrapped }));
    process.exit(0);
  }

  // Generate or reuse task slug
  const taskSlug = taskSlugArg || slugifyTask(task);

  // Setup directories
  const codescopePath = getCodescopePath(projectRoot);
  const executionDir = path.join(codescopePath, "execution", taskSlug);
  const plansDir = path.join(codescopePath, "plans");
  fs.mkdirSync(executionDir, { recursive: true });
  fs.mkdirSync(plansDir, { recursive: true });

  try {
    if (!phase) {
      // No --phase: run full pipeline non-interactively (--no-confirm --no-clarify)
      const result = await runOrientPipeline({
        projectRoot,
        task,
        taskSlug,
        noConfirm: true,
        noClarify: true,
      });
      console.log(JSON.stringify(result));
      process.exit(result.status === "error" ? 1 : 0);
    }

    switch (phase) {
      case "clarification": {
        // Load config for clarification style
        let clarificationStyle: "thorough" | "minimal" | "auto" = "auto";
        try {
          const config = loadConfig(projectRoot);
          if (config?.orient?.clarification) {
            clarificationStyle = config.orient.clarification;
          }
        } catch {
          // Non-fatal
        }

        const result = await runClarification({
          projectRoot,
          task,
          taskSlug,
          clarificationStyle,
          outputDir: executionDir,
          noClarify,
        });

        console.log(
          JSON.stringify({
            needsClarification: result.needsClarification,
            ambiguityLevel: result.ambiguityLevel,
            questions: result.questions,
            taskSlug,
            outputDir: executionDir,
            durationMs: result.durationMs,
          }),
        );
        break;
      }

      case "scope-contract": {
        if (!taskSlugArg) {
          console.error(JSON.stringify({ error: "--task-slug required for scope-contract phase" }));
          process.exit(1);
        }

        // Parse answers JSON
        let parsedAnswers: Record<string, string> = {};
        if (answers) {
          try {
            parsedAnswers = JSON.parse(answers);
          } catch {
            console.error(JSON.stringify({ error: "Invalid --answers JSON" }));
            process.exit(1);
          }
        }

        // Build scope contract from answers
        const keywords = extractKeywordsFromTask(task);
        const inScope = Object.values(parsedAnswers).length > 0
          ? Object.entries(parsedAnswers).map(([q, a]) => `${q}: ${a}`)
          : keywords.map((kw) => `Code related to "${kw}"`);

        const scopeContract = buildScopeContract(
          task,
          taskSlug,
          inScope,
          ["Changes outside clarified scope"],
          [],
          ["Scope derived from user answers"],
          [],
          [],
        );

        const scopeContractPath = writeScopeContractArtifact(scopeContract, executionDir);
        console.log(JSON.stringify({ scopeContractPath, taskSlug }));
        break;
      }

      case "research": {
        if (!taskSlugArg) {
          console.error(JSON.stringify({ error: "--task-slug required for research phase" }));
          process.exit(1);
        }

        // Run analysis first to get affected files
        const keywords = extractKeywordsFromTask(task);
        const analysisResult = await runAnalysis({
          projectRoot,
          taskSlug,
          keywords,
          outputDir: executionDir,
        });

        // Build a minimal scope contract for research
        const scopeContract = buildScopeContract(
          task,
          taskSlug,
          keywords.map((kw) => `Code related to "${kw}"`),
          [],
          analysisResult.affectedFiles,
          [],
          [],
          [],
        );

        const researchOutput = await runResearch({
          projectRoot,
          taskSlug,
          task,
          analysisResult,
          scopeContract,
          outputDir: executionDir,
        });

        console.log(
          JSON.stringify({
            researchPrompt: researchOutput.prompt ?? null,
            topics: researchOutput.topics,
            topicsResearched: researchOutput.topicsResearched,
            topicsSkipped: researchOutput.topicsSkipped,
            outputDir: executionDir,
          }),
        );
        break;
      }

      case "analysis-and-planning": {
        if (!taskSlugArg) {
          console.error(JSON.stringify({ error: "--task-slug required for analysis-and-planning phase" }));
          process.exit(1);
        }

        // Run analysis
        const keywords = extractKeywordsFromTask(task);
        const analysisResult = await runAnalysis({
          projectRoot,
          taskSlug,
          keywords,
          outputDir: executionDir,
        });
        writeAnalysisArtifact(analysisResult, executionDir);

        // Build scope contract from keywords
        const scopeContract = buildScopeContract(
          task,
          taskSlug,
          keywords.map((kw) => `Code related to "${kw}"`),
          [],
          analysisResult.affectedFiles,
          [],
          analysisResult.conventionMatches,
          [],
        );

        // Run planner
        const plannerResult = await runPlanner({
          projectRoot,
          taskSlug,
          task,
          scopeContract,
          analysisResult,
          researchOutput: null,
        });

        // Build a minimal plan for validation
        const plan = plannerResult.plan ?? {
          taskSlug,
          createdAt: new Date().toISOString(),
          status: "PENDING" as const,
          strategy: "sequential" as const,
          estimatedAgents: 0,
          estimatedTotalTokens: 0,
          agents: [],
          waves: [],
          validationResults: [],
          removedByUser: [],
        };

        // Validate
        let validationResult = validatePlan(plan, scopeContract);
        if (!validationResult.passed) {
          const fixed = autoFixPlan(plan, validationResult);
          validationResult = fixed.result;
        }

        // Write plan
        const planPath = writePlanArtifact(plan, plansDir);

        console.log(
          JSON.stringify({
            analysisResult: {
              affectedFiles: analysisResult.affectedFiles.length,
              blastRadiusFiles: analysisResult.blastRadiusFiles.length,
              conventionMatches: analysisResult.conventionMatches.length,
              testFiles: analysisResult.testFiles.length,
              crossCommunityImpact: analysisResult.crossCommunityImpact.length,
              durationMs: analysisResult.durationMs,
            },
            plannerPrompt: plannerResult.prompt,
            planPath,
            validationResult: {
              passed: validationResult.passed,
              checks: validationResult.checks.length,
              autoFixAttempts: validationResult.autoFixAttempts,
            },
          }),
        );
        break;
      }

      default:
        console.error(
          JSON.stringify({
            error: `Unknown --phase value: ${phase}. Valid values: clarification, scope-contract, research, analysis-and-planning`,
          }),
        );
        process.exit(1);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(JSON.stringify({ error: message }));
    process.exit(1);
  }
}

main();
