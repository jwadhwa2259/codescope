/**
 * Lightweight handoff generation for hook context.
 *
 * Produces handoff documents from pipeline filesystem artifacts.
 * Used by PreCompact hook to save session state before compaction.
 *
 * CRITICAL: ZERO imports from src/session/, src/graph/, src/tools/,
 * src/parser/, or anything that transitively imports heavy modules.
 * Only node:fs and node:path are allowed (build isolation per D-01).
 *
 * This duplicates minimal handoff logic from src/session/handoff-generator.ts
 * intentionally -- hooks cannot import from src/session/.
 */

import {
  existsSync,
  readdirSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  statSync,
} from "node:fs";
import { join, basename } from "node:path";

// ---------------------------------------------------------------------------
// Pipeline phase detection (inlined from src/session/handoff-generator.ts)
// ---------------------------------------------------------------------------

type PipelinePhase =
  | "clarification"
  | "scope-contract"
  | "research"
  | "analysis-and-planning"
  | "execution";

interface ArtifactCheck {
  file: string;
  phase: PipelinePhase;
  label: string;
}

const ARTIFACT_CHECKS: ArtifactCheck[] = [
  { file: "clarification.json", phase: "clarification", label: "Clarification" },
  { file: "scope-contract.md", phase: "scope-contract", label: "Scope Contract" },
  { file: "research.md", phase: "research", label: "Research" },
  { file: "analysis.json", phase: "analysis-and-planning", label: "Analysis & Planning" },
];

// ---------------------------------------------------------------------------
// findActiveTaskSlug
// ---------------------------------------------------------------------------

/**
 * Find the most recently active task slug in the execution directory.
 *
 * Checks subdirectories for coordination.md (active execution indicator).
 * Falls back to any subdir with at least one artifact file.
 * Returns null if no task found.
 */
export function findActiveTaskSlug(executionDir: string): string | null {
  if (!existsSync(executionDir)) {
    return null;
  }

  let entries: string[];
  try {
    entries = readdirSync(executionDir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name);
  } catch {
    return null;
  }

  if (entries.length === 0) {
    return null;
  }

  // Priority 1: dirs with coordination.md (active execution)
  const withCoordination: { slug: string; mtime: number }[] = [];
  for (const slug of entries) {
    const coordPath = join(executionDir, slug, "coordination.md");
    if (existsSync(coordPath)) {
      try {
        const stat = statSync(coordPath);
        withCoordination.push({ slug, mtime: stat.mtimeMs });
      } catch {
        withCoordination.push({ slug, mtime: 0 });
      }
    }
  }

  if (withCoordination.length > 0) {
    withCoordination.sort((a, b) => b.mtime - a.mtime);
    return withCoordination[0].slug;
  }

  // Priority 2: dirs with any artifact file
  const ARTIFACT_FILES = [
    "clarification.json",
    "scope-contract.md",
    "research.md",
    "analysis.json",
    "coordination.md",
  ];

  const withArtifacts: { slug: string; mtime: number }[] = [];
  for (const slug of entries) {
    const slugDir = join(executionDir, slug);
    let latestMtime = 0;
    let hasArtifact = false;

    for (const artifact of ARTIFACT_FILES) {
      const artifactPath = join(slugDir, artifact);
      if (existsSync(artifactPath)) {
        hasArtifact = true;
        try {
          const stat = statSync(artifactPath);
          if (stat.mtimeMs > latestMtime) {
            latestMtime = stat.mtimeMs;
          }
        } catch {
          // Non-fatal
        }
      }
    }

    if (hasArtifact) {
      withArtifacts.push({ slug, mtime: latestMtime });
    }
  }

  if (withArtifacts.length > 0) {
    withArtifacts.sort((a, b) => b.mtime - a.mtime);
    return withArtifacts[0].slug;
  }

  return null;
}

// ---------------------------------------------------------------------------
// buildHandoffContent
// ---------------------------------------------------------------------------

/**
 * Build a complete handoff document from pipeline filesystem state.
 *
 * Returns markdown with YAML frontmatter and 5 sections per D-10/D-11:
 * - Completed Work
 * - Remaining Tasks
 * - Key Decisions
 * - Active Findings
 * - Resume Command
 */
export function buildHandoffContent(
  projectRoot: string,
  taskSlug: string,
  executionDir: string,
): string {
  // Check which artifacts exist
  const artifactStatus: Record<string, boolean> = {};
  for (const check of ARTIFACT_CHECKS) {
    artifactStatus[check.file] = existsSync(join(executionDir, check.file));
  }
  const hasCoordination = existsSync(join(executionDir, "coordination.md"));

  // Determine pipeline phase
  let phase: PipelinePhase = "execution";
  if (!artifactStatus["clarification.json"]) {
    phase = "clarification";
  } else if (!artifactStatus["scope-contract.md"]) {
    phase = "scope-contract";
  } else if (!artifactStatus["research.md"]) {
    phase = "research";
  } else if (!artifactStatus["analysis.json"]) {
    phase = "analysis-and-planning";
  } else if (hasCoordination) {
    phase = "execution";
  }

  // Parse wave position from coordination.md
  let wavePosition = "N/A";
  if (hasCoordination) {
    wavePosition = parseWavePosition(join(executionDir, "coordination.md"));
  }

  const configPath = join(projectRoot, ".claude", "codescope", "config.yml");
  const timestamp = new Date().toISOString();

  // Build YAML frontmatter
  const frontmatter = [
    "---",
    `task_slug: ${taskSlug}`,
    `pipeline_phase: ${phase}`,
    `wave_position: ${wavePosition}`,
    `timestamp: ${timestamp}`,
    `orient_dir: ${executionDir}`,
    `config_path: ${configPath}`,
    "---",
  ].join("\n");

  // Build sections
  const completedWork = buildCompletedWork(artifactStatus, hasCoordination);
  const remainingTasks = buildRemainingTasks(artifactStatus, hasCoordination);
  const keyDecisions = buildKeyDecisions(executionDir);
  const activeFindings =
    "(Captured at compaction -- check reports directory for details)";
  const resumeCommand = `/codescope:resume ${taskSlug}`;

  const body = [
    "",
    "## Completed Work",
    "",
    completedWork,
    "",
    "## Remaining Tasks",
    "",
    remainingTasks,
    "",
    "## Key Decisions",
    "",
    keyDecisions,
    "",
    "## Active Findings",
    "",
    activeFindings,
    "",
    "## Resume Command",
    "",
    resumeCommand,
    "",
  ].join("\n");

  return frontmatter + body;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function parseWavePosition(coordinationPath: string): string {
  try {
    const content = readFileSync(coordinationPath, "utf-8");
    const waveCompletePattern =
      /\|\s*[\dT:\-]+\s*\|\s*\w+\s*\|\s*wave_(\d+)_complete\s*\|/g;
    let maxWave = 0;
    let match: RegExpExecArray | null;
    while ((match = waveCompletePattern.exec(content)) !== null) {
      const waveNum = parseInt(match[1], 10);
      if (waveNum > maxWave) maxWave = waveNum;
    }
    if (maxWave > 0) {
      const totalWavePattern = /total.*?(\d+)\s*wave/i;
      const totalMatch = totalWavePattern.exec(content);
      const total = totalMatch ? totalMatch[1] : "?";
      return `${maxWave}/${total}`;
    }
    return "N/A";
  } catch {
    return "N/A";
  }
}

function buildCompletedWork(
  artifactStatus: Record<string, boolean>,
  hasCoordination: boolean,
): string {
  const lines: string[] = [];

  for (const check of ARTIFACT_CHECKS) {
    if (artifactStatus[check.file]) {
      lines.push(`- [x] ${check.label} (${check.file})`);
    }
  }
  if (hasCoordination) {
    lines.push("- [x] Execution started (coordination.md)");
  }

  return lines.length > 0 ? lines.join("\n") : "(No completed work)";
}

function buildRemainingTasks(
  artifactStatus: Record<string, boolean>,
  hasCoordination: boolean,
): string {
  const lines: string[] = [];

  for (const check of ARTIFACT_CHECKS) {
    if (!artifactStatus[check.file]) {
      lines.push(`- [ ] ${check.label}`);
    }
  }
  if (!hasCoordination) {
    lines.push("- [ ] Execution");
  }
  lines.push("- [ ] Verification");
  lines.push("- [ ] Evaluation");
  lines.push("- [ ] Learning Capture");

  return lines.join("\n");
}

function buildKeyDecisions(executionDir: string): string {
  const scopeContractPath = join(executionDir, "scope-contract.md");

  if (!existsSync(scopeContractPath)) {
    return "(No decisions captured)";
  }

  try {
    const content = readFileSync(scopeContractPath, "utf-8");
    const lines: string[] = [];

    // Look for lines containing "decision" or "constraint" (case-insensitive)
    const contentLines = content.split("\n");
    for (const line of contentLines) {
      const lower = line.toLowerCase();
      if (
        (lower.includes("decision") || lower.includes("constraint")) &&
        line.trim().startsWith("-")
      ) {
        lines.push(line.trim());
      }
    }

    return lines.length > 0 ? lines.join("\n") : "(No decisions captured)";
  } catch {
    return "(No decisions captured)";
  }
}

// ---------------------------------------------------------------------------
// writeHandoffFile
// ---------------------------------------------------------------------------

/**
 * Write a handoff file to the sessions directory.
 *
 * Creates the sessions directory if it doesn't exist.
 * Returns the absolute path to the written file.
 */
export function writeHandoffFile(
  sessionsDir: string,
  taskSlug: string,
  content: string,
): string {
  mkdirSync(sessionsDir, { recursive: true });
  const handoffPath = join(sessionsDir, `${taskSlug}-handoff.md`);
  writeFileSync(handoffPath, content);
  return handoffPath;
}
