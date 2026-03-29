// ---------------------------------------------------------------------------
// Planner Module - Execution plan generation with hybrid strategy
// Per ORNT-09, ORNT-10, D-14: Sub-agent prompt construction and plan parsing.
// ---------------------------------------------------------------------------

import * as fs from "node:fs";
import * as path from "node:path";
import { loadConfig } from "../config/loader.js";
import { classifyCostTier } from "../utils/tokens.js";
import type {
  AgentAssignment,
  AnalysisResult,
  ExecutionPlan,
  ExecutionWave,
  ResearchOutput,
  ScopeContract,
  ValidationCheck,
} from "./types.js";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface PlannerOptions {
  projectRoot: string;
  taskSlug: string;
  task: string;
  scopeContract: ScopeContract;
  analysisResult: AnalysisResult;
  researchOutput: ResearchOutput | null;
}

// ---------------------------------------------------------------------------
// buildPlannerPrompt
// ---------------------------------------------------------------------------

/**
 * Build a sub-agent prompt for the planner agent that will generate
 * the execution plan.
 *
 * Includes:
 * - Task description and scope contract (In Scope / Out of Scope)
 * - Analysis results: affected files, blast radius, conventions, cross-community
 * - Research highlights (if research was done)
 * - Instructions for agent assignment and hybrid strategy per D-31/D-32
 *
 * Keeps prompt under ~8K tokens.
 */
export function buildPlannerPrompt(options: PlannerOptions): string {
  const { task, scopeContract, analysisResult, researchOutput } = options;

  // Load config for max_agents_concurrent
  const config = loadConfig(options.projectRoot);
  const maxConcurrent = config?.execute?.max_agents_concurrent ?? 3;

  const lines: string[] = [];

  // Task description
  lines.push("# Execution Plan Generation");
  lines.push("");
  lines.push(`## Task: ${task}`);
  lines.push("");

  // Scope contract
  lines.push("## Scope Contract");
  lines.push("");
  lines.push("**In Scope:**");
  for (const item of scopeContract.inScope) {
    lines.push(`- ${item}`);
  }
  lines.push("");
  lines.push("**Out of Scope:**");
  for (const item of scopeContract.outOfScope) {
    lines.push(`- ${item}`);
  }
  lines.push("");

  // Analysis results
  lines.push("## Analysis Results");
  lines.push("");
  lines.push("**Affected Files:**");
  lines.push("");
  lines.push("| File | Risk | Centrality |");
  lines.push("|------|------|------------|");
  for (const file of analysisResult.affectedFiles) {
    lines.push(
      `| \`${file.filePath}\` | **${file.risk}** | ${file.centrality.toFixed(3)} |`,
    );
  }
  lines.push("");

  if (analysisResult.blastRadiusFiles.length > 0) {
    lines.push("**Blast Radius:** " + analysisResult.blastRadiusFiles.length + " files affected");
    lines.push("");
  }

  if (analysisResult.conventionMatches.length > 0) {
    lines.push("**Conventions in Scope:** " + analysisResult.conventionMatches.join(", "));
    lines.push("");
  }

  if (analysisResult.crossCommunityImpact.length > 0) {
    lines.push("**Cross-Community Impact:** " + analysisResult.crossCommunityImpact.length + " communities");
    lines.push("");
  }

  // Research highlights
  if (researchOutput && researchOutput.topics.length > 0) {
    lines.push("## Research Highlights");
    lines.push("");
    const researched = researchOutput.topics.filter(
      (t) => t.source !== "skipped",
    );
    for (const topic of researched) {
      lines.push(`- **${topic.name}** (impact: ${topic.impactScore.toFixed(2)}, source: ${topic.source})`);
    }
    lines.push("");
  }

  // Instructions for plan generation
  lines.push("## Instructions");
  lines.push("");
  lines.push("Generate an execution plan with agent assignments following these rules:");
  lines.push("");
  lines.push("1. **Agent assignments:** Create agents with descriptive names (e.g., 'auth-api-agent').");
  lines.push("   For each agent specify:");
  lines.push("   - Task description (what this agent does)");
  lines.push("   - Exclusive write files (files only this agent modifies)");
  lines.push("   - Read-only files (files this agent references)");
  lines.push("   - Dependencies (which other agents must complete first)");
  lines.push("   - Estimated tokens and timeout");
  lines.push("");
  lines.push("2. **Hybrid strategy (D-31/D-32):**");
  lines.push("   - Independent agents (no shared files, no dependencies) -> run in parallel");
  lines.push("   - Dependent agents (blockedBy chains) -> sequential ordering");
  lines.push(`   - Maximum ${maxConcurrent} concurrent agents`);
  lines.push("");
  lines.push("3. **Output format:** Use the standard plan markdown format:");
  lines.push("   - `### Agent: {name}` sections with all fields");
  lines.push("   - `## Execution Order` table");
  lines.push("   - `## Validation` section (leave for automated validation)");
  lines.push("");

  let prompt = lines.join("\n");

  // Trim if over ~8K tokens (32000 chars)
  if (prompt.length > 32000) {
    prompt =
      prompt.substring(0, 31900) +
      "\n\n[Prompt truncated to fit token budget]";
  }

  return prompt;
}

// ---------------------------------------------------------------------------
// parsePlanOutput
// ---------------------------------------------------------------------------

/**
 * Parse a plan markdown (as returned by the planner sub-agent) into ExecutionPlan.
 *
 * Extracts:
 * - H1 title for taskSlug
 * - Metadata fields (Created, Status, Strategy, Estimated agents, tokens)
 * - Agent blocks from `### Agent: {name}` sections
 * - Execution order table
 * - Builds agents array and waves from parsed data
 */
export function parsePlanOutput(content: string): ExecutionPlan {
  // Extract taskSlug from H1
  const h1Match = content.match(/^#\s+Execution Plan:\s*(.+)/m);
  const taskSlug = h1Match?.[1]?.trim() ?? "unknown";

  // Extract metadata
  const statusMatch = content.match(/\*\*Status:\*\*\s*(\w+)/);
  const status = (statusMatch?.[1]?.trim() ?? "PENDING") as ExecutionPlan["status"];

  const strategyMatch = content.match(/\*\*Strategy:\*\*\s*([\w-]+)/);
  const parsedStrategy = strategyMatch?.[1]?.trim() ?? "";

  const agentsCountMatch = content.match(/\*\*Estimated agents:\*\*\s*(\d+)/);
  const estimatedAgents = agentsCountMatch
    ? parseInt(agentsCountMatch[1], 10)
    : 0;

  const tokensMatch = content.match(/\*\*Estimated total tokens:\*\*\s*~?(\d+)/);
  const estimatedTotalTokens = tokensMatch
    ? parseInt(tokensMatch[1], 10) * 1000
    : 0;

  // Parse agent blocks
  const agents: AgentAssignment[] = [];
  const agentRegex = /^###\s+Agent:\s*(.+)/gm;
  const agentSections: Array<{ name: string; content: string }> = [];

  let match;
  const positions: Array<{ name: string; start: number }> = [];
  while ((match = agentRegex.exec(content)) !== null) {
    positions.push({ name: match[1].trim(), start: match.index });
  }

  for (let i = 0; i < positions.length; i++) {
    const start = positions[i].start;
    const end =
      i + 1 < positions.length
        ? positions[i + 1].start
        : content.indexOf("## Execution Order", start) !== -1
          ? content.indexOf("## Execution Order", start)
          : content.length;
    agentSections.push({
      name: positions[i].name,
      content: content.substring(start, end),
    });
  }

  for (const section of agentSections) {
    const agent = parseAgentSection(section.name, section.content);
    agents.push(agent);
  }

  // Build waves from agent wave assignments
  const waveMap = new Map<number, string[]>();
  for (const agent of agents) {
    const group = waveMap.get(agent.wave) ?? [];
    group.push(agent.name);
    waveMap.set(agent.wave, group);
  }

  const waves: ExecutionWave[] = [...waveMap.entries()]
    .sort(([a], [b]) => a - b)
    .map(([waveNumber, agentNames]) => ({
      waveNumber,
      agents: agentNames,
      mode: (agentNames.length > 1 ? "parallel" : "sequential") as
        | "parallel"
        | "sequential",
    }));

  // Determine strategy from wave structure
  const strategy = determineStrategy(waves, parsedStrategy);

  return {
    taskSlug,
    createdAt: new Date().toISOString(),
    status,
    strategy,
    estimatedAgents: estimatedAgents || agents.length,
    estimatedTotalTokens,
    agents,
    waves,
    validationResults: [],
    removedByUser: [],
  };
}

/**
 * Parse a single agent section from the plan markdown.
 */
function parseAgentSection(
  name: string,
  content: string,
): AgentAssignment {
  const waveMatch = content.match(/\*\*Wave:\*\*\s*(\d+)/);
  const wave = waveMatch ? parseInt(waveMatch[1], 10) : 1;

  const taskMatch = content.match(/\*\*Task:\*\*\s*(.+)/);
  const task = taskMatch?.[1]?.trim() ?? "";

  const exclusiveMatch = content.match(
    /\*\*Files \(exclusive write\):\*\*\s*(.+)/,
  );
  const exclusiveWriteFiles = exclusiveMatch
    ? extractBacktickedPaths(exclusiveMatch[1])
    : [];

  const readOnlyMatch = content.match(
    /\*\*Files \(read-only\):\*\*\s*(.+)/,
  );
  const readOnlyFiles = readOnlyMatch
    ? extractBacktickedPaths(readOnlyMatch[1])
    : [];

  const convMatch = content.match(/\*\*Conventions:\*\*\s*(.+)/);
  const conventions = convMatch
    ? convMatch[1]
        .split(",")
        .map((c) => c.trim())
        .filter((c) => c.length > 0 && c !== "none")
    : [];

  const goldenMatch = content.match(/\*\*Golden files:\*\*\s*(.+)/);
  const goldenFiles = goldenMatch
    ? parseGoldenFiles(goldenMatch[1])
    : [];

  const depsMatch = content.match(/\*\*Depends on:\*\*\s*(.+)/);
  const dependsOn = depsMatch
    ? depsMatch[1]
        .split(",")
        .map((d) => d.trim())
        .filter((d) => d.length > 0 && d.toLowerCase() !== "none")
    : [];

  const tokensMatch = content.match(/\*\*Estimated tokens:\*\*\s*~?(\d+)/);
  const estimatedTokens = tokensMatch
    ? parseInt(tokensMatch[1], 10) * 1000
    : 0;

  const timeoutMatch = content.match(/\*\*Timeout:\*\*\s*(\d+)/);
  const timeoutSeconds = timeoutMatch
    ? parseInt(timeoutMatch[1], 10)
    : 180;

  return {
    name,
    wave,
    task,
    exclusiveWriteFiles,
    readOnlyFiles,
    conventions,
    goldenFiles,
    dependsOn,
    estimatedTokens,
    timeoutSeconds,
    costTier: classifyCostTier(estimatedTokens),
  };
}

/**
 * Extract file paths from backtick-delimited strings.
 */
function extractBacktickedPaths(text: string): string[] {
  const matches = text.matchAll(/`([^`]+)`/g);
  return Array.from(matches).map((m) => m[1]);
}

/**
 * Parse golden files from the format: `path` (lines N-M)
 */
function parseGoldenFiles(
  text: string,
): Array<{ path: string; lines: string }> {
  const results: Array<{ path: string; lines: string }> = [];
  const matches = text.matchAll(/`([^`]+)`\s*\(lines?\s*([^)]+)\)/g);
  for (const match of matches) {
    results.push({ path: match[1], lines: match[2].trim() });
  }
  return results;
}

/**
 * Determine the strategy from wave structure or parsed strategy string.
 */
function determineStrategy(
  waves: ExecutionWave[],
  parsedStrategy: string,
): "sequential" | "parallel" | "wave-based" {
  // If explicitly stated in the markdown, trust it
  if (
    parsedStrategy === "sequential" ||
    parsedStrategy === "parallel" ||
    parsedStrategy === "wave-based"
  ) {
    return parsedStrategy;
  }

  // Infer from structure
  const allSingle = waves.every((w) => w.agents.length === 1);
  if (allSingle && waves.length <= 1) return "sequential";

  const hasMultiAgent = waves.some((w) => w.agents.length > 1);
  if (waves.length === 1 && hasMultiAgent) return "parallel";

  if (hasMultiAgent || waves.length > 1) return "wave-based";

  return "sequential";
}

// ---------------------------------------------------------------------------
// writePlanArtifact
// ---------------------------------------------------------------------------

/**
 * Write the execution plan to `plans/[task-slug].md` in UI-SPEC format.
 *
 * Format:
 * - H1 "Execution Plan: {task-slug}"
 * - Metadata: Created, Status, Strategy, Estimated agents, tokens
 * - H2 "Agents" with H3 per agent
 * - H2 "Execution Order" table
 * - H2 "Validation" with checkbox list
 * - H2 "Removed by User" (empty by default, per D-17)
 *
 * Returns the written file path.
 */
export function writePlanArtifact(
  plan: ExecutionPlan,
  outputDir: string,
): string {
  const lines: string[] = [];

  // Header
  lines.push(`# Execution Plan: ${plan.taskSlug}`);
  lines.push("");
  lines.push(`**Created:** ${plan.createdAt}`);
  lines.push(`**Status:** ${plan.status}`);
  lines.push(`**Strategy:** ${plan.strategy}`);
  lines.push(`**Estimated agents:** ${plan.estimatedAgents}`);
  lines.push(
    `**Estimated total tokens:** ~${Math.round(plan.estimatedTotalTokens / 1000)}K`,
  );
  lines.push("");

  // Agents section
  lines.push("## Agents");
  lines.push("");

  for (const agent of plan.agents) {
    lines.push(`### Agent: ${agent.name}`);
    lines.push("");
    const waveDetail =
      agent.dependsOn.length > 0
        ? `${agent.wave} (sequential: after ${agent.dependsOn.join(", ")})`
        : String(agent.wave);
    lines.push(`- **Wave:** ${waveDetail}`);
    lines.push(`- **Task:** ${agent.task}`);
    lines.push(
      `- **Files (exclusive write):** ${agent.exclusiveWriteFiles.map((f) => `\`${f}\``).join(", ") || "none"}`,
    );
    lines.push(
      `- **Files (read-only):** ${agent.readOnlyFiles.map((f) => `\`${f}\``).join(", ") || "none"}`,
    );
    lines.push(
      `- **Conventions:** ${agent.conventions.join(", ") || "none"}`,
    );
    lines.push(
      `- **Golden files:** ${agent.goldenFiles.map((g) => `\`${g.path}\` (lines ${g.lines})`).join(", ") || "none"}`,
    );
    lines.push(
      `- **Depends on:** ${agent.dependsOn.join(", ") || "none"}`,
    );
    lines.push(
      `- **Estimated tokens:** ~${Math.round(agent.estimatedTokens / 1000)}K`,
    );
    lines.push(`- **Timeout:** ${agent.timeoutSeconds}s`);
    lines.push("");
  }

  // Execution Order table
  lines.push("## Execution Order");
  lines.push("");
  lines.push("| Wave | Agents | Mode | Files |");
  lines.push("|------|--------|------|-------|");

  for (const wave of plan.waves) {
    const agentNames = wave.agents.join(", ");
    const mode =
      wave.mode === "parallel"
        ? "parallel (agent teams)"
        : wave.waveNumber > 1
          ? `sequential (depends on wave ${wave.waveNumber - 1})`
          : "sequential";
    const fileCount = wave.agents.reduce((count, agentName) => {
      const agent = plan.agents.find((a) => a.name === agentName);
      return count + (agent?.exclusiveWriteFiles.length ?? 0);
    }, 0);
    lines.push(`| ${wave.waveNumber} | ${agentNames} | ${mode} | ${fileCount} |`);
  }
  lines.push("");

  // Validation section
  lines.push("## Validation");
  lines.push("");
  if (plan.validationResults.length === 0) {
    lines.push("_(validation pending)_");
  } else {
    for (const check of plan.validationResults) {
      const checked =
        check.status === "PASS" || check.status === "AUTO-FIXED"
          ? "[x]"
          : "[ ]";
      const detail = check.detail ? ` -- ${check.detail}` : "";
      lines.push(
        `- ${checked} ${check.name}: **${check.status}**${detail}`,
      );
    }
  }
  lines.push("");

  // Removed by User section
  lines.push("## Removed by User");
  lines.push("");
  if (plan.removedByUser.length === 0) {
    lines.push("_(none)_");
  } else {
    for (const removed of plan.removedByUser) {
      lines.push(`- ${removed}`);
    }
  }
  lines.push("");

  fs.mkdirSync(outputDir, { recursive: true });
  const filePath = path.join(outputDir, `${plan.taskSlug}.md`);
  fs.writeFileSync(filePath, lines.join("\n"), "utf-8");

  return filePath;
}

// ---------------------------------------------------------------------------
// runPlanner
// ---------------------------------------------------------------------------

/**
 * Main entry point for the planner module.
 *
 * 1. Build the planner prompt
 * 2. NOTE: Actual sub-agent dispatch happens in pipeline (Plan 06)
 * 3. Returns the prompt string for the orchestrator to dispatch
 */
export async function runPlanner(
  options: PlannerOptions,
): Promise<{ prompt: string; plan: ExecutionPlan | null }> {
  const prompt = buildPlannerPrompt(options);

  return {
    prompt,
    plan: null, // Will be populated by pipeline after sub-agent returns
  };
}
