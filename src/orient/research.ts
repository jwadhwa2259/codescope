// ---------------------------------------------------------------------------
// Research Module - Sub-agent prompt construction and output parsing
// Per D-10, D-11, D-12, D-13: Graph-driven research with impact-ranked topics.
// ---------------------------------------------------------------------------

import * as fs from "node:fs";
import * as path from "node:path";
import { getGraph } from "../graph/cache.js";
import { loadConfig } from "../config/loader.js";
import type {
  AffectedFile,
  AnalysisResult,
  ResearchOutput,
  ResearchTopic,
  ScopeContract,
} from "./types.js";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface ResearchOptions {
  projectRoot: string;
  taskSlug: string;
  task: string;
  analysisResult: AnalysisResult;
  scopeContract: ScopeContract;
  outputDir: string;
}

// ---------------------------------------------------------------------------
// extractResearchTopics
// ---------------------------------------------------------------------------

/**
 * Identify external libraries from affected file imports in the graph.
 *
 * For each affected file, looks at outgoing IMPORTS edges to find imported
 * libraries/packages. External libraries (those resolving to node_modules)
 * are identified. For each external library, computes impactScore =
 * centrality of importing file * number of files that import this library.
 * Deduplicates by library name, takes max impactScore.
 */
export function extractResearchTopics(
  projectRoot: string,
  affectedFiles: AffectedFile[],
): ResearchTopic[] {
  const { graph, centralities } = getGraph(projectRoot);
  const affectedPaths = new Set(affectedFiles.map((f) => f.filePath));

  // Map: library name -> { maxScore, fileCount }
  const libraryMap = new Map<
    string,
    { maxScore: number; fileCount: number }
  >();

  // First pass: count how many graph nodes import each external library
  const libraryImporterCount = new Map<string, number>();
  graph.forEachNode((nodeId: string, attrs: Record<string, unknown>) => {
    const filePath = (attrs.filePath as string) ?? "";
    // Only look at outgoing IMPORTS edges
    graph.forEachOutEdge(
      nodeId,
      (
        _edge: string,
        edgeAttrs: Record<string, unknown>,
        _source: string,
        target: string,
      ) => {
        if (edgeAttrs.kind !== "IMPORTS") return;
        const targetAttrs = graph.getNodeAttributes(target);
        const targetPath = (targetAttrs.filePath as string) ?? "";
        if (targetPath.includes("node_modules")) {
          const libName = extractLibraryName(targetPath);
          if (libName) {
            libraryImporterCount.set(
              libName,
              (libraryImporterCount.get(libName) ?? 0) + 1,
            );
          }
        }
      },
    );
  });

  // Second pass: for each affected file, find its external imports
  graph.forEachNode((nodeId: string, attrs: Record<string, unknown>) => {
    const filePath = (attrs.filePath as string) ?? "";
    if (!affectedPaths.has(filePath)) return;

    const centrality = centralities.get(nodeId) ?? 0;

    graph.forEachOutEdge(
      nodeId,
      (
        _edge: string,
        edgeAttrs: Record<string, unknown>,
        _source: string,
        target: string,
      ) => {
        if (edgeAttrs.kind !== "IMPORTS") return;
        const targetAttrs = graph.getNodeAttributes(target);
        const targetPath = (targetAttrs.filePath as string) ?? "";

        if (targetPath.includes("node_modules")) {
          const libName = extractLibraryName(targetPath);
          if (!libName) return;

          const fileCount = libraryImporterCount.get(libName) ?? 1;
          const score = centrality * fileCount;

          const existing = libraryMap.get(libName);
          if (!existing || score > existing.maxScore) {
            libraryMap.set(libName, { maxScore: score, fileCount });
          }
        }
      },
    );
  });

  // Build topics array, sorted by impactScore descending
  const topics: ResearchTopic[] = [];
  for (const [name, { maxScore }] of libraryMap) {
    topics.push({
      name,
      impactScore: maxScore,
      source: "skipped", // Will be assigned by rankTopics
    });
  }

  topics.sort((a, b) => b.impactScore - a.impactScore);
  return topics;
}

/**
 * Extract library name from a node_modules path.
 * Handles scoped packages like @scope/package.
 */
function extractLibraryName(filePath: string): string | null {
  const nmIdx = filePath.indexOf("node_modules/");
  if (nmIdx === -1) return null;

  const afterNm = filePath.substring(nmIdx + "node_modules/".length);
  const parts = afterNm.split("/");

  if (parts[0].startsWith("@") && parts.length >= 2) {
    return `${parts[0]}/${parts[1]}`;
  }
  return parts[0] || null;
}

// ---------------------------------------------------------------------------
// rankTopics
// ---------------------------------------------------------------------------

/**
 * Rank research topics by impact and assign sources.
 *
 * Per D-11:
 * - High-impact (score >= 0.5): context7 + web_search
 * - Mid-impact (0.1 <= score < 0.5): context7 only
 * - Low-impact (score < 0.1): skipped with reason
 *
 * Source availability adjustments:
 * - If context7 not in sources: mid-impact upgrades to web_search
 * - If web_search not in sources: high-impact stays context7 only
 */
export function rankTopics(
  topics: ResearchTopic[],
  config: { researchSources: string[]; maxResearchTime: number },
): ResearchTopic[] {
  const hasContext7 = config.researchSources.includes("context7");
  const hasWebSearch = config.researchSources.includes("web_search");

  return topics.map((topic) => {
    if (topic.impactScore < 0.1) {
      // Low-impact: skip
      return {
        ...topic,
        source: "skipped" as const,
        reason: `low graph impact (score ${topic.impactScore.toFixed(2)}, low file usage)`,
      };
    }

    if (topic.impactScore >= 0.5) {
      // High-impact: prefer context7, add web_search if available
      if (hasContext7) {
        return { ...topic, source: "context7" as const };
      }
      if (hasWebSearch) {
        return { ...topic, source: "web_search" as const };
      }
      return {
        ...topic,
        source: "skipped" as const,
        reason: "no research sources available",
      };
    }

    // Mid-impact (0.1 <= score < 0.5): context7 only
    if (hasContext7) {
      return { ...topic, source: "context7" as const };
    }
    // If context7 not available, upgrade to web_search
    if (hasWebSearch) {
      return { ...topic, source: "web_search" as const };
    }
    return {
      ...topic,
      source: "skipped" as const,
      reason: "no research sources available",
    };
  });
}

// ---------------------------------------------------------------------------
// buildResearchPrompt
// ---------------------------------------------------------------------------

/**
 * Build a sub-agent prompt for research.
 *
 * This prompt is passed to the Task/Agent tool by the pipeline orchestrator.
 * It includes:
 * - Task description and scope contract summary
 * - Non-skipped topics with source instructions
 * - Time budget
 * - Output format instructions matching UI-SPEC research.md format
 *
 * Per D-13: notes which research findings are most relevant to plan aspects.
 * Keeps prompt under ~5K tokens (estimated by character count / 4).
 */
export function buildResearchPrompt(
  task: string,
  topics: ResearchTopic[],
  scopeContract: ScopeContract,
  config: { maxResearchTime: number },
): string {
  const nonSkippedTopics = topics.filter((t) => t.source !== "skipped");
  const lines: string[] = [];

  lines.push("# Research Task");
  lines.push("");
  lines.push(`## Task: ${task}`);
  lines.push("");
  lines.push("## Scope");
  lines.push("");
  lines.push("**In Scope:**");
  for (const item of scopeContract.inScope) {
    lines.push(`- ${item}`);
  }
  lines.push("");
  lines.push("## Research Topics");
  lines.push("");

  for (const topic of nonSkippedTopics) {
    const sourceInstructions =
      topic.source === "context7"
        ? `Use Context7 to look up ${topic.name} documentation. Focus on APIs relevant to the task.`
        : topic.source === "web_search"
          ? `Use web search to find best practices and patterns for ${topic.name}.`
          : "";
    lines.push(`### ${topic.name} (impact: ${topic.impactScore.toFixed(2)})`);
    lines.push("");
    lines.push(sourceInstructions);
    lines.push("");
  }

  lines.push("## Time Budget");
  lines.push("");
  lines.push(
    `Complete research within ${config.maxResearchTime} seconds. Focus on high-impact topics first.`,
  );
  lines.push("");

  lines.push("## Output Format");
  lines.push("");
  lines.push(
    "Write findings to research.md with these exact sections:",
  );
  lines.push("- `## Relevant APIs` - Code examples and version-specific notes per library");
  lines.push("- `## Best Practices` - Patterns relevant to the task");
  lines.push("- `## Known Issues / Pitfalls` - Issues that affect this task");
  lines.push("- `## Version-Specific Notes` - Version constraints or breaking changes");
  lines.push("- `## Skipped Topics` - Low-impact topics that were skipped");
  lines.push("");
  lines.push(
    "Note which research findings are most relevant to which aspects of the plan.",
  );

  let prompt = lines.join("\n");

  // Trim if over ~5K tokens (20000 chars)
  if (prompt.length > 20000) {
    prompt = prompt.substring(0, 19900) + "\n\n[Prompt truncated to fit token budget]";
  }

  return prompt;
}

// ---------------------------------------------------------------------------
// parseResearchOutput
// ---------------------------------------------------------------------------

/**
 * Parse a research.md file content into structured ResearchOutput.
 *
 * Extracts:
 * - completedAt from `**Completed:** {timestamp}`
 * - topicsResearched from `**Topics researched:** {N}`
 * - topicsSkipped from `**Topics skipped (low-impact):** {N}`
 * - Topics from section headers under `## Relevant APIs`
 * - Skipped topics from `## Skipped Topics`
 */
export function parseResearchOutput(content: string): ResearchOutput {
  // Extract metadata
  const completedMatch = content.match(/\*\*Completed:\*\*\s*(.+)/);
  const completedAt = completedMatch?.[1]?.trim() ?? new Date().toISOString();

  const researchedMatch = content.match(
    /\*\*Topics researched:\*\*\s*(\d+)/,
  );
  const topicsResearched = researchedMatch
    ? parseInt(researchedMatch[1], 10)
    : 0;

  const skippedMatch = content.match(
    /\*\*Topics skipped.*?:\*\*\s*(\d+)/,
  );
  const topicsSkipped = skippedMatch ? parseInt(skippedMatch[1], 10) : 0;

  // Parse topics from ## Relevant APIs subsections
  const topics: ResearchTopic[] = [];
  const apiSection = extractSection(content, "Relevant APIs");
  if (apiSection) {
    const h3Matches = apiSection.matchAll(/^###\s+(.+)/gm);
    for (const match of h3Matches) {
      topics.push({
        name: match[1].trim(),
        impactScore: 0, // Not available from the artifact
        source: "context7",
      });
    }
  }

  // Parse skipped topics
  const skippedSection = extractSection(content, "Skipped Topics");
  if (skippedSection) {
    const bulletMatches = skippedSection.matchAll(/^-\s+(.+?):/gm);
    for (const match of bulletMatches) {
      topics.push({
        name: match[1].trim(),
        impactScore: 0,
        source: "skipped",
        reason: "low graph impact",
      });
    }
  }

  return {
    completedAt,
    topicsResearched,
    topicsSkipped,
    topics,
    outputPath: "",
    durationMs: 0,
  };
}

/**
 * Extract a section from markdown by H2 heading.
 */
function extractSection(
  content: string,
  heading: string,
): string | null {
  const regex = new RegExp(
    `^## ${heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\n([\\s\\S]*?)(?=^## |$)`,
    "m",
  );
  const match = content.match(regex);
  return match?.[1]?.trim() ?? null;
}

// ---------------------------------------------------------------------------
// writeResearchArtifact
// ---------------------------------------------------------------------------

/**
 * Write research.md to outputDir matching the UI-SPEC format.
 *
 * Format:
 * - H1 "Research: {task-slug}" (from outputPath)
 * - Metadata: Completed, Topics researched, Topics skipped
 * - H2 "Relevant APIs" with H3 per researched topic
 * - H2 "Best Practices"
 * - H2 "Known Issues / Pitfalls"
 * - H2 "Version-Specific Notes"
 * - H2 "Skipped Topics" with bullet list
 *
 * Returns the written file path.
 */
export function writeResearchArtifact(
  output: ResearchOutput,
  outputDir: string,
): string {
  const lines: string[] = [];
  const taskSlug = path.basename(outputDir) || "research";

  lines.push(`# Research: ${taskSlug}`);
  lines.push("");
  lines.push(`**Completed:** ${output.completedAt}`);
  lines.push(`**Topics researched:** ${output.topicsResearched}`);
  lines.push(`**Topics skipped (low-impact):** ${output.topicsSkipped}`);
  lines.push("");

  // Relevant APIs
  lines.push("## Relevant APIs");
  lines.push("");
  const researched = output.topics.filter((t) => t.source !== "skipped");
  if (researched.length === 0) {
    lines.push("_(no external libraries to research)_");
  } else {
    for (const topic of researched) {
      lines.push(`### ${topic.name}`);
      lines.push("");
      lines.push(`_(Research output for ${topic.name} via ${topic.source})_`);
      lines.push("");
    }
  }

  // Best Practices
  lines.push("## Best Practices");
  lines.push("");
  lines.push("_(populated by research sub-agent)_");
  lines.push("");

  // Known Issues / Pitfalls
  lines.push("## Known Issues / Pitfalls");
  lines.push("");
  lines.push("_(populated by research sub-agent)_");
  lines.push("");

  // Version-Specific Notes
  lines.push("## Version-Specific Notes");
  lines.push("");
  lines.push("_(populated by research sub-agent)_");
  lines.push("");

  // Skipped Topics
  lines.push("## Skipped Topics");
  lines.push("");
  const skipped = output.topics.filter((t) => t.source === "skipped");
  if (skipped.length === 0) {
    lines.push("_(none)_");
  } else {
    for (const topic of skipped) {
      lines.push(
        `- ${topic.name}: ${topic.reason ?? "low graph impact"}`,
      );
    }
  }
  lines.push("");

  fs.mkdirSync(outputDir, { recursive: true });
  const filePath = path.join(outputDir, "research.md");
  fs.writeFileSync(filePath, lines.join("\n"), "utf-8");

  return filePath;
}

// ---------------------------------------------------------------------------
// runResearch
// ---------------------------------------------------------------------------

/**
 * Main entry point for the research module.
 *
 * 1. Extract topics from analysis result via graph
 * 2. Load config for research_sources and max_research_time
 * 3. Rank topics
 * 4. Build sub-agent prompt
 * 5. NOTE: Actual sub-agent spawning happens in the pipeline orchestrator (Plan 06)
 *
 * If no non-skipped topics: writes minimal research.md and returns.
 * Returns ResearchOutput with the prompt for the orchestrator to dispatch.
 */
export async function runResearch(
  options: ResearchOptions,
): Promise<ResearchOutput & { prompt?: string }> {
  const startMs = Date.now();

  // Extract topics from graph
  const topics = extractResearchTopics(
    options.projectRoot,
    options.analysisResult.affectedFiles,
  );

  // Load config
  const config = loadConfig(options.projectRoot);
  const researchSources = config?.orient?.research_sources ?? [
    "context7",
    "web_search",
  ];
  const maxResearchTime = config?.orient?.max_research_time ?? 30;

  // Rank topics
  const rankedTopics = rankTopics(topics, {
    researchSources,
    maxResearchTime,
  });

  const nonSkipped = rankedTopics.filter((t) => t.source !== "skipped");

  // If no non-skipped topics, write minimal research.md
  if (nonSkipped.length === 0) {
    const output: ResearchOutput = {
      completedAt: new Date().toISOString(),
      topicsResearched: 0,
      topicsSkipped: rankedTopics.length,
      topics: rankedTopics,
      outputPath: writeResearchArtifact(
        {
          completedAt: new Date().toISOString(),
          topicsResearched: 0,
          topicsSkipped: rankedTopics.length,
          topics: rankedTopics,
          outputPath: "",
          durationMs: 0,
        },
        options.outputDir,
      ),
      durationMs: Date.now() - startMs,
    };
    return output;
  }

  // Build sub-agent prompt
  const prompt = buildResearchPrompt(
    options.task,
    rankedTopics,
    options.scopeContract,
    { maxResearchTime },
  );

  // Write a placeholder research.md (will be overwritten by sub-agent output)
  const outputPath = writeResearchArtifact(
    {
      completedAt: new Date().toISOString(),
      topicsResearched: nonSkipped.length,
      topicsSkipped: rankedTopics.length - nonSkipped.length,
      topics: rankedTopics,
      outputPath: "",
      durationMs: 0,
    },
    options.outputDir,
  );

  return {
    completedAt: new Date().toISOString(),
    topicsResearched: nonSkipped.length,
    topicsSkipped: rankedTopics.length - nonSkipped.length,
    topics: rankedTopics,
    outputPath,
    durationMs: Date.now() - startMs,
    prompt,
  };
}
