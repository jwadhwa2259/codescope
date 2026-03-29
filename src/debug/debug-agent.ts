// ---------------------------------------------------------------------------
// Debug Agent: bounded fix loop with scoped re-verify and re-eval
// ---------------------------------------------------------------------------
// Per D-11, D-12, D-13, D-14, D-20, D-23, D-24, D-27, D-29.
// Follows agent module pattern: Options + Result + async function (Phase 2).
//
// The debug loop:
// 1. Separate design decisions from auto-fixable findings
// 2. Escalate design decisions via callback
// 3. For each cycle (up to maxCycles):
//    a. Create fix plan from remaining fixable findings
//    b. Dispatch fix agents
//    c. Scoped re-verify changed files
//    d. Scoped re-eval targeted findings
//    e. Update resolved/remaining tracking
// 4. Return DebugResult with resolution stats
// ---------------------------------------------------------------------------

import type { EvalFinding } from "../eval/types.js";
import { CLASSIFICATION_PRIORITY } from "../eval/classifier.js";
import type { FailureClassification } from "../eval/classifier.js";
import type { DebugCycleResult } from "../eval/types.js";
import type {
  DebugOptions,
  DebugResult,
  DebugCallbacks,
  DesignDecision,
  FixTask,
} from "./types.js";
import { createFixPlan, isDesignDecision, buildFixPrompt } from "./fix-planner.js";
import { parseEvalFindings } from "../eval/eval-agent.js";
import { appendDebugCycleSection } from "../eval/report-appender.js";

// ---------------------------------------------------------------------------
// runDebug
// ---------------------------------------------------------------------------

/**
 * Run the bounded debug loop.
 *
 * Creates targeted fix plans from eval findings, dispatches them through
 * the execution system, runs scoped re-verification and re-evaluation,
 * and tracks resolution across cycles.
 *
 * Per D-14: caps at maxCycles with status report of what was tried.
 * Per D-20: stops early when no ERROR/WARN findings remain.
 * Per D-27: committed fixes preserved even on crash.
 *
 * @param options - Debug configuration including findings and cycle limits
 * @param callbacks - Dispatch and progress callbacks
 * @returns DebugResult with resolution stats
 */
export async function runDebug(
  options: DebugOptions,
  callbacks: DebugCallbacks,
): Promise<DebugResult> {
  const startTime = Date.now();

  const resolved: EvalFinding[] = [];
  const escalated: EvalFinding[] = [];
  const commits: Array<{ hash: string; findings: string[] }> = [];

  let remaining = [...options.findings];

  // ---- Step 1: Separate design decisions ----

  const designDecisions = remaining.filter((f) => isDesignDecision(f));
  let fixable = remaining.filter((f) => !isDesignDecision(f));

  // ---- Step 1b: Sort fixable findings by classification priority (D-06) ----
  // CODE_BUG first, then CONVENTION_MISS, PLAN_GAP, SCOPE_DRIFT
  fixable.sort((a, b) => {
    const aPri = CLASSIFICATION_PRIORITY[(a.classification ?? "CODE_BUG") as FailureClassification] ?? 99;
    const bPri = CLASSIFICATION_PRIORITY[(b.classification ?? "CODE_BUG") as FailureClassification] ?? 99;
    return aPri - bPri;
  });

  // ---- Step 2: Escalate design decisions ----

  for (const finding of designDecisions) {
    const decision: DesignDecision = {
      finding,
      options: [
        {
          id: "option-a",
          description: `Fix approach: resolve ${finding.description} directly`,
          impact: `Modifies ${finding.file}`,
        },
        {
          id: "option-b",
          description: `Alternative approach: workaround for ${finding.description}`,
          impact: `May require additional changes`,
        },
        {
          id: "skip",
          description: "Skip this finding",
          impact: "Finding remains unresolved",
        },
      ],
    };

    const userChoice = await callbacks.onDesignDecision(decision);

    if (userChoice === "skip") {
      escalated.push(finding);
    } else {
      // User chose an option -- add to fixable with chosen approach noted
      fixable.push({
        ...finding,
        description: `${finding.description} (user chose: ${userChoice})`,
      });
    }
  }

  // ---- Step 3: Check if any ERROR/WARN fixable findings exist (D-20) ----

  let cyclesUsed = 0;

  if (!hasActionableFindings(fixable)) {
    return {
      cyclesUsed,
      resolved,
      remaining: fixable,
      commits,
      escalated,
      timing_ms: Date.now() - startTime,
    };
  }

  // ---- Step 4: Debug loop ----

  for (let cycle = 1; cycle <= options.maxCycles; cycle++) {
    // Check if any ERROR/WARN remain
    if (!hasActionableFindings(fixable)) {
      break;
    }

    cyclesUsed = cycle;
    callbacks.onProgress(`## Debug cycle ${cycle}/${options.maxCycles}...`);

    // Create fix plan
    const plan = createFixPlan(
      fixable,
      options.taskSlug,
      options.scopeContractPath,
    );

    // Track changed files for re-verify
    const changedFiles: string[] = [];
    const cyclePlanResults: DebugCycleResult["fixPlans"] = [];

    // Dispatch fix agents
    for (const agent of plan.agents) {
      // Build fix task
      const agentFindings = fixable.filter((f) =>
        agent.exclusiveWriteFiles.includes(f.file),
      );

      const goldenFileExcerpts = new Map<string, string>();
      for (const f of agentFindings) {
        if (f.goldenFileRef) {
          goldenFileExcerpts.set(f.goldenFileRef, "");
        }
      }

      const fixTask: FixTask = {
        file: agent.exclusiveWriteFiles[0],
        findings: agentFindings,
        goldenFileExcerpts,
      };

      const prompt = buildFixPrompt(fixTask, options.scopeContractPath);

      try {
        const result = await callbacks.dispatchFixAgent(prompt);

        changedFiles.push(...agent.exclusiveWriteFiles);

        // Extract commit hash from output if present
        let commitHash: string | undefined;
        let commitMessage: string | undefined;
        if (result.success && result.output) {
          const hashMatch = result.output.match(/Commit:\s*([a-f0-9]{6,40})/i);
          if (hashMatch) {
            commitHash = hashMatch[1];
            commitMessage = `Fix ${agentFindings.length} finding(s) in ${fixTask.file}`;
            commits.push({
              hash: commitHash,
              findings: agentFindings.map((f) => f.id),
            });
          }
        }

        cyclePlanResults.push({
          description: `Fix ${fixTask.file}`,
          files: agent.exclusiveWriteFiles,
          findingsAddressed: agentFindings.map((f) => f.id),
          result: result.success ? "fixed" : "failed",
          commitHash,
          commitMessage,
        });
      } catch (err) {
        // Per D-27: crash recovery -- committed fixes preserved
        cyclePlanResults.push({
          description: `Fix ${fixTask.file}`,
          files: agent.exclusiveWriteFiles,
          findingsAddressed: agentFindings.map((f) => f.id),
          result: "failed",
        });
      }
    }

    // Scoped re-verify: only changed files
    let verifyResult = { newIssues: 0 };
    if (changedFiles.length > 0) {
      try {
        verifyResult = await callbacks.dispatchVerifyAgent(changedFiles);
      } catch {
        // Verify failure is non-fatal
      }
    }

    // Scoped re-eval: targeting only this cycle's findings
    let reEvalFindings: EvalFinding[] = [];
    try {
      const scopedPrompt = buildScopedReEvalPrompt(
        fixable,
        options.scopeContractPath,
      );
      const reEvalResponse = await callbacks.dispatchEvalAgent(scopedPrompt);
      reEvalFindings = parseEvalFindings(reEvalResponse);
    } catch {
      // Re-eval failure: assume all findings remain
      reEvalFindings = [...fixable];
    }

    // Determine resolved: findings from this cycle that no longer appear in re-eval.
    // Re-eval findings get fresh IDs from parseEvalFindings, so match by
    // file + criterion + line-bucket (same key generation as parseEvalFindings).
    const reEvalKeys = new Set(reEvalFindings.map((f) => findingMatchKey(f)));
    const newlyResolved = fixable.filter(
      (f) => !reEvalKeys.has(findingMatchKey(f)),
    );
    resolved.push(...newlyResolved);

    // New findings from re-eval that weren't in our fixable set
    const fixableKeys = new Set(fixable.map((f) => findingMatchKey(f)));
    const newFindings = reEvalFindings.filter(
      (f) => !fixableKeys.has(findingMatchKey(f)),
    );

    // Update fixable: remaining (matched in re-eval) + new findings
    fixable = [
      ...fixable.filter((f) => reEvalKeys.has(findingMatchKey(f))),
      ...newFindings,
    ];

    // Build DebugCycleResult and append to report
    const cycleResult: DebugCycleResult = {
      maxCycles: options.maxCycles,
      findingsTargeted: plan.agents.reduce(
        (sum, a) => sum + a.exclusiveWriteFiles.length,
        0,
      ),
      fixPlans: cyclePlanResults,
      reVerify: {
        filesVerified: changedFiles.length,
        newIssues: verifyResult.newIssues,
      },
      reEval: {
        findingsEvaluated: fixable.length + newlyResolved.length,
        resolved: newlyResolved.length,
        remaining: fixable.length,
        newFromFix: newFindings.length,
      },
    };

    try {
      appendDebugCycleSection(options.reportPath, cycle, cycleResult);
    } catch {
      // Report append failure is non-fatal
    }

    callbacks.onProgress(
      `Cycle ${cycle}: ${newlyResolved.length}/${newlyResolved.length + fixable.length} resolved, ${newFindings.length} new`,
    );
  }

  // ---- Step 5: Final status ----

  if (cyclesUsed >= options.maxCycles && hasActionableFindings(fixable)) {
    callbacks.onProgress(
      `Max debug cycles (${options.maxCycles}) reached. ${fixable.length} finding(s) remain.`,
    );
  } else if (fixable.length === 0 || !hasActionableFindings(fixable)) {
    callbacks.onProgress(
      `All findings resolved after ${cyclesUsed} cycle(s).`,
    );
  }

  return {
    cyclesUsed,
    resolved,
    remaining: fixable,
    commits,
    escalated,
    timing_ms: Date.now() - startTime,
  };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Generate a stable match key for a finding.
 * Uses file + criterion + 5-line-bucket, the same bucketing logic as
 * parseEvalFindings id generation. This allows matching original findings
 * against re-eval findings which get fresh IDs.
 */
function findingMatchKey(finding: EvalFinding): string {
  const sanitizedFile = finding.file.replace(/[^a-z0-9]/gi, "-");
  const lineBucket = Math.floor(finding.line / 5) * 5;
  return `${finding.criterion}-${sanitizedFile}-${lineBucket}`;
}

/**
 * Check if there are any ERROR or WARN findings that need debugging.
 * Per D-20: only ERROR and WARN findings trigger debug cycles.
 */
function hasActionableFindings(findings: EvalFinding[]): boolean {
  return findings.some(
    (f) => f.severity === "ERROR" || f.severity === "WARN",
  );
}

/**
 * Build a scoped re-eval prompt targeting specific findings.
 * Per D-13: scoped re-eval only evaluates targeted findings.
 */
function buildScopedReEvalPrompt(
  findings: EvalFinding[],
  scopeContractPath: string,
): string {
  const sections: string[] = [];

  sections.push("# Scoped Re-Eval: Check Targeted Findings");
  sections.push("");
  sections.push(
    "Re-evaluate ONLY the following findings. Check if each has been resolved by recent fixes.",
  );
  sections.push("");
  sections.push(`Scope contract: Read \`${scopeContractPath}\``);
  sections.push("");
  sections.push("## Findings to re-evaluate");
  sections.push("");

  for (const finding of findings) {
    sections.push(
      `- [${finding.severity}] \`${finding.file}:${finding.line}\` -- ${finding.description}`,
    );
    sections.push(`  Evidence: ${finding.evidence}`);
  }

  sections.push("");
  sections.push(
    "Return a JSON array of findings that STILL exist (are NOT resolved). Omit resolved findings.",
  );

  return sections.join("\n");
}
