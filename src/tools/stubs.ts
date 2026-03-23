import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod/v4";

/**
 * Stub tool definition for registration before bootstrap.
 */
export interface StubToolDef {
  name: string;
  description: string;
  inputSchema: Record<string, z.ZodType>;
}

/**
 * Build the standard "not bootstrapped" MCP response for a stub tool.
 */
export function makeStubResponse(toolName: string) {
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify({
          status: "not_bootstrapped",
          message: "Run /codescope:bootstrap first",
          tool: toolName,
        }),
      },
    ],
  };
}

/**
 * The 10 stub tool definitions with their Zod input schemas (per D-48).
 */
export const STUB_TOOLS: StubToolDef[] = [
  {
    name: "codescope_recall",
    description:
      "Retrieve conventions, learnings, overview for a topic",
    inputSchema: {
      topic: z.string().describe("Topic to recall information about"),
    },
  },
  {
    name: "codescope_graph_query",
    description:
      "Query the knowledge graph for neighbors, paths, or communities",
    inputSchema: {
      query_type: z
        .enum(["neighbors", "paths", "communities"])
        .describe("Type of graph query"),
      node_id: z.number().optional().describe("Node ID to query from"),
      file_path: z.string().optional().describe("File path to query from"),
    },
  },
  {
    name: "codescope_blast_radius",
    description:
      "Compute the blast radius of changes to a file via graph traversal",
    inputSchema: {
      file_path: z.string().describe("File to compute blast radius for"),
      max_hops: z
        .number()
        .int()
        .min(1)
        .max(10)
        .optional()
        .describe("Maximum BFS hops from the file"),
    },
  },
  {
    name: "codescope_conventions",
    description:
      "Get detected conventions for a file or module",
    inputSchema: {
      file_path: z
        .string()
        .optional()
        .describe("File to check conventions for"),
      module: z
        .string()
        .optional()
        .describe("Module to check conventions for"),
    },
  },
  {
    name: "codescope_orient",
    description:
      "Get orientation context for a task including graph analysis and conventions",
    inputSchema: {
      task: z.string().describe("Task description to orient on"),
    },
  },
  {
    name: "codescope_verify",
    description:
      "Run verification checks for a completed task",
    inputSchema: {
      task_slug: z.string().describe("Task slug to verify"),
      checks: z
        .array(z.string())
        .optional()
        .describe("Specific checks to run"),
    },
  },
  {
    name: "codescope_search",
    description:
      "Search the codebase using graph, text, or hybrid search",
    inputSchema: {
      query: z.string().describe("Search query"),
      search_type: z
        .enum(["graph", "text", "hybrid"])
        .optional()
        .describe("Type of search to perform"),
    },
  },
  {
    name: "codescope_readiness",
    description:
      "Check codebase readiness for AI-assisted changes",
    inputSchema: {},
  },
  {
    name: "codescope_detect_changes",
    description:
      "Detect and classify changes in the working directory",
    inputSchema: {
      diff: z
        .string()
        .optional()
        .describe("Git diff to analyze instead of working directory"),
    },
  },
  {
    name: "codescope_service_map",
    description:
      "Get the service map for a monorepo or project structure",
    inputSchema: {},
  },
];

/**
 * Register all 10 stub tools on the MCP server.
 * Each returns a structured "not_bootstrapped" error until bootstrap completes.
 */
export function registerStubTools(server: McpServer): void {
  for (const tool of STUB_TOOLS) {
    server.tool(
      tool.name,
      tool.description,
      tool.inputSchema,
      async () => makeStubResponse(tool.name),
    );
  }
}
