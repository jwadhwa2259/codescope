# Phase 5: Verification - Research

**Researched:** 2026-03-24
**Domain:** Verification pipeline (static analysis, runtime testing, blast radius diff, code review, auto-smoke generation)
**Confidence:** HIGH

## Summary

Phase 5 implements a two-agent verification pipeline that runs after execution agents complete. A **static verify agent** handles convention compliance (ast-grep), blast radius diff (plan vs git diff), scope drift detection, and LLM-based code review. A **runtime verify agent** handles build, unit/integration tests, E2E verification with auto-detected tools, and auto-smoke test generation for new endpoints. Results are written to a unified verify report at `.claude/codescope/reports/[task-slug]-[ISO-date].md`.

The codebase already has significant infrastructure to build on: the Phase 3 `verify.ts` MCP tool handles convention compliance scanning, `analytics.ts` provides blast radius BFS with hop-distance classification, the execution engine provides the agent module pattern (Options + Result + async function), and the config schema already has all verify fields defined. The primary new work is: (1) building the static verify and runtime verify agent modules, (2) blast radius diff logic, (3) server lifecycle management for E2E, (4) auto-smoke generation, (5) report writing, (6) upgrading the MCP tool, and (7) integrating verify into the orient pipeline.

**Primary recommendation:** Build the verify phase as a new `src/verify/` module directory following the established agent module pattern, reusing existing ast-grep scanning from `verify.ts`, blast radius BFS from `analytics.ts`, and graph cache from `cache.ts`. Use process group killing (`detached: true` + `process.kill(-pid)`) for server lifecycle management rather than adding the `tree-kill` dependency.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Unified single report at `reports/[task-slug]-[ISO-date].md`. One file with sections: Static Checks (conventions, blast radius diff, code review), Runtime Checks (build, unit tests, integration tests, E2E), Auto-Smoke Results, Summary.
- **D-02:** Three severity levels: ERROR, WARN, INFO. Maps to eval triage: ERROR = must fix, WARN = eval judges, INFO = skip.
- **D-03:** Per-section timing data in the report.
- **D-04:** Convention violations include golden file references with file:line, convention name, adoption %, path to golden file.
- **D-05:** Unconfigured checks are skipped with explicit notes.
- **D-06:** Report naming: `[task-slug]-[ISO-date].md`. No sequence number, retained indefinitely.
- **D-07:** Predicted blast radius from execution plan's per-agent file assignments (plans/[task-slug].md).
- **D-08:** Surprise files classified by graph distance: hop 1-2 = WARN, hop 3+ or unconnected = ERROR.
- **D-09:** Skip files (predicted but not changed) are INFO severity.
- **D-10:** Scope drift detection: files modified outside scope contract flagged as WARN.
- **D-11:** E2E tool detection respects config; if `e2e.tool` is 'none', skip E2E.
- **D-12:** Auto-smoke generates minimal reachability checks for new endpoints only. Temp file, cleaned up after.
- **D-13:** Smoke test generation by LLM sub-agent. Reads new route/endpoint code, generates minimal smoke test.
- **D-14:** New endpoint detection via git diff + AST analysis using web-tree-sitter.
- **D-15:** Server lifecycle: start, readiness check (health_check polling or ready_signal stdout scan or 5s fixed delay), run E2E/smoke, kill process tree, verify port free.
- **D-16:** Server cleanup: kill process tree, verify port free. Force kill by PID from lsof after 3s.
- **D-17:** Two agents, sequential: static verify first, then runtime verify. Build failure short-circuits tests.
- **D-18:** Build failure short-circuits: skip unit tests, integration tests, E2E, auto-smoke. No cascading failures.
- **D-19:** Pipeline orchestrated by orient skill body -- verify step after execute step.
- **D-20:** Both agents follow agent module pattern (Options + Result + async function).
- **D-21:** Verification always proceeds to eval. No gate on ERROR severity. Data-gathering, not a gate.
- **D-22:** Test output captured as summary + failures only. Passing tests = count only.
- **D-23:** LLM code review sub-agent reads git diff + scope contract + conventions + golden files.
- **D-24:** Code review soft cap of 10 findings.
- **D-25:** Code review uses agents.eval_judge.model from config.yml.
- **D-26:** LLM extraction from raw test output. No per-framework parsers.
- **D-27:** Tail-biased truncation: keep last 500 lines of test output.
- **D-28:** codescope_verify upgraded to accept all check types. Capabilities array updated, upcoming emptied.
- **D-29:** Checks requiring orient artifacts gracefully degrade when called standalone.
- **D-30:** No schema changes needed. Existing verify section covers all Phase 5 behavior.

### Claude's Discretion
- No areas deferred to Claude's discretion -- all gray areas received explicit user decisions.

### Deferred Ideas (OUT OF SCOPE)
- Per-framework JSON parsers for test output -- LLM extraction is sufficient for v1
- Permanent smoke test file generation -- temp-only in v1
- Convention enforcement blocking mode -- stays suggestion-only
- Coverage-aware smoke generation (testing modified endpoints without coverage, not just new ones) -- v2
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| VRFY-01 | Static verify agent checks convention compliance by scanning new/modified files against conventions-enforced.md using ast-grep | Existing `verify.ts` has convention compliance logic. Reuse `parseEnforcedConventions` and `scanFilesAgainstRule`. Add golden file reference per D-04 by reading golden-files.md. |
| VRFY-02 | Static verify agent compares predicted blast radius against actual files changed and reports surprises/skips | Existing `analytics.ts` `blastRadius()` BFS provides hop-distance. Read plan from `readPlanFromDisk()`. Git diff via `execSync('git diff --name-only')`. Graph cache via `getGraph()`. |
| VRFY-03 | Static verify agent performs semantic code review of changes | LLM sub-agent pattern: build prompt with git diff + scope contract + conventions + golden files. Dispatch via callbacks pattern (same as execution). Use `agents.eval_judge.model` from config. Soft cap 10 findings. |
| VRFY-04 | Runtime verify agent runs project build command and reports clean build or errors with file/line | `execSync` or `spawn` with `config.verify.build_command`. Capture stdout/stderr, tail-biased truncation (last 500 lines per D-27). Build failure short-circuits all subsequent runtime checks per D-18. |
| VRFY-05 | Runtime verify agent runs unit/integration test commands and reports pass/fail with output | Run `config.verify.tests.unit` and `config.verify.tests.integration` commands. LLM extraction from raw output per D-26. |
| VRFY-06 | Runtime verify agent runs E2E verification using auto-detected tool | Auto-detect from project files (playwright.config.ts, Podfile, build.gradle, conftest.py) per D-11. Server lifecycle management per D-15/D-16. |
| VRFY-07 | Auto-smoke test generation for new routes/views/endpoints lacking E2E tests | Git diff + web-tree-sitter AST to detect new endpoint declarations per D-14. LLM sub-agent generates temp smoke test per D-13. Clean up after. |
| VRFY-08 | Verify report written to .claude/codescope/reports/[task]-[date].md with all check results | Report writer assembles sections per UI-SPEC format. Timing data per D-03. Summary table at end. |
</phase_requirements>

## Standard Stack

### Core (Already Installed)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| @ast-grep/cli (sg) | 0.42.0 (installed) | Convention compliance scanning | Already used in Phase 2/3 convention detection. Verified available at `/opt/homebrew/bin/sg`. |
| web-tree-sitter | 0.25.10 (pinned) | AST parsing for endpoint detection | Already used for Phase 1-2 parsing. Required for D-14 new endpoint detection in auto-smoke. |
| graphology + traversal | 0.26.0 / 0.3.1 | BFS blast radius for surprise file classification | Already used in analytics.ts. `blastRadius()` provides hop-distance classification per D-08. |
| better-sqlite3 | ^12.8.0 | Knowledge graph access | Already used. Graph loaded via `getGraph()` cache for blast radius diff calculations. |
| vitest | ^4.1.0 | Test framework | 53 test files, 556 tests all passing. Established test infrastructure. |

### No New Dependencies Required

This phase requires zero new npm dependencies. All functionality is built on top of existing infrastructure:

- Convention compliance: existing `verify.ts` + `runner.ts` ast-grep infrastructure
- Blast radius: existing `analytics.ts` BFS + `cache.ts` graph cache
- Git operations: `child_process.execSync` (already used throughout codebase)
- Server lifecycle: `child_process.spawn` with `detached: true` + `process.kill(-pid)` for process tree cleanup
- Port checking: `lsof` via `execSync` (verified available at `/usr/sbin/lsof`)
- File operations: `node:fs` (already used everywhere)
- Report writing: string template assembly (same as `writeExecutionSummary` pattern)

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Native process group kill (`process.kill(-pid)`) | `tree-kill` npm package (v1.2.2) | tree-kill adds a dependency for cross-platform support. Since CodeScope runs on macOS/Linux (Claude Code environments), native detached + negative PID is sufficient. No Windows support needed. |
| LLM test output parsing (D-26) | Per-framework JSON parsers (jest --json, vitest --reporter=json) | Locked decision: LLM extraction is universal across all test frameworks. Per-framework parsers deferred to v2. |
| Manual endpoint detection heuristics | Existing parser pool web-tree-sitter | Locked decision D-14: use web-tree-sitter AST analysis on git diff new files. Reuse existing parser infrastructure. |

## Architecture Patterns

### Recommended Project Structure

```
src/
├── verify/
│   ├── types.ts               # VerifyOptions, VerifyResult, SurpriseFile, SkipFile, etc.
│   ├── static-verify.ts       # Static verify agent: conventions, blast radius diff, code review
│   ├── runtime-verify.ts      # Runtime verify agent: build, tests, E2E, auto-smoke
│   ├── blast-radius-diff.ts   # Plan-vs-actual file comparison with graph distance
│   ├── report-writer.ts       # Assemble unified verify report markdown
│   ├── smoke-generator.ts     # New endpoint detection + smoke test generation
│   ├── server-lifecycle.ts    # Start server, readiness check, kill process tree
│   └── run-verify.ts          # CLI entry point (matches run-orient.ts pattern)
├── tools/
│   └── verify.ts              # MODIFIED: upgrade MCP tool with new check types
├── orient/
│   ├── pipeline.ts            # MODIFIED: add verify step after execution
│   └── run-orient.ts          # MODIFIED: add --phase verify support
└── skills/
    └── orient/SKILL.md        # MODIFIED: add Step 5: Verification
```

### Pattern 1: Agent Module Pattern (from Phase 2)

**What:** Each verify agent follows Options + Result + async function + artifact output.
**When to use:** Both static-verify and runtime-verify modules.

```typescript
// Source: Established Phase 2 pattern (D-05)
interface StaticVerifyOptions {
  projectRoot: string;
  taskSlug: string;
  changedFiles: string[];
  planPath: string;
  scopeContractPath: string;
}

interface StaticVerifyResult {
  conventionViolations: ConventionViolation[];
  blastRadiusDiff: BlastRadiusDiffResult;
  codeReview: ReviewFinding[];
  timing: Record<string, number>;
}

export async function runStaticVerify(
  options: StaticVerifyOptions,
): Promise<StaticVerifyResult> {
  // ...implementation
}
```

### Pattern 2: CLI Entry Point Pattern (from run-orient.ts)

**What:** CLI entry point with `--phase` flag for phased execution by skill body.
**When to use:** `run-verify.ts` for skill body dispatch.

```typescript
// Source: src/orient/run-orient.ts pattern
// Phases: static, runtime, full
// Outputs JSON to stdout for skill body to parse

switch (phase) {
  case "static": {
    const result = await runStaticVerify(options);
    console.log(JSON.stringify(result));
    break;
  }
  case "runtime": {
    const result = await runRuntimeVerify(options);
    console.log(JSON.stringify(result));
    break;
  }
  // no --phase: run both sequentially
}
```

### Pattern 3: Callbacks for Sub-Agent Dispatch (from execution)

**What:** Code review and smoke test generation require LLM sub-agent dispatch. Use the same callback pattern as execution.
**When to use:** When the verify module needs to spawn LLM sub-agents (code review D-23, smoke generation D-13).

```typescript
// Source: src/execution/orchestrator.ts ExecutionCallbacks pattern
export interface VerifyCallbacks {
  dispatchReviewAgent: (prompt: string) => Promise<{ findings: string }>;
  dispatchSmokeAgent: (prompt: string) => Promise<{ testCode: string }>;
  onProgress: (message: string) => void;
}
```

### Pattern 4: MCP Handler Extraction (from Phase 3)

**What:** Extract core logic into `handleVerify()` for testability, register on MCP server separately.
**When to use:** Upgrading the `codescope_verify` tool.

```typescript
// Source: src/tools/verify.ts existing pattern
export async function handleVerify(
  projectRoot: string,
  input: VerifyInput,  // upgraded input type with new check types
): Promise<McpResponse> { /* ... */ }

export function registerVerifyTool(server: McpServer, projectRoot: string): void {
  server.tool("codescope_verify", description, schema, handler);
}
```

### Anti-Patterns to Avoid

- **Anti-pattern: Fat orchestrator.** Do NOT embed verification logic in the skill body or pipeline.ts. Keep the verify modules self-contained with CLI entry point. Skill body only dispatches and reads results. Maintains <15K token orchestrator per EXEC-06.
- **Anti-pattern: Hardcoded test framework parsing.** Do NOT write vitest/jest/pytest JSON parsers. D-26 mandates LLM extraction. The test command is run, raw output captured, LLM extracts pass/fail/error info.
- **Anti-pattern: Blocking verification.** D-21 explicitly states verification is data-gathering, not a gate. Do NOT stop the pipeline on ERROR findings. Always proceed to eval.
- **Anti-pattern: Importing MCP tool handlers in verify modules.** Verify modules are standalone. The MCP tool handler calls verify modules, not vice versa. Avoid circular dependencies.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Convention compliance scanning | Custom AST walkers | Existing `parseEnforcedConventions` + `scanFilesAgainstRule` from `verify.ts` | Already tested, handles ast-grep edge cases (non-zero exit on no matches). |
| Blast radius BFS with hop distance | Custom graph traversal | `blastRadius()` from `analytics.ts` + `getGraph()` from `cache.ts` | Proven BFS with Red/Orange/Yellow/Green classification. Cached graph with 5-min TTL. |
| Git diff file list | Manual file tracking | `execSync('git diff --name-only HEAD~1', ...)` | Standard git operation, already used in codebase. |
| Golden file references | Hardcoded paths | Read `golden-files.md` from bootstrap output | Golden files already ranked by modern pattern density (Phase 2). |
| Config loading | Manual YAML parsing | `loadConfig()` from `config/loader.ts` | Validates against ConfigSchema including verify section. |
| Execution plan reading | Manual file parsing | `readPlanFromDisk()` from `execution/orchestrator.ts` | Already parses JSON plan format with agents, waves, file assignments. |
| Process tree killing (macOS/Linux) | `tree-kill` npm package | `spawn({detached: true})` + `process.kill(-child.pid)` | Native Node.js, no new dependency. Works on macOS and Linux. |
| Port availability check | Custom socket probe | `lsof -ti :{port}` via `execSync` | Standard Unix utility, verified available on macOS. |

## Common Pitfalls

### Pitfall 1: Process Tree Not Killed After E2E Tests
**What goes wrong:** `npm start` spawns a shell which spawns the actual server process. `child.kill()` only kills the shell, leaving the server running and the port occupied.
**Why it happens:** Node.js `child_process.kill()` sends signal to the direct child only, not descendants.
**How to avoid:** Spawn with `{ detached: true, stdio: 'pipe' }` to create a new process group. Kill with `process.kill(-child.pid, 'SIGTERM')` to kill the entire process group. Then verify port is free with `lsof -ti :{port}`.
**Warning signs:** E2E tests hang on second run, "port already in use" errors, zombie processes.

### Pitfall 2: Build Short-Circuit Not Propagated
**What goes wrong:** Build fails but runtime verify agent still tries to run tests, causing cascading "command not found" or "module not found" errors that confuse the eval agent.
**Why it happens:** Sequential flow not properly checking previous step results.
**How to avoid:** `run-verify.ts` runs static first, then checks build result before running test/E2E/smoke. If build failed, mark all subsequent checks as SKIPPED per D-18 and include reason in report.
**Warning signs:** Multiple ERROR findings all traceable to build failure.

### Pitfall 3: Git Diff Against Wrong Base
**What goes wrong:** `git diff --name-only` shows no files (comparing working tree to itself) or shows too many files (comparing against wrong commit).
**Why it happens:** The correct base depends on whether execution agents committed their changes or left them as uncommitted modifications.
**How to avoid:** Use `git diff --name-only HEAD` for uncommitted changes, or compare against the commit before orient started. The execution engine creates coordination entries with timestamps -- use the pre-execution git state as baseline. Also handle both staged and unstaged: `git diff --name-only HEAD` captures both.
**Warning signs:** Blast radius diff shows 0 surprises and 0 skips (means git diff returned empty).

### Pitfall 4: Server Readiness Race Condition
**What goes wrong:** E2E tests start before the server is actually ready to accept connections, causing false test failures.
**Why it happens:** Server startup is async; spawning the process returns immediately.
**How to avoid:** Three readiness strategies per D-15: (1) health_check URL polling every 1s, (2) ready_signal stdout scanning, (3) 5s fixed delay fallback. All capped by verify.timeout_seconds. Poll health check with `fetch()` in a loop with 1s intervals.
**Warning signs:** Intermittent E2E failures, "ECONNREFUSED" in test output.

### Pitfall 5: ast-grep Non-Zero Exit on No Matches
**What goes wrong:** ast-grep returns exit code 1 when no matches are found, causing `execSync` to throw.
**Why it happens:** Standard behavior for grep-like tools.
**How to avoid:** Already handled in existing `verify.ts` -- catch the error and parse stdout from the error object. Reuse this same pattern. The code at `scanFilesAgainstRule` lines 128-143 shows the correct pattern.
**Warning signs:** Convention compliance always reports errors instead of clean results.

### Pitfall 6: Temp Smoke Test File Cleanup Failure
**What goes wrong:** Auto-generated smoke test files left in the project if the process crashes mid-verification.
**Why it happens:** Cleanup code doesn't run on unhandled exceptions.
**How to avoid:** Use try/finally for temp file cleanup. Write smoke test files to a temp directory (OS temp dir, not project root) when possible. Register cleanup in a finally block that runs regardless of test outcome.
**Warning signs:** Orphaned test files appearing in git status.

### Pitfall 7: Graph Distance Calculation for Unconnected Files
**What goes wrong:** Surprise files that have no path to any predicted file in the graph get classified as hop 0 or cause exceptions.
**Why it happens:** BFS from predicted files never reaches unconnected nodes.
**How to avoid:** For each surprise file, run BFS from all predicted files and take the minimum hop count. If no path exists (file not in graph or unreachable), classify as unconnected = ERROR per D-08. Use `graph.hasNode()` check before BFS.
**Warning signs:** Unconnected files classified as WARN instead of ERROR.

### Pitfall 8: Large Test Output Overwhelming LLM Context
**What goes wrong:** Test suite with hundreds of passing tests produces massive stdout that exceeds LLM context when passed for extraction.
**Why it happens:** Test frameworks print all test names, not just failures.
**How to avoid:** Tail-biased truncation per D-27: keep last 500 lines. Failures and summary are at the end of test output for virtually all test frameworks (vitest, jest, pytest, mocha, Go test).
**Warning signs:** LLM extraction timing out or returning garbled results.

## Code Examples

### Blast Radius Diff Implementation

```typescript
// Source: Pattern derived from analytics.ts blastRadius() + orchestrator.ts readPlanFromDisk()

import { getGraph } from "../graph/cache.js";
import { blastRadius } from "../graph/analytics.js";
import { readPlanFromDisk } from "../execution/orchestrator.js";
import { execSync } from "node:child_process";

interface SurpriseFile {
  filePath: string;
  minHopDistance: number;  // from nearest predicted file
  severity: "WARN" | "ERROR";
}

interface SkipFile {
  filePath: string;
  severity: "INFO";
  reason: string;
}

interface BlastRadiusDiffResult {
  surprises: SurpriseFile[];
  skips: SkipFile[];
  scopeDrift: string[];
}

function computeBlastRadiusDiff(
  projectRoot: string,
  planPath: string,
  scopeContractPath: string,
): BlastRadiusDiffResult {
  // 1. Get predicted files from execution plan
  const plan = readPlanFromDisk(planPath);
  const predictedFiles = new Set<string>();
  for (const agent of plan.agents) {
    for (const file of agent.exclusiveWriteFiles) {
      predictedFiles.add(file);
    }
  }

  // 2. Get actual changed files from git diff
  const diffOutput = execSync("git diff --name-only HEAD", {
    encoding: "utf-8",
    cwd: projectRoot,
  }).trim();
  const actualFiles = new Set(diffOutput.split("\n").filter(Boolean));

  // 3. Classify surprises (changed but not predicted)
  const { graph } = getGraph(projectRoot);
  const surprises: SurpriseFile[] = [];

  for (const file of actualFiles) {
    if (predictedFiles.has(file)) continue;

    // Find minimum graph distance from any predicted file
    let minHop = Infinity;
    for (const predicted of predictedFiles) {
      // Find graph node for this file path
      graph.forEachNode((nodeId, attrs) => {
        if (attrs.filePath === predicted) {
          const radius = blastRadius(graph, nodeId, 4);
          for (const node of radius) {
            if (node.filePath === file && node.hop < minHop) {
              minHop = node.hop;
            }
          }
        }
      });
    }

    surprises.push({
      filePath: file,
      minHopDistance: minHop === Infinity ? -1 : minHop,
      severity: minHop <= 2 ? "WARN" : "ERROR",  // D-08
    });
  }

  // 4. Classify skips (predicted but not changed)
  const skips: SkipFile[] = [];
  for (const file of predictedFiles) {
    if (!actualFiles.has(file)) {
      skips.push({
        filePath: file,
        severity: "INFO",
        reason: "Predicted but not modified -- may have been handled differently",
      });
    }
  }

  // 5. Scope drift detection (D-10)
  // ... read scope contract, check if actual files are covered

  return { surprises, skips, scopeDrift: [] };
}
```

### Server Lifecycle Management

```typescript
// Source: Pattern from D-15, D-16, Node.js child_process docs

import { spawn, execSync, type ChildProcess } from "node:child_process";

interface ServerHandle {
  process: ChildProcess;
  port: number;
}

async function startServer(
  command: string,
  healthCheck: string | undefined,
  readySignal: string | undefined,
  timeoutSeconds: number,
): Promise<ServerHandle> {
  // Spawn with detached: true for process group killing
  const child = spawn("sh", ["-c", command], {
    detached: true,
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env },
  });

  // Extract port from command or health check URL
  const port = extractPort(healthCheck ?? command);

  // Wait for readiness
  const deadline = Date.now() + timeoutSeconds * 1000;

  if (healthCheck) {
    // Strategy 1: Health check polling every 1s
    while (Date.now() < deadline) {
      try {
        const res = await fetch(healthCheck);
        if (res.ok) break;
      } catch {
        // Not ready yet
      }
      await sleep(1000);
    }
  } else if (readySignal) {
    // Strategy 2: Watch stdout for ready signal
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("Server timeout")), timeoutSeconds * 1000);
      child.stdout?.on("data", (data: Buffer) => {
        if (data.toString().includes(readySignal)) {
          clearTimeout(timeout);
          resolve();
        }
      });
    });
  } else {
    // Strategy 3: Fixed 5s delay
    await sleep(5000);
  }

  return { process: child, port };
}

async function stopServer(handle: ServerHandle): Promise<void> {
  // Kill process tree via process group
  try {
    process.kill(-handle.process.pid!, "SIGTERM");
  } catch {
    // Process may already be dead
  }

  // Wait up to 3s for port to free
  const deadline = Date.now() + 3000;
  while (Date.now() < deadline) {
    if (!isPortInUse(handle.port)) return;
    await sleep(500);
  }

  // Force kill by PID from lsof (D-16)
  try {
    const pid = execSync(`lsof -ti :${handle.port}`, { encoding: "utf-8" }).trim();
    if (pid) {
      process.kill(parseInt(pid, 10), "SIGKILL");
    }
  } catch {
    // No process on port -- success
  }
}

function isPortInUse(port: number): boolean {
  try {
    execSync(`lsof -ti :${port}`, { encoding: "utf-8" });
    return true;
  } catch {
    return false;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
```

### Report Writer Pattern

```typescript
// Source: Pattern from src/execution/orchestrator.ts writeExecutionSummary()

import * as fs from "node:fs";
import * as path from "node:path";
import { getCodescopePath } from "../utils/paths.js";

interface VerifyReport {
  taskSlug: string;
  taskDescription: string;
  static: StaticVerifyResult;
  runtime: RuntimeVerifyResult;
  totalDurationMs: number;
}

function writeVerifyReport(
  projectRoot: string,
  report: VerifyReport,
): string {
  const reportsDir = path.join(getCodescopePath(projectRoot), "reports");
  fs.mkdirSync(reportsDir, { recursive: true });

  const isoDate = new Date().toISOString().split("T")[0];  // YYYY-MM-DD
  const filename = `${report.taskSlug}-${isoDate}.md`;
  const reportPath = path.join(reportsDir, filename);

  const sections: string[] = [];

  // Header per UI-SPEC
  sections.push(`# Verify Report: ${report.taskSlug}`);
  sections.push(`\n**Date:** ${new Date().toISOString()}`);
  sections.push(`**Task:** ${report.taskDescription}`);
  sections.push(`**Duration:** ${(report.totalDurationMs / 1000).toFixed(1)}s`);

  // Static Checks section
  sections.push("\n\n## Static Checks");
  // ... convention compliance, blast radius diff, code review subsections

  // Runtime Checks section
  sections.push("\n\n## Runtime Checks");
  // ... build, unit tests, integration tests, E2E subsections

  // Auto-Smoke Results section
  sections.push("\n\n## Auto-Smoke Results");

  // Summary table per UI-SPEC
  sections.push("\n\n## Summary");
  // ... summary table with all check results

  const content = sections.join("\n");
  fs.writeFileSync(reportPath, content, "utf-8");
  return reportPath;
}
```

### MCP Tool Upgrade Pattern

```typescript
// Source: Existing verify.ts + helpers.ts pattern

// Upgraded input schema per D-28
const CheckType = z.enum([
  "convention_compliance",
  "blast_radius_diff",
  "build",
  "unit_tests",
  "integration_tests",
  "e2e",
  "auto_smoke",
  "code_review",
]);

interface VerifyInput {
  files: string[];
  checks?: string[];
  task_slug?: string;  // Required for blast_radius_diff and code_review (D-29)
}

// Graceful degradation per D-29
function checkRequiresOrientArtifacts(check: string): boolean {
  return check === "blast_radius_diff" || check === "code_review";
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Phase 3 convention compliance only | Full 8-check verification pipeline | Phase 5 | Verify tool gains blast radius diff, build, tests, E2E, smoke, code review |
| `upcoming` array in verify metadata | `capabilities` array with all checks | Phase 5 | `upcoming` becomes empty array |
| Pipeline: clarify -> research -> plan -> execute | Pipeline: clarify -> research -> plan -> execute -> **verify** -> eval | Phase 5 | Verify step added to orient pipeline |
| Manual code review | LLM-powered semantic code review | Phase 5 | Automated quality check against scope + conventions |

**Not changing:**
- ConfigSchema.verify section -- D-30 confirms no schema changes needed
- Convention compliance core logic in verify.ts -- upgraded but not rewritten
- Agent module pattern -- same Options + Result + async function
- Filesystem coordination pattern -- same approach

## Open Questions

1. **Git diff base commit**
   - What we know: Execution agents make changes that may or may not be committed. The verify step needs to compare predicted vs actual files changed.
   - What's unclear: Whether execution agents commit their changes (creating new commits) or leave them as uncommitted modifications in the working tree.
   - Recommendation: Use `git diff --name-only HEAD` which captures both staged and unstaged modifications. If execution creates commits, use `git diff --name-only {pre-execution-commit}..HEAD`. Store the pre-execution HEAD SHA in the execution summary or coordination file for reliable diff base.

2. **Code review sub-agent dispatch mechanism**
   - What we know: D-23 specifies LLM sub-agent for code review. D-25 says use eval_judge model.
   - What's unclear: Whether the verify CLI (`run-verify.ts`) should dispatch the sub-agent directly, or return a prompt for the skill body to dispatch (like research/planner modules).
   - Recommendation: Follow the research/planner pattern -- `run-verify.ts` returns a review prompt, skill body dispatches the Agent tool, passes results back. This keeps the CLI thin and model-agnostic. Same for smoke test generation (D-13).

3. **Scope contract file format for drift detection**
   - What we know: D-10 requires checking if modified files are covered by "In Scope" items from the scope contract.
   - What's unclear: Whether scope contract items are file paths or descriptive text (e.g., "Code related to authentication").
   - Recommendation: Read the actual scope contract from `ScopeContract.affectedFiles` array (which has explicit `filePath` fields per `orient/types.ts`). Compare modified files against these paths. Files modified but not in `affectedFiles` are potential scope drift.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|-------------|-----------|---------|----------|
| ast-grep CLI (sg) | Convention compliance (VRFY-01) | Yes | 0.42.0 | -- |
| git | Blast radius diff, change detection | Yes | 2.50.1 | -- |
| Node.js | Runtime, spawning | Yes | 25.6.1 | -- |
| lsof | Server port cleanup (D-16) | Yes | available | -- |
| vitest | Project test framework | Yes | ^4.1.0 (in package.json) | -- |
| web-tree-sitter WASM grammars | Endpoint detection (D-14) | Yes | 0.25.10 | -- |

**Missing dependencies with no fallback:** None.

**Missing dependencies with fallback:** None.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | vitest ^4.1.0 |
| Config file | vitest.config.ts |
| Quick run command | `npx vitest run tests/verify/` |
| Full suite command | `npx vitest run` |

### Phase Requirements -> Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| VRFY-01 | Convention compliance scans modified files against enforced conventions | unit | `npx vitest run tests/verify/static-verify.test.ts -t "convention compliance" -x` | Wave 0 |
| VRFY-02 | Blast radius diff compares plan vs git diff with hop classification | unit | `npx vitest run tests/verify/blast-radius-diff.test.ts -x` | Wave 0 |
| VRFY-03 | Code review sub-agent produces findings | unit | `npx vitest run tests/verify/static-verify.test.ts -t "code review" -x` | Wave 0 |
| VRFY-04 | Build command execution with failure detection | unit | `npx vitest run tests/verify/runtime-verify.test.ts -t "build" -x` | Wave 0 |
| VRFY-05 | Test command execution with LLM-style output parsing | unit | `npx vitest run tests/verify/runtime-verify.test.ts -t "tests" -x` | Wave 0 |
| VRFY-06 | E2E tool auto-detection and execution | unit | `npx vitest run tests/verify/runtime-verify.test.ts -t "e2e" -x` | Wave 0 |
| VRFY-07 | Auto-smoke endpoint detection and temp test generation | unit | `npx vitest run tests/verify/smoke-generator.test.ts -x` | Wave 0 |
| VRFY-08 | Verify report assembly with all sections and timing | unit | `npx vitest run tests/verify/report-writer.test.ts -x` | Wave 0 |

### Sampling Rate

- **Per task commit:** `npx vitest run tests/verify/`
- **Per wave merge:** `npx vitest run`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] `tests/verify/static-verify.test.ts` -- covers VRFY-01, VRFY-02, VRFY-03
- [ ] `tests/verify/runtime-verify.test.ts` -- covers VRFY-04, VRFY-05, VRFY-06
- [ ] `tests/verify/blast-radius-diff.test.ts` -- covers VRFY-02 detailed scenarios
- [ ] `tests/verify/smoke-generator.test.ts` -- covers VRFY-07
- [ ] `tests/verify/report-writer.test.ts` -- covers VRFY-08
- [ ] `tests/verify/server-lifecycle.test.ts` -- covers D-15/D-16 server management
- [ ] `tests/tools/verify.test.ts` -- existing file, needs new tests for upgraded MCP tool (D-28)

## Project Constraints (from CLAUDE.md)

- **Tech stack:** TypeScript, web-tree-sitter WASM (not node-tree-sitter), ast-grep CLI, better-sqlite3, graphology, enhanced-resolve, @modelcontextprotocol/sdk, vitest
- **Performance:** Graph queries <100ms, plugin startup <5K tokens, orchestrator <15K tokens
- **Quality:** Convention false positive rate <5%, eval finding accuracy >70%, debug resolution >80% within 3 cycles
- **ESM-first:** `type: module`, NodeNext module resolution
- **web-tree-sitter memory management:** Call `tree.delete()` after every parse, periodic `parser.delete()` and recreate
- **MCP handler extraction pattern:** `handleXxx` for tests, `registerXxxTool` for MCP registration
- **Agent module pattern:** Options + Result + async function + markdown artifact
- **Thin orchestrator:** <15K tokens, filesystem-first coordination
- **GSD workflow:** Use GSD commands for planned work

## Sources

### Primary (HIGH confidence)
- `src/tools/verify.ts` -- existing Phase 3 convention compliance implementation
- `src/graph/analytics.ts` -- blast radius BFS implementation
- `src/graph/cache.ts` -- graph cache with 5-min TTL
- `src/execution/orchestrator.ts` -- execution result types, plan reading, summary writing
- `src/execution/agent-spawner.ts` -- agent prompt construction, invocation building
- `src/config/schema.ts` -- ConfigSchema.verify section with all fields
- `src/orient/pipeline.ts` -- pipeline orchestration pattern
- `src/orient/run-orient.ts` -- CLI entry point pattern with --phase flag
- `src/orient/types.ts` -- ExecutionPlan, AgentAssignment, ScopeContract types
- `src/execution/types.ts` -- AgentResult, ExecutionResult, ExecutionOptions
- `05-CONTEXT.md` -- all 30 user decisions (D-01 through D-30)
- `05-UI-SPEC.md` -- report format, MCP response schema, copywriting contract
- `vitest.config.ts` -- test framework configuration
- `package.json` -- dependency versions, scripts

### Secondary (MEDIUM confidence)
- [Node.js child_process documentation](https://nodejs.org/api/child_process.html) -- spawn, detached, process group killing
- [tree-kill npm](https://www.npmjs.com/package/tree-kill) -- process tree killing reference (decided against, using native)
- [nodejs/node#40438](https://github.com/nodejs/node/issues/40438) -- process tree killing discussion

### Tertiary (LOW confidence)
- None. All findings verified against primary sources.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- no new dependencies, all verified installed and working (556 tests pass)
- Architecture: HIGH -- follows established patterns from Phase 2/3/4, all code reviewed
- Pitfalls: HIGH -- based on direct code review of existing implementations and known Node.js process management behavior
- Blast radius diff: HIGH -- `blastRadius()` and `readPlanFromDisk()` both exist and are tested
- Server lifecycle: MEDIUM -- process group killing is well-documented but untested in this specific context
- Auto-smoke generation: MEDIUM -- endpoint detection patterns are domain-specific, quality depends on LLM sub-agent

**Research date:** 2026-03-24
**Valid until:** 2026-04-23 (30 days -- stable domain, no rapidly changing dependencies)
