---
phase: 5
slug: verification
status: draft
shadcn_initialized: false
preset: none
created: 2026-03-23
---

# Phase 5 — UI Design Contract

> Output formatting and copywriting contract for the Verification phase. This phase produces no visual frontend — all user-facing output is structured markdown reports and MCP JSON responses. This contract defines the exact text formats, section structures, severity labels, and copy strings that the planner and executor must follow.

---

## Design System

| Property | Value |
|----------|-------|
| Tool | none |
| Preset | not applicable |
| Component library | none (CLI plugin, no frontend) |
| Icon library | not applicable |
| Font | not applicable (terminal/markdown output) |

**Rationale:** CodeScope is a Claude Code plugin. Phase 5 outputs are: (1) a markdown verify report written to disk, (2) MCP JSON responses, (3) terminal log lines. There is no React, no browser rendering, no visual design system.

---

## Spacing Scale

Not applicable. This phase produces structured markdown and JSON, not visual layouts.

Markdown report structure uses:
- One blank line between sections
- No blank line between list items within a section
- Two blank lines before H2 headings
- One blank line before H3 headings

---

## Typography

Not applicable. Terminal and markdown output inherit the consumer's rendering.

Markdown heading hierarchy for the verify report:

| Level | Usage |
|-------|-------|
| H1 (`#`) | Report title only: `# Verify Report: [task-slug]` |
| H2 (`##`) | Major sections: Static Checks, Runtime Checks, Auto-Smoke Results, Summary |
| H3 (`###`) | Individual checks: Convention Compliance, Blast Radius Diff, Code Review, Build, Unit Tests, Integration Tests, E2E |
| Bold (`**`) | Inline labels: severity tags, file paths, timing data |
| Code (`` ` ``) | File paths, command names, convention names, rule IDs |

---

## Color

Not applicable. No visual rendering layer.

Severity markers use text labels (no color codes):

| Severity | Marker | Meaning | Downstream Mapping |
|----------|--------|---------|--------------------|
| ERROR | `[ERROR]` | Build fails, test fails — something is broken | Must fix (eval triage) |
| WARN | `[WARN]` | Convention violation, blast radius surprise — worth reviewing | Eval judges |
| INFO | `[INFO]` | Code review suggestions, auto-smoke results, skips — FYI only | Skip by default |
| SKIPPED | `[SKIPPED]` | Check not run due to missing config | No action needed |
| PASS | `[PASS]` | Check passed successfully | No action needed |

Source: CONTEXT.md D-02, D-05.

---

## Copywriting Contract

### Verify Report Header

```
# Verify Report: {task-slug}

**Date:** {ISO-8601 date}
**Task:** {task description from scope contract}
**Duration:** {total verification time}
```

### Section Headers with Timing (D-03)

Format: `### {Check Name} ({duration})`

Examples:
- `### Convention Compliance (0.8s)`
- `### Unit Tests: 142/142 PASS (8.1s)`
- `### Build (12.3s)`
- `### E2E: Playwright (4.2s)`

### Convention Violation Entry (D-04)

```
- [WARN] `{file}:{line}` — Violates `{convention-name}` ({adoption}% adoption)
  See golden file: `{golden-file-path}:{line-range}` for correct pattern
```

### Blast Radius Diff — Surprise File (D-08)

```
- [{severity}] Surprise: `{file}` changed but not in plan (graph distance: {hops} hops from nearest predicted file)
```

Where severity = WARN for hops 1-2, ERROR for hops 3+ or unconnected.

### Blast Radius Diff — Skip File (D-09)

```
- [INFO] Skip: `{file}` predicted but not modified — may have been handled by a different approach or deemed unnecessary by execution agent
```

### Scope Drift (D-10)

```
- [WARN] Possible scope drift: `{file}` not covered by scope contract
```

### Build Failure (D-18)

```
### Build ({duration})

[ERROR] Build failed.

**Command:** `{build_command}`
**Exit code:** {code}

**Output (last 500 lines):**
```
{truncated output}
```

[SKIPPED] Unit Tests — skipped due to build failure
[SKIPPED] Integration Tests — skipped due to build failure
[SKIPPED] E2E — skipped due to build failure
[SKIPPED] Auto-Smoke — skipped due to build failure
```

### Build Success

```
### Build ({duration})

[PASS] Build succeeded.

**Command:** `{build_command}`
```

### Test Results — Pass (D-22)

```
### Unit Tests: {pass_count}/{total_count} PASS ({duration})

[PASS] All tests passed.
```

### Test Results — Failure (D-22)

```
### Unit Tests: {pass_count}/{total_count} PASS, {fail_count} FAIL ({duration})

[ERROR] {fail_count} test(s) failed.

**Failed tests:**
- `{test_name}` at `{file}:{line}` — {assertion_error}
- `{test_name}` at `{file}:{line}` — {assertion_error}
```

### Test Output Truncation (D-27)

```
**Output truncated — showing last 500 of {N} lines.**
```

### E2E Auto-Detection Note (D-11)

```
**E2E tool:** {tool_name} (auto-detected from `{config_file}`)
```

Or when configured:
```
**E2E tool:** {tool_name} (configured in config.yml)
```

Or when skipped:
```
[SKIPPED] E2E — tool set to 'none' in config.yml
```

### Auto-Smoke Results (D-12)

```
### Auto-Smoke Results ({duration})

**New endpoints detected:** {count}

- [INFO] `GET /api/users` — 200 OK (smoke pass)
- [INFO] `POST /api/orders` — 401 Unauthorized (auth-required, expected)
- [WARN] `GET /api/health` — 500 Internal Server Error (smoke fail)
```

### Code Review Findings (D-23, D-24)

```
### Code Review ({duration})

**Reviewer model:** {model_name}
**Findings:** {count} (soft cap: 10)

- [WARN] `{file}:{line}` — {finding description}
- [INFO] `{file}:{line}` — {finding description}
```

When truncated:
```
_{N} additional minor findings omitted._
```

### Unconfigured Check Skip (D-05)

```
[SKIPPED] {Check Name}: No {config_field} configured in config.yml. Run /codescope:settings to configure.
```

### Report Summary Section

```
## Summary

| Check | Result | Duration |
|-------|--------|----------|
| Convention Compliance | {PASS/N violations} | {time} |
| Blast Radius Diff | {PASS/N surprises, N skips} | {time} |
| Code Review | {N findings} | {time} |
| Build | {PASS/FAIL} | {time} |
| Unit Tests | {pass}/{total} PASS | {time} |
| Integration Tests | {pass}/{total} PASS | {time} |
| E2E | {PASS/FAIL/SKIPPED} | {time} |
| Auto-Smoke | {N}/{N} endpoints reachable | {time} |

**Total verification time:** {total_duration}
**Errors:** {count} | **Warnings:** {count} | **Info:** {count} | **Skipped:** {count}
```

### Empty State — No Enforced Conventions

```
[INFO] No conventions enforced yet. Use /codescope:review-learnings (Phase 7) to promote high-confidence conventions.
```

Source: Existing verify.ts line 197.

### Empty State — No Orient Artifacts (Standalone MCP Call) (D-29)

```
[WARN] Blast radius diff requires orient artifacts (execution plan). Run as part of /codescope:orient pipeline for full verification. Convention compliance, build, and test checks are available standalone.
```

### Empty State — No Changed Files

```
[INFO] No changed files detected (git diff --name-only returned empty). Verification skipped.
```

### Error State — Bootstrap Required

```
No bootstrap data found. Run /codescope:bootstrap first.
```

Source: Existing verify.ts line 169.

### Error State — Server Start Failure (D-15, D-16)

```
[ERROR] Server failed to start for E2E verification.

**Command:** `{start_command}`
**Readiness check:** {health_check or ready_signal or "5s fixed delay"}
**Timeout:** {timeout_seconds}s

E2E and auto-smoke tests skipped.
```

### Error State — Server Cleanup Failure (D-16)

```
[WARN] Port {port} still in use after server shutdown. Force-killed PID {pid}.
```

### Destructive Actions

No destructive actions in this phase. Verification is read-only data-gathering (D-21). Auto-smoke temp files are created and cleaned up automatically (D-12). No user confirmation required.

---

## MCP Response Schema — codescope_verify Upgrade (D-28)

### Input Schema

```typescript
{
  files: string[];            // File paths to verify
  checks?: (                  // Checks to run (default: all applicable)
    | "convention_compliance"
    | "blast_radius_diff"
    | "build"
    | "unit_tests"
    | "integration_tests"
    | "e2e"
    | "auto_smoke"
    | "code_review"
  )[];
  task_slug?: string;         // Required for blast_radius_diff and code_review
}
```

### Success Response

```json
{
  "status": "ok",
  "data": {
    "files_checked": 12,
    "checks": {
      "convention_compliance": {
        "status": "completed",
        "violations": [],
        "summary": { "total_violations": 0, "files_with_violations": 0 }
      },
      "blast_radius_diff": {
        "status": "completed",
        "surprises": [],
        "skips": [],
        "scope_drift": []
      },
      "build": {
        "status": "pass",
        "command": "npm run build",
        "duration_ms": 12300
      },
      "unit_tests": {
        "status": "pass",
        "passed": 142,
        "failed": 0,
        "total": 142,
        "duration_ms": 8100,
        "failures": []
      }
    },
    "summary": {
      "errors": 0,
      "warnings": 0,
      "info": 3,
      "skipped": 2,
      "total_duration_ms": 25400
    }
  },
  "metadata": {
    "last_bootstrap": "2026-03-23T...",
    "staleness": "fresh",
    "query_ms": 25400,
    "capabilities": [
      "convention_compliance",
      "blast_radius_diff",
      "build",
      "unit_tests",
      "integration_tests",
      "e2e",
      "auto_smoke",
      "code_review"
    ],
    "upcoming": []
  }
}
```

### Partial Response (D-29 — standalone call without orient artifacts)

```json
{
  "status": "partial",
  "data": {
    "files_checked": 12,
    "checks": {
      "convention_compliance": { "status": "completed", "..." : "..." },
      "blast_radius_diff": { "status": "unavailable", "reason": "Requires orient artifacts" },
      "code_review": { "status": "unavailable", "reason": "Requires orient artifacts" }
    }
  },
  "warnings": [
    "blast_radius_diff and code_review require orient artifacts. Run as part of /codescope:orient pipeline."
  ],
  "metadata": { "..." : "..." }
}
```

### Error Response

```json
{
  "status": "error",
  "error": {
    "code": "NOT_BOOTSTRAPPED",
    "message": "No bootstrap data found. Run /codescope:bootstrap first.",
    "recovery": "Run /codescope:bootstrap to analyze your codebase."
  }
}
```

---

## Registry Safety

| Registry | Blocks Used | Safety Gate |
|----------|-------------|-------------|
| not applicable | none | not applicable |

**Rationale:** No shadcn, no component registry, no third-party UI blocks. This is a backend-only phase.

---

## Report File Contract

| Property | Value | Source |
|----------|-------|--------|
| Path | `.claude/codescope/reports/{task-slug}-{ISO-date}.md` | D-06 |
| Naming | No sequence number, one report per orient run | D-06 |
| Retention | All reports retained indefinitely | D-06 |
| Encoding | UTF-8 | Default |
| Line endings | LF | Project convention (ESM, type:module) |

---

## Agent Module Contract

Both verify agents follow established patterns (D-20):

```typescript
// Static verify agent
interface StaticVerifyOptions {
  projectRoot: string;
  taskSlug: string;
  changedFiles: string[];    // From git diff --name-only
  planPath: string;          // Execution plan with predicted files
  scopeContractPath: string; // Scope contract from orient
}

interface StaticVerifyResult {
  conventionViolations: Violation[];
  blastRadiusDiff: { surprises: SurpriseFile[]; skips: SkipFile[]; scopeDrift: string[] };
  codeReview: ReviewFinding[];
  timing: { convention_ms: number; blastRadius_ms: number; codeReview_ms: number };
}

// Runtime verify agent
interface RuntimeVerifyOptions {
  projectRoot: string;
  taskSlug: string;
  config: Config['verify'];
  changedFiles: string[];
  buildShortCircuit: boolean; // If true, build already failed — skip tests
}

interface RuntimeVerifyResult {
  build: { status: 'pass' | 'fail' | 'skipped'; output?: string; duration_ms: number };
  unitTests: TestResult;
  integrationTests: TestResult;
  e2e: TestResult;
  autoSmoke: SmokeResult[];
  timing: Record<string, number>;
}
```

---

## Checker Sign-Off

- [ ] Dimension 1 Copywriting: PASS
- [ ] Dimension 2 Visuals: PASS (adapted: report structure and section hierarchy)
- [ ] Dimension 3 Color: PASS (adapted: severity markers as text labels)
- [ ] Dimension 4 Typography: PASS (adapted: markdown heading hierarchy)
- [ ] Dimension 5 Spacing: PASS (adapted: markdown blank line conventions)
- [ ] Dimension 6 Registry Safety: PASS (not applicable confirmed)

**Approval:** pending
