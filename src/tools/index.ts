import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerStatusTool } from "./status.js";
import { registerStubTools } from "./stubs.js";

/**
 * Register all CodeScope MCP tools on the server.
 * - codescope_status: functional health check tool
 * - 10 stub tools: return not_bootstrapped until bootstrap completes
 */
export function registerTools(
  server: McpServer,
  projectRoot: string,
): void {
  registerStatusTool(server, projectRoot);
  registerStubTools(server);
}
