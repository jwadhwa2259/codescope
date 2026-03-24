// ---------------------------------------------------------------------------
// Execution orchestrator: thin wave runner with coordination and summary
// Per EXEC-01, EXEC-04, EXEC-05, EXEC-06, D-24, D-36/D-37/D-38.
// ---------------------------------------------------------------------------

import * as fs from "node:fs";
import * as path from "node:path";
import type {
  ExecutionOptions,
  ExecutionResult,
  AgentResult,
} from "./types.js";
import type { ExecutionPlan, AgentAssignment, ExecutionWave } from "../orient/types.js";
import {
  initCoordinationFile,
  appendCoordinationEntry,
} from "./coordination.js";
import { detectAgentTeams } from "./teams-detector.js";
import { buildWaveSchedule } from "./wave-scheduler.js";
import {
  buildAgentPrompt,
  buildAgentInvocation,
  writeChangeReport,
} from "./agent-spawner.js";
import type { AgentInvocation, AgentPromptContext } from "./agent-spawner.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Callbacks provided by the skill body for agent dispatch.
 * The orchestrator prepares invocations but does NOT directly call Claude
 * Code's Agent tool. The skill body provides dispatchAgent implementation.
 */
export interface ExecutionCallbacks {
  dispatchAgent: (
    invocation: AgentInvocation,
  ) => Promise<{ success: boolean; output?: string; error?: string }>;
  onProgress: (message: string) => void;
}

// ---------------------------------------------------------------------------
// readPlanFromDisk
// ---------------------------------------------------------------------------

/**
 * Read and parse an execution plan from disk.
 * Supports JSON format.
 *
 * @param planPath - Path to the plan file
 * @returns Parsed ExecutionPlan
 */
export function readPlanFromDisk(planPath: string): ExecutionPlan {
  const content = fs.readFileSync(planPath, "utf-8");
  return JSON.parse(content) as ExecutionPlan;
}

// ---------------------------------------------------------------------------
// writeExecutionSummary
// ---------------------------------------------------------------------------

/**
 * Write an execution summary matching the UI-SPEC format (lines 333-370).
 *
 * @param result - The execution result
 * @param executionDir - Directory to write summary to
 * @param taskSlug - Task identifier
 * @returns Path to the written summary file
 */
export function writeExecutionSummary(
  result: ExecutionResult,
  executionDir: string,
  taskSlug: string,
): string {
  const summaryPath = path.join(executionDir, "summary.md");
  const timestamp = new Date().toISOString();
  const durationSec = Math.round(result.durationMs / 1000);

  // Build results table
  const resultRows = result.agents
    .map((a) => {
      const durStr =
        a.status === "skipped" ? "-" : `${Math.round(a.durationMs / 1000)}s`;
      const filesStr = a.filesChanged.length.toString();
      const linesStr =
        a.status === "skipped"
          ? "0"
          : `+${a.linesAdded}/-${a.linesRemoved}`;
      const depNote =
        a.status === "skipped" && a.error
          ? ` (dep: ${a.error.replace(/^Dependency\s+/, "").split(" ")[0]})`
          : "";
      return `| ${a.name} | **${a.status}** | ${durStr} | ${filesStr} | ${linesStr}${depNote} |`;
    })
    .join("\n");

  // Compute totals
  const succeeded = result.agents.filter(
    (a) => a.status === "complete",
  ).length;
  const totalAgents = result.agents.length;
  const totalFiles = result.agents.reduce(
    (sum, a) => sum + a.filesChanged.length,
    0,
  );
  const totalAdded = result.agents.reduce((sum, a) => sum + a.linesAdded, 0);
  const totalRemoved = result.agents.reduce(
    (sum, a) => sum + a.linesRemoved,
    0,
  );

  // Next step
  const nextStep =
    result.status === "complete"
      ? "Proceeding to verification..."
      : "Partial results -- review with `git diff`";

  // Build failures section
  const failures = result.agents.filter(
    (a) => a.status === "failed" || a.status === "skipped",
  );
  let failuresSection = "";
  if (failures.length > 0) {
    const failureEntries = failures
      .map((a) => {
        const lines = [`### ${a.name}`, ""];
        lines.push(`- **Error:** ${a.error ?? "Unknown error"}`);
        lines.push(`- **Retry:** ${a.retried ? "attempted" : "not attempted"}`);
        if (a.status === "skipped") {
          lines.push(`- **Skipped:** dependency failed`);
        }
        return lines.join("\n");
      })
      .join("\n\n");
    failuresSection = `\n## Failures\n\n${failureEntries}\n`;
  }

  const tokensK = Math.round(result.tokensEstimate / 1000);

  const summary = [
    `# Execution Summary: ${taskSlug}`,
    "",
    `**Completed:** ${timestamp}`,
    `**Duration:** ${durationSec}s`,
    `**Mode:** ${result.mode}`,
    "",
    "## Results",
    "",
    "| Agent | Status | Duration | Files | Lines Changed |",
    "|-------|--------|----------|-------|---------------|",
    resultRows,
    "",
    "## Totals",
    "",
    `- **Agents:** ${succeeded}/${totalAgents} succeeded`,
    `- **Files changed:** ${totalFiles}`,
    `- **Lines changed:** +${totalAdded}/-${totalRemoved}`,
    `- **Tokens used:** ~${tokensK}K`,
    `- **Execution mode:** ${result.mode}`,
    "",
    "## Next Step",
    "",
    nextStep,
    failuresSection,
  ].join("\n");

  fs.writeFileSync(summaryPath, summary, "utf-8");
  return summaryPath;
}

// ---------------------------------------------------------------------------
// runExecution
// ---------------------------------------------------------------------------

/**
 * Run the execution orchestrator.
 *
 * Reads plan from disk, detects agent teams, manages wave-based dispatch,
 * handles failures with retry + dependent skip, writes coordination entries,
 * and produces the execution summary.
 *
 * Stays thin (<15K tokens per EXEC-06) by delegating agent dispatch to
 * callbacks and keeping all state on disk.
 *
 * @param options - Execution configuration
 * @param callbacks - Dispatch and progress callbacks from the skill body
 * @returns ExecutionResult with agent results and summary path
 */
export async function runExecution(
  options: ExecutionOptions,
  callbacks: ExecutionCallbacks,
): Promise<ExecutionResult> {
  const startMs = Date.now();
  const { projectRoot, taskSlug, planPath, maxConcurrent, verbosity } = options;
  const { dispatchAgent, onProgress } = callbacks;

  // 1. Read plan from disk
  const plan = readPlanFromDisk(planPath);

  // 2. Set up execution directory
  const executionDir = path.join(projectRoot, "execution", taskSlug);
  fs.mkdirSync(executionDir, { recursive: true });

  // 3. Detect agent teams availability (EXEC-04)
  const teamsAvailability = detectAgentTeams();

  // 4. Determine effective execution mode
  const hasParallelWaves = plan.waves.some(
    (w) => w.mode === "parallel" && w.agents.length > 1,
  );
  const effectiveMode: "sequential" | "parallel" | "wave-based" =
    hasParallelWaves && teamsAvailability.available
      ? plan.strategy
      : "sequential";

  // 5. Initialize coordination file
  const coordinationPath = initCoordinationFile(
    executionDir,
    taskSlug,
    effectiveMode,
  );

  // 6. Execute waves
  const agentResults: AgentResult[] = [];
  const failedAgents = new Set<string>();

  // Build lookup for agent assignments
  const agentMap = new Map<string, AgentAssignment>();
  for (const agent of plan.agents) {
    agentMap.set(agent.name, agent);
  }

  // Build dependency reverse map: for each agent, which agents transitively depend on it
  const dependentsOf = buildDependentsMap(plan.agents);

  for (const wave of plan.waves) {
    // Emit wave banner per D-24
    onProgress(
      `Executing wave ${wave.waveNumber}/${plan.waves.length}: [${wave.agents.join(", ")}]...`,
    );

    const waveMode =
      wave.mode === "parallel" && teamsAvailability.available
        ? "parallel"
        : "sequential";

    const executionMode: "sequential" | "parallel" | "wave-based" =
      waveMode === "parallel"
        ? effectiveMode === "wave-based"
          ? "wave-based"
          : "parallel"
        : "sequential";

    if (waveMode === "parallel") {
      // Dispatch all wave agents concurrently (EXEC-04)
      const promises = wave.agents.map(async (agentName) => {
        return executeAgent(
          agentName,
          agentMap,
          failedAgents,
          executionMode,
          coordinationPath,
          executionDir,
          options,
          dispatchAgent,
          onProgress,
        );
      });

      const results = await Promise.all(promises);
      for (const r of results) {
        agentResults.push(r);
        if (r.status === "failed") {
          failedAgents.add(r.name);
        }
      }
    } else {
      // Sequential dispatch
      for (const agentName of wave.agents) {
        const result = await executeAgent(
          agentName,
          agentMap,
          failedAgents,
          executionMode,
          coordinationPath,
          executionDir,
          options,
          dispatchAgent,
          onProgress,
        );
        agentResults.push(result);
        if (result.status === "failed") {
          failedAgents.add(result.name);
        }
      }
    }
  }

  // 7. Determine overall status
  const allComplete = agentResults.every((a) => a.status === "complete");
  const allFailed = agentResults.every(
    (a) => a.status === "failed" || a.status === "skipped",
  );
  const overallStatus: "complete" | "partial" | "failed" = allComplete
    ? "complete"
    : allFailed
      ? "failed"
      : "partial";

  // 8. Compute tokens estimate
  const tokensEstimate = plan.agents.reduce(
    (sum, a) => sum + a.estimatedTokens,
    0,
  );

  // 9. Build result
  const durationMs = Date.now() - startMs;
  const result: ExecutionResult = {
    status: overallStatus,
    agents: agentResults,
    summaryPath: "",
    coordinationPath,
    durationMs,
    mode: effectiveMode,
    tokensEstimate,
  };

  // 10. Write execution summary
  const summaryPath = writeExecutionSummary(result, executionDir, taskSlug);
  result.summaryPath = summaryPath;

  return result;
}

// ---------------------------------------------------------------------------
// Internal: executeAgent
// ---------------------------------------------------------------------------

/**
 * Execute a single agent with retry logic per D-36.
 */
async function executeAgent(
  agentName: string,
  agentMap: Map<string, AgentAssignment>,
  failedAgents: Set<string>,
  executionMode: "sequential" | "parallel" | "wave-based",
  coordinationPath: string,
  executionDir: string,
  options: ExecutionOptions,
  dispatchAgent: ExecutionCallbacks["dispatchAgent"],
  onProgress: ExecutionCallbacks["onProgress"],
): Promise<AgentResult> {
  const assignment = agentMap.get(agentName);
  if (!assignment) {
    return {
      name: agentName,
      status: "failed",
      durationMs: 0,
      filesChanged: [],
      linesAdded: 0,
      linesRemoved: 0,
      error: `Agent ${agentName} not found in plan`,
      retried: false,
    };
  }

  // Check if any dependency failed -> skip per D-37
  const failedDep = assignment.dependsOn.find((dep) => failedAgents.has(dep));
  if (failedDep) {
    const skipResult: AgentResult = {
      name: agentName,
      status: "skipped",
      durationMs: 0,
      filesChanged: [],
      linesAdded: 0,
      linesRemoved: 0,
      error: `Dependency ${failedDep} failed`,
      retried: false,
    };

    appendCoordinationEntry(coordinationPath, {
      timestamp: new Date().toISOString(),
      agent: agentName,
      signal: "skipped",
      files: [],
      detail: `Dependency ${failedDep} failed`,
    });

    return skipResult;
  }

  // Build prompt and invocation
  const context: AgentPromptContext = {
    projectRoot: options.projectRoot,
    taskSlug: options.taskSlug,
    scopeContractPath: path.join(
      options.projectRoot,
      ".claude",
      "codescope",
      "orient",
      options.taskSlug,
      "scope-contract.md",
    ),
    planPath: options.planPath,
    researchPath: null,
    coordinationPath,
    executionDir,
    executionMode,
  };

  const prompt = buildAgentPrompt(assignment, context);
  const invocation = buildAgentInvocation(assignment, prompt);

  // Append started coordination entry
  appendCoordinationEntry(coordinationPath, {
    timestamp: new Date().toISOString(),
    agent: agentName,
    signal: "started",
    files: [],
    detail: `Wave ${assignment.wave}`,
  });

  const agentStartMs = Date.now();

  // First attempt
  let dispatchResult = await dispatchAgent(invocation);

  if (!dispatchResult.success) {
    // Retry once per D-36
    onProgress(
      `${agentName} **failed** (${dispatchResult.error ?? "unknown"}) -- retrying once...`,
    );

    appendCoordinationEntry(coordinationPath, {
      timestamp: new Date().toISOString(),
      agent: agentName,
      signal: "failed",
      files: [],
      detail: `First attempt: ${dispatchResult.error ?? "unknown"}`,
    });

    dispatchResult = await dispatchAgent(invocation);

    if (!dispatchResult.success) {
      // Retry also failed
      const durationMs = Date.now() - agentStartMs;
      onProgress(
        `${agentName} **failed** after retry -- skipping + dependents`,
      );

      appendCoordinationEntry(coordinationPath, {
        timestamp: new Date().toISOString(),
        agent: agentName,
        signal: "failed",
        files: [],
        detail: `Retry failed: ${dispatchResult.error ?? "unknown"}`,
      });

      return {
        name: agentName,
        status: "failed",
        durationMs,
        filesChanged: [],
        linesAdded: 0,
        linesRemoved: 0,
        error: dispatchResult.error ?? "Unknown error after retry",
        retried: true,
      };
    }
  }

  // Agent succeeded
  const durationMs = Date.now() - agentStartMs;
  const durationSec = Math.round(durationMs / 1000);

  // Write change report
  const agentResult: AgentResult = {
    name: agentName,
    status: "complete",
    durationMs,
    filesChanged: assignment.exclusiveWriteFiles,
    linesAdded: 0,
    linesRemoved: 0,
    retried: false,
  };

  const changeReportPath = writeChangeReport(agentResult, executionDir);
  agentResult.changeReportPath = changeReportPath;

  // Append done coordination entry
  appendCoordinationEntry(coordinationPath, {
    timestamp: new Date().toISOString(),
    agent: agentName,
    signal: "done",
    files: assignment.exclusiveWriteFiles,
    detail: `+0/-0 lines (${durationSec}s)`,
  });

  onProgress(
    `${agentName} complete (${durationSec}s, ${assignment.exclusiveWriteFiles.length} files)`,
  );

  return agentResult;
}

// ---------------------------------------------------------------------------
// Internal: buildDependentsMap
// ---------------------------------------------------------------------------

/**
 * Build a map of agent name -> set of agents that directly depend on it.
 * Used for tracking which agents to skip when a dependency fails.
 */
function buildDependentsMap(
  agents: AgentAssignment[],
): Map<string, Set<string>> {
  const dependents = new Map<string, Set<string>>();
  for (const agent of agents) {
    for (const dep of agent.dependsOn) {
      const existing = dependents.get(dep) ?? new Set<string>();
      existing.add(agent.name);
      dependents.set(dep, existing);
    }
  }
  return dependents;
}
