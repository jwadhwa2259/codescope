import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerStatusTool } from "./status.js";
import { registerRecallTool } from "./recall.js";
import { registerGraphQueryTool } from "./graph-query.js";
import { registerBlastRadiusTool } from "./blast-radius.js";
import { registerConventionsTool } from "./conventions.js";
import { registerOrientTool } from "./orient.js";
import { registerVerifyTool } from "./verify.js";
import { registerSearchTool } from "./search.js";
import { registerReadinessTool } from "./readiness-tool.js";
import { registerDetectChangesTool } from "./detect-changes.js";
import { registerServiceMapTool } from "./service-map.js";
import { registerEvalTool } from "./eval.js";
import { registerTrendsTool } from "./trends-tool.js";
import { registerPredictImpactTool } from "./impact-prediction.js";
import { registerReviewTool } from "./review/index.js";

/**
 * Register all 15 CodeScope MCP tools on the server.
 *
 * Each tool handler checks isBootstrapped() internally and returns
 * NOT_BOOTSTRAPPED error if no data exists. No stubs needed.
 *
 * Tools:
 * 1.  codescope_status          - Health check (always functional)
 * 2.  codescope_recall          - Retrieve conventions, learnings, overview by topic
 * 3.  codescope_graph_query     - Query knowledge graph neighbors, paths, communities
 * 4.  codescope_blast_radius    - BFS blast radius from a file
 * 5.  codescope_conventions     - Get detected conventions for files/modules
 * 6.  codescope_orient          - Lightweight task orientation brief
 * 7.  codescope_verify          - Convention compliance check (Phase 3 partial)
 * 8.  codescope_search          - Graph-based code search (Phase 3 partial)
 * 9.  codescope_readiness       - AI readiness score
 * 10. codescope_detect_changes  - Classify working directory changes by risk
 * 11. codescope_service_map     - Service map for monorepos
 * 12. codescope_eval            - Evaluate code changes against criteria (Phase 6)
 * 13. codescope_trends          - Readiness trend data with period comparisons (Phase 9)
 * 14. codescope_predict_impact  - Reverse blast radius impact prediction (Phase 11)
 * 15. codescope_review         - Structural impact analysis for PRs and changes (Phase 11)
 */
export function registerTools(
  server: McpServer,
  projectRoot: string,
): void {
  // Status tool always functional (no bootstrap required)
  registerStatusTool(server, projectRoot);

  // All 11 real tools -- each checks isBootstrapped() internally
  registerRecallTool(server, projectRoot);
  registerGraphQueryTool(server, projectRoot);
  registerBlastRadiusTool(server, projectRoot);
  registerConventionsTool(server, projectRoot);
  registerOrientTool(server, projectRoot);
  registerVerifyTool(server, projectRoot);
  registerSearchTool(server, projectRoot);
  registerReadinessTool(server, projectRoot);
  registerDetectChangesTool(server, projectRoot);
  registerServiceMapTool(server, projectRoot);
  registerEvalTool(server, projectRoot);
  registerTrendsTool(server, projectRoot);
  registerPredictImpactTool(server, projectRoot);
  registerReviewTool(server, projectRoot);
}
