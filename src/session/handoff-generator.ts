// ---------------------------------------------------------------------------
// Handoff Document Generator
// ---------------------------------------------------------------------------
// Generates structured handoff documents from pipeline filesystem artifacts.
// Per D-10/D-11: YAML frontmatter + 5-section markdown body.
// Per D-12: writes to .claude/codescope/sessions/{taskSlug}-handoff.md.
// ---------------------------------------------------------------------------

import * as fs from "node:fs";
import * as path from "node:path";
import type { PipelinePhase, ArtifactStatus } from "./types.js";

// ---------------------------------------------------------------------------
// Pipeline phase ordering and artifact mapping
// ---------------------------------------------------------------------------

interface PhaseArtifact {
  phase: PipelinePhase;
  label: string;
  file: string;
  location: "execution"; // all artifacts live in execution dir
}

const PHASE_ARTIFACTS: PhaseArtifact[] = [
  {
    phase: "clarification",
    label: "Clarification",
    file: "clarification.json",
    location: "execution",
  },
  {
    phase: "scope-contract",
    label: "Scope Contract",
    file: "scope-contract.md",
    location: "execution",
  },
  {
    phase: "research",
    label: "Research",
    file: "research.md",
    location: "execution",
  },
  {
    phase: "analysis-and-planning",
    label: "Analysis & Planning",
    file: "analysis.json",
    location: "execution",
  },
];

// ---------------------------------------------------------------------------
// detectPipelinePhase
// ---------------------------------------------------------------------------

/**
 * Detect the current pipeline phase based on which artifacts exist on disk.
 *
 * Checks for each artifact file in order. Returns the FIRST phase whose
 * artifact does NOT exist (meaning that phase still needs to run).
 *
 * Special case: if coordination.md exists, the pipeline is in the execution
 * phase regardless of other post-analysis artifacts.
 *
 * If all artifacts exist, returns "learning-capture".
 */
export function detectPipelinePhase(
  executionDir: string,
  projectRoot: string,
  taskSlug: string,
): { name: PipelinePhase; wavePosition: string; artifacts: ArtifactStatus } {
  const artifacts: ArtifactStatus = {
    clarification: fs.existsSync(path.join(executionDir, "clarification.json")),
    scopeContract: fs.existsSync(path.join(executionDir, "scope-contract.md")),
    research: fs.existsSync(path.join(executionDir, "research.md")),
    analysis: fs.existsSync(path.join(executionDir, "analysis.json")),
    plan: false,
    coordination: fs.existsSync(path.join(executionDir, "coordination.md")),
    verifyReport: false,
    evalReport: false,
  };

  // Check plans dir for plan artifacts
  const plansDir = path.join(
    projectRoot,
    ".claude",
    "codescope",
    "plans",
  );
  if (fs.existsSync(plansDir)) {
    try {
      const planFiles = fs.readdirSync(plansDir);
      artifacts.plan = planFiles.some((f) => f.startsWith(taskSlug));
    } catch {
      // Non-fatal
    }
  }

  // Check reports dir for verify/eval reports
  const reportsDir = path.join(
    projectRoot,
    ".claude",
    "codescope",
    "reports",
  );
  if (fs.existsSync(reportsDir)) {
    try {
      const reportFiles = fs.readdirSync(reportsDir);
      const taskReports = reportFiles.filter((f) => f.startsWith(taskSlug));
      artifacts.verifyReport = taskReports.some(
        (f) => f.includes("verify") || f.includes("review"),
      );
      artifacts.evalReport = taskReports.some((f) => f.includes("eval"));
    } catch {
      // Non-fatal
    }
  }

  // Determine wave position from coordination.md
  let wavePosition = "N/A";
  if (artifacts.coordination) {
    wavePosition = parseWavePosition(
      path.join(executionDir, "coordination.md"),
    );
  }

  // If coordination.md exists, we're in execution phase
  // (even if verify/eval reports don't exist yet)
  if (artifacts.coordination && !artifacts.verifyReport) {
    return { name: "execution", wavePosition, artifacts };
  }

  // Check sequential artifact phases
  if (!artifacts.clarification) {
    return { name: "clarification", wavePosition, artifacts };
  }
  if (!artifacts.scopeContract) {
    return { name: "scope-contract", wavePosition, artifacts };
  }
  if (!artifacts.research) {
    return { name: "research", wavePosition, artifacts };
  }
  if (!artifacts.analysis) {
    return { name: "analysis-and-planning", wavePosition, artifacts };
  }

  // Post-execution phases
  if (artifacts.verifyReport && !artifacts.evalReport) {
    return { name: "evaluation", wavePosition, artifacts };
  }
  if (artifacts.verifyReport && artifacts.evalReport) {
    return { name: "learning-capture", wavePosition, artifacts };
  }

  // analysis done but no coordination = about to start execution
  return { name: "execution", wavePosition, artifacts };
}

/**
 * Parse coordination.md to extract wave position (e.g., "2/3").
 * Looks for lines matching `| YYYY-MM-DDTHH:mm | agent | wave_N_complete |`.
 */
function parseWavePosition(coordinationPath: string): string {
  try {
    const content = fs.readFileSync(coordinationPath, "utf-8");
    const waveCompletePattern =
      /\|\s*[\dT:\-]+\s*\|\s*\w+\s*\|\s*wave_(\d+)_complete\s*\|/g;
    let maxWave = 0;
    let match: RegExpExecArray | null;
    while ((match = waveCompletePattern.exec(content)) !== null) {
      const waveNum = parseInt(match[1], 10);
      if (waveNum > maxWave) maxWave = waveNum;
    }

    if (maxWave > 0) {
      // Try to find total waves from the document
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

// ---------------------------------------------------------------------------
// generateHandoff
// ---------------------------------------------------------------------------

/**
 * Generate a handoff document from pipeline filesystem state.
 *
 * Returns null if the execution directory does not exist.
 * Otherwise, returns a complete markdown string with YAML frontmatter
 * and 5 body sections per D-10/D-11.
 */
export function generateHandoff(
  projectRoot: string,
  taskSlug: string,
  options?: { executionDir?: string },
): string | null {
  const executionDir =
    options?.executionDir ??
    path.join(projectRoot, ".claude", "codescope", "execution", taskSlug);

  if (!fs.existsSync(executionDir)) {
    return null;
  }

  const phase = detectPipelinePhase(executionDir, projectRoot, taskSlug);
  const configPath = path.join(
    projectRoot,
    ".claude",
    "codescope",
    "config.yml",
  );

  // Build YAML frontmatter
  const frontmatter = [
    "---",
    `task_slug: ${taskSlug}`,
    `pipeline_phase: ${phase.name}`,
    `wave_position: ${phase.wavePosition}`,
    `timestamp: ${new Date().toISOString()}`,
    `orient_dir: ${executionDir}`,
    `config_path: ${configPath}`,
    "---",
  ].join("\n");

  // Build body sections
  const completedWork = buildCompletedWork(phase.artifacts, executionDir);
  const remainingTasks = buildRemainingTasks(phase.artifacts);
  const keyDecisions = buildKeyDecisions(executionDir);
  const activeFindings = buildActiveFindings(projectRoot, taskSlug);
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
// Body section builders
// ---------------------------------------------------------------------------

function buildCompletedWork(
  artifacts: ArtifactStatus,
  _executionDir: string,
): string {
  const lines: string[] = [];

  if (artifacts.clarification) {
    lines.push("- [x] Clarification (clarification.json)");
  }
  if (artifacts.scopeContract) {
    lines.push("- [x] Scope Contract (scope-contract.md)");
  }
  if (artifacts.research) {
    lines.push("- [x] Research (research.md)");
  }
  if (artifacts.analysis) {
    lines.push("- [x] Analysis & Planning (analysis.json)");
  }
  if (artifacts.plan) {
    lines.push("- [x] Plan artifact written");
  }
  if (artifacts.coordination) {
    lines.push("- [x] Execution started (coordination.md)");
  }
  if (artifacts.verifyReport) {
    lines.push("- [x] Verification complete");
  }
  if (artifacts.evalReport) {
    lines.push("- [x] Evaluation complete");
  }

  return lines.length > 0 ? lines.join("\n") : "(No completed work)";
}

function buildRemainingTasks(artifacts: ArtifactStatus): string {
  const lines: string[] = [];

  if (!artifacts.clarification) {
    lines.push("- [ ] Clarification");
  }
  if (!artifacts.scopeContract) {
    lines.push("- [ ] Scope Contract");
  }
  if (!artifacts.research) {
    lines.push("- [ ] Research");
  }
  if (!artifacts.analysis) {
    lines.push("- [ ] Analysis & Planning");
  }
  if (!artifacts.coordination) {
    lines.push("- [ ] Execution");
  }
  if (!artifacts.verifyReport) {
    lines.push("- [ ] Verification");
  }
  if (!artifacts.evalReport) {
    lines.push("- [ ] Evaluation");
  }
  // Learning capture is always last
  lines.push("- [ ] Learning Capture");

  return lines.join("\n");
}

function buildKeyDecisions(executionDir: string): string {
  const scopeContractPath = path.join(executionDir, "scope-contract.md");

  if (!fs.existsSync(scopeContractPath)) {
    return "(No decisions captured)";
  }

  try {
    const content = fs.readFileSync(scopeContractPath, "utf-8");
    const lines: string[] = [];

    // Extract decisions/constraints sections from scope contract
    const sections = content.split(/^##\s+/m);
    for (const section of sections) {
      const lowerSection = section.toLowerCase();
      if (
        lowerSection.startsWith("decision") ||
        lowerSection.startsWith("constraint") ||
        lowerSection.startsWith("key decision")
      ) {
        // Extract bullet points from this section
        const bulletLines = section.split("\n").filter((l) => l.startsWith("- "));
        lines.push(...bulletLines);
      }
    }

    return lines.length > 0 ? lines.join("\n") : "(No decisions captured)";
  } catch {
    return "(No decisions captured)";
  }
}

function buildActiveFindings(
  projectRoot: string,
  taskSlug: string,
): string {
  const reportsDir = path.join(
    projectRoot,
    ".claude",
    "codescope",
    "reports",
  );

  if (!fs.existsSync(reportsDir)) {
    return "(No findings yet -- pre-verification)";
  }

  try {
    const reportFiles = fs
      .readdirSync(reportsDir)
      .filter((f) => f.startsWith(taskSlug))
      .sort(); // alphabetical, latest report type last

    if (reportFiles.length === 0) {
      return "(No findings yet -- pre-verification)";
    }

    // Read the latest report and extract summary lines
    const latestReport = reportFiles[reportFiles.length - 1];
    const content = fs.readFileSync(
      path.join(reportsDir, latestReport),
      "utf-8",
    );

    // Extract summary lines (first non-empty lines after any heading)
    const lines = content
      .split("\n")
      .filter((l) => l.trim().length > 0 && !l.startsWith("#"))
      .slice(0, 10); // Cap at 10 summary lines

    return lines.length > 0
      ? lines.join("\n")
      : "(No findings yet -- pre-verification)";
  } catch {
    return "(No findings yet -- pre-verification)";
  }
}

// ---------------------------------------------------------------------------
// writeHandoff
// ---------------------------------------------------------------------------

/**
 * Write a handoff document to the sessions directory.
 *
 * Per D-12: writes to .claude/codescope/sessions/{taskSlug}-handoff.md.
 * Creates the sessions directory if it doesn't exist.
 *
 * @returns The absolute path to the written handoff file.
 */
export function writeHandoff(
  projectRoot: string,
  taskSlug: string,
  content: string,
): string {
  const sessionsDir = path.join(
    projectRoot,
    ".claude",
    "codescope",
    "sessions",
  );
  fs.mkdirSync(sessionsDir, { recursive: true });

  const handoffPath = path.join(sessionsDir, `${taskSlug}-handoff.md`);
  fs.writeFileSync(handoffPath, content);

  return handoffPath;
}
