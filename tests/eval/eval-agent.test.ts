// ---------------------------------------------------------------------------
// Tests for eval-agent.ts
// ---------------------------------------------------------------------------
// Per 06-01-PLAN.md Task 1 behavior specifications.
// ---------------------------------------------------------------------------

import { describe, it, expect, vi } from "vitest";
import type {
  EvalOptions,
  EvalCallbacks,
  EvalFinding,
  EvalCriterion,
} from "../../src/eval/types.js";
import type { StaticVerifyResult, RuntimeVerifyResult } from "../../src/verify/types.js";
import {
  buildEvalPrompt,
  parseEvalFindings,
  groupFindingsByCriterion,
  runEval,
  tokenEstimate,
  chunkVerifyResult,
  deduplicateFindings,
} from "../../src/eval/eval-agent.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeStaticResult(overrides?: Partial<StaticVerifyResult>): StaticVerifyResult {
  return {
    conventionViolations: [],
    blastRadiusDiff: {
      surprises: [],
      skips: [],
      scopeDrift: [],
      timing_ms: 10,
    },
    codeReview: [],
    timing: { convention_ms: 5, blastRadius_ms: 5, codeReview_ms: 5 },
    ...overrides,
  };
}

function makeRuntimeResult(overrides?: Partial<RuntimeVerifyResult>): RuntimeVerifyResult {
  return {
    build: { status: "pass", duration_ms: 100 },
    unitTests: {
      status: "pass",
      passed: 10,
      failed: 0,
      total: 10,
      duration_ms: 200,
      failures: [],
    },
    integrationTests: {
      status: "skipped",
      passed: 0,
      failed: 0,
      total: 0,
      duration_ms: 0,
      failures: [],
    },
    e2e: {
      status: "skipped",
      passed: 0,
      failed: 0,
      total: 0,
      duration_ms: 0,
      failures: [],
    },
    autoSmoke: [],
    timing: {},
    ...overrides,
  };
}

function makeOptions(overrides?: Partial<EvalOptions>): EvalOptions {
  return {
    projectRoot: "/test/project",
    taskSlug: "test-task",
    verifyResult: {
      static: makeStaticResult(),
      runtime: makeRuntimeResult(),
    },
    scopeContractPath: "/test/project/.claude/codescope/orient/scope-contract.md",
    planPath: "/test/project/.claude/codescope/plans/test-plan.md",
    coordinationPath: "/test/project/.claude/codescope/execution/coordination.md",
    researchPath: "/test/project/.claude/codescope/orient/research.md",
    enabledCriteria: {
      scope_compliance: true,
      convention_adherence: true,
      completeness: true,
      correctness: true,
    },
    ignorePatterns: [],
    ...overrides,
  };
}

function makeCallbacks(
  dispatchResult: string | (() => Promise<string>) = "[]",
): EvalCallbacks {
  const dispatchFn =
    typeof dispatchResult === "function"
      ? dispatchResult
      : vi.fn().mockResolvedValue(dispatchResult);
  return {
    dispatchEvalAgent: dispatchFn as EvalCallbacks["dispatchEvalAgent"],
    onProgress: vi.fn(),
  };
}

function makeFinding(overrides?: Partial<EvalFinding>): EvalFinding {
  return {
    id: "eval-scope_compliance-src-handler-ts-40",
    criterion: "scope_compliance",
    category: "missing_implementation",
    file: "src/handler.ts",
    line: 42,
    description: "Missing error handling in handler",
    severity: "ERROR",
    evidence: "No try-catch block around async operation",
    ...overrides,
  };
}

const SAMPLE_FINDINGS_JSON = JSON.stringify([
  {
    criterion: "scope_compliance",
    category: "missing_implementation",
    file: "src/handler.ts",
    line: 42,
    description: "Missing error handling",
    severity: "ERROR",
    evidence: "No try-catch",
  },
  {
    criterion: "convention_adherence",
    category: "incorrect_implementation",
    file: "src/utils.ts",
    line: 10,
    description: "Uses callbacks instead of async/await",
    severity: "WARN",
    evidence: "callback(null, result)",
    goldenFileRef: "src/patterns/async.ts",
  },
]);

// ---------------------------------------------------------------------------
// buildEvalPrompt
// ---------------------------------------------------------------------------

describe("buildEvalPrompt", () => {
  it("includes all 6 context sources", () => {
    const opts = makeOptions();
    const prompt = buildEvalPrompt(opts);

    // 1. Scope contract by reference
    expect(prompt).toContain(opts.scopeContractPath);
    // 2. Plan by reference
    expect(prompt).toContain(opts.planPath);
    // 3. Coordination by reference
    expect(prompt).toContain(opts.coordinationPath);
    // 4. Verify results inline JSON
    expect(prompt).toContain(JSON.stringify(opts.verifyResult, null, 2));
    // 5. Research by reference
    expect(prompt).toContain(opts.researchPath!);
    // 6. Git diff instruction
    expect(prompt).toContain("git diff HEAD");
  });

  it("omits research section when researchPath is null", () => {
    const opts = makeOptions({ researchPath: null });
    const prompt = buildEvalPrompt(opts);

    expect(prompt).not.toContain("Research");
    expect(prompt).toContain(opts.scopeContractPath);
  });

  it("includes only enabled criteria", () => {
    const opts = makeOptions({
      enabledCriteria: {
        scope_compliance: true,
        convention_adherence: false,
        completeness: true,
        correctness: false,
      },
    });
    const prompt = buildEvalPrompt(opts);

    expect(prompt).toContain("scope_compliance");
    expect(prompt).toContain("completeness");
    // Disabled criteria should not appear in the criteria list
    // (they may appear in other parts of the prompt, so check the criteria section)
    const criteriaSection = prompt.split("Criteria to evaluate")[1]?.split("\n\n")[0] ?? "";
    expect(criteriaSection).not.toContain("convention_adherence");
    expect(criteriaSection).not.toContain("correctness");
  });

  it("includes output format instruction with JSON array schema", () => {
    const opts = makeOptions();
    const prompt = buildEvalPrompt(opts);

    expect(prompt).toContain("JSON");
    expect(prompt).toContain("criterion");
    expect(prompt).toContain("severity");
    expect(prompt).toContain("evidence");
  });
});

// ---------------------------------------------------------------------------
// tokenEstimate
// ---------------------------------------------------------------------------

describe("tokenEstimate", () => {
  it("returns character count divided by 4", () => {
    const text = "a".repeat(100);
    expect(tokenEstimate(text)).toBe(25);
  });

  it("rounds up with Math.ceil", () => {
    const text = "a".repeat(101);
    expect(tokenEstimate(text)).toBe(26);
  });
});

// ---------------------------------------------------------------------------
// chunkVerifyResult
// ---------------------------------------------------------------------------

describe("chunkVerifyResult", () => {
  it("returns single chunk when total tokens below threshold", () => {
    const opts = makeOptions();
    const chunks = chunkVerifyResult(opts, 50_000);
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toEqual(opts);
  });

  it("splits into multiple chunks by file groups when over threshold", () => {
    // Create a large set of convention violations across many files
    const violations = Array.from({ length: 200 }, (_, i) => ({
      file: `src/file-${i}.ts`,
      line: 10,
      convention: "use-async-await",
      adoption: 85,
      goldenFile: null,
      message: "x".repeat(500), // make each large
      severity: "WARN" as const,
    }));

    const opts = makeOptions({
      verifyResult: {
        static: makeStaticResult({ conventionViolations: violations }),
        runtime: makeRuntimeResult(),
      },
    });

    // Use a small threshold to force chunking
    const chunks = chunkVerifyResult(opts, 1_000);
    expect(chunks.length).toBeGreaterThan(1);

    // Each chunk should retain the same paths
    for (const chunk of chunks) {
      expect(chunk.scopeContractPath).toBe(opts.scopeContractPath);
      expect(chunk.planPath).toBe(opts.planPath);
      expect(chunk.coordinationPath).toBe(opts.coordinationPath);
      expect(chunk.researchPath).toBe(opts.researchPath);
    }
  });

  it("includes full scope contract context in every chunk", () => {
    const violations = Array.from({ length: 100 }, (_, i) => ({
      file: `src/file-${i}.ts`,
      line: 10,
      convention: "test",
      adoption: 80,
      goldenFile: null,
      message: "x".repeat(500),
      severity: "WARN" as const,
    }));

    const opts = makeOptions({
      verifyResult: {
        static: makeStaticResult({ conventionViolations: violations }),
        runtime: makeRuntimeResult(),
      },
    });

    const chunks = chunkVerifyResult(opts, 1_000);
    for (const chunk of chunks) {
      expect(chunk.scopeContractPath).toBe(opts.scopeContractPath);
    }
  });
});

// ---------------------------------------------------------------------------
// deduplicateFindings
// ---------------------------------------------------------------------------

describe("deduplicateFindings", () => {
  it("removes duplicate findings with same id across chunks", () => {
    const f1 = makeFinding({ id: "eval-a-1", severity: "WARN" });
    const f2 = makeFinding({ id: "eval-a-1", severity: "WARN" });
    const f3 = makeFinding({ id: "eval-b-2", severity: "ERROR" });

    const result = deduplicateFindings([f1, f2, f3]);
    expect(result).toHaveLength(2);
    expect(result.map((f) => f.id)).toEqual(["eval-a-1", "eval-b-2"]);
  });

  it("keeps highest severity when findings with same id differ in severity", () => {
    const f1 = makeFinding({ id: "eval-a-1", severity: "INFO" });
    const f2 = makeFinding({ id: "eval-a-1", severity: "ERROR" });

    const result = deduplicateFindings([f1, f2]);
    expect(result).toHaveLength(1);
    expect(result[0].severity).toBe("ERROR");
  });
});

// ---------------------------------------------------------------------------
// runEval - basic
// ---------------------------------------------------------------------------

describe("runEval", () => {
  it("dispatches single eval call for small verify results", async () => {
    const opts = makeOptions();
    const callbacks = makeCallbacks(SAMPLE_FINDINGS_JSON);

    await runEval(opts, callbacks);

    expect(callbacks.dispatchEvalAgent).toHaveBeenCalledTimes(1);
  });

  it("chunks large verify results and dispatches per-chunk eval", async () => {
    const violations = Array.from({ length: 500 }, (_, i) => ({
      file: `src/file-${i}.ts`,
      line: 10,
      convention: "test",
      adoption: 80,
      goldenFile: null,
      message: "x".repeat(1000),
      severity: "WARN" as const,
    }));

    const opts = makeOptions({
      verifyResult: {
        static: makeStaticResult({ conventionViolations: violations }),
        runtime: makeRuntimeResult(),
      },
    });

    const callbacks = makeCallbacks(vi.fn().mockResolvedValue("[]"));

    await runEval(opts, callbacks);

    // Should have dispatched multiple calls (one per chunk)
    expect(
      (callbacks.dispatchEvalAgent as ReturnType<typeof vi.fn>).mock.calls.length,
    ).toBeGreaterThan(1);
  });

  it("retries dispatchEvalAgent once on failure", async () => {
    const opts = makeOptions();
    let callCount = 0;
    const callbacks = makeCallbacks(async () => {
      callCount++;
      if (callCount === 1) throw new Error("Network error");
      return SAMPLE_FINDINGS_JSON;
    });

    const result = await runEval(opts, callbacks);

    expect(callCount).toBe(2);
    expect(result.findings.length).toBeGreaterThan(0);
  });

  it("marks all criteria as unavailable after retry failure", async () => {
    const opts = makeOptions();
    const callbacks = makeCallbacks(async () => {
      throw new Error("Persistent failure");
    });

    const result = await runEval(opts, callbacks);

    // Per D-26: pipeline continues with PASS
    expect(result.overallStatus).toBe("PASS");
    for (const criterion of result.criteria) {
      if (opts.enabledCriteria[criterion.criterion]) {
        expect(criterion.status).toBe("PASS");
        expect(criterion.detail).toContain("Unavailable");
      }
    }
  });

  it("returns EvalResult with overallStatus PASS when LLM unavailable after retry", async () => {
    const opts = makeOptions();
    const callbacks = makeCallbacks(async () => {
      throw new Error("LLM unavailable");
    });

    const result = await runEval(opts, callbacks);
    expect(result.overallStatus).toBe("PASS");
    expect(result.findings).toHaveLength(0);
  });

  it("returns per-criterion PASS/FAIL based on finding severities", async () => {
    const findings = [
      {
        criterion: "scope_compliance",
        category: "missing_implementation",
        file: "src/a.ts",
        line: 10,
        description: "out of scope",
        severity: "ERROR",
        evidence: "evidence",
      },
      {
        criterion: "convention_adherence",
        category: "incorrect_implementation",
        file: "src/b.ts",
        line: 20,
        description: "style issue",
        severity: "WARN",
        evidence: "evidence",
      },
    ];
    const callbacks = makeCallbacks(JSON.stringify(findings));
    const opts = makeOptions();

    const result = await runEval(opts, callbacks);

    const scopeResult = result.criteria.find(
      (c) => c.criterion === "scope_compliance",
    );
    const conventionResult = result.criteria.find(
      (c) => c.criterion === "convention_adherence",
    );

    expect(scopeResult?.status).toBe("FAIL"); // has ERROR
    expect(conventionResult?.status).toBe("PASS"); // WARN-only = PASS
  });

  it("marks disabled criteria as SKIPPED with detail", async () => {
    const opts = makeOptions({
      enabledCriteria: {
        scope_compliance: true,
        convention_adherence: false,
        completeness: true,
        correctness: false,
      },
    });
    const callbacks = makeCallbacks("[]");

    const result = await runEval(opts, callbacks);

    const conventionResult = result.criteria.find(
      (c) => c.criterion === "convention_adherence",
    );
    const correctnessResult = result.criteria.find(
      (c) => c.criterion === "correctness",
    );

    expect(conventionResult?.status).toBe("SKIPPED");
    expect(conventionResult?.detail).toBe("Disabled in config");
    expect(correctnessResult?.status).toBe("SKIPPED");
    expect(correctnessResult?.detail).toBe("Disabled in config");
  });

  it("sets overallStatus to FAIL when any criterion has ERROR findings", async () => {
    const findings = [
      {
        criterion: "correctness",
        category: "incorrect_implementation",
        file: "src/a.ts",
        line: 5,
        description: "bug",
        severity: "ERROR",
        evidence: "evidence",
      },
    ];
    const callbacks = makeCallbacks(JSON.stringify(findings));
    const opts = makeOptions();

    const result = await runEval(opts, callbacks);
    expect(result.overallStatus).toBe("FAIL");
  });

  it("sets overallStatus to PASS when all criteria pass or are SKIPPED", async () => {
    const opts = makeOptions({
      enabledCriteria: {
        scope_compliance: true,
        convention_adherence: false,
        completeness: true,
        correctness: false,
      },
    });
    const callbacks = makeCallbacks("[]");

    const result = await runEval(opts, callbacks);
    expect(result.overallStatus).toBe("PASS");
  });

  it("filters findings against ignorePatterns before scoring", async () => {
    const findings = [
      {
        criterion: "convention_adherence",
        category: "incorrect_implementation",
        file: "src/handler.ts",
        line: 42,
        description: "Uses callbacks instead of async/await",
        severity: "ERROR",
        evidence: "callback(null, result)",
      },
    ];
    const callbacks = makeCallbacks(JSON.stringify(findings));
    const opts = makeOptions({
      ignorePatterns: [
        {
          pattern: "callbacks instead of async",
          scope: "*",
          criterion: "convention_adherence",
          created: "2026-03-24",
          reason: "Known pattern",
        },
      ],
    });

    const result = await runEval(opts, callbacks);

    // Finding should be filtered out by ignore pattern
    expect(result.findings).toHaveLength(0);
    const conventionResult = result.criteria.find(
      (c) => c.criterion === "convention_adherence",
    );
    expect(conventionResult?.status).toBe("PASS");
  });
});

// ---------------------------------------------------------------------------
// parseEvalFindings
// ---------------------------------------------------------------------------

describe("parseEvalFindings", () => {
  it("parses valid JSON array of findings into EvalFinding[]", () => {
    const result = parseEvalFindings(SAMPLE_FINDINGS_JSON);
    expect(result).toHaveLength(2);
    expect(result[0].criterion).toBe("scope_compliance");
    expect(result[0].id).toBeTruthy();
  });

  it("returns empty array for garbled/non-JSON LLM response", () => {
    const result = parseEvalFindings("This is not JSON at all, just rambling...");
    expect(result).toEqual([]);
  });

  it("extracts findings from markdown code block wrapping", () => {
    const wrapped = `Here are the findings:\n\n\`\`\`json\n${SAMPLE_FINDINGS_JSON}\n\`\`\`\n\nThese are the issues I found.`;
    const result = parseEvalFindings(wrapped);
    expect(result).toHaveLength(2);
    expect(result[0].criterion).toBe("scope_compliance");
  });

  it("generates id for each finding using criterion, file, and 5-line bucket", () => {
    const findings = [
      {
        criterion: "correctness",
        category: "incorrect_implementation",
        file: "src/handler.ts",
        line: 42,
        description: "Bug",
        severity: "ERROR",
        evidence: "evidence",
      },
    ];
    const result = parseEvalFindings(JSON.stringify(findings));

    // 42 / 5 = 8.4, Math.floor = 8, * 5 = 40
    expect(result[0].id).toBe("eval-correctness-src-handler-ts-40");
  });

  it("discards findings with invalid criterion values", () => {
    const findings = [
      {
        criterion: "invalid_criterion",
        category: "missing_implementation",
        file: "src/a.ts",
        line: 10,
        description: "test",
        severity: "ERROR",
        evidence: "evidence",
      },
    ];
    const result = parseEvalFindings(JSON.stringify(findings));
    expect(result).toHaveLength(0);
  });

  it("discards findings with invalid severity values", () => {
    const findings = [
      {
        criterion: "correctness",
        category: "missing_implementation",
        file: "src/a.ts",
        line: 10,
        description: "test",
        severity: "CRITICAL",
        evidence: "evidence",
      },
    ];
    const result = parseEvalFindings(JSON.stringify(findings));
    expect(result).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// groupFindingsByCriterion
// ---------------------------------------------------------------------------

describe("groupFindingsByCriterion", () => {
  it("groups findings by criterion, sorted by severity within each group", () => {
    const findings: EvalFinding[] = [
      makeFinding({
        id: "1",
        criterion: "scope_compliance",
        severity: "WARN",
      }),
      makeFinding({
        id: "2",
        criterion: "scope_compliance",
        severity: "ERROR",
      }),
      makeFinding({
        id: "3",
        criterion: "correctness",
        severity: "INFO",
      }),
      makeFinding({
        id: "4",
        criterion: "correctness",
        severity: "ERROR",
      }),
    ];

    const grouped = groupFindingsByCriterion(findings);

    expect(grouped.get("scope_compliance")).toHaveLength(2);
    expect(grouped.get("correctness")).toHaveLength(2);

    // ERROR should come first
    const scopeFindings = grouped.get("scope_compliance")!;
    expect(scopeFindings[0].severity).toBe("ERROR");
    expect(scopeFindings[1].severity).toBe("WARN");

    const correctnessFindings = grouped.get("correctness")!;
    expect(correctnessFindings[0].severity).toBe("ERROR");
    expect(correctnessFindings[1].severity).toBe("INFO");
  });
});

// ---------------------------------------------------------------------------
// EvalFinding type (structural test)
// ---------------------------------------------------------------------------

describe("EvalFinding type", () => {
  it("includes all required fields including optional goldenFileRef", () => {
    const finding = makeFinding({ goldenFileRef: "src/golden.ts" });

    expect(finding).toHaveProperty("id");
    expect(finding).toHaveProperty("criterion");
    expect(finding).toHaveProperty("category");
    expect(finding).toHaveProperty("file");
    expect(finding).toHaveProperty("line");
    expect(finding).toHaveProperty("description");
    expect(finding).toHaveProperty("severity");
    expect(finding).toHaveProperty("evidence");
    expect(finding).toHaveProperty("goldenFileRef");
  });
});
