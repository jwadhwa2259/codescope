import { describe, it, expect } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerTools } from "../../src/tools/index.js";

describe("MCP server integration", () => {
  it("creates server and registers all tools without errors", () => {
    const server = new McpServer({ name: "codescope", version: "0.1.0" });
    // This should not throw
    expect(() => registerTools(server, process.cwd())).not.toThrow();
  });
});
