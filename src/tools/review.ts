import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod/v4";
import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { getGraph } from "../graph/cache.js";
import { blastRadius } from "../graph/analytics.js";
import { openDatabase, closeDatabase } from "../graph/database.js";
import { getGraphDbPath, getCodescopePath } from "../utils/paths.js";
import {
  okResponse,
  errorResponse,
  isBootstrapped,
  buildMetadata,
} from "./helpers.js";

// ---- Constants ----

/** Centrality threshold for HIGH risk classification */
const HIGH_RISK_THRESHOLD = 0.7;

/** Centrality threshold for MEDIUM risk classification */
const MEDIUM_RISK_THRESHOLD = 0.3;

/** Maximum neighbors to expand for cycle detection per Pitfall 6 */
const MAX_NEIGHBOR_EXPANSION = 50;

// ---- Types ----

type RiskTier = "HIGH" | "MEDIUM" | "LOW";

interface ParsedConvention {
  name: string;
  adoption_pct: number;
  confidence: string;
  category: string;
  files: string[];
  evidence: string[];
}

interface DiffResolution {
  files: string[];
  diffText: string;
  source: string;
}

interface DiffError {
  error: true;
  code: string;
  message: string;
  recovery: string;
}

// ---- Internal Helpers (duplicated from detect-changes.ts for isolation) ----

/**
 * Classify risk based on centrality score.
 * Per D-07: HIGH (>0.7), MEDIUM (0.3-0.7), LOW (<0.3)
 */
function classifyRisk(centrality: number): RiskTier {
  if (centrality > HIGH_RISK_THRESHOLD) return "HIGH";
  if (centrality >= MEDIUM_RISK_THRESHOLD) return "MEDIUM";
  return "LOW";
}

/**
 * Parse file paths from a git diff string.
 * Extracts paths from "diff --git a/path b/path" lines.
 */
function parseFilesFromDiff(diff: string): string[] {
  const files = new Set<string>();
  const lines = diff.split("\n");

  for (const line of lines) {
    const match = line.match(/^diff --git a\/(.+?) b\/(.+?)$/);
    if (match) {
      files.add(match[2]);
    }
  }

  return Array.from(files);
}

/**
 * Get changed files from git diff in the working directory.
 */
function getWorkingDirChanges(projectRoot: string): string[] {
  try {
    const output = execFileSync("git", ["diff", "--name-only", "HEAD"], {
      cwd: projectRoot,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    });
    return output
      .trim()
      .split("\n")
      .filter((line) => line.length > 0);
  } catch {
    return [];
  }
}

/**
 * Detect the default branch for the repository.
 * Tries symbolic-ref first, then falls back to common names.
 */
function detectDefaultBranch(projectRoot: string): string {
  try {
    const ref = execFileSync(
      "git",
      ["symbolic-ref", "refs/remotes/origin/HEAD", "--short"],
      {
        cwd: projectRoot,
        encoding: "utf-8",
        stdio: ["pipe", "pipe", "pipe"],
      },
    ).trim();
    // ref is like "origin/main" -- strip "origin/" prefix
    return ref.replace(/^origin\//, "");
  } catch {
    // Fallback: try common names
    try {
      execFileSync("git", ["rev-parse", "--verify", "main"], {
        cwd: projectRoot,
        encoding: "utf-8",
        stdio: ["pipe", "pipe", "pipe"],
      });
      return "main";
    } catch {
      return "master";
    }
  }
}

/**
 * Resolve diff input through the priority chain per D-03:
 * explicit diff > PR number > branch name > working tree
 */
function resolveDiff(
  args: Record<string, unknown>,
  projectRoot: string,
): DiffResolution | DiffError {
  // 1. Explicit diff string provided
  if (args.diff && typeof args.diff === "string") {
    return {
      files: parseFilesFromDiff(args.diff),
      diffText: args.diff,
      source: "diff",
    };
  }

  // 2. PR number (via gh CLI)
  if (args.pr_number !== undefined && args.pr_number !== null) {
    const prNum = Number(args.pr_number);
    if (!Number.isInteger(prNum) || prNum <= 0) {
      return {
        error: true,
        code: "INVALID_PR_NUMBER",
        message: `Invalid PR number: ${args.pr_number}. Must be a positive integer.`,
        recovery: "Provide a valid PR number, branch name, or diff string.",
      };
    }

    try {
      const diff = execFileSync("gh", ["pr", "diff", String(prNum)], {
        cwd: projectRoot,
        encoding: "utf-8",
        maxBuffer: 50 * 1024 * 1024,
        stdio: ["pipe", "pipe", "pipe"],
      });
      return {
        files: parseFilesFromDiff(diff),
        diffText: diff,
        source: "pr",
      };
    } catch {
      return {
        error: true,
        code: "GH_CLI_UNAVAILABLE",
        message:
          "Failed to retrieve PR diff. The gh CLI may not be installed or authenticated.",
        recovery: "Use branch name or working tree diff instead.",
      };
    }
  }

  // 3. Branch name (via git diff)
  if (args.branch && typeof args.branch === "string") {
    const branch = args.branch;
    // Validate branch name to prevent injection
    if (!/^[a-zA-Z0-9._\/-]+$/.test(branch)) {
      return {
        error: true,
        code: "INVALID_BRANCH_NAME",
        message: `Invalid branch name: "${branch}". Branch names must match [a-zA-Z0-9._/-]+.`,
        recovery: "Provide a valid branch name.",
      };
    }

    const baseBranch = detectDefaultBranch(projectRoot);
    try {
      const diffText = execFileSync(
        "git",
        ["diff", `${baseBranch}...${branch}`],
        {
          cwd: projectRoot,
          encoding: "utf-8",
          maxBuffer: 50 * 1024 * 1024,
          stdio: ["pipe", "pipe", "pipe"],
        },
      );

      return {
        files: parseFilesFromDiff(diffText),
        diffText,
        source: "branch",
      };
    } catch {
      return {
        error: true,
        code: "BRANCH_DIFF_FAILED",
        message: `Failed to compute diff for branch "${branch}" against "${baseBranch}".`,
        recovery:
          "Check that the branch exists and try again, or provide a diff string directly.",
      };
    }
  }

  // 4. Working tree diff (default)
  return {
    files: getWorkingDirChanges(projectRoot),
    diffText: "",
    source: "working_tree",
  };
}

/**
 * Parse conventions.md into structured convention objects.
 * Duplicated from conventions.ts for isolation.
 */
function parseConventions(content: string): ParsedConvention[] {
  const conventions: ParsedConvention[] = [];
  const sections = content.split(/^## /m).filter((s) => s.trim().length > 0);

  for (const section of sections) {
    const lines = section.split("\n");

    let name = "";
    let adoption = 0;
    let confidence = "";
    let category = "";
    let files: string[] = [];
    const evidence: string[] = [];
    let inEvidence = false;

    for (const line of lines) {
      const trimmed = line.trim();

      if (trimmed.startsWith("**Convention:**")) {
        name = trimmed.replace("**Convention:**", "").trim();
        inEvidence = false;
      } else if (trimmed.startsWith("**Adoption:**")) {
        const pctStr = trimmed.replace("**Adoption:**", "").trim();
        adoption = parseInt(pctStr.replace("%", ""), 10) || 0;
        inEvidence = false;
      } else if (trimmed.startsWith("**Confidence:**")) {
        confidence = trimmed.replace("**Confidence:**", "").trim();
        inEvidence = false;
      } else if (trimmed.startsWith("**Category:**")) {
        category = trimmed.replace("**Category:**", "").trim();
        inEvidence = false;
      } else if (trimmed.startsWith("**Files:**")) {
        const fileStr = trimmed.replace("**Files:**", "").trim();
        files = fileStr
          .split(",")
          .map((f) => f.trim())
          .filter((f) => f.length > 0);
        inEvidence = false;
      } else if (trimmed.startsWith("**Evidence:**")) {
        inEvidence = true;
      } else if (inEvidence && trimmed.startsWith("-")) {
        evidence.push(trimmed.replace(/^-\s*/, "").trim());
      } else if (inEvidence && trimmed === "") {
        inEvidence = false;
      }
    }

    if (name) {
      conventions.push({
        name,
        adoption_pct: adoption,
        confidence,
        category,
        files,
        evidence,
      });
    }
  }

  return conventions;
}

/**
 * Get community assignments for file node IDs from SQLite.
 */
function getFileCommunities(
  db: { prepare: (sql: string) => { all: (...args: unknown[]) => unknown[] } },
  nodeIds: string[],
): Map<string, { communityId: number; label: string }> {
  if (nodeIds.length === 0) {
    return new Map();
  }

  const placeholders = nodeIds.map(() => "?").join(",");
  const rows = db
    .prepare(
      `SELECT node_id, community_id, modularity_class
       FROM communities WHERE node_id IN (${placeholders})`,
    )
    .all(...nodeIds.map(Number)) as Array<{
    node_id: number;
    community_id: number;
    modularity_class: string;
  }>;

  const map = new Map<string, { communityId: number; label: string }>();
  for (const row of rows) {
    map.set(String(row.node_id), {
      communityId: row.community_id,
      label: row.modularity_class,
    });
  }
  return map;
}

/**
 * Get edges involving changed files from SQLite.
 */
function getEdgesForFiles(
  db: { prepare: (sql: string) => { all: (...args: unknown[]) => unknown[] } },
  changedFiles: string[],
): Array<{
  source: string;
  target: string;
  kind: string;
}> {
  if (changedFiles.length === 0) {
    return [];
  }

  const placeholders = changedFiles.map(() => "?").join(",");
  const rows = db
    .prepare(
      `SELECT e.source_id, e.target_id, e.kind,
              src.file_path AS source_path, tgt.file_path AS target_path
       FROM edges e
       JOIN nodes src ON e.source_id = src.id
       JOIN nodes tgt ON e.target_id = tgt.id
       WHERE src.file_path IN (${placeholders}) OR tgt.file_path IN (${placeholders})`,
    )
    .all(...changedFiles, ...changedFiles) as Array<{
    source_id: number;
    target_id: number;
    kind: string;
    source_path: string;
    target_path: string;
  }>;

  return rows.map((row) => ({
    source: row.source_path,
    target: row.target_path,
    kind: row.kind,
  }));
}

/**
 * Get node IDs for file paths from SQLite.
 */
function getNodeIdsForFiles(
  db: { prepare: (sql: string) => { all: (...args: unknown[]) => unknown[] } },
  filePaths: string[],
): Map<string, string> {
  if (filePaths.length === 0) {
    return new Map();
  }

  const placeholders = filePaths.map(() => "?").join(",");
  const rows = db
    .prepare(
      `SELECT id, file_path FROM nodes WHERE file_path IN (${placeholders})`,
    )
    .all(...filePaths) as Array<{ id: number; file_path: string }>;

  const map = new Map<string, string>();
  for (const row of rows) {
    map.set(row.file_path, String(row.id));
  }
  return map;
}

/**
 * DFS cycle detection on a subgraph starting from changed file nodes.
 * Per D-10: only returns cycles that include at least one changed file node.
 *
 * @param graph - The graphology DirectedGraph
 * @param startNodeIds - Node IDs of changed files
 * @param nodeIdToFilePath - Map from node ID to file path for output
 * @returns Array of cycle paths (as file path arrays)
 */
function detectCycles(
  graph: import("graphology").DirectedGraph,
  startNodeIds: string[],
  nodeIdToFilePath: Map<string, string>,
): string[][] {
  const cycles: string[][] = [];
  const globalVisited = new Set<string>();
  const changedSet = new Set(startNodeIds);

  // Collect start nodes + immediate neighbors (capped at MAX_NEIGHBOR_EXPANSION per node)
  const subgraphNodes = new Set<string>(startNodeIds);
  for (const nodeId of startNodeIds) {
    if (!graph.hasNode(nodeId)) continue;
    let neighborCount = 0;
    graph.forEachOutNeighbor(nodeId, (neighbor) => {
      if (neighborCount < MAX_NEIGHBOR_EXPANSION) {
        subgraphNodes.add(neighbor);
        neighborCount++;
      }
    });
  }

  function dfs(
    node: string,
    pathArr: string[],
    inStack: Set<string>,
  ): void {
    if (inStack.has(node)) {
      // Found cycle: extract cycle from path
      const cycleStart = pathArr.indexOf(node);
      if (cycleStart >= 0) {
        const cyclePath = pathArr.slice(cycleStart);
        // Only include cycles that have at least one changed file node
        const hasChangedNode = cyclePath.some((n) => changedSet.has(n));
        if (hasChangedNode) {
          // Convert node IDs to file paths
          const filePathCycle = cyclePath.map(
            (n) => nodeIdToFilePath.get(n) ?? n,
          );
          cycles.push(filePathCycle);
        }
      }
      return;
    }
    if (globalVisited.has(node)) return;
    if (!subgraphNodes.has(node)) return;

    globalVisited.add(node);
    inStack.add(node);
    pathArr.push(node);

    if (graph.hasNode(node)) {
      graph.forEachOutNeighbor(node, (neighbor) => {
        if (subgraphNodes.has(neighbor)) {
          dfs(neighbor, [...pathArr], new Set(inStack));
        }
      });
    }

    inStack.delete(node);
  }

  for (const node of startNodeIds) {
    if (!globalVisited.has(node)) {
      dfs(node, [], new Set());
    }
  }

  return cycles;
}

// ---- Main Handler ----

/**
 * Core handler for codescope_review.
 * Extracted from MCP registration for unit testing without transport.
 *
 * Performs structural impact analysis on diffs:
 * - Per-file risk scoring (REVIEW-01 / D-07)
 * - Dependency edge reporting (REVIEW-02 / D-09)
 * - Circular dependency detection (REVIEW-02 / D-10)
 * - Convention compliance checking (REVIEW-03)
 * - Cross-community analysis (D-08)
 */
export async function handleReview(
  args: Record<string, unknown>,
  projectRoot: string,
): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  const startMs = Date.now();

  // Guard: NOT_BOOTSTRAPPED
  if (!isBootstrapped(projectRoot)) {
    return errorResponse(
      "NOT_BOOTSTRAPPED",
      "No bootstrap data found. The knowledge graph has not been built yet.",
      "Run /codescope:bootstrap to analyze your codebase.",
    );
  }

  // Resolve diff input per D-03
  const resolved = resolveDiff(args, projectRoot);
  if ("error" in resolved && resolved.error === true) {
    return errorResponse(resolved.code, resolved.message, resolved.recovery);
  }

  const diffResult = resolved as DiffResolution;
  const changedFiles = diffResult.files;

  try {
    // Get graph with staleness check for changed files
    const cached = await getGraph(projectRoot, changedFiles);
    const graph = cached.graph;
    const centralities = cached.centralities;

    // ---- Step 1: Per-file risk scoring (REVIEW-01) ----
    const fileResults: Array<{
      path: string;
      risk: RiskTier;
      centrality: number;
      blast_radius_count: number;
    }> = [];

    for (const filePath of changedFiles) {
      const matchingNodes = graph.filterNodes(
        (_n: string, attr: Record<string, unknown>) =>
          attr.filePath === filePath && attr.kind === "file",
      );

      if (matchingNodes.length > 0) {
        const nodeId = matchingNodes[0];
        const centrality = centralities.get(nodeId) ?? 0;
        const risk = classifyRisk(centrality);
        const blastNodes = blastRadius(graph, nodeId, 4);
        const blastCount = blastNodes.length;

        fileResults.push({
          path: filePath,
          risk,
          centrality,
          blast_radius_count: blastCount,
        });
      } else {
        // File not in graph: LOW risk, 0 centrality, 0 blast radius
        fileResults.push({
          path: filePath,
          risk: "LOW",
          centrality: 0,
          blast_radius_count: 0,
        });
      }
    }

    // Build summary
    const summary = {
      total_files: fileResults.length,
      high_risk: fileResults.filter((r) => r.risk === "HIGH").length,
      medium_risk: fileResults.filter((r) => r.risk === "MEDIUM").length,
      low_risk: fileResults.filter((r) => r.risk === "LOW").length,
    };

    // ---- Step 2: Dependency change detection (REVIEW-02 / D-09) ----
    const dbPath = getGraphDbPath(projectRoot);
    const db = openDatabase(dbPath);

    let newEdges: Array<{ source: string; target: string; kind: string }> = [];
    let circularDependencies: string[][] = [];

    try {
      // Query edges involving changed files
      newEdges = getEdgesForFiles(db, changedFiles);

      // ---- Step 3: Circular dependency detection (D-10) ----
      // Get node IDs for changed files
      const nodeIdMap = getNodeIdsForFiles(db, changedFiles);

      // Build reverse map for cycle output
      const nodeIdToFilePath = new Map<string, string>();
      for (const [filePath, nodeId] of nodeIdMap.entries()) {
        nodeIdToFilePath.set(nodeId, filePath);
      }
      // Also add all graph nodes for cycle path conversion
      graph.forEachNode((nodeId: string, attrs: Record<string, unknown>) => {
        if (attrs.filePath) {
          nodeIdToFilePath.set(nodeId, attrs.filePath as string);
        }
      });

      const changedNodeIds = Array.from(nodeIdMap.values());
      circularDependencies = detectCycles(
        graph,
        changedNodeIds,
        nodeIdToFilePath,
      );

      // ---- Step 4: Convention compliance (REVIEW-03) ----
      const csPath = getCodescopePath(projectRoot);
      const conventionsPath = path.join(csPath, "conventions.md");

      let conventionViolations: Array<{
        file: string;
        convention: string;
        adoption_pct: number;
        confidence: string;
        evidence: string[];
      }> = [];

      if (fs.existsSync(conventionsPath)) {
        const content = fs.readFileSync(conventionsPath, "utf-8");
        const allConventions = parseConventions(content);

        for (const conv of allConventions) {
          for (const changedFile of changedFiles) {
            if (conv.files.some((f) => f.includes(changedFile) || changedFile.includes(f))) {
              conventionViolations.push({
                file: changedFile,
                convention: conv.name,
                adoption_pct: conv.adoption_pct,
                confidence: conv.confidence,
                evidence: conv.evidence,
              });
            }
          }
        }
      }

      // ---- Step 5: Cross-community analysis (D-08) ----
      const allNodeIds = changedNodeIds;
      const communityMap = getFileCommunities(db, allNodeIds);

      // Group files by community
      const communityGroups = new Map<
        number,
        { label: string; files: string[] }
      >();

      for (const [nodeId, info] of communityMap.entries()) {
        const filePath = nodeIdToFilePath.get(nodeId);
        if (!filePath) continue;

        if (!communityGroups.has(info.communityId)) {
          communityGroups.set(info.communityId, {
            label: info.label,
            files: [],
          });
        }
        communityGroups.get(info.communityId)!.files.push(filePath);
      }

      const communitiesTouched = communityGroups.size;
      const communityBreakdown = Array.from(communityGroups.entries()).map(
        ([communityId, group]) => ({
          community_id: communityId,
          label: group.label,
          files: group.files,
        }),
      );

      // ---- Build response (D-01) ----
      const reviewData = {
        summary,
        files: fileResults,
        dependency_changes: {
          new_edges: newEdges,
          removed_edges: [] as Array<{
            source: string;
            target: string;
            kind: string;
          }>,
          circular_dependencies: circularDependencies,
        },
        convention_violations: conventionViolations,
        cross_community_changes: {
          communities_touched: communitiesTouched,
          flagged: communitiesTouched >= 3,
          community_breakdown: communityBreakdown,
        },
      };

      return okResponse(reviewData, buildMetadata(projectRoot, startMs));
    } finally {
      closeDatabase(db);
    }
  } catch (err) {
    return errorResponse(
      "REVIEW_FAILED",
      `Failed to perform review: ${err instanceof Error ? err.message : String(err)}`,
      "Run /codescope:bootstrap to rebuild the knowledge graph.",
    );
  }
}

// ---- MCP Registration ----

/**
 * Register the codescope_review MCP tool on the server.
 *
 * Structural impact analysis for PRs and code changes. Analyzes git diffs
 * for per-file risk scores, dependency edge changes, circular dependency
 * detection, convention compliance violations, and cross-community boundary
 * crossings.
 */
export function registerReviewTool(
  server: McpServer,
  projectRoot: string,
): void {
  server.tool(
    "codescope_review",
    "Structural impact analysis for PRs and code changes. Analyzes git diffs for per-file risk scores, dependency edge changes, circular dependency detection, convention compliance violations, and cross-community boundary crossings. Related tools: codescope_predict_impact, codescope_detect_changes, codescope_blast_radius.",
    {
      pr_number: z
        .number()
        .int()
        .positive()
        .optional()
        .describe("GitHub PR number to review (requires gh CLI)"),
      branch: z
        .string()
        .optional()
        .describe("Branch name to diff against default branch"),
      diff: z
        .string()
        .optional()
        .describe("Raw git diff string to analyze"),
    },
    async (args) => handleReview(args as Record<string, unknown>, projectRoot),
  );
}
