import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as fs from "node:fs";
import * as path from "node:path";
import { getCodescopePath } from "../utils/paths.js";
import {
  isBootstrapped,
  errorResponse,
  okResponse,
  buildMetadata,
} from "./helpers.js";

// ---- Types ----

interface DimensionScore {
  percent: number;
  grade: string;
  delta: string;
  explainer: string;
}

interface ReadinessData {
  overall: {
    grade: string;
    percent: number;
  };
  dimensions: {
    convention_coverage: DimensionScore;
    type_safety: DimensionScore;
    test_coverage_proxy: DimensionScore;
    import_graph_health: DimensionScore;
  };
  improvements: string[];
}

// ---- Dimension Name Mapping ----

const DIMENSION_KEY_MAP: Record<string, keyof ReadinessData["dimensions"]> = {
  "convention coverage": "convention_coverage",
  "type safety": "type_safety",
  "test coverage proxy": "test_coverage_proxy",
  "import graph health": "import_graph_health",
};

// ---- Parsing ----

/**
 * Parses the H1 title line to extract grade and percent.
 *
 * Expected format: `# AI Readiness Score: B+ (87%)`
 */
function parseOverall(content: string): { grade: string; percent: number } | null {
  const match = content.match(
    /^#\s+AI Readiness Score:\s+([A-F][+-]?)\s+\((\d+)%\)/m,
  );
  if (!match) return null;
  return {
    grade: match[1],
    percent: parseInt(match[2], 10),
  };
}

/**
 * Parses the dimension scores table.
 *
 * Expected format (markdown table):
 * ```
 * | Dimension | Score | Grade | Delta | What This Means for AI |
 * |-----------|-------|-------|-------|------------------------|
 * | Convention Coverage | 92% | A- | +5% | Strong conventions... |
 * ```
 */
function parseDimensions(
  content: string,
): Partial<ReadinessData["dimensions"]> {
  const dimensions: Partial<ReadinessData["dimensions"]> = {};

  // Find table rows (lines starting with |, excluding header separator)
  const lines = content.split("\n");
  let inDimensionTable = false;

  for (const line of lines) {
    const trimmed = line.trim();

    // Detect the header row
    if (trimmed.includes("| Dimension |") && trimmed.includes("| Score |")) {
      inDimensionTable = true;
      continue;
    }

    // Skip separator row
    if (inDimensionTable && trimmed.match(/^\|[-\s|]+\|$/)) {
      continue;
    }

    // Parse data rows
    if (inDimensionTable && trimmed.startsWith("|")) {
      const cells = trimmed
        .split("|")
        .map((c) => c.trim())
        .filter((c) => c.length > 0);

      if (cells.length >= 5) {
        const dimensionName = cells[0].toLowerCase();
        const key = DIMENSION_KEY_MAP[dimensionName];

        if (key) {
          dimensions[key] = {
            percent: parseInt(cells[1].replace("%", ""), 10) || 0,
            grade: cells[2],
            delta: cells[3],
            explainer: cells[4],
          };
        }
      }
    }

    // End of table when we hit a non-table line after starting
    if (inDimensionTable && !trimmed.startsWith("|") && trimmed.length > 0) {
      inDimensionTable = false;
    }
  }

  return dimensions;
}

/**
 * Parses the improvements list.
 *
 * Expected format:
 * ```
 * ## Top 3 Improvements
 * 1. Add type annotations... -- improves Type Safety
 * 2. Add unit tests... -- improves Test Coverage Proxy
 * 3. Extract shared constants... -- improves Convention Coverage
 * ```
 */
function parseImprovements(content: string): string[] {
  const improvements: string[] = [];
  const lines = content.split("\n");
  let inImprovements = false;

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed.match(/^##\s+Top \d+ Improvements/)) {
      inImprovements = true;
      continue;
    }

    if (inImprovements) {
      // Match numbered list items
      const match = trimmed.match(/^\d+\.\s+(.+)/);
      if (match) {
        improvements.push(match[1].trim());
      } else if (trimmed.startsWith("##") || (trimmed === "" && improvements.length > 0)) {
        // Stop at next heading or empty line after we have items
        if (trimmed.startsWith("##")) break;
        if (improvements.length > 0) break;
      }
    }
  }

  return improvements;
}

// ---- Handler ----

/**
 * Core readiness logic, extracted for testability without MCP transport.
 *
 * Per D-01 through D-05: Returns structured AI readiness score with
 * overall grade, per-dimension breakdown, delta tracking, and improvements.
 */
export async function handleReadiness(
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
  const readinessPath = path.join(csPath, "readiness.md");

  // Check if readiness.md exists
  if (!fs.existsSync(readinessPath)) {
    return errorResponse(
      "NODE_NOT_FOUND",
      "Readiness score not yet computed. Run /codescope:bootstrap first.",
      "Run /codescope:bootstrap to generate readiness assessment.",
    );
  }

  const content = fs.readFileSync(readinessPath, "utf-8");

  // Parse overall grade
  const overall = parseOverall(content);
  if (!overall) {
    return errorResponse(
      "NODE_NOT_FOUND",
      "Readiness score not yet computed. Run /codescope:bootstrap first.",
      "Run /codescope:bootstrap to generate readiness assessment.",
    );
  }

  // Parse dimensions
  const dimensions = parseDimensions(content);

  // Parse improvements
  const improvements = parseImprovements(content);

  const data: ReadinessData = {
    overall,
    dimensions: {
      convention_coverage: dimensions.convention_coverage ?? {
        percent: 0,
        grade: "F",
        delta: "N/A",
        explainer: "Not computed",
      },
      type_safety: dimensions.type_safety ?? {
        percent: 0,
        grade: "F",
        delta: "N/A",
        explainer: "Not computed",
      },
      test_coverage_proxy: dimensions.test_coverage_proxy ?? {
        percent: 0,
        grade: "F",
        delta: "N/A",
        explainer: "Not computed",
      },
      import_graph_health: dimensions.import_graph_health ?? {
        percent: 0,
        grade: "F",
        delta: "N/A",
        explainer: "Not computed",
      },
    },
    improvements,
  };

  const metadata = buildMetadata(projectRoot, startMs);
  return okResponse(data, metadata);
}

// ---- MCP Registration ----

/**
 * Register the codescope_readiness tool on the MCP server.
 *
 * Per D-35: Rich description with use-case examples and related tools.
 */
export function registerReadinessTool(
  server: McpServer,
  projectRoot: string,
): void {
  server.tool(
    "codescope_readiness",
    "Get the AI readiness score for this codebase. Returns a letter grade (A-F) with per-dimension breakdown (convention coverage, type safety, test coverage proxy, import graph health), delta tracking from previous bootstrap, and top 3 improvement suggestions. Related tools: codescope_status, codescope_conventions.",
    {},
    async () => {
      return handleReadiness(projectRoot);
    },
  );
}
