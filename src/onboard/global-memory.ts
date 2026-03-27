import * as fs from "node:fs";
import { getGlobalMemoryPath } from "../utils/paths.js";
import type { GlobalEnrichmentEntry } from "../learning/types.js";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface GlobalPreferences {
  agentModels?: Record<string, string>;
  orientVerbosity?: string;
  clarification?: string;
  evalMode?: string;
  conventionStrictness?: string;
  researchSources?: string[];
}

export interface GlobalMemory {
  preferences: GlobalPreferences;
  techStack: string[];
  ignorePatterns: string[];
  crossProjectGotchas: string[];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_TEMPLATE = "No previous preferences found. Starting fresh.";

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Read saved preferences and extended sections from global memory file
 * (~/.codescope/global-memory.md).
 *
 * Returns null when:
 * - File does not exist
 * - File is empty
 * - File contains only the default template
 * - No parseable preferences found and no sections with content
 *
 * Accepts an optional custom path for testing.
 */
export function readGlobalMemory(customPath?: string): GlobalMemory | null {
  const memoryPath = customPath ?? getGlobalMemoryPath();

  if (!fs.existsSync(memoryPath)) return null;

  const content = fs.readFileSync(memoryPath, "utf-8").trim();

  // Return null if file is empty or just the default template
  if (!content || content.includes(DEFAULT_TEMPLATE)) return null;

  // Parse structured preferences from markdown
  const preferences = parsePreferences(content);

  // Parse new sections
  const techStack = parseBulletSection(content, "Tech Stack Tendencies");
  const ignorePatterns = parseBulletSection(content, "Ignore Patterns");
  const crossProjectGotchas = parseBulletSection(content, "Cross-Project Gotchas");

  // Return null if no preferences were actually parsed AND no sections have content
  const hasPrefs = Object.values(preferences).some((v) => v !== undefined);
  const hasSections =
    techStack.length > 0 ||
    ignorePatterns.length > 0 ||
    crossProjectGotchas.length > 0;

  if (!hasPrefs && !hasSections) return null;

  return {
    preferences,
    techStack,
    ignorePatterns,
    crossProjectGotchas,
  };
}

/**
 * Write GlobalMemory to file in structured Markdown format.
 * Creates/overwrites the file at the given path (or default global memory location).
 *
 * Always includes all sections (Preferences, Tech Stack Tendencies, Ignore Patterns,
 * Cross-Project Gotchas) even if arrays are empty -- writes "(None yet.)" placeholder.
 */
export function writeGlobalMemory(
  memory: GlobalMemory,
  customPath?: string,
): void {
  const memoryPath = customPath ?? getGlobalMemoryPath();

  const lines: string[] = [
    "# CodeScope Global Memory",
    "",
    "## Preferences",
    "",
  ];

  const prefs = memory.preferences;
  if (prefs.orientVerbosity)
    lines.push(`- orient_verbosity: ${prefs.orientVerbosity}`);
  if (prefs.clarification)
    lines.push(`- clarification: ${prefs.clarification}`);
  if (prefs.evalMode) lines.push(`- eval_mode: ${prefs.evalMode}`);
  if (prefs.conventionStrictness)
    lines.push(`- convention_strictness: ${prefs.conventionStrictness}`);

  lines.push("");

  // Tech Stack Tendencies
  lines.push("## Tech Stack Tendencies");
  lines.push("");
  if (memory.techStack.length > 0) {
    for (const item of memory.techStack) {
      lines.push(`- ${item}`);
    }
  } else {
    lines.push("(None yet.)");
  }
  lines.push("");

  // Ignore Patterns
  lines.push("## Ignore Patterns");
  lines.push("");
  if (memory.ignorePatterns.length > 0) {
    for (const item of memory.ignorePatterns) {
      lines.push(`- ${item}`);
    }
  } else {
    lines.push("(None yet.)");
  }
  lines.push("");

  // Cross-Project Gotchas
  lines.push("## Cross-Project Gotchas");
  lines.push("");
  if (memory.crossProjectGotchas.length > 0) {
    for (const item of memory.crossProjectGotchas) {
      lines.push(`- ${item}`);
    }
  } else {
    lines.push("(None yet.)");
  }
  lines.push("");

  lines.push(`*Last updated: ${new Date().toISOString().split("T")[0]}*`);
  lines.push("");

  fs.writeFileSync(memoryPath, lines.join("\n"), "utf-8");
}

/**
 * Add global enrichment entries to appropriate sections (deduplicating).
 * Reads current global memory, adds entries, and writes back.
 * Creates file if it does not exist.
 */
export function addGlobalEnrichment(
  entries: GlobalEnrichmentEntry[],
  customPath?: string,
): void {
  // Read existing or start with empty
  let memory = readGlobalMemory(customPath);
  if (!memory) {
    memory = {
      preferences: {},
      techStack: [],
      ignorePatterns: [],
      crossProjectGotchas: [],
    };
  }

  for (const entry of entries) {
    switch (entry.type) {
      case "tech_stack":
        if (!memory.techStack.includes(entry.value)) {
          memory.techStack.push(entry.value);
        }
        break;
      case "ignore_pattern":
        if (!memory.ignorePatterns.includes(entry.value)) {
          memory.ignorePatterns.push(entry.value);
        }
        break;
      case "cross_project_gotcha":
        if (!memory.crossProjectGotchas.includes(entry.value)) {
          memory.crossProjectGotchas.push(entry.value);
        }
        break;
    }
  }

  writeGlobalMemory(memory, customPath);
}

// ---------------------------------------------------------------------------
// Internal: Parse preferences from ## Preferences section
// ---------------------------------------------------------------------------

function parsePreferences(content: string): GlobalPreferences {
  const preferences: GlobalPreferences = {};

  const lines = content.split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("- orient_verbosity:")) {
      preferences.orientVerbosity = trimmed.split(":").slice(1).join(":").trim();
    } else if (trimmed.startsWith("- clarification:")) {
      preferences.clarification = trimmed.split(":").slice(1).join(":").trim();
    } else if (trimmed.startsWith("- eval_mode:")) {
      preferences.evalMode = trimmed.split(":").slice(1).join(":").trim();
    } else if (trimmed.startsWith("- convention_strictness:")) {
      preferences.conventionStrictness = trimmed.split(":").slice(1).join(":").trim();
    }
  }

  return preferences;
}

// ---------------------------------------------------------------------------
// Internal: Parse bullet items from a named ## section
// ---------------------------------------------------------------------------

function parseBulletSection(content: string, sectionName: string): string[] {
  // Find the section by heading
  const sectionPattern = new RegExp(
    `^## ${escapeRegex(sectionName)}\\s*$`,
    "m",
  );
  const match = sectionPattern.exec(content);
  if (!match) return [];

  // Extract content between this heading and the next ## heading (or end)
  const startIdx = match.index + match[0].length;
  const nextHeadingMatch = /^## /m.exec(content.slice(startIdx));
  const endIdx = nextHeadingMatch
    ? startIdx + nextHeadingMatch.index
    : content.length;
  const sectionContent = content.slice(startIdx, endIdx).trim();

  // Skip "(None yet.)" placeholder
  if (sectionContent === "(None yet.)") return [];

  // Parse bullet items (lines starting with "- ")
  const items: string[] = [];
  for (const line of sectionContent.split("\n")) {
    const trimmed = line.trim();
    if (trimmed.startsWith("- ")) {
      items.push(trimmed.slice(2).trim());
    }
  }

  return items;
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
