import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod/v4";
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

interface RecallInput {
  topic: string;
}

interface RecallData {
  overview: string;
  conventions: string;
  learnings: string;
}

// ---- Section Parsing ----

/**
 * Splits markdown content into sections by H2 headings (## ).
 * Returns an array of { heading, body } where heading is the H2 text
 * and body is everything until the next H2 or end of file.
 */
function splitSections(content: string): Array<{ heading: string; body: string }> {
  const sections: Array<{ heading: string; body: string }> = [];
  const lines = content.split("\n");
  let currentHeading = "";
  let currentBody: string[] = [];

  for (const line of lines) {
    if (line.startsWith("## ")) {
      // Save previous section
      if (currentHeading || currentBody.length > 0) {
        sections.push({
          heading: currentHeading,
          body: currentBody.join("\n").trim(),
        });
      }
      currentHeading = line.replace(/^## /, "").trim();
      currentBody = [];
    } else {
      currentBody.push(line);
    }
  }

  // Save last section
  if (currentHeading || currentBody.length > 0) {
    sections.push({
      heading: currentHeading,
      body: currentBody.join("\n").trim(),
    });
  }

  return sections;
}

/**
 * Filters sections by topic keyword (case-insensitive).
 * Matches against both the H2 heading text and body content.
 */
function filterSectionsByTopic(
  sections: Array<{ heading: string; body: string }>,
  topic: string,
): Array<{ heading: string; body: string }> {
  const lowerTopic = topic.toLowerCase();
  return sections.filter(
    (s) =>
      s.heading.toLowerCase().includes(lowerTopic) ||
      s.body.toLowerCase().includes(lowerTopic),
  );
}

/**
 * Formats matched sections back into a readable string.
 */
function formatSections(sections: Array<{ heading: string; body: string }>): string {
  return sections
    .map((s) => (s.heading ? `## ${s.heading}\n${s.body}` : s.body))
    .join("\n\n")
    .trim();
}

/**
 * Gets a summary (first 20 lines) from content when no topic matches.
 */
function getSummary(content: string): string {
  return content.split("\n").slice(0, 20).join("\n").trim();
}

// ---- Artifacts ----

const ARTIFACTS = ["overview.md", "conventions.md", "learnings.md"] as const;
type ArtifactName = (typeof ARTIFACTS)[number];

/**
 * Reads an artifact file. Returns null if the file does not exist.
 */
function readArtifact(codescopePath: string, name: ArtifactName): string | null {
  const filePath = path.join(codescopePath, name);
  if (!fs.existsSync(filePath)) return null;
  return fs.readFileSync(filePath, "utf-8");
}

// ---- Handler ----

/**
 * Core recall logic, extracted for testability without MCP transport.
 *
 * Per D-20: reads overview.md, conventions.md, learnings.md, filters by topic,
 * returns merged context. One tool call = full context for a topic.
 */
export async function handleRecall(
  projectRoot: string,
  input: RecallInput,
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
  const { topic } = input;

  // Read all 3 artifacts
  const raw: Record<string, string | null> = {};
  const warnings: string[] = [];

  for (const artifact of ARTIFACTS) {
    const content = readArtifact(csPath, artifact);
    if (content === null) {
      warnings.push(`Missing artifact: ${artifact}`);
    }
    raw[artifact] = content;
  }

  // Process each artifact: filter sections by topic
  const data: RecallData = { overview: "", conventions: "", learnings: "" };

  const artifactKeyMap: Record<ArtifactName, keyof RecallData> = {
    "overview.md": "overview",
    "conventions.md": "conventions",
    "learnings.md": "learnings",
  };

  let anyMatches = false;
  const filteredPerArtifact: Record<string, Array<{ heading: string; body: string }>> = {};

  for (const artifact of ARTIFACTS) {
    const content = raw[artifact];
    if (content === null) continue;

    const sections = splitSections(content);
    const matched = filterSectionsByTopic(sections, topic);
    filteredPerArtifact[artifact] = matched;

    if (matched.length > 0) {
      anyMatches = true;
    }
  }

  // If no sections match any artifact, fall back to summaries
  for (const artifact of ARTIFACTS) {
    const content = raw[artifact];
    if (content === null) continue;

    const key = artifactKeyMap[artifact];
    if (anyMatches) {
      const matched = filteredPerArtifact[artifact] ?? [];
      data[key] = matched.length > 0 ? formatSections(matched) : "";
    } else {
      // No matches anywhere -- provide summary from each
      data[key] = getSummary(content);
    }
  }

  const metadata = buildMetadata(projectRoot, startMs);

  if (warnings.length > 0) {
    return partialResponse(data, warnings, metadata);
  }

  return okResponse(data, metadata);
}

// ---- MCP Registration ----

/**
 * Register the codescope_recall tool on the MCP server.
 *
 * Per D-35: Rich description with use-case examples and related tools.
 */
export function registerRecallTool(
  server: McpServer,
  projectRoot: string,
): void {
  server.tool(
    "codescope_recall",
    "Retrieve conventions, learnings, and codebase overview for a topic. Returns combined context from overview.md, conventions.md, and learnings.md filtered by topic keyword. Use this before making changes to understand the codebase context. Related tools: codescope_conventions, codescope_orient.",
    {
      topic: z
        .string()
        .describe(
          "Topic to recall information about (e.g., 'authentication', 'error handling', 'imports')",
        ),
    },
    async ({ topic }) => {
      return handleRecall(projectRoot, { topic });
    },
  );
}
