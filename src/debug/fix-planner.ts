// ---------------------------------------------------------------------------
// Fix Planner: creates mini ExecutionPlan objects from eval findings
// ---------------------------------------------------------------------------
// Per D-11, D-12, D-15, D-16, D-23, D-24, D-29.
// Groups findings by file, creates AgentAssignment per group, caps at 3 agents.
// Produces ExecutionPlan compatible with runExecution from orchestrator.
// ---------------------------------------------------------------------------

import type {
  ExecutionPlan,
  AgentAssignment,
} from "../orient/types.js";
import type { EvalFinding } from "../eval/types.js";
import type { FixTask } from "./types.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_AGENTS_PER_PLAN = 3;
const ESTIMATED_TOKENS_PER_AGENT = 5000;
const DEFAULT_TIMEOUT_SECONDS = 120;
const MAX_TASK_DESCRIPTION_LENGTH = 500;

// ---------------------------------------------------------------------------
// createFixPlan
// ---------------------------------------------------------------------------

/**
 * Create a mini ExecutionPlan from eval findings.
 * Groups findings by file, creates one AgentAssignment per file group,
 * caps at MAX_AGENTS_PER_PLAN agents (excess findings bundled into last agent).
 *
 * Per D-11: 1-3 fix tasks per plan using existing execution orchestrator.
 * Per D-16: atomic commits per finding group.
 *
 * @param findings - Eval findings to create fix tasks for
 * @param taskSlug - Parent task identifier
 * @param scopeContractPath - Path to scope contract for agent context
 * @returns ExecutionPlan compatible with runExecution
 */
export function createFixPlan(
  findings: EvalFinding[],
  taskSlug: string,
  scopeContractPath: string,
): ExecutionPlan {
  // Group findings by file
  const fileGroups = new Map<string, EvalFinding[]>();
  for (const finding of findings) {
    const existing = fileGroups.get(finding.file) ?? [];
    existing.push(finding);
    fileGroups.set(finding.file, existing);
  }

  // Convert to array of [file, findings] pairs
  let groups = Array.from(fileGroups.entries());

  // Cap at MAX_AGENTS_PER_PLAN: merge excess groups into the last agent
  if (groups.length > MAX_AGENTS_PER_PLAN) {
    const kept = groups.slice(0, MAX_AGENTS_PER_PLAN - 1);
    const overflow = groups.slice(MAX_AGENTS_PER_PLAN - 1);

    // Merge overflow into a single group keyed by first overflow file
    const mergedFile = overflow[0][0];
    const mergedFindings: EvalFinding[] = [];
    for (const [, f] of overflow) {
      mergedFindings.push(...f);
    }
    kept.push([mergedFile, mergedFindings]);
    groups = kept;
  }

  // Create agents
  const agents: AgentAssignment[] = groups.map(([file, groupFindings]) => {
    // Build agent name from file path
    const name = `fix-${file.replace(/[^a-z0-9]/gi, "-").slice(0, 40)}`;

    // Build task description with finding descriptions
    const descriptions = groupFindings
      .map((f) => f.description)
      .join("; ");
    let task = `Fix ${groupFindings.length} finding(s) in ${file}: ${descriptions}`;
    if (task.length > MAX_TASK_DESCRIPTION_LENGTH) {
      task = task.slice(0, MAX_TASK_DESCRIPTION_LENGTH - 3) + "...";
    }

    // Extract golden files from findings with goldenFileRef
    const goldenFileRefs = new Set<string>();
    const goldenFiles: Array<{ path: string; lines: string }> = [];
    for (const f of groupFindings) {
      if (f.goldenFileRef && !goldenFileRefs.has(f.goldenFileRef)) {
        goldenFileRefs.add(f.goldenFileRef);
        goldenFiles.push({ path: f.goldenFileRef, lines: "1-50" });
      }
    }

    return {
      name,
      wave: 1,
      task,
      exclusiveWriteFiles: [file],
      readOnlyFiles: [],
      conventions: [],
      goldenFiles,
      dependsOn: [],
      estimatedTokens: ESTIMATED_TOKENS_PER_AGENT,
      timeoutSeconds: DEFAULT_TIMEOUT_SECONDS,
    };
  });

  return {
    taskSlug: `${taskSlug}-debug`,
    createdAt: new Date().toISOString(),
    status: "APPROVED",
    strategy: "sequential",
    estimatedAgents: agents.length,
    estimatedTotalTokens: agents.length * ESTIMATED_TOKENS_PER_AGENT,
    agents,
    waves: [
      {
        waveNumber: 1,
        agents: agents.map((a) => a.name),
        mode: "sequential",
      },
    ],
    validationResults: [],
    removedByUser: [],
  };
}

// ---------------------------------------------------------------------------
// isDesignDecision
// ---------------------------------------------------------------------------

/**
 * Check if a finding represents a design decision that should be escalated.
 * Per D-29: simple category check. More nuanced detection (public API changes
 * etc.) happens in the LLM prompt which categorizes findings.
 *
 * @param finding - The eval finding to check
 * @returns true if the finding is a design decision
 */
export function isDesignDecision(finding: EvalFinding): boolean {
  return finding.category === "design_decision";
}

// ---------------------------------------------------------------------------
// buildFixPrompt
// ---------------------------------------------------------------------------

/**
 * Build a scoped prompt for a fix agent.
 * Per D-23: specific findings + affected file + golden file excerpts + scope contract.
 * Per D-15: golden file excerpts as fix patterns for higher accuracy.
 *
 * @param fixTask - The fix task containing file, findings, and golden excerpts
 * @param scopeContractPath - Path to scope contract (by reference)
 * @returns Complete prompt string for the fix agent
 */
export function buildFixPrompt(
  fixTask: FixTask,
  scopeContractPath: string,
): string {
  const sections: string[] = [];

  // Header
  sections.push("# Fix Agent: Targeted Repair");
  sections.push("");
  sections.push(
    `Fix the following findings in ${fixTask.file}. Make minimal changes to resolve each finding.`,
  );

  // Scope contract by reference
  sections.push("");
  sections.push(`Read: \`${scopeContractPath}\``);

  // Findings section
  sections.push("");
  sections.push("## Findings");
  sections.push("");
  for (const finding of fixTask.findings) {
    sections.push(
      `- [${finding.severity}] \`${finding.file}:${finding.line}\` -- ${finding.description}`,
    );
    sections.push(`  Evidence: ${finding.evidence}`);
  }

  // Golden file section
  if (fixTask.goldenFileExcerpts.size > 0) {
    sections.push("");
    sections.push("## Golden Files");
    sections.push("");
    for (const [filePath] of fixTask.goldenFileExcerpts) {
      sections.push(`- Follow the pattern in: \`${filePath}\``);
    }
  }

  // Instruction
  sections.push("");
  sections.push(
    "After fixing, run the project's test command to verify no regressions. Commit each fix group atomically.",
  );

  return sections.join("\n");
}
