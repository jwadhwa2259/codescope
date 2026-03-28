import * as fs from "node:fs";
import * as path from "node:path";
import { getGraph } from "../graph/cache.js";
import { blastRadius } from "../graph/analytics.js";
import { getCodescopePath } from "../utils/paths.js";
import type { AffectedFile, AnalysisResult } from "./types.js";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface AnalysisOptions {
  projectRoot: string;
  taskSlug: string;
  keywords: string[];
  outputDir: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Maximum number of affected files to return */
const MAX_AFFECTED_FILES = 50;

/** Maximum number of top-centrality nodes to expand blast radius from */
const MAX_BLAST_RADIUS_ROOTS = 5;

/** Maximum hops for blast radius BFS */
const BLAST_RADIUS_MAX_HOPS = 3;

// ---------------------------------------------------------------------------
// Risk classification (same thresholds as orient.ts)
// ---------------------------------------------------------------------------

function classifyRisk(centrality: number): "HIGH" | "MEDIUM" | "LOW" {
  if (centrality > 0.7) return "HIGH";
  if (centrality >= 0.3) return "MEDIUM";
  return "LOW";
}

// ---------------------------------------------------------------------------
// Convention reading (same parsing as src/tools/orient.ts lines 89-129)
// ---------------------------------------------------------------------------

/**
 * Read conventions from conventions.md and filter to those relevant
 * to the given file paths.
 */
function readRelevantConventions(
  codescopePath: string,
  filePaths: string[],
): string[] {
  const conventionsPath = path.join(codescopePath, "conventions.md");
  if (!fs.existsSync(conventionsPath)) return [];

  const content = fs.readFileSync(conventionsPath, "utf-8");
  const conventions: string[] = [];

  // Parse convention blocks (same format as conventions.ts)
  const sections = content.split(/^## /m).filter((s) => s.trim().length > 0);

  for (const section of sections) {
    const lines = section.split("\n");
    let name = "";
    let files: string[] = [];

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith("**Convention:**")) {
        name = trimmed.replace("**Convention:**", "").trim();
      } else if (trimmed.startsWith("**Files:**")) {
        const fileStr = trimmed.replace("**Files:**", "").trim();
        files = fileStr
          .split(",")
          .map((f) => f.trim())
          .filter((f) => f.length > 0);
      }
    }

    if (name) {
      // Check if any convention files overlap with the relevant file paths
      const isRelevant = files.some((convFile) =>
        filePaths.some(
          (fp) => fp.includes(convFile) || convFile.includes(fp),
        ),
      );
      if (isRelevant || filePaths.length === 0) {
        conventions.push(name);
      }
    }
  }

  return conventions;
}

// ---------------------------------------------------------------------------
// Main entry: runAnalysis
// ---------------------------------------------------------------------------

/**
 * Run graph-based analysis for a task's affected scope.
 *
 * Steps:
 * 1. Get cached graph + centralities
 * 2. Find affected files by keyword matching (per ORNT-08)
 * 3. Compute blast radius from top-5 highest-centrality affected nodes
 * 4. Match conventions from conventions.md
 * 5. Discover test files via graph neighborhood
 * 6. Calculate cross-community impact
 */
export async function runAnalysis(
  options: AnalysisOptions,
): Promise<AnalysisResult> {
  const startMs = Date.now();
  const { graph, centralities } = await getGraph(options.projectRoot);

  // ---- Step 1: Affected files ----
  // Walk all graph nodes, match keywords against node name and filePath
  const affectedNodes: Array<{
    nodeId: string;
    filePath: string;
    centrality: number;
    community: string | null;
    kind: string;
  }> = [];

  graph.forEachNode((nodeId: string, attrs: Record<string, unknown>) => {
    const name = ((attrs.name as string) ?? "").toLowerCase();
    const filePath = ((attrs.filePath as string) ?? "").toLowerCase();
    const matches = options.keywords.some(
      (kw) => name.includes(kw) || filePath.includes(kw),
    );
    if (matches) {
      const cent = centralities.get(nodeId) ?? 0;
      affectedNodes.push({
        nodeId,
        filePath: (attrs.filePath as string) ?? "",
        centrality: cent,
        community:
          attrs.community !== undefined ? String(attrs.community) : null,
        kind: (attrs.kind as string) ?? "unknown",
      });
    }
  });

  // Sort by centrality descending, cap at MAX_AFFECTED_FILES
  affectedNodes.sort((a, b) => b.centrality - a.centrality);
  const cappedNodes = affectedNodes.slice(0, MAX_AFFECTED_FILES);

  const affectedFiles: AffectedFile[] = cappedNodes
    .filter((n) => n.kind === "file")
    .map((n) => ({
      filePath: n.filePath,
      risk: classifyRisk(n.centrality),
      centrality: n.centrality,
      community: n.community,
    }));

  // ---- Step 2: Blast radius ----
  // Take top 5 highest-centrality affected nodes (any kind, not just files)
  const topNodes = cappedNodes
    .slice(0, MAX_BLAST_RADIUS_ROOTS);

  const blastRadiusMap = new Map<
    string,
    { filePath: string; hopDistance: number; riskLevel: string }
  >();

  for (const node of topNodes) {
    const brResults = blastRadius(graph, node.nodeId, BLAST_RADIUS_MAX_HOPS);
    for (const br of brResults) {
      if (!blastRadiusMap.has(br.filePath) || br.hop < blastRadiusMap.get(br.filePath)!.hopDistance) {
        blastRadiusMap.set(br.filePath, {
          filePath: br.filePath,
          hopDistance: br.hop,
          riskLevel: br.risk,
        });
      }
    }
  }

  const blastRadiusFiles = Array.from(blastRadiusMap.values()).sort(
    (a, b) => a.hopDistance - b.hopDistance,
  );

  // ---- Step 3: Convention matching ----
  const csPath = getCodescopePath(options.projectRoot);
  const affectedFilePaths = affectedFiles.map((f) => f.filePath);
  const conventionMatches = readRelevantConventions(csPath, affectedFilePaths);

  // ---- Step 4: Test file mapping ----
  // For each affected node, check graph neighbors for test/spec files
  const testFileSet = new Set<string>();
  const affectedNodeIds = new Set(cappedNodes.map((n) => n.nodeId));

  for (const node of cappedNodes) {
    // Check all neighbors (in + out edges)
    const neighbors = graph.neighbors(node.nodeId);
    for (const neighbor of neighbors) {
      if (!graph.hasNode(neighbor)) continue;
      const neighborAttrs = graph.getNodeAttributes(neighbor);
      const neighborName = ((neighborAttrs.name as string) ?? "").toLowerCase();
      const neighborPath = ((neighborAttrs.filePath as string) ?? "").toLowerCase();
      const neighborKind = (neighborAttrs.kind as string) ?? "";

      const isTestFile =
        neighborName.includes(".test.") ||
        neighborName.includes(".spec.") ||
        (neighborKind === "file" &&
          (neighborPath.includes("/test") || neighborPath.includes("/tests/")));

      if (isTestFile) {
        testFileSet.add((neighborAttrs.filePath as string) ?? "");
      }
    }
  }

  const testFiles = Array.from(testFileSet).filter((f) => f.length > 0);

  // ---- Step 5: Cross-community impact ----
  // Group affected nodes by community ID
  const communityAffectedCount = new Map<number, number>();
  for (const node of cappedNodes) {
    if (node.community !== null) {
      const cId = Number(node.community);
      communityAffectedCount.set(
        cId,
        (communityAffectedCount.get(cId) ?? 0) + 1,
      );
    }
  }

  // Count total nodes per community from the full graph
  const communityTotalCount = new Map<number, number>();
  graph.forEachNode((_nodeId: string, attrs: Record<string, unknown>) => {
    const community = attrs.community as number | undefined;
    if (community !== undefined) {
      communityTotalCount.set(
        community,
        (communityTotalCount.get(community) ?? 0) + 1,
      );
    }
  });

  const crossCommunityImpact = Array.from(
    communityAffectedCount.entries(),
  ).map(([communityId, affectedCount]) => ({
    communityId,
    nodeCount: communityTotalCount.get(communityId) ?? 0,
    affectedCount,
  }));

  return {
    affectedFiles,
    blastRadiusFiles,
    conventionMatches,
    testFiles,
    crossCommunityImpact,
    durationMs: Date.now() - startMs,
  };
}

// ---------------------------------------------------------------------------
// Analysis artifact writing
// ---------------------------------------------------------------------------

/**
 * Write analysis.md to outputDir with structured sections:
 * - H1 "Analysis" with completion timestamp
 * - H2 "Affected Files" table
 * - H2 "Blast Radius" table
 * - H2 "Conventions in Scope" list
 * - H2 "Test Files" list
 * - H2 "Cross-Community Impact" table
 *
 * Returns written file path.
 */
export function writeAnalysisArtifact(
  result: AnalysisResult,
  outputDir: string,
): string {
  const lines: string[] = [];
  const now = new Date().toISOString();

  lines.push("# Analysis");
  lines.push("");
  lines.push(`**Completed:** ${now}`);
  lines.push(`**Duration:** ${result.durationMs}ms`);
  lines.push("");

  // Affected Files table
  lines.push("## Affected Files");
  lines.push("");
  lines.push("| File | Risk | Centrality | Community |");
  lines.push("|------|------|------------|-----------|");
  for (const file of result.affectedFiles) {
    lines.push(
      `| \`${file.filePath}\` | **${file.risk}** | ${file.centrality.toFixed(3)} | ${file.community ?? "unknown"} |`,
    );
  }
  if (result.affectedFiles.length === 0) {
    lines.push("| _(none detected)_ | - | - | - |");
  }
  lines.push("");

  // Blast Radius table
  lines.push("## Blast Radius");
  lines.push("");
  lines.push("| File | Hop Distance | Risk Level |");
  lines.push("|------|-------------|------------|");
  for (const br of result.blastRadiusFiles) {
    lines.push(
      `| \`${br.filePath}\` | ${br.hopDistance} | ${br.riskLevel} |`,
    );
  }
  if (result.blastRadiusFiles.length === 0) {
    lines.push("| _(none computed)_ | - | - |");
  }
  lines.push("");

  // Conventions in Scope
  lines.push("## Conventions in Scope");
  lines.push("");
  if (result.conventionMatches.length === 0) {
    lines.push("- _(none detected)_");
  } else {
    for (const conv of result.conventionMatches) {
      lines.push(`- ${conv}`);
    }
  }
  lines.push("");

  // Test Files
  lines.push("## Test Files");
  lines.push("");
  if (result.testFiles.length === 0) {
    lines.push("- _(none discovered)_");
  } else {
    for (const tf of result.testFiles) {
      lines.push(`- \`${tf}\``);
    }
  }
  lines.push("");

  // Cross-Community Impact
  lines.push("## Cross-Community Impact");
  lines.push("");
  lines.push("| Community ID | Total Nodes | Affected Nodes |");
  lines.push("|-------------|-------------|----------------|");
  for (const impact of result.crossCommunityImpact) {
    lines.push(
      `| ${impact.communityId} | ${impact.nodeCount} | ${impact.affectedCount} |`,
    );
  }
  if (result.crossCommunityImpact.length === 0) {
    lines.push("| _(none)_ | - | - |");
  }
  lines.push("");

  fs.mkdirSync(outputDir, { recursive: true });
  const filePath = path.join(outputDir, "analysis.md");
  fs.writeFileSync(filePath, lines.join("\n"), "utf-8");

  return filePath;
}
