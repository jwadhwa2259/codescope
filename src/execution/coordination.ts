// ---------------------------------------------------------------------------
// Coordination file operations (append-only audit trail)
// Per D-28, D-29, D-30: structured markdown, parseable by downstream agents.
// ---------------------------------------------------------------------------

import * as fs from "node:fs";
import * as path from "node:path";
import type { CoordinationEntry, CoordinationSignal } from "./types.js";

/**
 * Initialize a coordination.md file with the standard header.
 * Per UI-SPEC format: title, started timestamp, mode, markdown table header.
 *
 * @param executionDir - Directory to create coordination.md in
 * @param taskSlug - Task identifier for the log header
 * @param mode - Execution mode (sequential / parallel / wave-based)
 * @returns Absolute path to the created coordination.md file
 */
export function initCoordinationFile(
  executionDir: string,
  taskSlug: string,
  mode: string,
): string {
  const coordPath = path.join(executionDir, "coordination.md");
  const header = [
    `# Coordination Log: ${taskSlug}`,
    "",
    `**Started:** ${new Date().toISOString()}`,
    `**Mode:** ${mode}`,
    "",
    "## Log",
    "",
    "| Timestamp | Agent | Signal | Files | Detail |",
    "|-----------|-------|--------|-------|--------|",
    "",
  ].join("\n");

  fs.writeFileSync(coordPath, header, "utf-8");
  return coordPath;
}

/**
 * Append a single entry to the coordination log as a markdown table row.
 * Uses fs.appendFileSync for atomic append (synchronous, per better-sqlite3
 * patterns in this project).
 *
 * @param coordinationPath - Path to coordination.md
 * @param entry - The coordination entry to append
 */
export function appendCoordinationEntry(
  coordinationPath: string,
  entry: CoordinationEntry,
): void {
  const filesStr =
    entry.files.length > 0
      ? entry.files.map((f) => "`" + f + "`").join(", ")
      : "";
  const line = `| ${entry.timestamp} | ${entry.agent} | \`${entry.signal}\` | ${filesStr} | ${entry.detail} |\n`;
  fs.appendFileSync(coordinationPath, line, "utf-8");
}

/**
 * Read and parse coordination log entries from a coordination.md file.
 * Parses markdown table rows back into structured CoordinationEntry objects.
 * Used by later agents to read what previous agents did (D-34).
 *
 * @param coordinationPath - Path to coordination.md
 * @returns Array of parsed CoordinationEntry objects
 */
export function readCoordinationEntries(
  coordinationPath: string,
): CoordinationEntry[] {
  const content = fs.readFileSync(coordinationPath, "utf-8");
  const lines = content.split("\n");

  // Find the separator row (|---|...) and start parsing after it
  let separatorIndex = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim().startsWith("|---")) {
      separatorIndex = i;
      break;
    }
  }

  if (separatorIndex === -1) {
    return [];
  }

  const entries: CoordinationEntry[] = [];

  for (let i = separatorIndex + 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line || !line.startsWith("|")) {
      continue;
    }

    // Split by | and remove first/last empty cells from leading/trailing |
    const cells = line
      .split("|")
      .slice(1, -1)
      .map((c) => c.trim());

    if (cells.length < 5) {
      continue;
    }

    const [timestamp, agent, signalRaw, filesRaw, detail] = cells;

    // Strip backticks from signal
    const signal = signalRaw.replace(/`/g, "") as CoordinationSignal;

    // Parse files: split by comma, strip backticks and whitespace
    const files =
      filesRaw.trim() === ""
        ? []
        : filesRaw
            .split(",")
            .map((f) => f.trim().replace(/`/g, ""))
            .filter((f) => f.length > 0);

    entries.push({
      timestamp,
      agent,
      signal,
      files,
      detail,
    });
  }

  return entries;
}
