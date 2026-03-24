// ---------------------------------------------------------------------------
// User Gate: routing logic for eval findings
// ---------------------------------------------------------------------------
// Per GATE-01, GATE-02, GATE-03, D-07, D-08, D-09, D-10.
// Routes findings to debug, ignore, or defer based on eval.mode config.
// Three modes: interactive, auto-debug, auto-skip-minor.
// ---------------------------------------------------------------------------

import type { EvalFinding, EvalCriterion } from "./types.js";
import { groupFindingsByCriterion } from "./eval-agent.js";
import { appendIgnoreEntry, appendTodoEntry } from "./ignore-filter.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type GateAction = "debug" | "ignore" | "defer";

export interface GateDecision {
  findingId: string;
  action: GateAction;
}

export interface GateResult {
  toDebug: EvalFinding[];
  ignored: EvalFinding[];
  deferred: EvalFinding[];
  skipped: EvalFinding[]; // Auto-skipped INFO findings in auto-skip-minor mode
  presentation?: string; // Markdown for interactive mode display
}

// ---------------------------------------------------------------------------
// Criterion display names
// ---------------------------------------------------------------------------

const CRITERION_DISPLAY: Record<EvalCriterion, string> = {
  scope_compliance: "Scope Compliance",
  convention_adherence: "Convention Adherence",
  completeness: "Completeness",
  correctness: "Correctness",
};

// ---------------------------------------------------------------------------
// routeFindings
// ---------------------------------------------------------------------------

/**
 * Route eval findings based on the configured gate mode.
 *
 * - "auto-debug" (GATE-02): all findings go to toDebug
 * - "auto-skip-minor" (GATE-03, D-09): INFO -> skipped, WARN+ERROR -> toDebug
 * - "interactive" (GATE-01, D-07): build presentation, user calls applyGateDecisions after
 */
export function routeFindings(
  findings: EvalFinding[],
  mode: "interactive" | "auto-debug" | "auto-skip-minor",
): GateResult {
  if (mode === "auto-debug") {
    return {
      toDebug: [...findings],
      ignored: [],
      deferred: [],
      skipped: [],
    };
  }

  if (mode === "auto-skip-minor") {
    const infoFindings: EvalFinding[] = [];
    const warnAndError: EvalFinding[] = [];

    for (const finding of findings) {
      if (finding.severity === "INFO") {
        infoFindings.push(finding);
      } else {
        warnAndError.push(finding);
      }
    }

    return {
      toDebug: warnAndError,
      ignored: [],
      deferred: [],
      skipped: infoFindings,
    };
  }

  // interactive mode: build presentation for user, no pre-routing
  const presentation = buildGatePresentation(findings);
  return {
    toDebug: [],
    ignored: [],
    deferred: [],
    skipped: [],
    presentation,
  };
}

// ---------------------------------------------------------------------------
// applyGateDecisions
// ---------------------------------------------------------------------------

/**
 * Apply user decisions to findings after interactive gate review.
 * Findings without a decision default to toDebug.
 *
 * - "debug" -> toDebug
 * - "ignore" -> calls appendIgnoreEntry, adds to ignored (D-10)
 * - "defer" -> calls appendTodoEntry, adds to deferred (D-08)
 */
export function applyGateDecisions(
  findings: EvalFinding[],
  decisions: GateDecision[],
  projectRoot: string,
  taskSlug: string,
): GateResult {
  const decisionMap = new Map<string, GateAction>();
  for (const d of decisions) {
    decisionMap.set(d.findingId, d.action);
  }

  const toDebug: EvalFinding[] = [];
  const ignored: EvalFinding[] = [];
  const deferred: EvalFinding[] = [];

  for (const finding of findings) {
    const action = decisionMap.get(finding.id) ?? "debug";

    switch (action) {
      case "debug":
        toDebug.push(finding);
        break;
      case "ignore":
        appendIgnoreEntry(projectRoot, finding, taskSlug);
        ignored.push(finding);
        break;
      case "defer":
        appendTodoEntry(projectRoot, finding, taskSlug);
        deferred.push(finding);
        break;
    }
  }

  return {
    toDebug,
    ignored,
    deferred,
    skipped: [],
  };
}

// ---------------------------------------------------------------------------
// buildGatePresentation
// ---------------------------------------------------------------------------

/**
 * Build markdown presentation for interactive gate.
 * Groups findings by criterion, severity-sorted (ERRORs first).
 * Numbered list with evidence and action prompt.
 * Matches UI-SPEC "User Gate -- Interactive Mode" format.
 */
export function buildGatePresentation(findings: EvalFinding[]): string {
  const lines: string[] = [];

  lines.push("## Eval Gate");
  lines.push("");
  lines.push(`${findings.length} finding(s) require your decision.`);

  if (findings.length === 0) {
    return lines.join("\n");
  }

  const grouped = groupFindingsByCriterion(findings);
  let findingNumber = 0;

  // Iterate in canonical criterion order
  const criterionOrder: EvalCriterion[] = [
    "scope_compliance",
    "convention_adherence",
    "completeness",
    "correctness",
  ];

  for (const criterion of criterionOrder) {
    const criterionFindings = grouped.get(criterion);
    if (!criterionFindings || criterionFindings.length === 0) continue;

    lines.push("");
    lines.push(
      `### ${CRITERION_DISPLAY[criterion]} (${criterionFindings.length} findings)`,
    );
    lines.push("");

    for (const finding of criterionFindings) {
      findingNumber++;
      lines.push(
        `${findingNumber}. [${finding.severity}] \`${finding.file}:${finding.line}\` -- ${finding.description}`,
      );
      lines.push(`   Evidence: ${finding.evidence}`);
      lines.push("   Action? [debug / ignore / defer]");
      lines.push("");
    }
  }

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// buildAutoDebugPresentation
// ---------------------------------------------------------------------------

/**
 * Build presentation string for auto-debug mode.
 * Per UI-SPEC "User Gate -- Auto-Debug Mode" format.
 */
export function buildAutoDebugPresentation(findings: EvalFinding[]): string {
  return [
    "## Eval Gate (auto-debug)",
    "",
    `${findings.length} finding(s) -- all sent to debug agent automatically.`,
  ].join("\n");
}

// ---------------------------------------------------------------------------
// buildAutoSkipMinorPresentation
// ---------------------------------------------------------------------------

/**
 * Build presentation string for auto-skip-minor mode.
 * Per UI-SPEC "User Gate -- Auto-Skip-Minor Mode" format.
 */
export function buildAutoSkipMinorPresentation(
  skipped: number,
  debugCount: number,
): string {
  return [
    "## Eval Gate (auto-skip-minor)",
    "",
    `${skipped} INFO finding(s) auto-skipped.`,
    `${debugCount} WARN + ERROR finding(s) sent to debug agent automatically.`,
  ].join("\n");
}
