import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as fs from "node:fs";
import * as path from "node:path";
import { getCodescopePath } from "../utils/paths.js";
import {
  isBootstrapped,
  errorResponse,
  okResponse,
  partialResponse,
  buildMetadata,
} from "./helpers.js";

// ---- Types ----

interface ServiceEntry {
  name: string;
  path: string;
  loc: number;
  framework: string;
  analysis: string;
}

interface DependencyEdge {
  from: string;
  to: string;
  shared_types: string[];
  import_count: number;
}

interface ServiceMapData {
  services: ServiceEntry[];
  dependencies: DependencyEdge[];
}

// ---- Table Parsing ----

/**
 * Parses a markdown table into an array of row objects.
 * Returns rows as arrays of cell strings.
 *
 * Handles the standard markdown table format:
 * ```
 * | Header1 | Header2 |
 * |---------|---------|
 * | val1    | val2    |
 * ```
 */
function parseMarkdownTable(content: string, headerMarker: string): string[][] {
  const lines = content.split("\n");
  const rows: string[][] = [];
  let inTable = false;
  let pastSeparator = false;

  for (const line of lines) {
    const trimmed = line.trim();

    // Find the header row containing the marker
    if (!inTable && trimmed.startsWith("|") && trimmed.includes(headerMarker)) {
      inTable = true;
      pastSeparator = false;
      continue;
    }

    // Skip separator row
    if (inTable && !pastSeparator && trimmed.match(/^\|[-\s|]+\|$/)) {
      pastSeparator = true;
      continue;
    }

    // Parse data rows
    if (inTable && pastSeparator && trimmed.startsWith("|")) {
      const cells = trimmed
        .split("|")
        .map((c) => c.trim())
        .filter((c) => c.length > 0);
      if (cells.length > 0) {
        rows.push(cells);
      }
    }

    // End of table when we hit a non-table line after starting
    if (inTable && pastSeparator && !trimmed.startsWith("|") && trimmed.length > 0) {
      break;
    }
  }

  return rows;
}

/**
 * Parses services from a service manifest or cross-service-map markdown.
 *
 * Expected table columns: Service | Path | LOC | Framework | Analysis
 */
function parseServices(content: string): ServiceEntry[] {
  const rows = parseMarkdownTable(content, "Service");
  return rows.map((cells) => ({
    name: cells[0] ?? "",
    path: cells[1] ?? "",
    loc: parseInt(cells[2] ?? "0", 10) || 0,
    framework: cells[3] ?? "",
    analysis: cells[4] ?? "",
  }));
}

/**
 * Parses dependency edges from cross-service-map.md.
 *
 * Expected table columns: From | To | Shared Types | Import Count
 */
function parseDependencies(content: string): DependencyEdge[] {
  const rows = parseMarkdownTable(content, "From");
  return rows.map((cells) => ({
    from: cells[0] ?? "",
    to: cells[1] ?? "",
    shared_types: (cells[2] ?? "")
      .split(",")
      .map((t) => t.trim())
      .filter((t) => t.length > 0),
    import_count: parseInt(cells[3] ?? "0", 10) || 0,
  }));
}

// ---- Handler ----

/**
 * Core service map logic, extracted for testability without MCP transport.
 *
 * Per D-33, D-34: Returns service list with cross-service dependencies.
 * Single-service projects get empty dependencies array.
 */
export async function handleServiceMap(
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

  const csPath = getCodescopePath(projectRoot);
  const manifestPath = path.join(csPath, "service-manifest.md");
  const crossMapPath = path.join(csPath, "cross-service-map.md");

  // Read service-manifest.md
  if (!fs.existsSync(manifestPath)) {
    return errorResponse(
      "NODE_NOT_FOUND",
      "Service manifest not found. Run /codescope:bootstrap first.",
      "Run /codescope:bootstrap to generate service manifest.",
    );
  }

  const manifestContent = fs.readFileSync(manifestPath, "utf-8");
  const services = parseServices(manifestContent);

  // Read cross-service-map.md (optional)
  let dependencies: DependencyEdge[] = [];
  const warnings: string[] = [];
  let hasCrossMap = false;

  if (fs.existsSync(crossMapPath)) {
    hasCrossMap = true;
    const crossMapContent = fs.readFileSync(crossMapPath, "utf-8");
    dependencies = parseDependencies(crossMapContent);
  }

  const metadata = buildMetadata(projectRoot, startMs);

  const data: ServiceMapData = {
    services,
    dependencies,
  };

  // Per D-34: single-service gets empty dependencies, no warning
  if (services.length <= 1) {
    return okResponse(data, metadata);
  }

  // Multi-service without cross-service map: partial response
  if (!hasCrossMap) {
    warnings.push(
      "Cross-service dependency map not available. Dependencies array is empty.",
    );
    return partialResponse(data, warnings, metadata);
  }

  return okResponse(data, metadata);
}

// ---- MCP Registration ----

/**
 * Register the codescope_service_map tool on the MCP server.
 *
 * Per D-35: Rich description with use-case examples and related tools.
 */
export function registerServiceMapTool(
  server: McpServer,
  projectRoot: string,
): void {
  server.tool(
    "codescope_service_map",
    "Get the cross-service dependency map for this project. Returns service list with LOC, frameworks, and analysis status, plus dependency edges with shared types and import counts. For single-service projects, returns one service with empty dependencies. Related tools: codescope_graph_query, codescope_blast_radius.",
    {},
    async () => {
      return handleServiceMap(projectRoot);
    },
  );
}
