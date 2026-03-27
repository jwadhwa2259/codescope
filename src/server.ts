import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerTools } from "./tools/index.js";

/**
 * CodeScope MCP Server
 *
 * Registers all 12 MCP tools and connects via StdioServerTransport.
 * Claude Code spawns this process and communicates over stdin/stdout.
 *
 * Tools registered:
 *   codescope_status, codescope_recall, codescope_graph_query,
 *   codescope_blast_radius, codescope_conventions, codescope_orient,
 *   codescope_verify, codescope_search, codescope_readiness,
 *   codescope_detect_changes, codescope_service_map, codescope_eval
 *
 * Each tool handler checks bootstrap state internally and returns
 * structured errors with recovery hints when not bootstrapped.
 */

const server = new McpServer({
  name: "codescope",
  version: "0.1.0",
});

const projectRoot = process.cwd();
registerTools(server, projectRoot);

const transport = new StdioServerTransport();
await server.connect(transport);
