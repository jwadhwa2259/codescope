import { describe, it, expect, vi } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerTools } from "../../src/tools/index.js";

/**
 * MCP-01: All 12 MCP tools are registered and operational.
 *
 * Verifies that registerTools wires all expected tools onto the McpServer.
 * Uses a spy on McpServer.prototype.tool to count and name registrations.
 */
describe("MCP-01: All MCP tools are registered", () => {
  it("registerTools registers exactly 14 distinct tool names on the server", () => {
    const server = new McpServer({ name: "codescope", version: "0.1.0" });
    const toolSpy = vi.spyOn(server, "tool");

    registerTools(server, process.cwd());

    // Each call to server.tool() registers one tool.
    // The first argument is always the tool name string.
    const registeredNames = toolSpy.mock.calls.map(
      (call) => call[0] as string,
    );

    // All 14 CodeScope MCP tools (Phase 3 + Phase 6 + Phase 9 + Phase 11)
    expect(registeredNames.length).toBe(14);

    // Verify all 14 required tools are present
    const requiredTools = [
      "codescope_status",          // MCP-10
      "codescope_recall",          // MCP-02
      "codescope_graph_query",     // MCP-03
      "codescope_blast_radius",    // MCP-04
      "codescope_conventions",     // MCP-05
      "codescope_orient",          // MCP-06
      "codescope_verify",          // MCP-07
      "codescope_search",          // MCP-08
      "codescope_readiness",       // MCP-09
      "codescope_detect_changes",  // MCP-11
      "codescope_service_map",     // MCP-12
      "codescope_eval",            // EVAL-01
      "codescope_trends",          // DEBT-01
      "codescope_predict_impact",  // IMPACT-01
    ];

    for (const toolName of requiredTools) {
      expect(
        registeredNames,
        `Missing required tool: ${toolName}`,
      ).toContain(toolName);
    }

    // Verify no duplicate tool names
    const uniqueNames = new Set(registeredNames);
    expect(uniqueNames.size).toBe(registeredNames.length);

    toolSpy.mockRestore();
  });

  it("MCP server can be created and tools registered without throwing", () => {
    const server = new McpServer({ name: "codescope", version: "0.1.0" });
    expect(() => registerTools(server, process.cwd())).not.toThrow();
  });
});
