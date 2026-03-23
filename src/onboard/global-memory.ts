import * as fs from "node:fs";
import { getGlobalMemoryPath } from "../utils/paths.js";

export interface GlobalPreferences {
  agentModels?: Record<string, string>;
  orientVerbosity?: string;
  clarification?: string;
  evalMode?: string;
  conventionStrictness?: string;
  researchSources?: string[];
}

const DEFAULT_TEMPLATE = "No previous preferences found. Starting fresh.";

/**
 * Read saved preferences from global memory file (~/.codescope/global-memory.md).
 * Returns null when:
 * - File does not exist
 * - File is empty
 * - File contains only the default template
 * - No parseable preferences found
 *
 * Accepts an optional custom path for testing.
 */
export function readGlobalMemory(customPath?: string): GlobalPreferences | null {
  const memoryPath = customPath ?? getGlobalMemoryPath();

  if (!fs.existsSync(memoryPath)) return null;

  const content = fs.readFileSync(memoryPath, "utf-8").trim();

  // Return null if file is empty or just the default template
  if (!content || content.includes(DEFAULT_TEMPLATE)) return null;

  // Parse structured preferences from markdown
  // Expected format:
  // ## Preferences
  // - orient_verbosity: brief
  // - clarification: thorough
  // - eval_mode: interactive
  // - convention_strictness: suggest-only

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

  // Return null if no preferences were actually parsed
  const hasPrefs = Object.values(preferences).some((v) => v !== undefined);
  return hasPrefs ? preferences : null;
}

/**
 * Write preferences to global memory file in structured Markdown format.
 * Creates/overwrites the file at the given path (or default global memory location).
 */
export function writeGlobalMemory(
  preferences: GlobalPreferences,
  customPath?: string,
): void {
  const memoryPath = customPath ?? getGlobalMemoryPath();

  const lines: string[] = [
    "# CodeScope Global Memory",
    "",
    "## Preferences",
    "",
  ];

  if (preferences.orientVerbosity)
    lines.push(`- orient_verbosity: ${preferences.orientVerbosity}`);
  if (preferences.clarification)
    lines.push(`- clarification: ${preferences.clarification}`);
  if (preferences.evalMode) lines.push(`- eval_mode: ${preferences.evalMode}`);
  if (preferences.conventionStrictness)
    lines.push(`- convention_strictness: ${preferences.conventionStrictness}`);

  lines.push("", `*Last updated: ${new Date().toISOString().split("T")[0]}*`, "");

  fs.writeFileSync(memoryPath, lines.join("\n"), "utf-8");
}
