import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod/v4";
import { handleReview } from "./handler.js";

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
