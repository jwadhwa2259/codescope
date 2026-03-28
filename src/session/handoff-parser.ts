// ---------------------------------------------------------------------------
// Handoff Document Parser
// ---------------------------------------------------------------------------
// Parses handoff markdown documents back into structured data for resume.
// Per D-10/D-11: extracts YAML frontmatter and 5-section body.
// Per D-17: validates referenced artifacts on disk before resume.
// ---------------------------------------------------------------------------

import * as fs from "node:fs";
import * as path from "node:path";
import type { HandoffData, HandoffFrontmatter, PipelinePhase } from "./types.js";

// ---------------------------------------------------------------------------
// parseHandoff
// ---------------------------------------------------------------------------

/**
 * Parse a handoff markdown document into structured HandoffData.
 *
 * Extracts YAML frontmatter (flat key-value pairs) and 5 body sections.
 * Returns null if input is empty, has no frontmatter delimiters, or
 * frontmatter is missing required fields.
 */
export function parseHandoff(content: string): HandoffData | null {
  if (!content || !content.trim()) {
    return null;
  }

  // Extract YAML frontmatter between --- delimiters
  const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
  if (!frontmatterMatch) {
    return null;
  }

  const frontmatterRaw = frontmatterMatch[1].trim();
  if (!frontmatterRaw) {
    return null;
  }

  // Parse flat key-value pairs (no js-yaml dependency needed)
  const frontmatter = parseFrontmatter(frontmatterRaw);
  if (!frontmatter) {
    return null;
  }

  // Extract body (everything after second ---)
  const bodyStart = content.indexOf("---", 4);
  const body = bodyStart >= 0 ? content.slice(bodyStart + 3).trim() : "";

  // Parse body sections
  const completedWork = extractSectionItems(body, "Completed Work", (line) =>
    /^- \[x\]/i.test(line),
  );
  const remainingTasks = extractSectionItems(body, "Remaining Tasks", (line) =>
    /^- \[ \]/.test(line),
  );
  const keyDecisions = extractSectionItems(body, "Key Decisions", (line) =>
    line.startsWith("- "),
  );
  const activeFindings = extractSectionLines(body, "Active Findings");
  const resumeCommand = extractFirstLine(body, "Resume Command");

  return {
    frontmatter,
    completedWork,
    remainingTasks,
    keyDecisions,
    activeFindings,
    resumeCommand,
  };
}

// ---------------------------------------------------------------------------
// Internal parsing helpers
// ---------------------------------------------------------------------------

function parseFrontmatter(raw: string): HandoffFrontmatter | null {
  const pairs: Record<string, string> = {};
  for (const line of raw.split("\n")) {
    const colonIdx = line.indexOf(":");
    if (colonIdx === -1) continue;
    const key = line.slice(0, colonIdx).trim();
    const value = line.slice(colonIdx + 1).trim();
    pairs[key] = value;
  }

  // Validate required fields
  if (!pairs["task_slug"] || !pairs["pipeline_phase"]) {
    return null;
  }

  return {
    task_slug: pairs["task_slug"],
    pipeline_phase: pairs["pipeline_phase"] as PipelinePhase,
    wave_position: pairs["wave_position"] ?? "N/A",
    timestamp: pairs["timestamp"] ?? "",
    orient_dir: pairs["orient_dir"] ?? "",
    config_path: pairs["config_path"] ?? "",
  };
}

/**
 * Extract items from a named section that match a filter predicate.
 */
function extractSectionItems(
  body: string,
  sectionName: string,
  filter: (line: string) => boolean,
): string[] {
  const section = extractSection(body, sectionName);
  if (!section) return [];

  return section
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && filter(l));
}

/**
 * Extract all non-empty lines from a named section.
 */
function extractSectionLines(body: string, sectionName: string): string[] {
  const section = extractSection(body, sectionName);
  if (!section) return [];

  return section
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
}

/**
 * Extract the first non-empty line from a named section.
 */
function extractFirstLine(body: string, sectionName: string): string {
  const section = extractSection(body, sectionName);
  if (!section) return "";

  const lines = section
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  return lines[0] ?? "";
}

/**
 * Extract raw text between `## {sectionName}` and the next `## ` heading.
 */
function extractSection(body: string, sectionName: string): string | null {
  const pattern = new RegExp(`## ${escapeRegex(sectionName)}\\s*\\n`, "i");
  const match = pattern.exec(body);
  if (!match) return null;

  const start = match.index + match[0].length;
  const nextHeading = body.indexOf("\n## ", start);
  const end = nextHeading >= 0 ? nextHeading : body.length;

  return body.slice(start, end).trim();
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// ---------------------------------------------------------------------------
// findLatestHandoff
// ---------------------------------------------------------------------------

/**
 * Find the latest handoff file in the sessions directory.
 *
 * If `taskSlug` is provided, reads that specific handoff file directly.
 * Otherwise, scans all `*-handoff.md` files and returns the most recently
 * modified one.
 *
 * Returns null if the directory doesn't exist, is empty, or parsing fails.
 */
export function findLatestHandoff(
  sessionsDir: string,
  taskSlug?: string,
): { path: string; data: HandoffData } | null {
  if (!fs.existsSync(sessionsDir)) {
    return null;
  }

  if (taskSlug) {
    const handoffPath = path.join(sessionsDir, `${taskSlug}-handoff.md`);
    if (!fs.existsSync(handoffPath)) {
      return null;
    }
    const content = fs.readFileSync(handoffPath, "utf-8");
    const data = parseHandoff(content);
    return data ? { path: handoffPath, data } : null;
  }

  // Scan for all handoff files, sort by mtime descending
  let files: string[];
  try {
    files = fs
      .readdirSync(sessionsDir)
      .filter((f) => f.endsWith("-handoff.md"));
  } catch {
    return null;
  }

  if (files.length === 0) {
    return null;
  }

  // Sort by mtime, most recent first
  const sorted = files
    .map((f) => {
      const filePath = path.join(sessionsDir, f);
      const stat = fs.statSync(filePath);
      return { filePath, mtime: stat.mtime.getTime() };
    })
    .sort((a, b) => b.mtime - a.mtime);

  // Try to parse the most recent one
  for (const { filePath } of sorted) {
    const content = fs.readFileSync(filePath, "utf-8");
    const data = parseHandoff(content);
    if (data) {
      return { path: filePath, data };
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// validateHandoffArtifacts
// ---------------------------------------------------------------------------

/**
 * Validate that artifacts referenced in the handoff document still exist on disk.
 *
 * Per D-17: before resume, check that the execution directory and completed
 * artifacts are still present. Returns a list of missing artifacts.
 */
export function validateHandoffArtifacts(
  handoff: HandoffData,
): { valid: boolean; missing: string[] } {
  const missing: string[] = [];
  const orientDir = handoff.frontmatter.orient_dir;

  // Check execution dir exists
  if (!fs.existsSync(orientDir)) {
    missing.push(orientDir);
    return { valid: false, missing };
  }

  // Extract artifact filenames from completedWork entries
  // Format: "- [x] Phase Name (artifact-filename.ext)"
  // or:     "- [x] Phase Name (artifact-filename.ext written)"
  const artifactPattern = /\(([^)]+?)(?:\s+written)?\)/;

  for (const entry of handoff.completedWork) {
    const match = artifactPattern.exec(entry);
    if (!match) continue;

    const artifactFilename = match[1].trim();
    // Skip entries that don't look like filenames
    if (!artifactFilename.includes(".")) continue;

    const artifactPath = path.join(orientDir, artifactFilename);
    if (!fs.existsSync(artifactPath)) {
      missing.push(artifactFilename);
    }
  }

  return { valid: missing.length === 0, missing };
}
