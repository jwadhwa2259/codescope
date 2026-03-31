/**
 * Builds the reference index from the knowledge graph.
 *
 * For each non-noise file, finds the most similar same-role file using
 * 4-signal weighted similarity: convention density (40%), community
 * proximity (25%), directory proximity (20%), shared imports (15%).
 *
 * Returns a ReferenceIndex keyed by relative file path for O(1) hook lookups.
 * Per D-01, D-02, D-03, D-04.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import type { Database as DatabaseType } from "better-sqlite3";
import {
  loadGraphFromSQLite,
  runCommunityDetection,
} from "../graph/analytics.js";
import { classifyFileRole } from "../classifier/file-role.js";
import { isNoiseFile } from "../conventions/golden-files.js";
import { parseDetectorConventions } from "../conventions/parser.js";
import type { ReferenceIndex, ReferenceFileEntry } from "./types.js";

// ---- Similarity weights per D-02 ----

const W_CONV_DENSITY = 0.4;
const W_COMMUNITY = 0.25;
const W_DIRECTORY = 0.2;
const W_SHARED_IMPORTS = 0.15;

/**
 * Compute directory proximity between two file paths.
 * Returns a value 0-1 where 1.0 means same directory.
 * Uses shared path segments from root / max(segments of either).
 */
function directoryProximity(dirA: string, dirB: string): number {
  const partsA = dirA.split("/").filter(Boolean);
  const partsB = dirB.split("/").filter(Boolean);
  const maxLen = Math.max(partsA.length, partsB.length);
  if (maxLen === 0) return 1.0;

  let shared = 0;
  const minLen = Math.min(partsA.length, partsB.length);
  for (let i = 0; i < minLen; i++) {
    if (partsA[i] === partsB[i]) {
      shared++;
    } else {
      break;
    }
  }

  return shared / maxLen;
}

/**
 * Build reference index from the graph database.
 *
 * @param db - Open database connection with v2 schema
 * @param codescopeDir - Path to .claude/codescope/ directory
 * @returns ReferenceIndex with per-file reference data keyed by relative path
 */
export function buildReferenceIndex(
  db: DatabaseType,
  codescopeDir: string,
): ReferenceIndex {
  // Load graph and compute communities
  const graph = loadGraphFromSQLite(db);

  if (graph.order === 0) {
    return { generated: new Date().toISOString(), files: {} };
  }

  const { communities } = runCommunityDetection(graph, db);

  // Read and parse conventions for convention density computation
  const conventionsPath = path.join(codescopeDir, "conventions.md");
  let highConfConventions: Array<{ name: string; files: string[] }> = [];
  if (fs.existsSync(conventionsPath)) {
    const content = fs.readFileSync(conventionsPath, "utf-8");
    const parsed = parseDetectorConventions(content);
    highConfConventions = parsed
      .filter((c) => c.confidence === "HIGH-CONF")
      .map((c) => ({ name: c.name, files: c.files }));
  }

  // Collect file nodes and classify roles
  const fileNodes: Array<{
    nodeId: string;
    filePath: string;
    role: string;
    dirname: string;
  }> = [];

  graph.forEachNode((nodeId, attrs) => {
    if (attrs.kind !== "file") return;
    const filePath = (attrs.filePath as string) ?? "";
    if (!filePath || isNoiseFile(filePath)) return;

    const { role } = classifyFileRole(filePath);
    // Exclude test and config roles as noise
    if (role === "test" || role === "config" || role === "deprecated") return;

    fileNodes.push({
      nodeId,
      filePath,
      role,
      dirname: path.dirname(filePath).replace(/\\/g, "/"),
    });
  });

  // Build per-file convention density map
  // Count how many HIGH-CONF conventions each file follows
  const fileConvCount = new Map<string, number>();
  for (const conv of highConfConventions) {
    for (const f of conv.files) {
      fileConvCount.set(f, (fileConvCount.get(f) ?? 0) + 1);
    }
  }

  // Group files by role for scoped matching
  const roleGroups = new Map<string, typeof fileNodes>();
  for (const node of fileNodes) {
    const group = roleGroups.get(node.role) ?? [];
    group.push(node);
    roleGroups.set(node.role, group);
  }

  // Max convention count per role group (for normalization)
  const roleMaxConv = new Map<string, number>();
  for (const [role, group] of roleGroups) {
    let max = 0;
    for (const node of group) {
      const count = fileConvCount.get(node.filePath) ?? 0;
      if (count > max) max = count;
    }
    roleMaxConv.set(role, max);
  }

  // Build file import map: filePath -> Set<target filePaths>
  const fileImports = new Map<string, Set<string>>();
  const edges = db
    .prepare(
      `SELECT n1.file_path as source_path, n2.file_path as target_path
       FROM edges e
       JOIN nodes n1 ON e.source_id = n1.id
       JOIN nodes n2 ON e.target_id = n2.id
       WHERE e.kind = 'imports'`,
    )
    .all() as Array<{ source_path: string; target_path: string }>;

  for (const edge of edges) {
    const set = fileImports.get(edge.source_path) ?? new Set<string>();
    set.add(edge.target_path);
    fileImports.set(edge.source_path, set);
  }

  // Build file -> community map (use first node in file)
  const fileCommunity = new Map<string, number>();
  for (const node of fileNodes) {
    const cId = communities[node.nodeId];
    if (cId !== undefined) {
      fileCommunity.set(node.filePath, cId);
    }
  }

  // Compute pairwise similarity and find best reference per file
  const files: Record<string, ReferenceFileEntry> = {};

  for (const node of fileNodes) {
    // Determine candidate pool
    let candidates: typeof fileNodes;
    if (node.role === "general") {
      // "general" files compare against ALL non-noise files
      candidates = fileNodes;
    } else {
      candidates = roleGroups.get(node.role) ?? [];
    }

    // Need at least one other candidate
    if (candidates.length < 2 && candidates.some((c) => c.filePath === node.filePath)) {
      continue;
    }

    const maxConv = node.role === "general"
      ? Math.max(...[...roleMaxConv.values()], 1)
      : roleMaxConv.get(node.role) ?? 1;

    let bestScore = -1;
    let bestCandidate: (typeof fileNodes)[0] | null = null;

    for (const candidate of candidates) {
      if (candidate.filePath === node.filePath) continue; // No self-reference

      // Signal 1: Convention density similarity
      const nodeConvCount = fileConvCount.get(node.filePath) ?? 0;
      const candConvCount = fileConvCount.get(candidate.filePath) ?? 0;
      const nodeConvDensity = maxConv > 0 ? nodeConvCount / maxConv : 0;
      const candConvDensity = maxConv > 0 ? candConvCount / maxConv : 0;
      const convSimilarity = 1.0 - Math.abs(nodeConvDensity - candConvDensity);

      // Signal 2: Community proximity (1.0 if same, 0.0 otherwise)
      const nodeCommunity = fileCommunity.get(node.filePath);
      const candCommunity = fileCommunity.get(candidate.filePath);
      const communitySimilarity =
        nodeCommunity !== undefined &&
        candCommunity !== undefined &&
        nodeCommunity === candCommunity
          ? 1.0
          : 0.0;

      // Signal 3: Directory proximity
      const dirProximity = directoryProximity(node.dirname, candidate.dirname);

      // Signal 4: Shared imports
      const nodeImps = fileImports.get(node.filePath) ?? new Set<string>();
      const candImps = fileImports.get(candidate.filePath) ?? new Set<string>();
      const maxImps = Math.max(nodeImps.size, candImps.size);
      let sharedCount = 0;
      if (maxImps > 0) {
        for (const imp of nodeImps) {
          if (candImps.has(imp)) sharedCount++;
        }
      }
      const sharedImportSimilarity = maxImps > 0 ? sharedCount / maxImps : 0;

      // Weighted similarity
      const score =
        convSimilarity * W_CONV_DENSITY +
        communitySimilarity * W_COMMUNITY +
        dirProximity * W_DIRECTORY +
        sharedImportSimilarity * W_SHARED_IMPORTS;

      if (score > bestScore) {
        bestScore = score;
        bestCandidate = candidate;
      }
    }

    if (bestCandidate && bestScore > 0) {
      files[node.filePath] = {
        referencePath: bestCandidate.filePath,
        roleLabel: node.role,
        score: Math.round(bestScore * 1000) / 1000, // 3 decimal places
      };
    }
  }

  return {
    generated: new Date().toISOString(),
    files,
  };
}
