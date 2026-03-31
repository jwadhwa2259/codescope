# Phase 19: Intelligence Features - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-03-30
**Phase:** 19-intelligence-features
**Areas discussed:** Reference file matching, Post-edit validation, Eval skill modes, Hook budget & priority

---

## Reference File Matching

| Option | Description | Selected |
|--------|-------------|----------|
| Pre-computed references-index.json | Artifact built at bootstrap, <1ms lookup, fits existing pattern | ✓ |
| On-the-fly MCP tool | Always fresh but violates D-01, 50-200ms latency | |
| Reuse golden-files only | No new artifact but global ranking, not role-scoped | |

**User's choice:** Pre-computed references-index.json (research recommendation)
**Notes:** Weighted similarity: convention density 40%, community proximity 25%, directory proximity 20%, shared imports 15%. Role-scoped candidates. One-line injection at P2.5 (~20 tokens). Research conducted by parallel agent exploring codebase artifacts and hook architecture.

---

## Post-Edit Validation

| Option | Description | Selected |
|--------|-------------|----------|
| Pre-computed convention-violations.json | <2ms, medium-high accuracy, fits artifact pattern | ✓ |
| ast-grep subprocess (sg scan) | 100-200ms, high accuracy, too slow for hook | |
| @ast-grep/napi in-process | 5-50ms, high accuracy, adds native addon complexity | |
| MCP tool (Claude calls manually) | No time pressure, full graph access, not automatic | |
| Regex anti-patterns | <1ms but low accuracy, string matching only | |

**User's choice:** Pre-computed convention-violations.json (research recommendation)
**Notes:** Type names and import paths pre-extracted at bootstrap. PostToolUse priority 1 (~100 tokens). Advisory only. Escalate to napi only if FP rate >5%. Research agent analyzed 5 approaches against latency, accuracy, and build isolation constraints.

---

## Eval Skill Modes

| Option | Description | Selected |
|--------|-------------|----------|
| Mode 2 MVP (deterministic scorecard) | Fast, free, reproducible. Convention %, blast radius, violations, import correctness, risk files, composite grade. | ✓ |
| Mode 1 (run task + score) | Orient pipeline + Mode 2 scoring. Medium priority. | ✓ (second priority) |
| Mode 3 (benchmark suite) | YAML tasks, batch mode. Deferred to Phase 20+. | |
| Full LLM-based eval for all modes | Semantically richer but slow, expensive, non-reproducible | |

**User's choice:** Mode 2 deterministic as MVP, Mode 1 as second priority, Mode 3 deferred (research recommendation)
**Notes:** Scorecard fields all deterministic from existing MCP tools. Composite score: 25% each for convention adherence, blast radius, violations, import correctness. Letter grades A-F. Research agent confirmed existing eval agent infrastructure and MCP tools provide all needed data.

---

## Hook Budget & Priority

| Option | Description | Selected |
|--------|-------------|----------|
| Keep 500 tokens, add at P2.5 (Pre) and P1 (Post) | PreToolUse total ~310/500, PostToolUse total ~230/500. Comfortable headroom. | ✓ |
| Increase budget to 750 tokens | More room but risks context pollution per Pitfall 7 | |
| Separate budgets for new items | Complex, breaks existing composer pattern | |

**User's choice:** Keep 500 tokens with recommended priority allocation (research recommendation)
**Notes:** Reference = PreToolUse P2.5 only (~20 tokens). Validation = PostToolUse P1 only (~100 tokens). No overlap between hooks. Research agent verified token arithmetic and confirmed 40-55% headroom.

---

## Claude's Discretion

- Exact similarity weight tuning
- Scorecard markdown rendering format
- Whether to add complementary MCP validation tool
- Pairwise similarity pre-computation strategy

## Deferred Ideas

- Mode 3 benchmark suite — Phase 20+
- Full LLM eval detail — Phase 20+
- @ast-grep/napi escalation — only if FP >5%
- Community benchmark YAMLs — Phase 20+
