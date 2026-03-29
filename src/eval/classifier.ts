// ---------------------------------------------------------------------------
// Failure Classifier: rule-based mapping from eval criteria to classifications
// ---------------------------------------------------------------------------
// Per Phase 13 D-04, D-05, D-06.
// Maps each EvalCriterion to exactly one FailureClassification.
// Priority ordering: CODE_BUG (0) -> CONVENTION_MISS (1) -> PLAN_GAP (2) -> SCOPE_DRIFT (3).
// ---------------------------------------------------------------------------

import type { EvalFinding, EvalCriterion } from "./types.js";

/**
 * Classification buckets for eval findings.
 * Each bucket maps to a specific remediation strategy.
 */
export type FailureClassification =
  | "SCOPE_DRIFT"
  | "PLAN_GAP"
  | "CODE_BUG"
  | "CONVENTION_MISS";

/**
 * Priority ordering for classifications.
 * Per D-06: CODE_BUG fixes first, CONVENTION_MISS second,
 * PLAN_GAP and SCOPE_DRIFT escalated to planner.
 */
export const CLASSIFICATION_PRIORITY: Record<FailureClassification, number> = {
  CODE_BUG: 0,
  CONVENTION_MISS: 1,
  PLAN_GAP: 2,
  SCOPE_DRIFT: 3,
};

/**
 * Deterministic mapping from eval criterion to failure classification.
 * Per D-04: each criterion maps to exactly one classification.
 */
const CRITERION_MAP: Record<EvalCriterion, FailureClassification> = {
  scope_compliance: "SCOPE_DRIFT",
  completeness: "PLAN_GAP",
  correctness: "CODE_BUG",
  convention_adherence: "CONVENTION_MISS",
};

/**
 * Classify a single eval finding based on its criterion.
 *
 * @param finding - The eval finding to classify
 * @returns The failure classification for the finding's criterion
 */
export function classifyFinding(finding: EvalFinding): FailureClassification {
  return CRITERION_MAP[finding.criterion] ?? "CODE_BUG";
}

/**
 * Classify an array of findings, adding a classification field to each.
 * Returns a new array with all original fields preserved plus the classification.
 *
 * @param findings - Array of eval findings to classify
 * @returns Array of findings with classification field added
 */
export function classifyFindings(
  findings: EvalFinding[],
): Array<EvalFinding & { classification: FailureClassification }> {
  return findings.map((f) => ({
    ...f,
    classification: classifyFinding(f),
  }));
}
