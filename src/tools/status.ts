import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod/v4";
import * as fs from "node:fs";
import * as childProcess from "node:child_process";
import { configExists } from "../config/loader.js";
import { getGraphDbPath } from "../utils/paths.js";

export interface StatusResponse {
  config_exists: boolean;
  bootstrap_completed: boolean;
  last_bootstrap: string | null;
  graph_nodes: number;
  graph_edges: number;
  dependency_health: {
    node_version: string;
    node_compatible: boolean;
    sqlite_available: boolean;
    wasm_grammars_available: boolean;
    ast_grep_available: boolean;
  };
  plugin_version: string;
}

/**
 * Core status logic, extracted for testability without MCP transport.
 */
export async function getStatus(
  projectRoot: string,
  verbose?: boolean,
): Promise<StatusResponse> {
  const hasConfig = configExists(projectRoot);
  const graphDbPath = getGraphDbPath(projectRoot);
  const hasGraphDb = fs.existsSync(graphDbPath);

  let graphNodes = 0;
  let graphEdges = 0;
  if (hasGraphDb) {
    try {
      const Database = (await import("better-sqlite3")).default;
      const db = new Database(graphDbPath, { readonly: true });
      graphNodes =
        (db.prepare("SELECT COUNT(*) as count FROM nodes").get() as any)
          ?.count ?? 0;
      graphEdges =
        (db.prepare("SELECT COUNT(*) as count FROM edges").get() as any)
          ?.count ?? 0;
      db.close();
    } catch {
      /* graph not yet initialized */
    }
  }

  const status: StatusResponse = {
    config_exists: hasConfig,
    bootstrap_completed: hasGraphDb && graphNodes > 0,
    last_bootstrap: null, // TODO: read from metadata in graph.db
    graph_nodes: graphNodes,
    graph_edges: graphEdges,
    dependency_health: {
      node_version: process.version,
      node_compatible: parseInt(process.version.slice(1)) >= 22,
      sqlite_available: await checkModule("better-sqlite3"),
      wasm_grammars_available: checkGrammarsAvailable(),
      ast_grep_available: checkCliAvailable("sg"),
    },
    plugin_version: "0.1.0",
  };

  return status;
}

/**
 * Register the codescope_status tool on the MCP server.
 */
export function registerStatusTool(
  server: McpServer,
  projectRoot: string,
): void {
  server.tool(
    "codescope_status",
    "Get current CodeScope status, health check, and dependency information",
    {
      verbose: z
        .boolean()
        .optional()
        .describe("Include detailed dependency health"),
    },
    async ({ verbose }) => {
      const status = await getStatus(projectRoot, verbose);
      return {
        content: [
          { type: "text" as const, text: JSON.stringify(status, null, 2) },
        ],
      };
    },
  );
}

async function checkModule(name: string): Promise<boolean> {
  try {
    await import(name);
    return true;
  } catch {
    return false;
  }
}

function checkGrammarsAvailable(): boolean {
  const grammarDir = process.env.CODESCOPE_GRAMMAR_DIR;
  if (!grammarDir) return false;
  return fs.existsSync(grammarDir);
}

function checkCliAvailable(cmd: string): boolean {
  try {
    childProcess.execSync(`which ${cmd}`, { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}
