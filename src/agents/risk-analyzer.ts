import * as fs from "node:fs";
import * as path from "node:path";
import { buildGraph } from "../graph/builder.js";
import {
  loadGraphFromSQLite,
  computeCentrality,
  runCommunityDetection,
  blastRadius,
  computeDangerZones,
  type CentralityResult,
  type CommunityResult,
  type DangerZoneEntry,
  type BlastRadiusNode,
} from "../graph/analytics.js";
import { openDatabase, closeDatabase } from "../graph/database.js";
import { getGraphDbPath, getCodescopePath } from "../utils/paths.js";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface RiskAnalyzerOptions {
  projectRoot: string;
  outputDir: string; // where to write danger-zones.md
  dbPath?: string; // optional: override default graph.db path
  batchDir?: string; // optional: override default batch dir
  workspaceAliases?: Record<string, string>; // workspace package name -> resolved path
}

export interface RiskAnalyzerResult {
  dangerZonesPath: string;
  nodesCreated: number;
  edgesCreated: number;
  totalImports: number;
  communitiesDetected: number;
  dangerZoneCount: number;
  durationMs: number;
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

/**
 * Runs the Risk Analyzer agent: builds the knowledge graph from source code,
 * runs centrality + community detection + blast radius analytics, and produces
 * danger-zones.md following the UI-SPEC copywriting contract.
 */
export async function runRiskAnalyzer(
  options: RiskAnalyzerOptions,
): Promise<RiskAnalyzerResult> {
  const startTime = Date.now();

  // Resolve paths
  const dbPath = options.dbPath ?? getGraphDbPath(options.projectRoot);
  const batchDir =
    options.batchDir ??
    path.join(getCodescopePath(options.projectRoot), "batch");

  // Ensure output directory exists
  fs.mkdirSync(options.outputDir, { recursive: true });

  // Step 1: Build the knowledge graph (per D-17)
  const buildResult = await buildGraph({
    projectRoot: options.projectRoot,
    dbPath,
    batchDir,
    ...(options.workspaceAliases &&
      Object.keys(options.workspaceAliases).length > 0 && {
        workspaceAliases: options.workspaceAliases,
      }),
  });

  // Step 2: Run analytics (per D-15, D-19: load on demand, run, write back, discard)
  // Declare variables BEFORE try block so they remain accessible for markdown generation
  let dangerZones: DangerZoneEntry[] = [];
  let communityResult: CommunityResult | undefined;
  let centralityResult: CentralityResult | undefined;
  const blastRadiusExamples: Array<{
    node: string;
    results: BlastRadiusNode[];
  }> = [];

  // Only run analytics if graph has sufficient edges
  const hasSufficientEdges = buildResult.edgesCreated >= 5;

  if (hasSufficientEdges) {
    const db = openDatabase(dbPath);
    try {
      const graph = loadGraphFromSQLite(db);
      centralityResult = computeCentrality(graph);
      communityResult = runCommunityDetection(graph, db);
      dangerZones = computeDangerZones(
        graph,
        centralityResult.centralities,
        communityResult.communities,
      );

      // Get top 3 danger zones for blast radius examples
      const topDangerZones = dangerZones.slice(0, 3);
      for (const dz of topDangerZones) {
        // Find the node ID for this file
        const fileNodes = graph.filterNodes(
          (_n: string, attr: Record<string, unknown>) =>
            attr.filePath === dz.filePath && attr.kind === "file",
        );
        if (fileNodes.length > 0) {
          blastRadiusExamples.push({
            node: dz.filePath,
            results: blastRadius(graph, fileNodes[0]),
          });
        }
      }
    } finally {
      closeDatabase(db);
    }
  }

  // Step 3: Generate danger-zones.md
  const markdown = generateDangerZonesMarkdown(
    buildResult,
    dangerZones,
    communityResult,
    centralityResult,
    blastRadiusExamples,
    hasSufficientEdges,
  );

  // Step 4: Write to file
  const dangerZonesPath = path.join(options.outputDir, "danger-zones.md");
  fs.writeFileSync(dangerZonesPath, markdown, "utf-8");

  const durationMs = Date.now() - startTime;

  return {
    dangerZonesPath,
    nodesCreated: buildResult.nodesCreated,
    edgesCreated: buildResult.edgesCreated,
    totalImports: buildResult.totalImports,
    communitiesDetected: communityResult?.communityCount ?? 0,
    dangerZoneCount: dangerZones.length,
    durationMs,
  };
}

// ---------------------------------------------------------------------------
// Markdown generation
// ---------------------------------------------------------------------------

function generateDangerZonesMarkdown(
  buildResult: {
    filesProcessed: number;
    nodesCreated: number;
    edgesCreated: number;
    errors: string[];
  },
  dangerZones: DangerZoneEntry[],
  communityResult: CommunityResult | undefined,
  _centralityResult: CentralityResult | undefined,
  blastRadiusExamples: Array<{ node: string; results: BlastRadiusNode[] }>,
  hasSufficientEdges: boolean,
): string {
  const timestamp = new Date().toISOString();
  const lines: string[] = [];

  // YAML frontmatter
  lines.push("---");
  lines.push(`generated: "${timestamp}"`);
  lines.push('generator: "risk-analyzer"');
  lines.push("phase: 2");
  lines.push(`total_nodes: ${buildResult.nodesCreated}`);
  lines.push(`total_edges: ${buildResult.edgesCreated}`);
  lines.push(
    `communities_detected: ${communityResult?.communityCount ?? 0}`,
  );
  lines.push("---");
  lines.push("");
  lines.push("# Danger Zones");
  lines.push("");

  if (!hasSufficientEdges) {
    lines.push(
      "Knowledge graph contains insufficient edges for danger zone analysis.",
    );
    lines.push("");
    lines.push("## High-Centrality Nodes");
    lines.push("");
    lines.push(
      "| Rank | File | In-Degree | Communities Touched | Risk Score |",
    );
    lines.push(
      "|------|------|-----------|---------------------|------------|",
    );
    lines.push("");
    lines.push("## Cross-Boundary Dependencies");
    lines.push("");
    lines.push("No cross-boundary dependencies detected.");
    lines.push("");
    lines.push("## Risk Summary");
    lines.push("");
    lines.push(`- **Total files analyzed:** ${buildResult.filesProcessed}`);
    lines.push(`- **Graph nodes:** ${buildResult.nodesCreated}`);
    lines.push(`- **Graph edges:** ${buildResult.edgesCreated}`);
    lines.push(`- **Communities detected:** 0`);
    lines.push(`- **Modularity:** N/A`);
    lines.push(`- **Danger zone files:** 0`);
    lines.push(`- **Build errors:** ${buildResult.errors.length}`);
    return lines.join("\n");
  }

  // High-Centrality Nodes section
  lines.push("## High-Centrality Nodes");
  lines.push("");
  lines.push(
    "| Rank | File | In-Degree | Communities Touched | Risk Score |",
  );
  lines.push(
    "|------|------|-----------|---------------------|------------|",
  );

  // Filter to danger zones with meaningful risk (any risk score > 0)
  const significantZones = dangerZones.filter((dz) => dz.riskScore > 0);
  for (let i = 0; i < significantZones.length; i++) {
    const dz = significantZones[i];
    lines.push(
      `| ${i + 1} | \`${dz.filePath}\` | ${dz.inDegree.toFixed(3)} | ${dz.communitiesTouched} | ${dz.riskScore.toFixed(3)} |`,
    );
  }

  lines.push("");

  // Cross-Boundary Dependencies section
  lines.push("## Cross-Boundary Dependencies");
  lines.push("");

  const crossBoundary = dangerZones.filter(
    (dz) => dz.communitiesTouched > 1,
  );
  if (crossBoundary.length === 0) {
    lines.push("No cross-boundary dependencies detected.");
  } else {
    for (const dz of crossBoundary) {
      lines.push(
        `- \`${dz.filePath}\` touches ${dz.communitiesTouched} communities`,
      );
    }
  }

  lines.push("");

  // Blast Radius Examples section
  if (blastRadiusExamples.length > 0) {
    lines.push("## Blast Radius Examples");
    lines.push("");

    for (const example of blastRadiusExamples) {
      lines.push(`### Blast Radius: \`${example.node}\``);
      lines.push("");
      lines.push("| Hop | Classification | Files |");
      lines.push("|-----|----------------|-------|");

      // Group by hop level
      const byHop = new Map<number, BlastRadiusNode[]>();
      for (const node of example.results) {
        const hopKey = Math.min(node.hop, 3); // Group 3+ together
        const existing = byHop.get(hopKey) ?? [];
        existing.push(node);
        byHop.set(hopKey, existing);
      }

      const hopLabels: Record<number, string> = {
        0: "Red (direct)",
        1: "Orange (1 hop)",
        2: "Yellow (2 hops)",
        3: "Green (3+ hops)",
      };

      for (const [hop, nodes] of [...byHop.entries()].sort(
        (a, b) => a[0] - b[0],
      )) {
        const fileList = nodes
          .map((n) => `\`${n.filePath || n.name}\``)
          .join(", ");
        lines.push(
          `| ${hop === 3 ? "3+" : String(hop)} | ${hopLabels[hop] ?? `Hop ${hop}`} | ${fileList} |`,
        );
      }

      lines.push("");
    }
  }

  // Risk Summary section
  lines.push("## Risk Summary");
  lines.push("");
  lines.push(`- **Total files analyzed:** ${buildResult.filesProcessed}`);
  lines.push(`- **Graph nodes:** ${buildResult.nodesCreated}`);
  lines.push(`- **Graph edges:** ${buildResult.edgesCreated}`);
  lines.push(
    `- **Communities detected:** ${communityResult?.communityCount ?? 0}`,
  );
  lines.push(
    `- **Modularity:** ${communityResult?.modularity?.toFixed(3) ?? "N/A"}`,
  );
  lines.push(`- **Danger zone files:** ${dangerZones.length}`);
  lines.push(`- **Build errors:** ${buildResult.errors.length}`);

  return lines.join("\n");
}
