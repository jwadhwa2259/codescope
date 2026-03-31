---
phase: 20-eval-db-fix-audit-cleanup
validation_date: 2026-03-31
validator: gsd-nyquist-auditor
status: compliant
tests_run: 59
tests_passing: 59
tests_failing: 0
---

# Phase 20 Validation Map

**Phase Goal:** Fix eval scorecard DB path bug (unblocking real blast-radius and import-correctness metrics), formally defer VALID-02/VALID-03 to Out of Scope, fix ViolationEntry.ruleId field, and correct SUMMARY frontmatter inaccuracies.

**Validation Status:** COMPLIANT — all requirements covered, all tests passing.

---

## Requirements Coverage

| Req ID | Description | Type | Test File | Test Name | Status |
|--------|-------------|------|-----------|-----------|--------|
| EVAL-01 | Mode 2 scorecard scores uncommitted changes using real graph DB | Integration | `tests/tools/eval.test.ts` | `deterministic mode opens graph.db via getGraphDbPath (not codescope.db)` | green |
| EVAL-01 | Mode 2 scorecard degrades gracefully when graph.db absent | Integration | `tests/tools/eval.test.ts` | `deterministic mode degrades gracefully when graph.db does not exist` | green |
| EVAL-02 | Mode 1 scorecard uses correct DB path (same fix as EVAL-01) | Integration | `tests/tools/eval.test.ts` | `deterministic mode opens graph.db via getGraphDbPath (not codescope.db)` | green |
| EVAL-04 | Scorecard includes convention adherence, blast radius, violation count, import correctness, risk files, composite score | Unit | `tests/eval/deterministic-scorecard.test.ts` | `renderScorecard` suite (8 tests) + `computeScorecard` suite (2 tests) | green |
| EVAL-04 | importCorrectness.total > 0 when graph.db has edge data (not 100%-fallback bug) | Integration | `tests/tools/eval.test.ts` | `deterministic mode opens graph.db via getGraphDbPath (not codescope.db)` | green |
| VALID-02 | Formally deferred to Out of Scope — no implementation required | Doc | `tests/artifacts/violation-index.test.ts` | `does NOT produce import-path-validity violations (VALID-03 removed)` | green |
| VALID-03 | Formally deferred to Out of Scope — no implementation required | Doc | `tests/artifacts/violation-index.test.ts` | `does NOT produce import-path-validity violations (VALID-03 removed)` | green |

---

## Automated Test Commands

| Requirement | Command | Expected |
|-------------|---------|----------|
| EVAL-01, EVAL-02, EVAL-04 (eval tool) | `npx vitest run tests/tools/eval.test.ts --reporter=verbose` | 10/10 pass |
| EVAL-04 (scorecard metrics) | `npx vitest run tests/eval/deterministic-scorecard.test.ts --reporter=verbose` | 36/36 pass |
| EVAL-04, VALID-02, VALID-03 (violation index) | `npx vitest run tests/artifacts/violation-index.test.ts --reporter=verbose` | 13/13 pass |
| Full suite | `npx vitest run tests/tools/eval.test.ts tests/artifacts/violation-index.test.ts tests/eval/deterministic-scorecard.test.ts --reporter=verbose` | 59/59 pass |

---

## Implementation Verification

| File | Line | Expected Content | Verified |
|------|------|-----------------|----------|
| `src/tools/eval.ts` | 13 | `import { getCodescopePath, getGraphDbPath } from "../utils/paths.js"` | yes |
| `src/tools/eval.ts` | 126 | `getGraphDbPath(projectRoot)` | yes |
| `src/tools/eval.ts` | (absent) | `codescope.db` — must be absent | yes (grep count: 0) |
| `src/artifacts/violation-index.ts` | 26 | `import { RULE_NAME_TO_ID } from "../conventions/rule-metadata.js"` | yes |
| `src/artifacts/violation-index.ts` | 70 | `function resolveRuleId(displayName: string): string` | yes |
| `src/artifacts/violation-index.ts` | 71 | `RULE_NAME_TO_ID.get(displayName)` | yes |
| `src/artifacts/violation-index.ts` | 140 | `ruleId: resolveRuleId(conv.name)` | yes |
| `.planning/REQUIREMENTS.md` | 37-38 | VALID-02/VALID-03 marked with strikethrough + "Moved to Out of Scope" | yes |
| `.planning/REQUIREMENTS.md` | 60-61 | Out of Scope section entries with technical rationale | yes |
| `.planning/REQUIREMENTS.md` | 87-93 | Traceability: VALID-02/VALID-03 "Out of Scope", EVAL-01/EVAL-02/EVAL-04 "Complete", zero "Pending" entries | yes |
| `.planning/phases/19-intelligence-features/19-01-SUMMARY.md` | 46 | `requirements-completed: [REF-01, REF-03, VALID-01, VALID-04]` (no VALID-02/VALID-03) | yes |

---

## Gap Analysis

No gaps found. All requirements have behavioral test coverage:

- **EVAL-01**: `tests/tools/eval.test.ts:241` — `deterministic mode opens graph.db via getGraphDbPath` proves the DB path fix by asserting `importCorrectness.total > 0` (which is only possible when graph.db is opened, since null-db returns total=0).
- **EVAL-02**: Covered by the same deterministic-mode test. Mode 1 and Mode 2 share the same `computeScorecard` call path; the DB path fix applies uniformly.
- **EVAL-04**: `tests/eval/deterministic-scorecard.test.ts` covers all six scorecard metrics individually (conventionAdherence, blastRadius, violationImpact, importCorrectness, riskFilesModified, composite). `renderScorecard` tests verify all six appear in the markdown output.
- **VALID-02**: Deferred to Out of Scope. The `violation-index.test.ts` suite confirms no type-name violations are produced. REQUIREMENTS.md traceability row reads "Out of Scope".
- **VALID-03**: Deferred to Out of Scope. `does NOT produce import-path-validity violations` test asserts `ruleId !== "import-path-validity"` across all violations. REQUIREMENTS.md traceability row reads "Out of Scope".

---

## Test Run Evidence

```
Test Files  3 passed (3)
      Tests  59 passed (59)
   Start at  07:46:01
   Duration  236ms

tests/tools/eval.test.ts             10 passed
tests/eval/deterministic-scorecard.test.ts  36 passed
tests/artifacts/violation-index.test.ts     13 passed
```

Run date: 2026-03-31
