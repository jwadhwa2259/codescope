import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  isBootstrapped,
  errorResponse,
  okResponse,
  buildMetadata,
} from "./helpers.js";
import { openDatabase, closeDatabase } from "../graph/database.js";
import { getGraphDbPath } from "../utils/paths.js";
import {
  getLatestSnapshot,
  getSnapshotNear,
  type ReadinessSnapshot,
} from "../graph/readiness-history.js";

// ---------------------------------------------------------------------------
// Trend direction
// ---------------------------------------------------------------------------

/**
 * Determines trend direction from two percentage values.
 *
 * - Within 1 point: "stable" (noise)
 * - Current > previous: "improving"
 * - Current < previous: "declining"
 */
export function trendDirection(
  current: number,
  previous: number,
): "improving" | "declining" | "stable" {
  const delta = current - previous;
  if (Math.abs(delta) <= 1) return "stable";
  if (delta > 0) return "improving";
  return "declining";
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TrendComparison {
  label: string; // "vs_previous", "vs_7_days_ago", "vs_30_days_ago"
  snapshot: ReadinessSnapshot | null;
  deltas: {
    overall_percent: number;
    convention_coverage: number;
    type_safety: number;
    test_coverage_proxy: number;
    import_graph_health: number;
  } | null;
  trend: "improving" | "declining" | "stable" | null;
}

// ---------------------------------------------------------------------------
// Comparison builder
// ---------------------------------------------------------------------------

function buildComparison(
  label: string,
  current: ReadinessSnapshot,
  other: ReadinessSnapshot | null,
): TrendComparison {
  if (other === null) {
    return { label, snapshot: null, deltas: null, trend: null };
  }

  return {
    label,
    snapshot: other,
    deltas: {
      overall_percent: current.overall_percent - other.overall_percent,
      convention_coverage:
        current.convention_coverage - other.convention_coverage,
      type_safety: current.type_safety - other.type_safety,
      test_coverage_proxy:
        current.test_coverage_proxy - other.test_coverage_proxy,
      import_graph_health:
        current.import_graph_health - other.import_graph_health,
    },
    trend: trendDirection(current.overall_percent, other.overall_percent),
  };
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

/**
 * Core trends logic, extracted for testability without MCP transport.
 *
 * Returns three period comparisons per D-12:
 * 1. vs_previous: current vs the snapshot right before it
 * 2. vs_7_days_ago: current vs snapshot nearest to 7 days ago
 * 3. vs_30_days_ago: current vs snapshot nearest to 30 days ago
 *
 * Each comparison includes per-dimension deltas and overall trend direction.
 */
export async function handleTrends(
  projectRoot: string,
): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  const startMs = Date.now();

  // Guard: must be bootstrapped
  if (!isBootstrapped(projectRoot)) {
    return errorResponse(
      "NOT_BOOTSTRAPPED",
      "No bootstrap data found. Run /codescope:bootstrap first.",
      "Run /codescope:bootstrap to analyze your codebase.",
    );
  }

  const db = openDatabase(getGraphDbPath(projectRoot));
  try {
    // Get current (latest) snapshot
    const current = getLatestSnapshot(db);
    if (current === null) {
      return errorResponse(
        "NO_HISTORY",
        "No readiness history found. Run /codescope:bootstrap first.",
        "Run /codescope:bootstrap to start tracking readiness trends.",
      );
    }

    // Get previous snapshot (second most recent)
    const previous = db
      .prepare(
        "SELECT * FROM readiness_history ORDER BY timestamp DESC LIMIT 1 OFFSET 1",
      )
      .get() as ReadinessSnapshot | undefined;

    // Get snapshot nearest to 7 days ago
    const weekAgo = getSnapshotNear(
      db,
      new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
    );

    // Get snapshot nearest to 30 days ago
    const monthAgo = getSnapshotNear(
      db,
      new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
    );

    // Build comparisons
    const previousComparison = buildComparison(
      "vs_previous",
      current,
      previous ?? null,
    );
    const weekComparison = buildComparison(
      "vs_7_days_ago",
      current,
      weekAgo,
    );
    const monthComparison = buildComparison(
      "vs_30_days_ago",
      current,
      monthAgo,
    );

    // Get total snapshot count
    const countRow = db
      .prepare("SELECT COUNT(*) as count FROM readiness_history")
      .get() as { count: number };

    // D-12: Notice when comparing snapshots across scoring versions
    const notices: string[] = [];
    const comparisons = [previousComparison, weekComparison, monthComparison];
    for (const comp of comparisons) {
      if (
        comp.snapshot !== null &&
        (current.scoring_version ?? 1) !==
          (comp.snapshot.scoring_version ?? 1)
      ) {
        notices.push(
          "Scoring methodology updated -- pre-update snapshots used estimation-based formulas. " +
            "Direct comparison may not be meaningful.",
        );
        break; // One notice is enough
      }
    }

    const data = {
      current: {
        timestamp: current.timestamp,
        overall_grade: current.overall_grade,
        overall_percent: current.overall_percent,
        dimensions: {
          convention_coverage: current.convention_coverage,
          type_safety: current.type_safety,
          test_coverage_proxy: current.test_coverage_proxy,
          import_graph_health: current.import_graph_health,
        },
        scoring_version: current.scoring_version ?? 1,
      },
      comparisons,
      snapshot_count: countRow.count,
      ...(notices.length > 0 ? { notices } : {}),
    };

    return okResponse(data, buildMetadata(projectRoot, startMs));
  } finally {
    closeDatabase(db);
  }
}

// ---------------------------------------------------------------------------
// MCP Registration
// ---------------------------------------------------------------------------

/**
 * Register the codescope_trends tool on the MCP server.
 *
 * Per D-35: Rich description with use-case context and related tools.
 */
export function registerTrendsTool(
  server: McpServer,
  projectRoot: string,
): void {
  server.tool(
    "codescope_trends",
    "Get readiness trend data showing how your codebase health changes over time. Returns the current readiness snapshot with three comparisons: vs. previous snapshot, vs. 7 days ago, vs. 30 days ago. Each comparison includes per-dimension deltas and trend direction (improving/declining/stable). Related tools: codescope_readiness.",
    {},
    async () => {
      return handleTrends(projectRoot);
    },
  );
}
