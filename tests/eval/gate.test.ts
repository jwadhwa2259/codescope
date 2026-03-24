// ---------------------------------------------------------------------------
// Tests for gate.ts -- User gate routing logic
// ---------------------------------------------------------------------------
// Per 06-03-PLAN.md Task 1 behavior specifications.
// ---------------------------------------------------------------------------

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { EvalFinding, EvalCriterion } from "../../src/eval/types.js";

vi.mock("../../src/eval/ignore-filter.js", () => ({
  appendIgnoreEntry: vi.fn(),
  appendTodoEntry: vi.fn(),
}));

import {
  routeFindings,
  applyGateDecisions,
  buildGatePresentation,
  buildAutoDebugPresentation,
  buildAutoSkipMinorPresentation,
  type GateAction,
  type GateDecision,
  type GateResult,
} from "../../src/eval/gate.js";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeFinding(overrides?: Partial<EvalFinding>): EvalFinding {
  return {
    id: "eval-scope_compliance-src-foo-ts-10",
    criterion: "scope_compliance",
    category: "incorrect_implementation",
    file: "src/foo.ts",
    line: 10,
    description: "Out of scope change detected",
    severity: "ERROR",
    evidence: "Line 10 modifies auth module not in scope contract",
    ...overrides,
  };
}

const ERROR_FINDING = makeFinding({
  id: "eval-scope-error",
  severity: "ERROR",
  criterion: "scope_compliance",
  description: "Scope violation",
});

const WARN_FINDING = makeFinding({
  id: "eval-convention-warn",
  severity: "WARN",
  criterion: "convention_adherence",
  description: "Convention violation: prefer named exports",
  evidence: "Line 5: export default class",
  file: "src/bar.ts",
  line: 5,
});

const INFO_FINDING = makeFinding({
  id: "eval-completeness-info",
  severity: "INFO",
  criterion: "completeness",
  description: "Optional improvement: add JSDoc",
  evidence: "Function missing documentation",
  file: "src/baz.ts",
  line: 20,
});

const CORRECTNESS_ERROR = makeFinding({
  id: "eval-correctness-error",
  severity: "ERROR",
  criterion: "correctness",
  description: "Null pointer dereference",
  evidence: "Line 42: obj.prop accessed without null check",
  file: "src/handler.ts",
  line: 42,
});

const ALL_FINDINGS = [ERROR_FINDING, WARN_FINDING, INFO_FINDING, CORRECTNESS_ERROR];

// ---------------------------------------------------------------------------
// routeFindings tests
// ---------------------------------------------------------------------------

describe("routeFindings", () => {
  it("auto-debug mode returns all findings as toDebug, none ignored/deferred", () => {
    const result = routeFindings(ALL_FINDINGS, "auto-debug");

    expect(result.toDebug).toEqual(ALL_FINDINGS);
    expect(result.ignored).toEqual([]);
    expect(result.deferred).toEqual([]);
    expect(result.skipped).toEqual([]);
  });

  it("auto-skip-minor mode returns WARN+ERROR as toDebug, INFO as skipped", () => {
    const result = routeFindings(ALL_FINDINGS, "auto-skip-minor");

    expect(result.toDebug).toEqual([ERROR_FINDING, WARN_FINDING, CORRECTNESS_ERROR]);
    expect(result.skipped).toEqual([INFO_FINDING]);
    expect(result.ignored).toEqual([]);
    expect(result.deferred).toEqual([]);
  });

  it("auto-skip-minor mode counts skipped and debug counts correctly", () => {
    const result = routeFindings(ALL_FINDINGS, "auto-skip-minor");

    expect(result.toDebug.length).toBe(3);
    expect(result.skipped.length).toBe(1);
  });

  it("interactive mode returns findings grouped by criterion for presentation", () => {
    const result = routeFindings(ALL_FINDINGS, "interactive");

    // In interactive mode, no findings are pre-routed
    expect(result.toDebug).toEqual([]);
    expect(result.ignored).toEqual([]);
    expect(result.deferred).toEqual([]);
    expect(result.skipped).toEqual([]);
    // But presentation string is provided
    expect(result.presentation).toBeDefined();
    expect(typeof result.presentation).toBe("string");
    expect(result.presentation!.length).toBeGreaterThan(0);
  });

  it("returns all empty arrays for empty findings", () => {
    const result = routeFindings([], "auto-debug");

    expect(result.toDebug).toEqual([]);
    expect(result.ignored).toEqual([]);
    expect(result.deferred).toEqual([]);
    expect(result.skipped).toEqual([]);
  });

  it("returns all empty arrays for empty findings in interactive mode", () => {
    const result = routeFindings([], "interactive");

    expect(result.toDebug).toEqual([]);
    expect(result.ignored).toEqual([]);
    expect(result.deferred).toEqual([]);
    expect(result.skipped).toEqual([]);
    // Presentation should reflect 0 findings
    expect(result.presentation).toBeDefined();
    expect(result.presentation).toContain("0 finding(s)");
  });
});

// ---------------------------------------------------------------------------
// applyGateDecisions tests
// ---------------------------------------------------------------------------

describe("applyGateDecisions", () => {
  it("debug action adds finding to toDebug", async () => {
    const { appendIgnoreEntry, appendTodoEntry } = await import(
      "../../src/eval/ignore-filter.js"
    );

    const decisions: GateDecision[] = [
      { findingId: ERROR_FINDING.id, action: "debug" },
    ];

    const result = applyGateDecisions(
      [ERROR_FINDING],
      decisions,
      "/project",
      "task-01",
    );

    expect(result.toDebug).toEqual([ERROR_FINDING]);
    expect(result.ignored).toEqual([]);
    expect(result.deferred).toEqual([]);
    expect(appendIgnoreEntry).not.toHaveBeenCalled();
    expect(appendTodoEntry).not.toHaveBeenCalled();
  });

  it("ignore action calls appendIgnoreEntry and adds to ignored", async () => {
    const { appendIgnoreEntry, appendTodoEntry } = await import(
      "../../src/eval/ignore-filter.js"
    );
    vi.mocked(appendIgnoreEntry).mockClear();
    vi.mocked(appendTodoEntry).mockClear();

    const decisions: GateDecision[] = [
      { findingId: WARN_FINDING.id, action: "ignore" },
    ];

    const result = applyGateDecisions(
      [WARN_FINDING],
      decisions,
      "/project",
      "task-01",
    );

    expect(result.ignored).toEqual([WARN_FINDING]);
    expect(result.toDebug).toEqual([]);
    expect(appendIgnoreEntry).toHaveBeenCalledWith(
      "/project",
      WARN_FINDING,
      "task-01",
    );
    expect(appendTodoEntry).not.toHaveBeenCalled();
  });

  it("defer action calls appendTodoEntry and adds to deferred", async () => {
    const { appendIgnoreEntry, appendTodoEntry } = await import(
      "../../src/eval/ignore-filter.js"
    );
    vi.mocked(appendIgnoreEntry).mockClear();
    vi.mocked(appendTodoEntry).mockClear();

    const decisions: GateDecision[] = [
      { findingId: INFO_FINDING.id, action: "defer" },
    ];

    const result = applyGateDecisions(
      [INFO_FINDING],
      decisions,
      "/project",
      "task-01",
    );

    expect(result.deferred).toEqual([INFO_FINDING]);
    expect(result.toDebug).toEqual([]);
    expect(appendTodoEntry).toHaveBeenCalledWith(
      "/project",
      INFO_FINDING,
      "task-01",
    );
    expect(appendIgnoreEntry).not.toHaveBeenCalled();
  });

  it("findings without a decision default to toDebug", async () => {
    const result = applyGateDecisions(
      [ERROR_FINDING, WARN_FINDING],
      [], // No decisions
      "/project",
      "task-01",
    );

    expect(result.toDebug).toEqual([ERROR_FINDING, WARN_FINDING]);
    expect(result.ignored).toEqual([]);
    expect(result.deferred).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// buildGatePresentation tests
// ---------------------------------------------------------------------------

describe("buildGatePresentation", () => {
  it("groups findings by criterion with severity sort and numbered list", () => {
    const presentation = buildGatePresentation(ALL_FINDINGS);

    // Should have the main header
    expect(presentation).toContain("## Eval Gate");

    // Should mention total finding count
    expect(presentation).toContain("4 finding(s) require your decision.");

    // Criterion headers
    expect(presentation).toContain("### Scope Compliance");
    expect(presentation).toContain("### Convention Adherence");
    expect(presentation).toContain("### Completeness");
    expect(presentation).toContain("### Correctness");

    // Numbered findings
    expect(presentation).toMatch(/1\.\s+\[ERROR\]/);

    // Evidence
    expect(presentation).toContain("Evidence:");

    // Action prompt
    expect(presentation).toContain("Action? [debug / ignore / defer]");
  });

  it("matches UI-SPEC format with criterion headers, evidence, action prompt", () => {
    const findings = [ERROR_FINDING, WARN_FINDING];
    const presentation = buildGatePresentation(findings);

    // Check structure matches UI-SPEC
    expect(presentation).toContain("## Eval Gate");
    expect(presentation).toContain("2 finding(s) require your decision.");

    // Findings should have file:line format
    expect(presentation).toContain("`src/foo.ts:10`");
    expect(presentation).toContain("`src/bar.ts:5`");

    // Each finding should have severity tag, description, evidence, and action prompt
    expect(presentation).toContain("[ERROR]");
    expect(presentation).toContain("[WARN]");
    expect(presentation).toContain("Evidence:");
    expect(presentation).toContain("Action? [debug / ignore / defer]");
  });

  it("numbers findings sequentially across groups", () => {
    const presentation = buildGatePresentation(ALL_FINDINGS);

    // Should have numbers 1-4 across all groups
    expect(presentation).toContain("1.");
    expect(presentation).toContain("2.");
    expect(presentation).toContain("3.");
    expect(presentation).toContain("4.");
  });
});

// ---------------------------------------------------------------------------
// buildAutoDebugPresentation tests
// ---------------------------------------------------------------------------

describe("buildAutoDebugPresentation", () => {
  it("returns correct auto-debug format", () => {
    const result = buildAutoDebugPresentation(ALL_FINDINGS);

    expect(result).toContain("## Eval Gate (auto-debug)");
    expect(result).toContain("4 finding(s) -- all sent to debug agent automatically.");
  });
});

// ---------------------------------------------------------------------------
// buildAutoSkipMinorPresentation tests
// ---------------------------------------------------------------------------

describe("buildAutoSkipMinorPresentation", () => {
  it("returns correct auto-skip-minor format with counts", () => {
    const result = buildAutoSkipMinorPresentation(1, 3);

    expect(result).toContain("## Eval Gate (auto-skip-minor)");
    expect(result).toContain("1 INFO finding(s) auto-skipped.");
    expect(result).toContain("3 WARN + ERROR finding(s) sent to debug agent automatically.");
  });
});
