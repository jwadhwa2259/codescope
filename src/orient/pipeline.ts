// ---------------------------------------------------------------------------
// Orient Pipeline Orchestrator
// Wires together clarification, research, analysis, planning, and validation
// into a single end-to-end flow triggered by /codescope:orient [task].
// Per D-01, D-02, ORNT-01, ORNT-11.
// ---------------------------------------------------------------------------

import * as fs from "node:fs";
import * as path from "node:path";
import {
  runClarification,
  extractKeywordsFromTask,
  buildScopeContract,
  writeScopeContractArtifact,
} from "./clarification.js";
import { runAnalysis, writeAnalysisArtifact } from "./analysis.js";
import { runResearch, writeResearchArtifact } from "./research.js";
import {
  runPlanner,
  parsePlanOutput,
  writePlanArtifact,
} from "./planner.js";
import { validatePlan, autoFixPlan } from "./validation.js";
import { loadConfig } from "../config/loader.js";
import { getCodescopePath } from "../utils/paths.js";
import type {
  PipelineOptions,
  PipelineResult,
  ScopeContract,
  AnalysisResult,
  ResearchOutput,
  ExecutionPlan,
} from "./types.js";

// ---------------------------------------------------------------------------
// slugifyTask
// ---------------------------------------------------------------------------

/**
 * Convert a task description into a filesystem-safe slug.
 *
 * - Lowercase, replace non-alphanumeric with hyphens, collapse multiples
 * - Append short timestamp suffix to prevent collisions (Pitfall 7)
 * - Cap at 60 characters
 */
export function slugifyTask(task: string): string {
  let slug = task
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  // Append short timestamp suffix for uniqueness
  const suffix = Date.now().toString(36).slice(-6);
  slug = `${slug}-${suffix}`;

  // Cap at 60 characters
  if (slug.length > 60) {
    slug = slug.slice(0, 60).replace(/-+$/, "");
  }

  return slug;
}

// ---------------------------------------------------------------------------
// runOrientPipeline
// ---------------------------------------------------------------------------

/**
 * Full orient pipeline orchestration: clarification through plan approval.
 *
 * Steps:
 * 1. Clarification (may skip if task is specific or --no-clarify)
 * 2. Gate 1 - Scope Approval (skipped with --no-confirm)
 * 3. Research (prepares prompt for sub-agent dispatch)
 * 4. Analysis (graph traversal - direct module call, fast)
 * 5. Planning (prepares prompt for sub-agent dispatch)
 * 6. Validation (mechanical auto-fix per D-19/D-20)
 * 7. Gate 2 - Plan Approval (skipped with --no-confirm)
 *
 * NOTE: The pipeline does NOT call runExecution directly.
 * It returns the approved plan path for the skill body to dispatch execution.
 */
export async function runOrientPipeline(
  options: PipelineOptions,
): Promise<PipelineResult> {
  const { projectRoot, task, taskSlug, noConfirm, noClarify, onProgress, onGate } = options;
  const progress = onProgress ?? (() => {});

  // Setup directories
  const codescopePath = getCodescopePath(projectRoot);
  const executionDir = path.join(codescopePath, "execution", taskSlug);
  const plansDir = path.join(codescopePath, "plans");
  fs.mkdirSync(executionDir, { recursive: true });
  fs.mkdirSync(plansDir, { recursive: true });

  // Load config for clarification style
  let clarificationStyle: "thorough" | "minimal" | "auto" = "auto";
  try {
    const config = loadConfig(projectRoot);
    if (config?.orient?.clarification) {
      clarificationStyle = config.orient.clarification;
    }
  } catch {
    // Config load failure non-fatal
  }

  // Budget tracking for ORNT-11 (60s for research + analysis + planning + validation)
  let budgetStartMs: number | null = null;
  const BUDGET_MS = 60_000;

  // ---- Step 1: Clarification (D-01) ----
  progress("## Clarifying scope...");

  const clarificationResult = await runClarification({
    projectRoot,
    task,
    taskSlug,
    clarificationStyle,
    outputDir: executionDir,
    noClarify,
  });

  // If clarification is needed, the pipeline returns so the skill body
  // can present questions to the user. The skill body handles the
  // conversation and calls back with answers for scope contract generation.
  if (clarificationResult.needsClarification) {
    // Return partial result -- skill body will handle questions + re-invoke
    return {
      status: "approved", // not truly approved yet, but pipeline pauses here
      scopeContractPath: null,
      planPath: null,
      executionDir,
      error: undefined,
    };
  }

  // Auto-generate scope contract from analysis when no clarification needed
  const keywords = extractKeywordsFromTask(task);
  const scopeContract = buildScopeContract(
    task,
    taskSlug,
    keywords.map((kw) => `Code related to "${kw}"`),
    ["Changes outside keyword-matched files"],
    clarificationResult.scopeContract?.affectedFiles ?? [],
    ["Task description was specific enough to auto-scope"],
    [],
    [],
  );
  scopeContract.status = "PENDING";

  const scopeContractPath = writeScopeContractArtifact(scopeContract, executionDir);

  // ---- Step 2: Gate 1 - Scope Approval (D-01, D-08) ----
  if (!noConfirm && onGate) {
    const gateResult = await onGate("scope", scopeContractPath);
    if (gateResult === "reject") {
      return {
        status: "rejected",
        scopeContractPath,
        planPath: null,
        executionDir,
        error: "Scope rejected by user",
      };
    }
    // 'edit' would re-present; for pipeline simplicity, treat edit as approve after update
    // 'approve' continues
  }

  scopeContract.status = "APPROVED";
  // Rewrite with approved status
  writeScopeContractArtifact(scopeContract, executionDir);

  // Start budget tracking (covers research + analysis + planning + validation)
  budgetStartMs = Date.now();

  // ---- Step 3: Research (D-10) ----
  progress("## Researching...");

  let analysisResult: AnalysisResult;
  let researchOutput: (ResearchOutput & { prompt?: string }) | null = null;

  // Run analysis first to get affected files for research topic extraction
  // (Step 4 order adjusted: analysis before research for data availability)
  progress("## Analyzing...");
  analysisResult = await runAnalysis({
    projectRoot,
    taskSlug,
    keywords,
    outputDir: executionDir,
  });
  writeAnalysisArtifact(analysisResult, executionDir);

  // Now run research with analysis results
  progress("## Researching...");
  researchOutput = await runResearch({
    projectRoot,
    taskSlug,
    task,
    analysisResult,
    scopeContract,
    outputDir: executionDir,
  });

  // ---- Step 5: Planning (ORNT-09) ----
  progress("## Planning...");

  const plannerResult = await runPlanner({
    projectRoot,
    taskSlug,
    task,
    scopeContract,
    analysisResult,
    researchOutput,
  });

  // The planner returns a prompt for sub-agent dispatch.
  // In non-interactive (full pipeline) mode, we create a minimal plan.
  // In skill body mode, the skill dispatches the planner sub-agent
  // and parses the output.
  let plan: ExecutionPlan;
  if (plannerResult.plan) {
    plan = plannerResult.plan;
  } else {
    // Create a minimal plan when running non-interactively
    plan = {
      taskSlug,
      createdAt: new Date().toISOString(),
      status: "PENDING",
      strategy: "sequential",
      estimatedAgents: 0,
      estimatedTotalTokens: 0,
      agents: [],
      waves: [],
      validationResults: [],
      removedByUser: [],
    };
  }

  // ---- Step 6: Validation (D-19) ----
  progress("## Validating plan...");

  let validationResult = validatePlan(plan, scopeContract);
  if (!validationResult.passed) {
    const fixed = autoFixPlan(plan, validationResult);
    plan = fixed.plan;
    validationResult = fixed.result;
  }
  plan.validationResults = validationResult.checks;

  // Write plan artifact to plans directory
  const planPath = writePlanArtifact(plan, plansDir);

  // ---- Step 7: Gate 2 - Plan Approval (D-14, D-15) ----
  if (!noConfirm && onGate) {
    const gateResult = await onGate("plan", planPath);
    if (gateResult === "reject") {
      return {
        status: "rejected",
        scopeContractPath,
        planPath,
        executionDir,
        error: "Plan rejected by user",
      };
    }
    // 'edit' would allow modifications + re-validate + re-present
    // 'approve' continues
  }

  plan.status = "APPROVED";
  // Rewrite with approved status
  writePlanArtifact(plan, plansDir);

  // Budget warning check (ORNT-11)
  if (budgetStartMs) {
    const elapsed = Date.now() - budgetStartMs;
    if (elapsed > BUDGET_MS) {
      progress(
        `WARNING: Orient pipeline exceeded 60s budget (${Math.round(elapsed / 1000)}s). Research + analysis + planning + validation took longer than expected.`,
      );
    }
  }

  return {
    status: "approved",
    scopeContractPath,
    planPath,
    executionDir,
  };
}
