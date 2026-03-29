# Phase 13: Pipeline Evolution - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md -- this log preserves the alternatives considered.

**Date:** 2026-03-28
**Phase:** 13-pipeline-evolution
**Areas discussed:** Qualification gate, Failure classification, Reconciliation report, Token budget strategy

---

## Qualification Gate

| Option | Description | Selected |
|--------|-------------|----------|
| Inline in executeAgent() | After each agent in orchestrator, run git diff + convention check | ✓ |
| Separate post-execution step | Run all checks after full execution completes | |
| Post-execution hook | External hook script for qualification | |

**User's choice:** Inline in executeAgent() (recommended default)
**Notes:** User accepted recommended route for all areas.

### Follow-up: Failure behavior

| Option | Description | Selected |
|--------|-------------|----------|
| Flag and continue | Mark agent as unqualified, pipeline continues | ✓ |
| Stop pipeline | Halt execution on first qualification failure | |
| Retry then flag | Retry agent once, flag if still fails | |

**User's choice:** Flag and continue (recommended default)

---

## Failure Classification

| Option | Description | Selected |
|--------|-------------|----------|
| Rule-based heuristics | Map eval criteria scores to categories directly | ✓ |
| LLM classification | Extra LLM call to classify each finding | |
| Hybrid | Rules first, LLM for ambiguous cases | |

**User's choice:** Rule-based heuristics (recommended default)
**Notes:** Eval agent already scores scope_compliance, convention_adherence, completeness, correctness -- direct mapping avoids extra LLM cost.

### Follow-up: Debug agent consumption

| Option | Description | Selected |
|--------|-------------|----------|
| Metadata on finding | classification field on EvalFinding, debug agent reads it | ✓ |
| Separate classification report | Standalone file debug agent reads | |

**User's choice:** Metadata on finding (recommended default)

---

## Reconciliation Report

| Option | Description | Selected |
|--------|-------------|----------|
| After full execution | Single report after all waves complete | ✓ |
| Per-wave | Report after each wave | |

**User's choice:** After full execution (recommended default)

### Follow-up: Report format

| Option | Description | Selected |
|--------|-------------|----------|
| Standalone markdown file | reconciliation.md in execution directory | ✓ |
| Section in execution summary | Append to existing summary.md | |

**User's choice:** Standalone markdown file (recommended default)

### Follow-up: Unexpected detection method

| Option | Description | Selected |
|--------|-------------|----------|
| Set difference | Compare planned targetFiles vs git diff --name-only | ✓ |
| Git blame analysis | Attribute changes to specific agents | |

**User's choice:** Set difference (recommended default)

---

## Token Budget Strategy

| Option | Description | Selected |
|--------|-------------|----------|
| LIGHT <20K, MODERATE 20-50K, HEAVY >50K | Three-tier classification | ✓ |
| Two-tier (LIGHT/HEAVY at 30K) | Simpler binary split | |

**User's choice:** Three-tier LIGHT/MODERATE/HEAVY (recommended default)

### Follow-up: Warning timing

| Option | Description | Selected |
|--------|-------------|----------|
| Before execution starts | Sum estimates, warn pre-flight | ✓ |
| During execution | Warn as agents complete and actuals accumulate | |
| Both pre and during | Warn before and track during | |

**User's choice:** Before execution starts (recommended default)

### Follow-up: Safe threshold

| Option | Description | Selected |
|--------|-------------|----------|
| Configurable, default 150K | config.yml setting, leaves headroom for verify/eval/debug | ✓ |
| Fixed 100K | Conservative fixed limit | |
| Model-aware auto-detect | Read model context window and compute | |

**User's choice:** Configurable, default 150K (recommended default)

---

## Claude's Discretion

- Convention scan implementation details in qualification gate
- tokenEstimate() extraction to shared utility vs import from eval-agent
- Reconciliation report formatting
- Coordination log integration for qualification issues

## Deferred Ideas

None -- discussion stayed within phase scope.
