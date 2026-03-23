import { DirectedGraph } from "graphology";
import { loadGraphFromSQLite, computeCentrality } from "./analytics.js";
import { openDatabase, closeDatabase } from "./database.js";
import { getGraphDbPath } from "../utils/paths.js";
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
 *
 * First call loads graph from SQLite (~200ms), subsequent calls return
 * cached instance (~5ms). Cache expires after 5 minutes (TTL_MS).
 *
 * Per D-21: Graph-querying tools use lazy-load + cache with 5-minute TTL.
 * Per GRPH-05: Graph queries < 100ms (after initial load).
 *
 * @throws Error if graph.db does not exist at the expected path
 */
export function getGraph(projectRoot: string): CachedGraph {
  const now = Date.now();

  // Return cached if valid and not expired
  if (cached !== null && now - cached.loadedAt < TTL_MS) {
    return cached;
  }

  const dbPath = getGraphDbPath(projectRoot);
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
