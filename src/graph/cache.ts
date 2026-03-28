import { DirectedGraph } from "graphology";
import { loadGraphFromSQLite, computeCentrality } from "./analytics.js";
import { openDatabase, closeDatabase } from "./database.js";
import { getGraphDbPath } from "../utils/paths.js";
import { getStaleFiles } from "./file-hash.js";
import { rebuildStaleFiles } from "./incremental.js";
import * as fs from "node:fs";

/**
 * Cached graph data structure containing the graphology instance
 * and pre-computed centrality scores.
 */
export interface CachedGraph {
  graph: DirectedGraph;
  centralities: Map<string, number>;
  loadedAt: number;
}

/** Cache TTL: 5 minutes */
const TTL_MS = 5 * 60 * 1000;

/** Module-level cache state */
let cached: CachedGraph | null = null;

/**
 * Returns the cached graph, loading from SQLite if not cached or TTL expired.
 * Optionally checks staleness for specific queried files and triggers
 * incremental rebuild before returning results.
 *
 * Per D-01: Staleness checks on EVERY tool call (when queriedFiles provided).
 * Per D-03: Scoped to queried files only, not the full source tree.
 * Per D-04: Stale files block the response until reparsed.
 * Per D-21: Graph-querying tools use lazy-load + cache with 5-minute TTL.
 * Per GRPH-05: Graph queries < 100ms (after initial load).
 *
 * @param projectRoot - Project root directory
 * @param queriedFiles - Optional file paths (relative) to check for staleness.
 *   When provided, staleness check ALWAYS runs even if cache is valid.
 *   When not provided, returns cached data if TTL hasn't expired.
 * @throws Error if graph.db does not exist at the expected path
 */
export async function getGraph(
  projectRoot: string,
  queriedFiles?: string[]
): Promise<CachedGraph> {
  const now = Date.now();
  const dbPath = getGraphDbPath(projectRoot);

  // If queriedFiles provided, ALWAYS check staleness even if cache is valid
  if (queriedFiles && queriedFiles.length > 0) {
    if (!fs.existsSync(dbPath)) {
      throw new Error(
        `Graph database not found at ${dbPath}. Run /codescope:bootstrap to analyze your codebase.`,
      );
    }

    const db = openDatabase(dbPath);
    try {
      const staleFiles = getStaleFiles(db, queriedFiles, projectRoot);
      if (staleFiles.length > 0) {
        // Rebuild stale files -- blocks until reparsed (D-04)
        await rebuildStaleFiles(db, staleFiles, projectRoot);
        // invalidateCache() was called inside rebuildStaleFiles,
        // so cached is now null -- will fall through to reload below
      }
    } finally {
      closeDatabase(db);
    }
  }

  // Return cached if valid and not expired
  if (cached !== null && now - cached.loadedAt < TTL_MS) {
    return cached;
  }

  if (!fs.existsSync(dbPath)) {
    throw new Error(
      `Graph database not found at ${dbPath}. Run /codescope:bootstrap to analyze your codebase.`,
    );
  }

  const db = openDatabase(dbPath);
  try {
    const graph = loadGraphFromSQLite(db);
    const centralityResult = computeCentrality(graph);

    cached = {
      graph,
      centralities: centralityResult.centralities,
      loadedAt: Date.now(),
    };

    return cached;
  } finally {
    closeDatabase(db);
  }
}

/**
 * Invalidates the cached graph, forcing a reload on next getGraph() call.
 * Called after bootstrap re-run or when cache needs to be refreshed.
 */
export function invalidateCache(): void {
  cached = null;
}
