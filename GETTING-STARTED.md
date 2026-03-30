# Getting Started with CodeScope

CodeScope is a plugin for [Claude Code](https://claude.ai/code) that gives the AI deep, persistent understanding of your codebase before it writes a single line of code. It analyzes your project's conventions, dependencies, and risk zones so that every AI-generated change fits naturally into your existing code.

## The Problem CodeScope Solves

When you ask an AI to modify code in an existing project, it starts from zero every time. It doesn't know your naming conventions, your module boundaries, which files are high-risk, or how your imports are structured. The result: code that works in isolation but clashes with everything around it.

CodeScope fixes this by analyzing your codebase once, building a knowledge graph of how everything connects, and then injecting that context into every Claude Code interaction automatically.

## What You Need

- **Node.js 22 or later** -- check with `node --version`
- **Claude Code** -- the CLI, desktop app, or IDE extension

## Installation

```bash
npm install -g codescope
```

Or use it directly without installing:

```bash
npx codescope init
```

## Setup (2 minutes)

### Step 1: Onboard your project

Open Claude Code in your project directory and run:

```
/codescope:onboard
```

This walks you through a short wizard:
- **Detects your project** -- languages, build commands, test commands, monorepo vs single repo
- **Configures agent models** -- which Claude models to use for different analysis tasks (defaults work fine)
- **Sets workflow preferences** -- how verbose you want the output, how strict convention enforcement should be

When it finishes, you'll have a config file at `.claude/codescope/config.yml`.

### Step 2: Bootstrap (analyze your codebase)

```
/codescope:bootstrap
```

This is the main analysis step. CodeScope:
1. Scans your project structure
2. Parses every source file into an AST
3. Builds a **knowledge graph** of all dependencies and relationships
4. Detects your **coding conventions** with adoption rates and confidence scores
5. Identifies **danger zones** -- high-risk files with many dependents
6. Computes an **AI Readiness Score** across four dimensions

For a typical project, this takes 1-5 minutes. You only need to run it once. CodeScope detects changes and updates incrementally after that.

When it completes, you'll see a readiness report like:

```
AI Readiness: B+ (82%)

| Dimension            | Score |
|----------------------|-------|
| Convention Coverage  | 87%   |
| Type Safety          | 91%   |
| Test Coverage Proxy  | 68%   |
| Import Graph Health  | 83%   |
```

### Step 3: You're done

That's it. CodeScope is now active. Every time Claude Code edits or writes a file, CodeScope automatically injects relevant context about that file's conventions, danger level, and blast radius.

## How to Use It

### Ask Claude to change code (the main workflow)

```
/codescope:orient add a caching layer to the user service
```

This runs the full autonomous pipeline:

1. **Clarifies** -- asks you targeted questions based on what the knowledge graph reveals about the affected area (danger zones, convention conflicts, cross-module dependencies)
2. **Scopes** -- produces a scope contract listing exactly what will and won't change, which you approve
3. **Researches** -- looks up any external libraries involved
4. **Plans** -- creates an execution plan with agent assignments, which you approve
5. **Executes** -- spawns sub-agents to make the changes in parallel waves
6. **Verifies** -- runs your build, tests, convention checks, and blast radius analysis
7. **Evaluates** -- scores the changes on scope compliance, convention adherence, completeness, and correctness
8. **Debugs** -- if evaluation finds issues, automatically attempts to fix them (up to 3 cycles)
9. **Learns** -- captures project-specific insights for future runs

You only need to step in twice: to approve the scope, and to approve the plan. Everything else is autonomous.

### Quick flags

- `--no-confirm` -- skip both approval gates (scope and plan). Full autopilot.
- `--no-clarify` -- skip the clarification questions if you already know exactly what you want.

### Review changes before committing

```
/codescope:review
```

Analyzes your working tree diff against the knowledge graph. Shows:
- Risk level per file (HIGH / MEDIUM / LOW)
- New or removed dependency edges
- Convention violations
- Cross-community warnings (changes that span unrelated parts of the codebase)

You can also review a specific branch or PR:

```
/codescope:review feature/auth
/codescope:review #42
```

### Visualize your codebase

```
/codescope:viz
```

Opens an interactive dashboard in your browser at `http://localhost:7463` with five panels:

1. **Graph** -- interactive dependency visualization (zoom, click, filter)
2. **Heatmap** -- convention compliance across your codebase
3. **Trends** -- readiness score history over time
4. **Blast Radius** -- select any file and see what it impacts
5. **Command Center** -- run actions from the dashboard

Use keyboard shortcuts `1-5` to switch panels.

### Pause and resume work

If you need to close Claude Code mid-task:

```
/codescope:pause
```

Saves your full pipeline state -- what's done, what's remaining, key decisions made.

Later, in a new session:

```
/codescope:resume
```

Picks up exactly where you left off.

### Review what CodeScope has learned

```
/codescope:review-learnings
```

Shows accumulated project learnings (gotchas, decisions, patterns) and lets you confirm, reject, edit, or promote them to enforced conventions.

### Change settings

```
/codescope:settings
```

Interactive menu to change any configuration: agent models, verbosity, convention strictness, eval mode, and more.

Quick one-liner changes:

```
/codescope:settings --set eval.mode=auto-debug
/codescope:settings --set conventions.strictness=warn
```

## What Happens Behind the Scenes

Once CodeScope is set up, it works automatically through Claude Code's hook system:

- **Before every file edit:** CodeScope injects the file's conventions, danger zone status, and blast radius into Claude's context. Claude sees something like: "This file has 14 dependents, follows camelCase naming, uses barrel exports, and is in a HIGH danger zone."

- **After every file edit:** CodeScope validates the change against detected conventions and flags violations.

- **Before context compaction:** CodeScope saves session state so nothing is lost when Claude's context window fills up.

- **On session resume:** CodeScope restores context from the previous session.

You don't need to do anything for this to work. It's invisible.

## What CodeScope Analyzes

| Analysis | What it finds |
|----------|---------------|
| **Knowledge Graph** | Every file, every import, every dependency edge. Community detection groups related modules. Centrality analysis finds the most connected files. |
| **Conventions** | Naming patterns, export styles, error handling approaches, test structures, import ordering -- with adoption rates (e.g., "camelCase: 94% adoption across 312 files"). |
| **Danger Zones** | Files with high in-degree centrality (many things depend on them). Changing these files has outsized impact. |
| **Blast Radius** | For any file, BFS traversal of the dependency graph to find everything affected by a change. |
| **AI Readiness** | A composite score measuring how well-structured the codebase is for AI-assisted changes. |

## MCP Tools (for advanced use)

CodeScope exposes 15 tools via the Model Context Protocol. You don't need to call these directly -- the skills and hooks use them. But if you want to query the knowledge graph manually:

| Tool | What it does |
|------|-------------|
| `codescope_status` | Health check -- is CodeScope bootstrapped and ready? |
| `codescope_recall` | Retrieve conventions, learnings, or overview by topic |
| `codescope_graph_query` | Query graph neighbors, paths, or communities |
| `codescope_blast_radius` | BFS blast radius from a file |
| `codescope_conventions` | Get conventions for specific files or modules |
| `codescope_orient` | Lightweight task orientation brief |
| `codescope_verify` | Check convention compliance |
| `codescope_search` | Graph-based code search |
| `codescope_readiness` | AI readiness score |
| `codescope_detect_changes` | Classify working directory changes by risk |
| `codescope_service_map` | Service map for monorepos |
| `codescope_eval` | Evaluate code changes against criteria |
| `codescope_trends` | Readiness trend data |
| `codescope_predict_impact` | Reverse blast radius (what impacts this file?) |
| `codescope_review` | Structural impact analysis for PRs |

## Project Files

CodeScope stores all its data in `.claude/codescope/` inside your project:

```
.claude/codescope/
  config.yml          -- your configuration (tracked in git)
  graph.db            -- the knowledge graph database (gitignored)
  conventions-enforced.md  -- confirmed conventions (tracked in git)
  readiness.md        -- latest readiness score
  learnings.md        -- accumulated project learnings
  services/           -- per-service analysis artifacts
  orient/             -- task orientation artifacts
  plans/              -- execution plans
  execution/          -- execution logs and coordination
  reports/            -- verification reports
  sessions/           -- pause/resume handoff files
```

## Supported Languages

- **TypeScript / JavaScript** -- full support (AST parsing, import resolution at 95-99% accuracy, convention detection)
- **Python** -- supported (AST parsing, import resolution at ~80% accuracy, convention detection)

## Tips

- **Run `/codescope:bootstrap` after major refactors** to update the knowledge graph. For small changes, incremental analysis handles it automatically.
- **Start with `suggest-only` convention strictness** (the default). Move to `warn` or `block` once you've reviewed and confirmed the detected conventions.
- **Use `/codescope:review` before every PR.** It catches cross-community coupling and convention drift that code review alone misses.
- **Review learnings periodically** with `/codescope:review-learnings`. Confirming learnings makes them permanent. Rejecting stale ones frees up capacity (capped at 50 active learnings).

## Troubleshooting

**"CodeScope has not analyzed this codebase yet"**
Run `/codescope:bootstrap` first.

**"No config found"**
Run `/codescope:onboard` first.

**Bootstrap is slow**
First bootstrap of a large codebase (100K+ LOC) can take up to 5 minutes. Subsequent runs are incremental and much faster.

**Convention detection seems wrong**
Conventions are detected with confidence scores. Low-confidence detections (below 80% adoption) are not enforced. Review with `/codescope:review-learnings` and reject any that don't match your intent.

**Graph data seems stale**
Run `/codescope:bootstrap --force` to rebuild from scratch. This preserves your config, enforced conventions, and learnings.
