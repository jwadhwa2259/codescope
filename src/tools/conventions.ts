import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod/v4";
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

interface ConventionsInput {
  file_path?: string;
  module?: string;
}

interface ParsedConvention {
  name: string;
  adoption_pct: number;
  confidence: string;
  category: string;
  files: string[];
  evidence: string[];
}

interface ConventionsData {
  conventions: ParsedConvention[];
  total: number;
  filtered: number;
  message?: string;
}

// ---- Convention Parsing ----

/**
 * Parses conventions.md into structured convention objects.
 *
 * Expected format per convention block:
 * ```
 * ## Section Heading
 *
 * **Convention:** convention name
 * **Adoption:** N%
 * **Confidence:** HIGH-CONF|MEDIUM-CONF|LOW-CONF
 * **Category:** category-name
 * **Files:** file1, file2, ...
 * **Evidence:**
 * - file:line -- description
 * ```
 */
function parseConventions(content: string): ParsedConvention[] {
  const conventions: ParsedConvention[] = [];
  const sections = content.split(/^## /m).filter((s) => s.trim().length > 0);

  for (const section of sections) {
    const lines = section.split("\n");

    let name = "";
    let adoption = 0;
    let confidence = "";
    let category = "";
    let files: string[] = [];
    const evidence: string[] = [];
    let inEvidence = false;

    for (const line of lines) {
      const trimmed = line.trim();

      if (trimmed.startsWith("**Convention:**")) {
        name = trimmed.replace("**Convention:**", "").trim();
        inEvidence = false;
      } else if (trimmed.startsWith("**Adoption:**")) {
        const pctStr = trimmed.replace("**Adoption:**", "").trim();
        adoption = parseInt(pctStr.replace("%", ""), 10) || 0;
        inEvidence = false;
      } else if (trimmed.startsWith("**Confidence:**")) {
        confidence = trimmed.replace("**Confidence:**", "").trim();
        inEvidence = false;
      } else if (trimmed.startsWith("**Category:**")) {
        category = trimmed.replace("**Category:**", "").trim();
        inEvidence = false;
      } else if (trimmed.startsWith("**Files:**")) {
        const fileStr = trimmed.replace("**Files:**", "").trim();
        files = fileStr
          .split(",")
          .map((f) => f.trim())
          .filter((f) => f.length > 0);
        inEvidence = false;
      } else if (trimmed.startsWith("**Evidence:**")) {
        inEvidence = true;
      } else if (inEvidence && trimmed.startsWith("-")) {
        evidence.push(trimmed.replace(/^-\s*/, "").trim());
      } else if (inEvidence && trimmed === "") {
        // End of evidence block on blank line
        inEvidence = false;
      }
    }

    // Only add if we found a valid convention name
    if (name) {
      conventions.push({
        name,
        adoption_pct: adoption,
        confidence,
        category,
        files,
        evidence,
      });
    }
  }

  return conventions;
}

// ---- Handler ----

/**
 * Core conventions logic, extracted for testability without MCP transport.
 *
 * Reads conventions.md, parses structured convention blocks,
 * filters by file_path or module, returns structured data.
 */
export async function handleConventions(
  projectRoot: string,
  input: ConventionsInput,
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
  const conventionsPath = path.join(csPath, "conventions.md");

  // Read conventions.md
  if (!fs.existsSync(conventionsPath)) {
    const metadata = buildMetadata(projectRoot, startMs);
    return okResponse(
      {
        conventions: [],
        total: 0,
        filtered: 0,
        message:
          "No conventions detected. This may indicate a very small codebase or highly varied coding patterns.",
      } satisfies ConventionsData,
      metadata,
    );
  }

  const content = fs.readFileSync(conventionsPath, "utf-8");
  const allConventions = parseConventions(content);

  // Empty conventions file
  if (allConventions.length === 0) {
    const metadata = buildMetadata(projectRoot, startMs);
    return okResponse(
      {
        conventions: [],
        total: 0,
        filtered: 0,
        message:
          "No conventions detected. This may indicate a very small codebase or highly varied coding patterns.",
      } satisfies ConventionsData,
      metadata,
    );
  }

  // Apply filters
  let filtered = allConventions;

  if (input.file_path) {
    filtered = filtered.filter((c) =>
      c.files.some((f) => f.includes(input.file_path!)),
    );
  }

  if (input.module) {
    const lowerModule = input.module.toLowerCase();
    filtered = filtered.filter(
      (c) =>
        c.category.toLowerCase().includes(lowerModule) ||
        c.name.toLowerCase().includes(lowerModule),
    );
  }

  const metadata = buildMetadata(projectRoot, startMs);

  const data: ConventionsData = {
    conventions: filtered,
    total: allConventions.length,
    filtered: filtered.length,
  };

  return okResponse(data, metadata);
}

// ---- MCP Registration ----

/**
 * Register the codescope_conventions tool on the MCP server.
 *
 * Per D-35: Rich description with use-case examples and related tools.
 */
export function registerConventionsTool(
  server: McpServer,
  projectRoot: string,
): void {
  server.tool(
    "codescope_conventions",
    "Get detected coding conventions for specific files or modules. Returns convention patterns with adoption percentages, confidence levels, and evidence. Use before writing code to follow established patterns. Related tools: codescope_recall, codescope_verify.",
    {
      file_path: z
        .string()
        .optional()
        .describe("File path to check conventions for"),
      module: z
        .string()
        .optional()
        .describe("Module name to check conventions for"),
    },
    async ({ file_path, module }) => {
      return handleConventions(projectRoot, { file_path, module });
    },
  );
}
