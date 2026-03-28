# Phase 12: Convention Enforcement + Session Continuity - Research

**Researched:** 2026-03-28
**Domain:** Git pre-commit hooks with ast-grep structural linting + Claude Code lifecycle hooks for session state preservation
**Confidence:** HIGH

## Summary

Phase 12 delivers two independent capabilities that share no runtime code paths: (1) convention enforcement via a pre-commit hook that runs `sg scan` against VERIFIED conventions on staged files, and (2) session continuity via structured handoff documents generated automatically on PreCompact and manually via `/codescope:pause`, with resume via `/codescope:resume` and a SessionStart hook.

The convention enforcement side is well-supported by existing infrastructure. The project already has: 18 ast-grep YAML rule files (`src/conventions/rules/{typescript,python}/`), a convention runner (`src/conventions/runner.ts`) that invokes `sg scan --rule --json`, a learning system with VERIFIED/UNVERIFIED status tracking (`src/learning/types.ts`), and a config schema with a `conventions.strictness` field that already accepts `"suggest-only" | "warn" | "block"` values. The pre-commit hook is a thin shell/Node script that chains with existing hooks, filters staged files, and maps the strictness config to exit codes.

The session continuity side builds on Claude Code's hook system, which provides `PreCompact` (matcher: `"manual" | "auto"`) and `SessionStart` (matcher: `"startup" | "resume" | "clear" | "compact"`) events. Both support `additionalContext` injection. The handoff document is a structured markdown file pointing into existing filesystem state -- the orient pipeline already persists all critical artifacts to disk (scope contracts, plans, coordination logs, execution summaries). The handoff is a pointer + summary, not a duplication.

**Primary recommendation:** Implement enforcement and session continuity as two independent work streams sharing only the config schema extension and plugin manifest update. Convention enforcement is a shell-level concern (pre-commit hook + `sg scan`). Session continuity is a TypeScript-level concern (handoff generation + Claude Code hook scripts).

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** `npx codescope install-hooks` creates a wrapper pre-commit script that chains with any existing hook. If an existing hook exists, it runs first -- if it fails, CodeScope's check is skipped. Follows the boidolr/ast-grep-pre-commit pattern.
- **D-02:** If husky detected (`.husky/` dir exists), integrate into husky's hook chain rather than writing to raw `.git/hooks/`. If no hook framework, install directly to `.git/hooks/pre-commit`.
- **D-03:** `npx codescope uninstall-hooks` cleanly removes CodeScope's additions without affecting other hooks.
- **D-04:** Hook script runs `sg scan` (ast-grep CLI) with CodeScope's detected convention rules on staged files only. Uses `git diff --cached --name-only` for file list.
- **D-05:** Only conventions with status VERIFIED in `learnings.md` are enforced -- auto-detected patterns (UNVERIFIED) never block or warn.
- **D-06:** Convention rules are auto-generated from detected patterns using ast-grep YAML rule format. The convention-detector already produces these patterns; enforcement consumes them filtered by VERIFIED status.
- **D-07:** Three severity levels configurable in `config.yml`: suggest-only (default, exit 0), warn (yellow banner, exit 0), block (red banner, exit 2).
- **D-08:** All modes show compact terminal output: file path, convention name, one-line evidence. `--verbose` flag for full detail.
- **D-09:** Output includes count summary: "Checked N conventions against M staged files" with pass/fail totals.
- **D-10:** Handoff is structured markdown with YAML frontmatter containing: task slug, current pipeline phase, wave position, timestamp, orient output directory path.
- **D-11:** Body sections: Completed Work, Remaining Tasks, Key Decisions, Active Findings, Resume Command.
- **D-12:** Stored in `.claude/codescope/sessions/{taskSlug}-handoff.md`. One handoff per task slug.
- **D-13:** PreCompact hook auto-generates handoff before context compaction -- same format as manual `/codescope:pause`.
- **D-14:** 7-day auto-cleanup of old session files on pause/resume invocations.
- **D-15:** `/codescope:resume` reads latest handoff, displays summary, offers "Continue" or "Start fresh".
- **D-16:** `--resume {taskSlug}` flag on orient scans for completed artifacts, skips phases with completed artifacts, resumes at first incomplete phase/wave.
- **D-17:** Artifact validation on resume: compare handoff against actual disk artifacts, warn on missing artifacts.
- **D-18:** SessionStart hook (source: "resume") injects handoff summary as `additionalContext`.
- **D-19:** `/codescope:pause` skill generates handoff document and confirms with summary.
- **D-20:** `/codescope:resume` skill reads handoff, displays interactive summary, resumes at correct position.

### Claude's Discretion
- Exact ast-grep YAML rule generation from detected conventions (rule structure, severity mapping)
- Hook script internal implementation (shell script vs Node.js script matching Phase 10 hook pattern)
- Handoff document markdown formatting and section ordering
- Session cleanup implementation (inline check vs separate utility)
- Whether to use lint-staged for staged file filtering or raw `git diff --cached`

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| ENFORCE-01 | Opt-in pre-commit hook runs ast-grep convention check on staged files | ast-grep `sg scan --rule FILE --json PATHS` with exit code 1 on error-severity matches; existing 18 YAML rules in `src/conventions/rules/`; `git diff --cached --name-only` for staged file list |
| ENFORCE-02 | Only VERIFIED (user-confirmed) conventions are enforced, never auto-detected | `LearningStatus` type has VERIFIED/UNVERIFIED; `parseLearnings()` in `src/learning/parser.ts` provides filtering; convention rules map to learning entries by convention name |
| ENFORCE-03 | Configurable severity via config.yml: suggest-only (default) / warn / block | `ConfigSchema` already has `conventions.strictness` with enum `"suggest-only" | "warn" | "block"`; defaults to `"suggest-only"` in `DEFAULT_CONFIG` |
| ENFORCE-04 | `npx codescope install-hooks` installs pre-commit without overwriting existing hooks | D-01/D-02 chain pattern; detect husky via `.husky/` existence; wrapper script pattern from boidolr/ast-grep-pre-commit |
| SESS-01 | `/codescope:pause` generates structured handoff document | YAML frontmatter + markdown body; stored at `.claude/codescope/sessions/{taskSlug}-handoff.md`; orient pipeline artifacts on disk provide all state |
| SESS-02 | `/codescope:resume` reads handoff and resumes at correct phase/wave | Orient pipeline (`run-orient.ts`) needs `--resume` flag; artifact validation via `fs.existsSync` on scope-contract, plans, execution artifacts |
| SESS-03 | `--resume {taskSlug}` on orient skips completed phases and loads existing artifacts | Orient phases (clarification, scope-contract, research, analysis-and-planning) each write artifacts to predictable paths in `.claude/codescope/execution/{taskSlug}/` |
| SESS-04 | PreCompact hook auto-generates handoff before context compaction | Claude Code `PreCompact` hook event with matcher `"manual|auto"`; hooks.json format supports multiple event handlers; hook runs Node.js script that generates handoff |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

- **Tech stack:** TypeScript, ast-grep CLI, better-sqlite3, vitest -- all enforced
- **Build:** tsdown with ESM output; hooks reference `.mjs` files in `dist/hooks/`
- **Hook isolation:** Hook scripts have ZERO imports from src/graph/, src/tools/, src/parser/, or any module that transitively imports better-sqlite3/graphology/web-tree-sitter (per D-01 from Phase 10)
- **Convention trust model:** Never auto-promote to enforced conventions; detection_threshold 80%, min_files 10, strictness suggest-only default
- **Plugin structure:** `.claude-plugin/plugin.json` + `skills/` + `hooks/hooks.json`
- **Learning bounds:** Max 50 active learnings, gotcha decay 90 days, decision decay 180 days
- **Testing:** vitest ^4.1.0, tests in `tests/**/*.test.ts`

## Standard Stack

### Core (already in project -- no new dependencies)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| @ast-grep/cli | ^0.40.5 (0.42.0 on system) | Convention scanning via `sg scan` | Already used in `src/conventions/runner.ts`; pre-commit hook calls same CLI |
| js-yaml | (already installed) | Parse config.yml for severity | Already used in `src/config/loader.ts` and `src/config/writer.ts` |
| zod/v4 | ^3.25 | Config schema extension | Already used in `src/config/schema.ts` for ConfigSchema |

### No New Dependencies Required

This phase requires zero new npm dependencies. Convention enforcement uses the `sg` CLI binary (already a project dependency via `@ast-grep/cli`). Session continuity uses `node:fs`, `node:path`, and `node:child_process` from the standard library. The pre-commit hook is a shell script or lightweight Node.js script. All handoff generation uses existing `parseLearnings()` and file system reads.

**Rationale for no lint-staged:** Decision D-04 specifies raw `git diff --cached --name-only` for staged file filtering. This is simpler, avoids an unnecessary dependency, and gives CodeScope full control over file filtering logic. lint-staged would be overhead for what amounts to a 3-line shell command.

## Architecture Patterns

### Recommended Project Structure (new files)
```
src/
  enforcement/
    install-hooks.ts          # CLI for npx codescope install-hooks
    uninstall-hooks.ts        # CLI for npx codescope uninstall-hooks
    pre-commit-check.ts       # Node.js pre-commit logic (reads config, filters VERIFIED, runs sg)
    rule-generator.ts         # Generate VERIFIED-only ast-grep rules from learnings + conventions
    types.ts                  # Enforcement-specific types
  session/
    handoff-generator.ts      # Build handoff document from pipeline state
    handoff-parser.ts         # Parse handoff document back to structured data
    session-cleanup.ts        # 7-day auto-cleanup utility
    types.ts                  # Session/handoff types
  hooks/
    pre-compact.ts            # PreCompact hook: auto-generate handoff
    session-start.ts          # SessionStart hook: inject handoff summary
    (existing) pre-tool-use.ts
    (existing) post-tool-use.ts
skills/
  pause/SKILL.md              # /codescope:pause skill definition
  resume/SKILL.md             # /codescope:resume skill definition
```

### Pattern 1: Pre-commit Hook Wrapper (Shell Layer)
**What:** A shell script installed to `.git/hooks/pre-commit` (or `.husky/pre-commit`) that wraps the existing hook and chains CodeScope's check.
**When to use:** Always for pre-commit installation.
**Implementation:**

```bash
#!/bin/sh
# CodeScope pre-commit hook wrapper
# Chains with existing hooks -- runs them first, then CodeScope check

# Run existing hook if it was preserved
if [ -f ".git/hooks/pre-commit.codescope-backup" ]; then
  .git/hooks/pre-commit.codescope-backup
  EXISTING_EXIT=$?
  if [ $EXISTING_EXIT -ne 0 ]; then
    exit $EXISTING_EXIT  # D-01: skip CodeScope if existing hook fails
  fi
fi

# Get staged files
STAGED_FILES=$(git diff --cached --name-only --diff-filter=ACM)
if [ -z "$STAGED_FILES" ]; then
  exit 0  # No staged files
fi

# Run CodeScope enforcement check
node "node_modules/.codescope/pre-commit-check.mjs" $STAGED_FILES
```

**Key insight:** The hook script itself is a thin shell wrapper. The actual convention checking logic lives in a Node.js module (`pre-commit-check.ts`) that gets built by tsdown and distributed alongside the project.

### Pattern 2: Convention Rule Generation (VERIFIED Filter)
**What:** Generate a temporary set of ast-grep YAML rules containing only VERIFIED conventions, then pass them to `sg scan`.
**When to use:** Every pre-commit check invocation.
**Implementation approach:**

The pre-commit check reads `learnings.md`, filters for entries with status `VERIFIED` and type `pattern`, maps each to its corresponding ast-grep rule file in `src/conventions/rules/`, and runs `sg scan` only with those rule files. This avoids needing to generate new YAML -- it reuses the existing rule files but selectively includes only the VERIFIED ones.

```typescript
// Pseudocode for VERIFIED convention filtering
const learnings = parseLearnings(readFileSync(learningsPath, 'utf-8'));
const verified = learnings.entries
  .filter(e => e.status === 'VERIFIED' && e.type === 'pattern');
const verifiedRuleIds = verified.map(e => conventionNameToRuleId(e.title));
// Then: sg scan --rule <ruleFile> for each verified rule
```

### Pattern 3: Handoff Document Structure
**What:** Structured markdown with YAML frontmatter that captures pipeline position and points to existing artifacts.
**When to use:** PreCompact hook and `/codescope:pause` skill.
**Format:**

```markdown
---
task_slug: add-auth-middleware-abc123
pipeline_phase: execution
wave_position: 2/3
timestamp: 2026-03-28T14:30:00Z
orient_dir: .claude/codescope/execution/add-auth-middleware-abc123
config_path: .claude/codescope/config.yml
---

# Session Handoff: add-auth-middleware

## Completed Work
- [x] Clarification (scope-contract.md written)
- [x] Research (research.md written)
- [x] Planning (plan at .claude/codescope/plans/add-auth-middleware-abc123.md)
- [x] Execution Wave 1/3: auth-middleware-core, auth-types
- [x] Execution Wave 2/3: auth-routes

## Remaining Tasks
- [ ] Execution Wave 3/3: auth-tests
- [ ] Verification (static + runtime)
- [ ] Evaluation
- [ ] Learning capture

## Key Decisions
- Using JWT middleware pattern from conventions
- Blast radius limited to src/routes/ and src/middleware/

## Active Findings
(none yet -- pre-verification)

## Resume Command
/codescope:resume add-auth-middleware-abc123
```

### Pattern 4: Claude Code Hook Registration
**What:** New hooks in `hooks.json` for PreCompact and SessionStart events.
**When to use:** Plugin hook registration.
**Format:**

```json
{
  "PreCompact": [
    {
      "matcher": "manual|auto",
      "hooks": [
        {
          "type": "command",
          "command": "node \"${CLAUDE_PLUGIN_ROOT}/dist/hooks/pre-compact.mjs\"",
          "timeout": 10,
          "statusMessage": "Saving session state..."
        }
      ]
    }
  ],
  "SessionStart": [
    {
      "matcher": "resume|compact",
      "hooks": [
        {
          "type": "command",
          "command": "node \"${CLAUDE_PLUGIN_ROOT}/dist/hooks/session-start.mjs\"",
          "timeout": 5,
          "statusMessage": "Loading session context..."
        }
      ]
    }
  ]
}
```

### Anti-Patterns to Avoid
- **Importing heavy modules in hooks:** PreCompact and SessionStart hooks MUST follow the same isolation pattern as PreToolUse/PostToolUse -- zero imports from `src/graph/`, `src/tools/`, etc. Use only `node:fs`, `node:path`, and local `./lib/` modules.
- **Duplicating state in handoff:** The handoff document is a pointer + summary, NOT a copy of pipeline state. All state lives on disk already. The handoff says "look here" not "here's the data."
- **Writing to `.git/hooks/` when husky exists:** If `.husky/` directory exists, writing directly to `.git/hooks/` will be silently overwritten by husky on the next `git checkout` or `npm install`.
- **Blocking on UNVERIFIED conventions:** Never. The VERIFIED filter is a hard requirement, not an optimization. Auto-detected patterns have confidence levels that may be wrong -- only user-confirmed patterns are safe to enforce.
- **Running `sg scan` on the entire project in pre-commit:** Pre-commit MUST only scan staged files. Running `sg scan` on the whole project would be slow and irrelevant -- the developer only needs feedback on what they're committing.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| ast-grep YAML rule format | Custom pattern matching language | ast-grep's existing YAML rule format with `id`, `language`, `rule`, `severity`, `message` | 18 rules already exist in `src/conventions/rules/`; the format is stable and well-documented |
| Staged file detection | Custom git status parser | `git diff --cached --name-only --diff-filter=ACM` | Standard git command, handles renames, deletions, and additions correctly |
| YAML frontmatter parsing | Regex-based frontmatter extraction | `js-yaml` (already installed) with simple `---` delimiter splitting | Already used throughout the project for config.yml |
| Pre-commit hook chaining | Custom hook manager | Shell script wrapper pattern (backup existing hook, chain execution) | Battle-tested pattern used by husky, pre-commit framework, and lint-staged |
| Session file cleanup | Custom scheduler | Simple timestamp comparison on `fs.statSync().mtime` | 7-day cleanup is a one-liner comparison, no scheduler needed |

**Key insight:** This phase composes existing pieces (ast-grep rules, learning status, config schema, hook system) rather than building new capabilities. The novel work is in the glue: filtering VERIFIED conventions, chaining hooks, generating handoff documents, and teaching orient about `--resume`.

## Common Pitfalls

### Pitfall 1: Pre-commit Hook Overwrites Existing Hooks
**What goes wrong:** Installing CodeScope's pre-commit hook replaces an existing pre-commit hook (e.g., from ESLint, Prettier, or another tool), breaking the developer's workflow.
**Why it happens:** Naive `fs.writeFileSync` to `.git/hooks/pre-commit` without checking for existing content.
**How to avoid:** D-01 mandates the wrapper pattern: (1) check if pre-commit exists, (2) if yes, rename to `.pre-commit.codescope-backup`, (3) install wrapper that runs backup first, then CodeScope. For husky: append to existing `.husky/pre-commit` file, don't replace it.
**Warning signs:** Tests that only verify fresh installs, not upgrades or existing-hook scenarios.

### Pitfall 2: Hook Script Fails When sg Is Not Installed
**What goes wrong:** The pre-commit hook runs on a machine where `@ast-grep/cli` is not in PATH (e.g., teammate who cloned the repo but didn't install dev dependencies).
**Why it happens:** `sg` is installed via npm as a dev dependency but may not be in the system PATH.
**How to avoid:** The hook script should first check `npx sg --version` or look for `sg` in `node_modules/.bin/`. If not found, emit a warning and exit 0 (don't block the commit for a missing tool).
**Warning signs:** CI/CD environments where `sg` is not available.

### Pitfall 3: Handoff Document References Deleted Artifacts
**What goes wrong:** A handoff document says "resume at wave 2" but the execution artifacts from wave 1 were manually deleted or corrupted.
**Why it happens:** The handoff is a pointer -- it assumes the referenced files still exist.
**How to avoid:** D-17 mandates artifact validation on resume: `fs.existsSync()` for each referenced path. If missing, warn the user and offer to restart that phase.
**Warning signs:** Handoff tests that only test the happy path (all artifacts present).

### Pitfall 4: PreCompact Hook Has No Pipeline State to Capture
**What goes wrong:** PreCompact fires during a session where no orient pipeline is running (e.g., user is just browsing code or doing a quick edit). The hook errors trying to find non-existent pipeline state.
**Why it happens:** PreCompact fires on every compaction, not just during pipeline execution.
**How to avoid:** The PreCompact hook must check for active pipeline state first (e.g., does `.claude/codescope/execution/` contain any task directories with in-progress coordination logs?). If no active pipeline, exit silently with no handoff.
**Warning signs:** Hook errors in non-pipeline sessions.

### Pitfall 5: Config Schema Migration for Existing Users
**What goes wrong:** Adding new fields to `ConfigSchema` causes validation errors for users with existing `config.yml` files that don't have the new fields.
**Why it happens:** Zod schema validation is strict by default -- missing fields fail validation.
**How to avoid:** The `conventions.strictness` field already exists in the schema. If adding new enforcement-specific fields, make them optional with defaults. The `loadConfig()` function should handle missing optional fields gracefully.
**Warning signs:** Tests that always use fresh config objects, never existing config.yml files.

### Pitfall 6: SessionStart Hook Injects Stale Handoff
**What goes wrong:** A handoff from 3 days ago is injected on session resume, but the codebase has changed significantly since then.
**Why it happens:** The handoff references a specific point-in-time state. If the developer has made manual changes since then, the handoff's artifact references may be outdated.
**How to avoid:** Include a `timestamp` in the handoff frontmatter. On resume, compare the handoff timestamp with the latest `git log` timestamp. If significant commits have occurred since the handoff, warn the user that the handoff may be outdated and offer "Start fresh" prominently.
**Warning signs:** Tests that don't simulate time passage between pause and resume.

### Pitfall 7: ast-grep Exit Code Semantics
**What goes wrong:** `sg scan` returns exit code 1 when it finds matches with `error` severity, exit code 0 when no matches or only non-error matches. Developers confuse "matches found" (informational) with "scan failed" (error).
**Why it happens:** Different tools use different exit code conventions for linting.
**How to avoid:** The `sg scan` exit codes are: 0 = no error-severity matches, 1 = at least one error-severity match. Map CodeScope's severity levels: `suggest-only` -> always exit 0 regardless of `sg` exit code; `warn` -> always exit 0 but show output; `block` -> pass through `sg`'s exit code (1 -> 2 for pre-commit convention). Use `--error` or `--warning` flags on `sg scan` to control which severity levels are treated as errors.
**Warning signs:** Tests that don't cover all three severity modes.

## Code Examples

### Example 1: Install Hook Script (install-hooks.ts core logic)
```typescript
// Source: Pattern derived from boidolr/ast-grep-pre-commit + project conventions
import { existsSync, readFileSync, writeFileSync, renameSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

function installPreCommitHook(projectRoot: string): { installed: boolean; method: 'husky' | 'git-hooks' } {
  const huskyDir = join(projectRoot, '.husky');
  const gitHooksDir = join(projectRoot, '.git', 'hooks');

  if (existsSync(huskyDir)) {
    // D-02: Integrate with husky
    const huskyHookPath = join(huskyDir, 'pre-commit');
    const marker = '# codescope-enforcement-start';
    const block = [
      marker,
      'node "node_modules/.codescope/pre-commit-check.mjs" $(git diff --cached --name-only --diff-filter=ACM)',
      '# codescope-enforcement-end',
    ].join('\n');

    if (existsSync(huskyHookPath)) {
      const existing = readFileSync(huskyHookPath, 'utf-8');
      if (!existing.includes(marker)) {
        writeFileSync(huskyHookPath, existing + '\n' + block + '\n', 'utf-8');
      }
    } else {
      writeFileSync(huskyHookPath, '#!/bin/sh\n' + block + '\n', { mode: 0o755 });
    }
    return { installed: true, method: 'husky' };
  }

  // D-02 fallback: Direct .git/hooks/ installation
  const hookPath = join(gitHooksDir, 'pre-commit');
  if (existsSync(hookPath)) {
    // D-01: Backup existing hook
    renameSync(hookPath, hookPath + '.codescope-backup');
  }
  // Write wrapper script (see Pattern 1 above)
  writeFileSync(hookPath, WRAPPER_SCRIPT, { mode: 0o755 });
  return { installed: true, method: 'git-hooks' };
}
```

### Example 2: Pre-commit Check (pre-commit-check.ts core logic)
```typescript
// Source: Pattern from src/conventions/runner.ts + sg scan CLI docs
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, basename } from 'node:path';

function runPreCommitCheck(
  stagedFiles: string[],
  projectRoot: string,
): { exitCode: number; output: string } {
  // 1. Load config for severity
  const config = loadConfigMinimal(projectRoot); // lightweight loader, no heavy imports
  const severity = config?.conventions?.strictness ?? 'suggest-only';

  // 2. Load VERIFIED conventions from learnings.md
  const learningsPath = join(projectRoot, '.claude', 'codescope', 'learnings.md');
  if (!existsSync(learningsPath)) {
    return { exitCode: 0, output: 'No learnings found -- skipping enforcement.' };
  }
  const verifiedRuleIds = getVerifiedConventionRuleIds(learningsPath);
  if (verifiedRuleIds.length === 0) {
    return { exitCode: 0, output: 'No VERIFIED conventions -- skipping enforcement.' };
  }

  // 3. Run sg scan for each verified rule against staged files
  let totalFindings = 0;
  const findings: string[] = [];

  for (const ruleId of verifiedRuleIds) {
    const rulePath = resolveRulePath(ruleId, projectRoot);
    if (!rulePath) continue;

    try {
      // sg scan --rule <file> --json <paths...>
      const output = execFileSync('sg', [
        'scan', '--rule', rulePath, '--json', ...stagedFiles,
      ], { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] });
      const matches = JSON.parse(output);
      // Format findings...
      totalFindings += matches.length;
    } catch (err) {
      // sg returns exit 1 on matches -- parse stdout
    }
  }

  // 4. Map severity to exit code (D-07)
  const summary = `Checked ${verifiedRuleIds.length} conventions against ${stagedFiles.length} staged files: ${totalFindings} finding(s)`;
  if (severity === 'block' && totalFindings > 0) {
    return { exitCode: 2, output: `\x1b[31m[BLOCK]\x1b[0m ${summary}\n${findings.join('\n')}` };
  }
  if (severity === 'warn' && totalFindings > 0) {
    return { exitCode: 0, output: `\x1b[33m[WARN]\x1b[0m ${summary}\n${findings.join('\n')}` };
  }
  return { exitCode: 0, output: totalFindings > 0 ? `[INFO] ${summary}\n${findings.join('\n')}` : summary };
}
```

### Example 3: Handoff Generation (handoff-generator.ts core logic)
```typescript
// Source: Pattern from orient pipeline + execution coordination types
import { existsSync, readFileSync, readdirSync, writeFileSync, mkdirSync, statSync } from 'node:fs';
import { join, basename } from 'node:path';

interface HandoffFrontmatter {
  task_slug: string;
  pipeline_phase: string;
  wave_position: string;
  timestamp: string;
  orient_dir: string;
  config_path: string;
}

function generateHandoff(projectRoot: string, taskSlug: string): string | null {
  const executionDir = join(projectRoot, '.claude', 'codescope', 'execution', taskSlug);
  if (!existsSync(executionDir)) return null;

  // Detect pipeline phase from artifacts
  const phase = detectPipelinePhase(executionDir, projectRoot, taskSlug);

  const frontmatter: HandoffFrontmatter = {
    task_slug: taskSlug,
    pipeline_phase: phase.name,
    wave_position: phase.wavePosition,
    timestamp: new Date().toISOString(),
    orient_dir: executionDir,
    config_path: join(projectRoot, '.claude', 'codescope', 'config.yml'),
  };

  // Build markdown body
  const sections = [
    buildCompletedWorkSection(executionDir, projectRoot, taskSlug),
    buildRemainingTasksSection(phase),
    buildKeyDecisionsSection(executionDir),
    buildActiveFindingsSection(executionDir),
    `## Resume Command\n\n/codescope:resume ${taskSlug}`,
  ];

  const yaml = Object.entries(frontmatter)
    .map(([k, v]) => `${k}: ${v}`)
    .join('\n');

  return `---\n${yaml}\n---\n\n# Session Handoff: ${taskSlug}\n\n${sections.join('\n\n')}`;
}
```

### Example 4: PreCompact Hook (pre-compact.ts)
```typescript
// Source: Pattern from src/hooks/pre-tool-use.ts
// CRITICAL: Zero imports from src/graph/, src/tools/, src/parser/
import { readFileSync, existsSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

interface PreCompactInput {
  session_id: string;
  transcript_path: string;
  cwd: string;
  hook_event_name: 'PreCompact';
  matcher_value: 'manual' | 'auto';
}

function processPreCompact(input: PreCompactInput, projectDir: string): void {
  const sessionsDir = join(projectDir, '.claude', 'codescope', 'sessions');
  const executionDir = join(projectDir, '.claude', 'codescope', 'execution');

  // Guard: no active pipeline state = silent no-op (Pitfall 4)
  if (!existsSync(executionDir)) {
    return;
  }

  // Find most recent active task (latest modified coordination.md)
  const taskSlug = findActiveTaskSlug(executionDir);
  if (!taskSlug) return;

  // Generate and write handoff (reuse handoff-generator logic)
  // NOTE: Cannot import from src/session/ due to build isolation.
  // Must inline or duplicate the lightweight handoff generation logic.
  mkdirSync(sessionsDir, { recursive: true });
  const handoff = generateHandoffInline(projectDir, taskSlug, executionDir);
  if (handoff) {
    writeFileSync(join(sessionsDir, `${taskSlug}-handoff.md`), handoff, 'utf-8');
  }
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Husky v4 (package.json config) | Husky v9+ (`.husky/` directory, shell scripts) | 2023 | Hook installation must detect husky version; v9+ uses directory-based hooks |
| lint-staged for file filtering | Direct `git diff --cached` | Decision D-04 | Simpler, no dependency, full control over filtering logic |
| Session management via MCP | Claude Code native hooks (PreCompact/SessionStart) | March 2025+ | No need for external MCP server; hooks are first-class in Claude Code |
| Pre-commit framework (Python) | ast-grep native pre-commit / custom shell | 2024+ | boidolr/ast-grep-pre-commit exists but we don't need the pre-commit framework; direct shell script is simpler |

**Deprecated/outdated:**
- **husky v4 API:** Configured via package.json, not directory. Our code must target v9+ (`.husky/` directory pattern).
- **Session Context Management MCP's `/handoff` command:** Replaced by Claude Code native PreCompact hooks for session state preservation.

## Open Questions

1. **Convention-to-rule mapping between learnings.md and ast-grep rule files**
   - What we know: Learnings contain convention titles (e.g., "Prefer Named Exports"). Rule files have IDs (e.g., `prefer-named-exports`). The `RULE_METADATA` map in `runner.ts` maps `ruleId -> { name, category }`.
   - What's unclear: The exact mapping from `LearningEntry.title` to `ruleId`. Is the title always the same as `RULE_METADATA[ruleId].name`?
   - Recommendation: Build a bidirectional lookup map: `name -> ruleId` and `ruleId -> name` from `RULE_METADATA`. Use this for the VERIFIED filter. Add a test that verifies all convention names in test learnings map correctly.

2. **PreCompact hook build isolation for handoff generation**
   - What we know: PreCompact hooks must follow the same isolation pattern as PreToolUse (zero heavy imports). Handoff generation reads learnings.md, coordination.md, and plan files -- all plain text.
   - What's unclear: Should handoff generation logic be duplicated in the hook (like artifact types are duplicated in `src/hooks/lib/types.ts`) or can it be shared via a lightweight shared module?
   - Recommendation: Create `src/hooks/lib/handoff-builder.ts` as a lightweight module with zero imports beyond `node:fs` and `node:path`. Duplicate the minimal types needed. This follows the established pattern from Phase 10's `artifact-reader.ts`.

3. **Orient pipeline `--resume` integration depth**
   - What we know: `run-orient.ts` currently supports `--phase` flag for step-by-step execution. Adding `--resume` with a task slug is similar.
   - What's unclear: How deeply should resume integration go? Should it restart from the last incomplete phase, or should it offer to re-run the last completed phase too?
   - Recommendation: Per D-16, skip phases with completed artifacts, resume at first incomplete phase. "First incomplete" means: check scope-contract.md (clarification done), check research.md (research done), check plan file (planning done), check coordination.md last signal (execution progress). The skill body handles user interaction for "Continue" vs "Start fresh."

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| ast-grep CLI (sg) | Convention enforcement | Yes | 0.42.0 | Graceful degradation: emit warning, exit 0, skip enforcement |
| Node.js | Hook scripts, pre-commit check | Yes | v25.6.1 | None (required) |
| git | Pre-commit hook, staged file detection | Yes | 2.50.1 | None (required) |

**Missing dependencies with no fallback:** None
**Missing dependencies with fallback:** None

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest ^4.1.0 |
| Config file | `vitest.config.ts` |
| Quick run command | `npx vitest run --reporter=verbose` |
| Full suite command | `npx vitest run` |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| ENFORCE-01 | Pre-commit hook runs sg scan on staged files | unit | `npx vitest run tests/enforcement/pre-commit-check.test.ts -t "runs sg scan"` | Wave 0 |
| ENFORCE-02 | Only VERIFIED conventions enforced | unit | `npx vitest run tests/enforcement/rule-generator.test.ts -t "filters VERIFIED"` | Wave 0 |
| ENFORCE-03 | Severity config maps to exit codes | unit | `npx vitest run tests/enforcement/pre-commit-check.test.ts -t "severity"` | Wave 0 |
| ENFORCE-04 | install-hooks chains with existing hooks | unit + integration | `npx vitest run tests/enforcement/install-hooks.test.ts` | Wave 0 |
| SESS-01 | /codescope:pause generates handoff | unit | `npx vitest run tests/session/handoff-generator.test.ts` | Wave 0 |
| SESS-02 | /codescope:resume reads handoff and resumes | unit | `npx vitest run tests/session/handoff-parser.test.ts` | Wave 0 |
| SESS-03 | --resume skips completed phases | unit | `npx vitest run tests/orient/resume.test.ts` | Wave 0 |
| SESS-04 | PreCompact hook generates handoff | unit | `npx vitest run tests/hooks/pre-compact.test.ts` | Wave 0 |

### Sampling Rate
- **Per task commit:** `npx vitest run tests/enforcement/ tests/session/ tests/hooks/pre-compact.test.ts tests/hooks/session-start.test.ts --reporter=verbose`
- **Per wave merge:** `npx vitest run`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `tests/enforcement/pre-commit-check.test.ts` -- covers ENFORCE-01, ENFORCE-02, ENFORCE-03
- [ ] `tests/enforcement/install-hooks.test.ts` -- covers ENFORCE-04
- [ ] `tests/enforcement/rule-generator.test.ts` -- covers ENFORCE-02 (VERIFIED filtering)
- [ ] `tests/enforcement/uninstall-hooks.test.ts` -- covers D-03
- [ ] `tests/session/handoff-generator.test.ts` -- covers SESS-01, SESS-04
- [ ] `tests/session/handoff-parser.test.ts` -- covers SESS-02
- [ ] `tests/session/session-cleanup.test.ts` -- covers D-14
- [ ] `tests/hooks/pre-compact.test.ts` -- covers SESS-04
- [ ] `tests/hooks/session-start.test.ts` -- covers D-18
- [ ] `tests/orient/resume.test.ts` -- covers SESS-03

## Sources

### Primary (HIGH confidence)
- [ast-grep YAML Rule Reference](https://ast-grep.github.io/reference/yaml.html) -- full rule format documentation
- [ast-grep scan CLI Reference](https://ast-grep.github.io/reference/cli/scan.html) -- flags, exit codes, JSON output
- [Claude Code Hooks Reference](https://code.claude.com/docs/en/hooks) -- PreCompact, SessionStart, additionalContext, hook JSON format, all 24+ events
- Existing codebase: `src/conventions/runner.ts`, `src/hooks/pre-tool-use.ts`, `src/learning/types.ts`, `src/config/schema.ts` -- established patterns

### Secondary (MEDIUM confidence)
- [boidolr/ast-grep-pre-commit](https://github.com/boidolr/ast-grep-pre-commit) -- ast-grep pre-commit integration pattern
- [Claude Code Session Lifecycle Hooks](https://claudefa.st/blog/tools/hooks/session-lifecycle-hooks) -- SessionStart with source matchers
- [Claude Code Hooks Guide (March 2026)](https://smartscope.blog/en/generative-ai/claude/claude-code-hooks-guide/) -- comprehensive hook walkthrough
- [PreCompact Hook Feature Request](https://github.com/anthropics/claude-code/issues/17237) -- community discussion on PreCompact usage

### Tertiary (LOW confidence)
- None

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- no new dependencies, all existing tools
- Architecture: HIGH -- patterns directly extend existing hook infrastructure (Phase 10)
- Convention enforcement: HIGH -- ast-grep CLI already used, rule files exist, config schema ready
- Session continuity: HIGH -- Claude Code hooks API is documented, filesystem-first state already on disk
- Pitfalls: HIGH -- identified from existing codebase patterns and hook isolation requirements

**Research date:** 2026-03-28
**Valid until:** 2026-04-28 (stable domain -- Claude Code hooks API unlikely to change within 30 days)
