# CodeScope Eval Framework — Plan

## Goal

Demonstrate that CodeScope gives Claude Code measurably better codebase awareness, leading to changes that respect conventions, avoid unnecessary risk, and fit naturally into existing code. Produce publishable results that show value to potential users.

## Core Claim

> CodeScope gives Claude Code deep understanding of your codebase — conventions, dependencies, risk zones — so every AI-generated change fits naturally into existing code.

## Approach: In-Session Evaluation via `/codescope:eval`

CodeScope is a Claude Code plugin. It runs inside Claude Code sessions on users' Max/Pro subscriptions — not as an external script, not via API. The eval works the same way: a skill you run inside Claude Code that scores changes using CodeScope's own MCP tools.

### How It Works

```
┌──────────────────────────────────────────────────────────────┐
│  Inside a Claude Code session with CodeScope installed       │
│                                                              │
│  User runs: /codescope:eval                                  │
│                                                              │
│  1. Pick a target repo (or use current project)              │
│     └── Must be bootstrapped (knowledge graph exists)        │
│                                                              │
│  2. User describes a task naturally                          │
│     "Add rate limiting middleware to the router"              │
│                                                              │
│  3. Claude executes the task with CodeScope active            │
│     └── Hooks inject context, validate conventions           │
│                                                              │
│  4. Score the changes using MCP tools                        │
│     ├── codescope_conventions  → convention adherence         │
│     ├── codescope_blast_radius → blast radius size            │
│     ├── codescope_verify       → violation count              │
│     ├── codescope_detect_changes → risk classification        │
│     └── codescope_eval         → composite score              │
│                                                              │
│  5. Generate a scorecard                                     │
│     └── .claude/codescope/evals/<task-id>.md                 │
│                                                              │
│  6. Optionally revert changes (eval-only mode)               │
│     └── git stash / git checkout to restore clean state      │
└──────────────────────────────────────────────────────────────┘
```

### What We Measure

| Metric | Tool | What it shows |
|--------|------|---------------|
| **Convention Adherence** | `codescope_conventions` | % of changed lines following detected conventions (naming, exports, error handling) |
| **Blast Radius** | `codescope_blast_radius` | Number of downstream files affected by the change |
| **Convention Violations** | `codescope_verify` | New violations introduced by the change |
| **Import Correctness** | `codescope_verify` | Broken or incorrect imports |
| **Risk Awareness** | `codescope_detect_changes` | How many HIGH-risk danger zone files were modified |
| **Composite Score** | `codescope_eval` | Overall quality (scope compliance + conventions + completeness + correctness) |

### Demonstrating Value Without A/B Testing

A/B testing (with vs without CodeScope) is impractical inside Claude Code — you can't easily disable the plugin mid-session and re-run the same task. Instead, we demonstrate value through:

**1. Absolute quality scores**
Show that CodeScope-assisted changes achieve high convention adherence (>85%), low violation counts, and contained blast radius. Users can compare mentally to their own experience with vanilla Claude Code.

**2. Before/after bootstrap**
Run a task before bootstrapping (CodeScope installed but no knowledge graph yet) and after. The delta shows what the analysis adds.

**3. Scorecard transparency**
Every eval produces a detailed scorecard showing exactly what CodeScope detected: which conventions were followed, which danger zones were avoided, what the blast radius looks like. Users can verify this against their own codebase knowledge.

**4. Community benchmarks**
Publish eval results on well-known repos (Fastify, Express, Hono). Users can run the same eval on the same repos and verify the numbers.

## The Eval Skill

### User Flow

```
User: /codescope:eval

CodeScope: What would you like to evaluate?
  1. Run a task and score the output
  2. Score existing uncommitted changes
  3. Run a benchmark suite on this repo

User: 1

CodeScope: Describe the task:
User: Add request validation middleware using zod schemas

CodeScope: Running task with full context injection...
[Claude executes the task normally — hooks fire, context injected]

CodeScope: Task complete. Scoring changes...

┌─────────────────────────────────────────┐
│  EVAL SCORECARD                         │
│                                         │
│  Task: Add zod validation middleware    │
│  Files changed: 4                       │
│  Lines added: 87  removed: 3           │
│                                         │
│  Convention Adherence:  94%  ██████████ │
│  Blast Radius:          6 files (LOW)   │
│  Violations:            0              │
│  Import Correctness:    100%           │
│  Risk Files Modified:   0 of 3 avoided │
│  Composite Score:       A (91%)        │
│                                         │
│  Details: .claude/codescope/evals/      │
│           eval-20260330-zod-valid.md    │
└─────────────────────────────────────────┘

Revert changes? [y/n]
```

### Mode 2: Score Existing Changes

For users who already made changes and want to see how they score:

```
User: /codescope:eval
> Score existing uncommitted changes

CodeScope: Analyzing working tree diff...
[Runs MCP tools against the diff]
[Produces the same scorecard]
```

This is the simplest mode — no task execution, just scoring. Useful for PR review workflows.

### Mode 3: Benchmark Suite

Pre-defined tasks for a repo that run sequentially and produce aggregate scores:

```
User: /codescope:eval
> Run a benchmark suite on this repo

CodeScope: Found 5 benchmark tasks for this repo.
Running task 1/5: Add error handling middleware...
Running task 2/5: Extract auth logic to module...
...

Aggregate Results:
| Task                    | Conv. | Blast | Violations | Score |
|-------------------------|-------|-------|------------|-------|
| Error handling MW       | 91%   | 4     | 0          | A     |
| Extract auth module     | 88%   | 8     | 1          | B+    |
| Add pagination          | 95%   | 3     | 0          | A     |
| Fix session race cond.  | 87%   | 2     | 0          | A-    |
| Add user service tests  | 92%   | 1     | 0          | A     |
|-------------------------|-------|-------|------------|-------|
| **Average**             | 91%   | 3.6   | 0.2        | A-    |
```

## Task Design

### Target Repositories

Start with repos users can easily clone and bootstrap:

| Repo | Language | Why |
|------|----------|-----|
| **fastify** | TS | Strong conventions, plugin architecture, strict patterns |
| **hono** | TS | Clean TS codebase, clear module structure, growing popularity |
| **express** | JS | Well-known, strong conventions, tests JS support |
| **codescope** | TS | Dog-fooding — evaluate on ourselves |

### Task Categories

| Category | Example Task | What it tests |
|----------|-------------|---------------|
| **Add feature** | "Add rate limiting middleware" | Convention adherence for new code, import correctness |
| **Refactor** | "Extract validation into a separate module" | Blast radius awareness, import graph impact |
| **Fix bug** | "Fix the race condition in session handler" | Risk zone awareness, minimal blast radius |
| **Add test** | "Add unit tests for auth service" | Test convention adherence, file placement |
| **Modify existing** | "Add pagination to list endpoints" | High-dependency file awareness, consistency |

### Benchmark Definition Format

```yaml
# .claude/codescope/benchmarks/fastify.yml
name: Fastify Benchmark Suite
repo: fastify/fastify
tasks:
  - id: rate-limit
    description: "Add rate limiting middleware that limits each IP to 100 requests per minute. Use the existing plugin pattern."
    category: add-feature
    revert_after: true

  - id: extract-validation
    description: "Extract the request validation logic from route handlers into a shared validation module."
    category: refactor
    revert_after: true

  - id: add-tests
    description: "Add unit tests for the error handling middleware."
    category: add-test
    revert_after: true
```

## Scorecard Output

Each eval produces a markdown file at `.claude/codescope/evals/<eval-id>.md`:

```markdown
# Eval Scorecard — Add zod validation middleware
**Date:** 2026-03-30
**Repo:** fastify/fastify @ v5.0.0
**CodeScope Version:** 0.1.0

## Summary
| Metric                | Value    | Rating |
|-----------------------|----------|--------|
| Convention Adherence  | 94%      | A      |
| Blast Radius          | 6 files  | LOW    |
| Convention Violations | 0        | PASS   |
| Import Correctness    | 100%     | PASS   |
| Risk Files Modified   | 0        | PASS   |
| Composite Score       | 91%      | A      |

## Convention Details
- camelCase function names: 12/12 (100%)
- Plugin registration pattern: 2/2 (100%)
- JSDoc on exports: 3/4 (75%) — missing on `validateSchema()`
- Barrel exports: 1/1 (100%)

## Blast Radius
Files directly changed: 4
Downstream affected: 6
Danger zone files touched: 0
Danger zone files avoided: 3 (router.ts, server.ts, app.ts)

## Files Changed
| File | Risk | Violations |
|------|------|------------|
| src/plugins/rate-limit.ts (new) | — | 0 |
| src/plugins/index.ts | LOW | 0 |
| src/types/plugin.ts | MEDIUM | 0 |
| test/rate-limit.test.ts (new) | — | 0 |
```

## Implementation Plan

### Phase 1: Scoring Pipeline
Build the scoring functions that call CodeScope's MCP tools and produce a structured scorecard. This is the core — everything else wraps it.

- Import MCP tool handlers directly as TypeScript functions (no subprocess needed)
- Score a diff and return structured `EvalScore` object
- Render scorecard as markdown

### Phase 2: `/codescope:eval` Skill
Create the skill with three modes:
1. Run task + score (main mode)
2. Score existing changes (simplest)
3. Benchmark suite (batch mode)

### Phase 3: Benchmark Tasks
Create benchmark task definitions for 2-3 popular repos. Start with Fastify and Hono.

### Phase 4: Publishable Results
- Run benchmarks on target repos
- Generate aggregate results
- Add summary to README with link to full results
- Optionally write a blog post with methodology

## Open Questions

1. **Revert mechanism** — After scoring an eval task, use `git stash` or `git checkout -- .` to revert? Need to handle new files too. `git stash --include-untracked` then `git stash drop` is probably cleanest.

2. **Reproducibility** — LLM outputs are non-deterministic. Running the same benchmark 3x and reporting averages would be more credible, but costs 3x the tokens. Start with single runs, add repetition later.

3. **Before/after comparison** — Running a task before bootstrap then after would be compelling. But "before bootstrap" means no knowledge graph, so most MCP tools return empty results. The scoring itself would need to handle that gracefully.

4. **Community contribution** — Should benchmark definitions be community-contributed? Users could submit benchmark YAMLs for their favorite repos. Creates engagement + more data points.

## Risks

| Risk | Mitigation |
|------|------------|
| Scores look good but don't match user perception | Include convention details so users can verify against their own knowledge |
| Benchmark tasks are too easy / not representative | Source tasks from real Claude Code usage patterns, not contrived examples |
| Scoring is biased toward CodeScope's own detection | Open-source the eval, let users run it and check results themselves |
| Users don't run benchmarks (too much effort) | Make Mode 2 (score existing changes) zero-effort — just run after any task |

## Suggested Next Steps

1. **Build scoring pipeline** — MCP tool calls → structured scorecard
2. **Build Mode 2 first** (score existing changes) — simplest, immediately useful
3. **Add Mode 1** (run task + score) — the main eval workflow
4. **Create benchmark tasks** for Fastify and Hono
5. **Run benchmarks, publish results** — README + blog post
