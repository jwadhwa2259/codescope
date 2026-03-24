// ---------------------------------------------------------------------------
// Plan Validation Module - Validation with auto-fix for mechanical errors
// Per D-19, D-20, D-21, D-22, D-23: Mechanical auto-fix, structural escalation.
// ---------------------------------------------------------------------------

import {
  buildWaveSchedule,
  validateFileOverlap,
  validateDependencyOrdering,
  validateScopeCoverage,
} from "../execution/wave-scheduler.js";
import type {
  AgentAssignment,
  ExecutionPlan,
  ExecutionWave,
  ScopeContract,
  ValidationCheck,
  ValidationResult,
} from "./types.js";

// ---------------------------------------------------------------------------
// validatePlan
// ---------------------------------------------------------------------------

/**
 * Run three validation checks on an execution plan.
 *
 * Per D-19:
 * 1. No overlapping file writes in the same parallel wave (EXEC-10)
 * 2. Dependency ordering -- no agent depends on same-wave agent, no cycles
 * 3. Scope coverage -- every In Scope item has at least one agent assigned
 *
 * Uses wave-scheduler functions from src/execution/wave-scheduler.ts.
 */
export function validatePlan(
  plan: ExecutionPlan,
  scopeContract: ScopeContract,
): ValidationResult {
  // Cast plan agents to wave-scheduler's local AgentAssignment type
  // (identical structure, different import paths during parallel Plan 01/02 dev)
  const agents = plan.agents as unknown as Parameters<
    typeof validateFileOverlap
  >[0];
  const waves = plan.waves as unknown as Parameters<
    typeof validateFileOverlap
  >[1];

  const overlapChecks = validateFileOverlap(agents, waves);
  const orderingChecks = validateDependencyOrdering(agents, waves);
  const coverageChecks = validateScopeCoverage(
    agents,
    scopeContract.inScope,
  );

  const allChecks: ValidationCheck[] = [
    ...overlapChecks,
    ...orderingChecks,
    ...coverageChecks,
  ];

  const passed = allChecks.every(
    (c) =>
      c.status === "PASS" ||
      c.status === "AUTO-FIXED" ||
      c.status === "WARNING",
  );

  return {
    passed,
    checks: allChecks,
    autoFixAttempts: 0,
  };
}

// ---------------------------------------------------------------------------
// autoFixPlan
// ---------------------------------------------------------------------------

/**
 * Attempt to auto-fix mechanical validation errors in a plan.
 *
 * Per D-20:
 * - Mechanical errors (file overlap, dependency ordering): auto-fixable
 * - Structural errors (scope coverage gaps): escalated as WARNING
 *
 * Loops up to maxAttempts:
 * 1. Apply mechanical fix (rebuild wave schedule)
 * 2. Re-validate
 * 3. If passed, return updated plan with AUTO-FIXED status
 *
 * If still failing after maxAttempts, return plan with WARNING status.
 */
export function autoFixPlan(
  plan: ExecutionPlan,
  validationResult: ValidationResult,
  maxAttempts: number = 2,
): { plan: ExecutionPlan; result: ValidationResult } {
  // If already passing, no fix needed
  if (validationResult.passed) {
    return { plan, result: validationResult };
  }

  let currentPlan = structuredClone(plan);
  let currentResult = structuredClone(validationResult);
  let attempts = 0;

  while (attempts < maxAttempts) {
    attempts++;

    const hasMechanicalErrors = currentResult.checks.some(
      (c) =>
        c.status === "FAIL" &&
        (c.name.includes("file-overlap") ||
          c.name.includes("dep-ordering") ||
          c.name.includes("dependency-ordering")),
    );

    if (!hasMechanicalErrors) {
      // Only structural errors remain (scope-coverage) -- escalate as WARNING
      break;
    }

    // Attempt fix: rebuild wave schedule via buildWaveSchedule
    try {
      const { waves: newWaves, strategy } = buildWaveSchedule(
        currentPlan.agents as unknown as Parameters<
          typeof buildWaveSchedule
        >[0],
      );

      // Update agent wave assignments from the new schedule
      const agentWaveMap = new Map<string, number>();
      for (const wave of newWaves) {
        for (const agentName of wave.agents) {
          agentWaveMap.set(agentName, wave.waveNumber);
        }
      }

      currentPlan.agents = currentPlan.agents.map((agent) => ({
        ...agent,
        wave: agentWaveMap.get(agent.name) ?? agent.wave,
      }));
      currentPlan.waves = newWaves as ExecutionWave[];
      currentPlan.strategy = strategy;

      // Re-validate
      const newResult = revalidate(currentPlan, currentResult);
      currentResult = newResult;

      if (newResult.passed) {
        // Mark fixed checks as AUTO-FIXED
        currentResult.checks = currentResult.checks.map((c) => {
          if (c.status === "PASS" && validationResult.checks.some(
            (oc) => oc.name === c.name && oc.status === "FAIL",
          )) {
            return { ...c, status: "AUTO-FIXED" as const, detail: `Auto-fixed by wave reschedule (attempt ${attempts})` };
          }
          return c;
        });
        currentResult.autoFixAttempts = attempts;
        return { plan: currentPlan, result: currentResult };
      }
    } catch {
      // buildWaveSchedule may throw on circular dependencies
      // Mark remaining fails as WARNING
      break;
    }
  }

  // Max attempts reached or only structural errors remain
  // Convert remaining FAIL to WARNING with explanation
  currentResult.checks = currentResult.checks.map((c) => {
    if (c.status === "FAIL") {
      return {
        ...c,
        status: "WARNING" as const,
        detail: `Could not auto-fix: ${c.detail ?? c.name} (after ${attempts} attempts)`,
      };
    }
    return c;
  });
  currentResult.autoFixAttempts = attempts;
  // Recalculate passed (WARNINGs are considered passed for the pipeline to continue)
  currentResult.passed = currentResult.checks.every(
    (c) =>
      c.status === "PASS" ||
      c.status === "AUTO-FIXED" ||
      c.status === "WARNING",
  );

  return { plan: currentPlan, result: currentResult };
}

/**
 * Re-run validation checks against an updated plan.
 * Preserves the scope contract checks from the original result.
 */
function revalidate(
  plan: ExecutionPlan,
  prevResult: ValidationResult,
): ValidationResult {
  const agents = plan.agents as unknown as Parameters<
    typeof validateFileOverlap
  >[0];
  const waves = plan.waves as unknown as Parameters<
    typeof validateFileOverlap
  >[1];

  const overlapChecks = validateFileOverlap(agents, waves);
  const orderingChecks = validateDependencyOrdering(agents, waves);

  // Keep the scope-coverage checks from the previous result (they don't change)
  const scopeChecks = prevResult.checks.filter((c) =>
    c.name.includes("scope-coverage"),
  );

  const allChecks: ValidationCheck[] = [
    ...overlapChecks,
    ...orderingChecks,
    ...scopeChecks,
  ];

  const passed = allChecks.every(
    (c) =>
      c.status === "PASS" ||
      c.status === "AUTO-FIXED" ||
      c.status === "WARNING",
  );

  return {
    passed,
    checks: allChecks,
    autoFixAttempts: prevResult.autoFixAttempts,
  };
}

// ---------------------------------------------------------------------------
// writeValidationSection
// ---------------------------------------------------------------------------

/**
 * Format validation checks as the "## Validation" section matching UI-SPEC format.
 *
 * - `- [x] {name}: **PASS**`
 * - `- [x] {name}: **AUTO-FIXED** -- {detail}`
 * - `- [ ] {name}: **WARNING** -- {detail}`
 * - `- [ ] {name}: **FAIL** -- {detail}`
 */
export function writeValidationSection(checks: ValidationCheck[]): string {
  const lines: string[] = [];

  for (const check of checks) {
    const checked =
      check.status === "PASS" || check.status === "AUTO-FIXED"
        ? "[x]"
        : "[ ]";
    const detail = check.detail ? ` -- ${check.detail}` : "";
    lines.push(`- ${checked} ${check.name}: **${check.status}**${detail}`);
  }

  return lines.join("\n");
}
