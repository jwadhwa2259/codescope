// ---------------------------------------------------------------------------
// Agent spawner: prompt construction, invocation building, change reporting
// Per D-31/D-32/D-33/D-34/D-35 and EXEC-02/EXEC-08.
// ---------------------------------------------------------------------------

import * as fs from "node:fs";
import * as path from "node:path";
import type { AgentAssignment } from "../orient/types.js";
import type { AgentResult, CoordinationEntry } from "./types.js";
import { readCoordinationEntries } from "./coordination.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Context needed by buildAgentPrompt to construct scoped prompts.
 * Paths are passed by reference (not embedded) to keep orchestrator thin.
 */
export interface AgentPromptContext {
  projectRoot: string;
  taskSlug: string;
  scopeContractPath: string;
  planPath: string;
  researchPath: string | null;
  coordinationPath: string;
  executionDir: string;
  executionMode: "sequential" | "parallel" | "wave-based";
}

/**
 * Structured invocation object for dispatching an agent.
 * The skill body translates this into a Task/Agent tool call.
 */
export interface AgentInvocation {
  name: string;
  prompt: string;
  tools: string[];
  model: string;
  timeout: number;
  permissionMode: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Standard tools available to execution agents. */
const AGENT_TOOLS = [
  "Read",
  "Write",
  "Edit",
  "Bash",
  "Glob",
  "Grep",
  "WebFetch",
  "codescope_blast_radius",
  "codescope_conventions",
  "codescope_recall",
  "codescope_search",
];

// ---------------------------------------------------------------------------
// buildAgentPrompt
// ---------------------------------------------------------------------------

/**
 * Build a scoped prompt for a single execution agent.
 *
 * Sections per D-31:
 * 1. Role + task
 * 2. Scope contract (by reference)
 * 3. File boundaries (exclusive write + read-only)
 * 4. Conventions (scoped to agent's files)
 * 5. Golden files (by reference with line ranges)
 * 6. Research (by reference, if available)
 * 7. Coordination context (progressive, from dependencies)
 * 8. MCP tools (per D-33)
 * 9. Output requirements
 * 10. SendMessage protocol (only for parallel/wave-based per EXEC-08/D-35)
 *
 * @param assignment - The agent's assignment from the execution plan
 * @param context - Paths and configuration for prompt construction
 * @returns Complete prompt string for the agent
 */
export function buildAgentPrompt(
  assignment: AgentAssignment,
  context: AgentPromptContext,
): string {
  const sections: string[] = [];

  // 1. Role + task
  sections.push(
    `# Role\n\nYou are an execution agent for CodeScope. Your task: ${assignment.task}`,
  );

  // 2. Scope contract by reference
  sections.push(
    `# Scope Contract\n\nRead the scope contract at \`${context.scopeContractPath}\` for full task boundaries.\nReview the plan at \`${context.planPath}\` for overall execution context.`,
  );

  // 3. File boundaries
  sections.push(
    [
      "# Your Files",
      "",
      `You have exclusive write access to: ${assignment.exclusiveWriteFiles.join(", ")}`,
      `Read-only files: ${assignment.readOnlyFiles.join(", ")}`,
      "",
      "Do NOT modify files outside your exclusive write list.",
    ].join("\n"),
  );

  // 4. Conventions (scoped to this agent per D-31)
  if (assignment.conventions.length > 0) {
    sections.push(
      [
        "# Conventions",
        "",
        "Follow these conventions for your files:",
        ...assignment.conventions.map((c) => `- ${c}`),
      ].join("\n"),
    );
  }

  // 5. Golden files by reference with line ranges
  if (assignment.goldenFiles.length > 0) {
    const refs = assignment.goldenFiles.map(
      (gf) => `- Reference \`${gf.path}\` lines ${gf.lines} for the preferred pattern.`,
    );
    sections.push(["# Golden Files", "", ...refs].join("\n"));
  }

  // 6. Research by reference (omitted when null per D-13)
  if (context.researchPath) {
    sections.push(
      `# Research\n\nExternal research is available at \`${context.researchPath}\`. Consult it for library-specific APIs and pitfalls.`,
    );
  }

  // 7. Coordination context (progressive, from dependencies per D-34)
  if (assignment.dependsOn.length > 0) {
    const entries = loadDependencyCoordinationEntries(
      context.coordinationPath,
      assignment.dependsOn,
    );
    if (entries.length > 0) {
      const formatted = entries.map(
        (e) =>
          `- [${e.timestamp}] ${e.agent}: ${e.signal} -- ${e.detail}${e.files.length > 0 ? ` (files: ${e.files.join(", ")})` : ""}`,
      );
      sections.push(
        [
          "# Coordination Context",
          "",
          "Previous agents completed:",
          ...formatted,
        ].join("\n"),
      );
    }
  }

  // 8. MCP tool access per D-33
  sections.push(
    [
      "# MCP Tools",
      "",
      "You have access to CodeScope MCP tools: codescope_blast_radius, codescope_conventions, codescope_recall, codescope_search. Use them to verify your changes fit the codebase.",
    ].join("\n"),
  );

  // 9. Output requirements
  sections.push(
    "# Output Requirements\n\nAfter completing your changes, write a change report summarizing what you modified.",
  );

  // 10. SendMessage protocol (only for parallel/wave-based per EXEC-08, D-35)
  if (
    context.executionMode === "parallel" ||
    context.executionMode === "wave-based"
  ) {
    sections.push(
      [
        "# SendMessage Protocol",
        "",
        "When running in parallel with other agents, broadcast signals using SendMessage:",
        "",
        "**HandoffSignal:**",
        '```json',
        '{',
        '  "type": "ready" | "done" | "blocked",',
        '  "files": ["src/path/to/file.ts"],',
        '  "detail": "Human-readable context"',
        '}',
        '```',
        "",
        "**DiscoverySignal:**",
        '```json',
        '{',
        '  "type": "discovery",',
        '  "category": "api_change" | "new_utility" | "pattern" | "warning",',
        '  "detail": "Human-readable description",',
        '  "files": ["src/path/to/affected-file.ts"]',
        '}',
        '```',
        "",
        "All signals are logged to the coordination file for the audit trail.",
      ].join("\n"),
    );
  }

  return sections.join("\n\n");
}

// ---------------------------------------------------------------------------
// buildAgentInvocation
// ---------------------------------------------------------------------------

/**
 * Build a structured invocation object for dispatching an agent.
 * The skill body translates this into a Task/Agent tool call.
 *
 * @param assignment - The agent's assignment
 * @param prompt - The constructed prompt string
 * @returns AgentInvocation with all dispatch parameters
 */
export function buildAgentInvocation(
  assignment: AgentAssignment,
  prompt: string,
): AgentInvocation {
  return {
    name: assignment.name,
    prompt,
    tools: [...AGENT_TOOLS],
    model: "inherit",
    timeout: assignment.timeoutSeconds * 1000,
    permissionMode: "acceptEdits",
  };
}

// ---------------------------------------------------------------------------
// parseAgentChanges
// ---------------------------------------------------------------------------

/**
 * Parse an agent's change report from disk to extract file changes.
 * Reads `{agentName}-changes.md` from executionDir.
 *
 * @param agentName - Name of the agent
 * @param executionDir - Directory containing change reports
 * @returns AgentResult with parsed file changes
 */
export function parseAgentChanges(
  agentName: string,
  executionDir: string,
): AgentResult {
  const reportPath = path.join(executionDir, `${agentName}-changes.md`);

  if (!fs.existsSync(reportPath)) {
    return {
      name: agentName,
      status: "complete",
      durationMs: 0,
      filesChanged: [],
      linesAdded: 0,
      linesRemoved: 0,
      retried: false,
    };
  }

  const content = fs.readFileSync(reportPath, "utf-8");
  const lines = content.split("\n");

  // Parse status
  let status: "complete" | "failed" | "skipped" = "complete";
  const statusMatch = content.match(/\*\*Status:\*\*\s*(\w+)/);
  if (statusMatch) {
    const s = statusMatch[1].toLowerCase();
    if (s === "failed") status = "failed";
    else if (s === "skipped") status = "skipped";
  }

  // Parse duration
  let durationMs = 0;
  const durationMatch = content.match(/\*\*Duration:\*\*\s*(\d+)s/);
  if (durationMatch) {
    durationMs = parseInt(durationMatch[1], 10) * 1000;
  }

  // Parse file table: | `{path}` | {action} | +{N}/-{M} |
  const filesChanged: string[] = [];
  let linesAdded = 0;
  let linesRemoved = 0;

  // Find table rows after the Files Changed header
  let inTable = false;
  let pastSeparator = false;
  for (const line of lines) {
    if (line.includes("## Files Changed")) {
      inTable = true;
      continue;
    }
    if (inTable && line.startsWith("|---")) {
      pastSeparator = true;
      continue;
    }
    if (inTable && pastSeparator && line.startsWith("|")) {
      const cells = line
        .split("|")
        .slice(1, -1)
        .map((c) => c.trim());
      if (cells.length >= 3) {
        const filePath = cells[0].replace(/`/g, "").trim();
        if (filePath && filePath !== "File") {
          filesChanged.push(filePath);
        }
        // Parse lines: +N/-M
        const linesMatch = cells[2].match(/\+(\d+)\/-(\d+)/);
        if (linesMatch) {
          linesAdded += parseInt(linesMatch[1], 10);
          linesRemoved += parseInt(linesMatch[2], 10);
        }
      }
    }
    // Stop at next heading
    if (inTable && pastSeparator && line.startsWith("##") && !line.includes("Files Changed")) {
      break;
    }
  }

  return {
    name: agentName,
    status,
    durationMs,
    filesChanged,
    linesAdded,
    linesRemoved,
    retried: false,
    changeReportPath: reportPath,
  };
}

// ---------------------------------------------------------------------------
// writeChangeReport
// ---------------------------------------------------------------------------

/**
 * Write an agent change report matching the UI-SPEC format (lines 305-331).
 *
 * @param result - The agent's execution result
 * @param executionDir - Directory to write the report to
 * @returns Absolute path to the written report file
 */
export function writeChangeReport(
  result: AgentResult,
  executionDir: string,
): string {
  const reportPath = path.join(executionDir, `${result.name}-changes.md`);
  const durationSec = Math.round(result.durationMs / 1000);
  const timestamp = new Date().toISOString();

  const fileRows =
    result.filesChanged.length > 0
      ? result.filesChanged
          .map((f) => `| \`${f}\` | modified | +${result.linesAdded}/-${result.linesRemoved} |`)
          .join("\n")
      : "| - | - | - |";

  const issuesContent =
    result.error ? `- ${result.error}` : "- None";

  const report = [
    `# Changes: ${result.name}`,
    "",
    `**Completed:** ${timestamp}`,
    `**Duration:** ${durationSec}s`,
    `**Status:** ${result.status}`,
    "",
    "## Files Changed",
    "",
    "| File | Action | Lines |",
    "|------|--------|-------|",
    fileRows,
    "",
    "## Summary",
    "",
    `Agent ${result.name} completed with status ${result.status}. ${result.filesChanged.length} file(s) changed.`,
    "",
    "## Discoveries",
    "",
    "- None",
    "",
    "## Issues",
    "",
    issuesContent,
    "",
  ].join("\n");

  fs.writeFileSync(reportPath, report, "utf-8");
  return reportPath;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Load coordination entries for specific dependency agents.
 * Per D-34: progressive context from completed dependency agents.
 */
function loadDependencyCoordinationEntries(
  coordinationPath: string,
  dependsOn: string[],
): CoordinationEntry[] {
  try {
    const allEntries = readCoordinationEntries(coordinationPath);
    const depSet = new Set(dependsOn);
    return allEntries.filter((e) => depSet.has(e.agent));
  } catch {
    // Coordination file may not exist yet or be malformed
    return [];
  }
}
