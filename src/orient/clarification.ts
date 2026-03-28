import * as fs from "node:fs";
import * as path from "node:path";
import { getGraph } from "../graph/cache.js";
import { computeDangerZones } from "../graph/analytics.js";
import { loadConfig } from "../config/loader.js";
import { getCodescopePath } from "../utils/paths.js";
import type {
  AmbiguityAssessment,
  AmbiguityLevel,
  AffectedFile,
  ClarificationQuestion,
  ClarificationResult,
  QuestionTopic,
  RiskFlag,
  ScopeContract,
} from "./types.js";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface ClarificationOptions {
  projectRoot: string;
  task: string;
  taskSlug: string;
  clarificationStyle: "thorough" | "minimal" | "auto";
  outputDir: string;
  noClarify?: boolean;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Stop words to filter from task description during keyword extraction */
const STOP_WORDS = new Set([
  "the", "a", "an", "to", "for", "in", "of", "and", "or", "is", "are",
  "be", "with", "from", "by", "on", "at", "it", "this", "that", "has",
  "have", "do", "does", "not", "but", "so", "if", "my", "we", "our",
  "can", "will", "should", "would", "could", "about", "into", "up",
  "out", "all", "some", "any", "each", "every", "no", "new", "add",
  "fix", "update", "change", "modify", "improve", "make", "use",
]);

/** Maximum questions before soft guardrail truncation (D-05) */
const MAX_QUESTIONS = 5;

// ---------------------------------------------------------------------------
// Keyword extraction
// ---------------------------------------------------------------------------

/**
 * Extract meaningful keywords from a task description.
 * Splits by spaces, filters stop words, lowercases.
 * Same logic as src/tools/orient.ts extractKeywords.
 */
export function extractKeywordsFromTask(task: string): string[] {
  return task
    .toLowerCase()
    .replace(/[^a-z0-9\s_-]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 1 && !STOP_WORDS.has(w));
}

// ---------------------------------------------------------------------------
// Ambiguity assessment
// ---------------------------------------------------------------------------

/**
 * Assess ambiguity of a task based on graph keyword matching, community
 * spread, and danger zone overlap.
 *
 * Thresholds (per D-03):
 * - HIGH: matchedNodes < 3 OR communitiesSpanned > 3 OR dangerZonesInScope > 2
 * - MEDIUM: communitiesSpanned > 1 OR dangerZonesInScope > 0
 * - LOW: otherwise
 */
export async function assessAmbiguity(
  projectRoot: string,
  keywords: string[],
): Promise<AmbiguityAssessment> {
  const { graph, centralities } = await getGraph(projectRoot);
  const reasons: string[] = [];

  // Count keyword matches in graph nodes
  let matchCount = 0;
  const matchedCommunities = new Set<number>();

  graph.forEachNode((_nodeId: string, attrs: Record<string, unknown>) => {
    const name = ((attrs.name as string) ?? "").toLowerCase();
    const filePath = ((attrs.filePath as string) ?? "").toLowerCase();
    const matches = keywords.some(
      (kw) => name.includes(kw) || filePath.includes(kw),
    );
    if (matches) {
      matchCount++;
      const community = attrs.community as number | undefined;
      if (community !== undefined) matchedCommunities.add(community);
    }
  });

  // Few matches = vague task
  if (matchCount < 3) {
    reasons.push(`Only ${matchCount} graph nodes match keywords`);
  }
  // Multiple communities = cross-cutting change
  if (matchedCommunities.size > 2) {
    reasons.push(`Spans ${matchedCommunities.size} communities`);
  }

  // Danger zones in scope
  const dangerZones = computeDangerZones(graph, centralities, {});
  const dangerInScope = dangerZones.filter((dz) =>
    keywords.some((kw) => dz.filePath.toLowerCase().includes(kw)),
  ).length;
  if (dangerInScope > 0) {
    reasons.push(`${dangerInScope} danger zones in scope`);
  }

  let level: AmbiguityLevel;
  if (matchCount < 3 || matchedCommunities.size > 3 || dangerInScope > 2) {
    level = "HIGH";
  } else if (matchedCommunities.size > 1 || dangerInScope > 0) {
    level = "MEDIUM";
  } else {
    level = "LOW";
  }

  return {
    level,
    matchedNodes: matchCount,
    communitiesSpanned: matchedCommunities.size,
    dangerZonesInScope: dangerInScope,
    reasons,
  };
}

// ---------------------------------------------------------------------------
// Question generation
// ---------------------------------------------------------------------------

/**
 * Generate clarification questions grouped by topic.
 *
 * Topics (per D-04, D-06):
 * - scope_boundary: multiple communities, ask which areas to include/exclude
 * - convention_conflict: conventions in scope conflict, ask which to prioritize
 * - danger_zone: high-centrality files in scope, flag risk
 * - test_coverage: affected files lack test mapping, ask about testing expectations
 *
 * Soft guardrail (D-05): after 5+ questions, truncate.
 */
export function generateQuestions(
  _projectRoot: string,
  _keywords: string[],
  assessment: AmbiguityAssessment,
  affectedFiles: AffectedFile[],
): ClarificationQuestion[] {
  const questions: ClarificationQuestion[] = [];

  // scope_boundary: when few graph nodes match (vague task)
  if (assessment.matchedNodes < 3) {
    questions.push({
      topic: "scope_boundary",
      question: "The task description is vague -- only a few codebase elements could be identified. Can you provide more specific details about which files, modules, or features should be changed?",
      context: `Only ${assessment.matchedNodes} graph node(s) matched the task keywords. More specificity will produce a better scope contract.`,
    });
  }

  // scope_boundary: when multiple communities span
  if (assessment.communitiesSpanned > 1) {
    questions.push({
      topic: "scope_boundary",
      question: `This task spans ${assessment.communitiesSpanned} different module communities. Which areas should be included in scope, and which should be excluded?`,
      context: `The task touches code across ${assessment.communitiesSpanned} communities, which increases the blast radius and risk.`,
    });
  }

  // danger_zone: when high-centrality files are in scope
  const highRiskFiles = affectedFiles.filter((f) => f.risk === "HIGH");
  if (assessment.dangerZonesInScope > 0 || highRiskFiles.length > 0) {
    const dangerFileNames = highRiskFiles
      .map((f) => f.filePath)
      .slice(0, 3)
      .join(", ");
    questions.push({
      topic: "danger_zone",
      question: `High-centrality files are in scope: ${dangerFileNames || "multiple danger zone files"}. These files affect many other modules. What approach should be taken to minimize risk?`,
      context: `${assessment.dangerZonesInScope} danger zone(s) overlap with the task scope. Changes here have a wide blast radius.`,
    });
  }

  // test_coverage: when affected files might lack tests
  if (affectedFiles.length > 0) {
    questions.push({
      topic: "test_coverage",
      question: "What testing expectations apply to this change? Should new tests be added, or are existing tests sufficient?",
      context: `${affectedFiles.length} file(s) are affected by this change.`,
    });
  }

  // convention_conflict: when conventions in scope might conflict
  // This is generated based on detected conventions (simplified: add one if broad scope)
  if (assessment.communitiesSpanned > 2) {
    questions.push({
      topic: "convention_conflict",
      question: "The change spans multiple module boundaries with potentially different conventions. Should a single consistent approach be used, or should existing per-module conventions be preserved?",
      context: `Code in ${assessment.communitiesSpanned} communities may follow different patterns.`,
    });
  }

  // Soft guardrail (D-05): truncate after MAX_QUESTIONS
  if (questions.length > MAX_QUESTIONS) {
    return questions.slice(0, MAX_QUESTIONS);
  }

  return questions;
}

// ---------------------------------------------------------------------------
// Scope contract building
// ---------------------------------------------------------------------------

/**
 * Build a ScopeContract object with all fields populated.
 * Status is always PENDING at creation time.
 */
export function buildScopeContract(
  task: string,
  taskSlug: string,
  inScope: string[],
  outOfScope: string[],
  affectedFiles: AffectedFile[],
  assumptions: string[],
  conventions: string[],
  riskFlags: RiskFlag[],
): ScopeContract {
  return {
    task,
    taskSlug,
    createdAt: new Date().toISOString(),
    status: "PENDING",
    inScope,
    outOfScope,
    affectedFiles,
    assumptions,
    conventionsInScope: conventions,
    riskFlags,
  };
}

// ---------------------------------------------------------------------------
// Scope contract artifact writing
// ---------------------------------------------------------------------------

/**
 * Write scope-contract.md in the UI-SPEC artifact format
 * (see 04-UI-SPEC.md lines 170-206).
 *
 * Returns the written file path.
 */
export function writeScopeContractArtifact(
  contract: ScopeContract,
  outputDir: string,
): string {
  const lines: string[] = [];

  lines.push(`# Scope Contract: ${contract.taskSlug}`);
  lines.push("");
  lines.push(`**Task:** ${contract.task}`);
  lines.push(`**Created:** ${contract.createdAt}`);
  lines.push(`**Status:** ${contract.status}`);
  lines.push("");

  lines.push("## In Scope");
  lines.push("");
  if (contract.inScope.length === 0) {
    lines.push("- (none specified)");
  } else {
    for (const item of contract.inScope) {
      lines.push(`- ${item}`);
    }
  }
  lines.push("");

  lines.push("## Out of Scope");
  lines.push("");
  if (contract.outOfScope.length === 0) {
    lines.push("- (none specified)");
  } else {
    for (const item of contract.outOfScope) {
      lines.push(`- ${item}`);
    }
  }
  lines.push("");

  lines.push("## Affected Files (estimated)");
  lines.push("");
  lines.push("| File | Risk | Centrality | Community |");
  lines.push("|------|------|------------|-----------|");
  for (const file of contract.affectedFiles) {
    lines.push(
      `| \`${file.filePath}\` | **${file.risk}** | ${file.centrality} | ${file.community ?? "unknown"} |`,
    );
  }
  lines.push("");

  lines.push("## Assumptions");
  lines.push("");
  if (contract.assumptions.length === 0) {
    lines.push("- (none)");
  } else {
    for (const item of contract.assumptions) {
      lines.push(`- ${item}`);
    }
  }
  lines.push("");

  lines.push("## Conventions in Scope");
  lines.push("");
  if (contract.conventionsInScope.length === 0) {
    lines.push("- (none detected)");
  } else {
    for (const item of contract.conventionsInScope) {
      lines.push(`- ${item}`);
    }
  }
  lines.push("");

  lines.push("## Risk Flags");
  lines.push("");
  if (contract.riskFlags.length === 0) {
    lines.push("- (none)");
  } else {
    for (const flag of contract.riskFlags) {
      lines.push(`- ${flag.filePath}: ${flag.reason}`);
    }
  }
  lines.push("");

  fs.mkdirSync(outputDir, { recursive: true });
  const filePath = path.join(outputDir, "scope-contract.md");
  fs.writeFileSync(filePath, lines.join("\n"), "utf-8");

  return filePath;
}

// ---------------------------------------------------------------------------
// Classify risk helper (same thresholds as orient.ts)
// ---------------------------------------------------------------------------

function classifyRisk(centrality: number): "HIGH" | "MEDIUM" | "LOW" {
  if (centrality > 0.7) return "HIGH";
  if (centrality >= 0.3) return "MEDIUM";
  return "LOW";
}

// ---------------------------------------------------------------------------
// Main entry: runClarification
// ---------------------------------------------------------------------------

/**
 * Run the clarification phase of the orient pipeline.
 *
 * - If noClarify is true, skip to LOW ambiguity with no questions (per D-03 --no-clarify).
 * - If style is 'minimal': only generate questions when level is HIGH (D-07).
 * - If style is 'thorough': generate questions when level is HIGH or MEDIUM.
 * - If style is 'auto': generate questions when level is HIGH, maybe for MEDIUM
 *   based on reasons count.
 *
 * Returns ClarificationResult with needsClarification, questions, and null
 * scopeContract (scope contract is generated after user answers -- the pipeline
 * handles this).
 */
export async function runClarification(
  options: ClarificationOptions,
): Promise<ClarificationResult> {
  const startMs = Date.now();

  // Skip clarification entirely if --no-clarify
  if (options.noClarify) {
    return {
      needsClarification: false,
      ambiguityLevel: "LOW",
      questions: [],
      scopeContract: null,
      durationMs: Date.now() - startMs,
    };
  }

  // Determine effective clarification style
  let style = options.clarificationStyle;
  if (style === "auto") {
    // Try to load from config
    try {
      const config = loadConfig(options.projectRoot);
      if (config?.orient?.clarification) {
        const configStyle = config.orient.clarification;
        if (configStyle !== "auto") {
          style = configStyle;
        }
      }
    } catch {
      // Config load failures are non-fatal
    }
  }

  // Extract keywords and assess ambiguity
  const keywords = extractKeywordsFromTask(options.task);
  const assessment = await assessAmbiguity(options.projectRoot, keywords);

  // Determine whether to generate questions based on style and ambiguity level
  let needsClarification = false;
  let questions: ClarificationQuestion[] = [];

  if (style === "minimal") {
    // D-07: Only ask when HIGH
    if (assessment.level === "HIGH") {
      needsClarification = true;
    }
  } else if (style === "thorough") {
    // Ask when HIGH or MEDIUM
    if (assessment.level === "HIGH" || assessment.level === "MEDIUM") {
      needsClarification = true;
    }
  } else {
    // auto: ask when HIGH, maybe MEDIUM if many reasons
    if (assessment.level === "HIGH") {
      needsClarification = true;
    } else if (assessment.level === "MEDIUM" && assessment.reasons.length >= 2) {
      needsClarification = true;
    }
  }

  // Generate questions if needed
  if (needsClarification) {
    // Build a quick list of affected files for question generation context
    const { graph, centralities } = await getGraph(options.projectRoot);
    const affectedFiles: AffectedFile[] = [];

    graph.forEachNode((_nodeId: string, attrs: Record<string, unknown>) => {
      const name = ((attrs.name as string) ?? "").toLowerCase();
      const filePath = ((attrs.filePath as string) ?? "").toLowerCase();
      const matches = keywords.some(
        (kw) => name.includes(kw) || filePath.includes(kw),
      );
      if (matches && attrs.kind === "file") {
        const nodeId = _nodeId;
        const cent = centralities.get(nodeId) ?? 0;
        affectedFiles.push({
          filePath: (attrs.filePath as string) ?? "",
          risk: classifyRisk(cent),
          centrality: cent,
          community: attrs.community !== undefined
            ? String(attrs.community)
            : null,
        });
      }
    });

    // Sort by centrality descending
    affectedFiles.sort((a, b) => b.centrality - a.centrality);

    questions = generateQuestions(
      options.projectRoot,
      keywords,
      assessment,
      affectedFiles,
    );
  }

  return {
    needsClarification,
    ambiguityLevel: assessment.level,
    questions,
    scopeContract: null,
    durationMs: Date.now() - startMs,
  };
}
