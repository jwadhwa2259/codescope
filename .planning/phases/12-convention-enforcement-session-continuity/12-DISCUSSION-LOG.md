# Phase 12: Convention Enforcement + Session Continuity - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md -- this log preserves the alternatives considered.

**Date:** 2026-03-28
**Phase:** 12-convention-enforcement-session-continuity
**Areas discussed:** Hook installation strategy, Enforcement output UX, Handoff document design, Resume pipeline re-entry

---

## Hook Installation Strategy

| Option | Description | Selected |
|--------|-------------|----------|
| Chain via wrapper (Recommended) | Create wrapper script that runs existing hook first, then CodeScope check. Preserves husky/lint-staged/manual hooks. | |
| Append to existing hook | Append CodeScope's check to end of existing .git/hooks/pre-commit. Simpler but fragile. | |
| Standalone only | Only install if no pre-commit hook exists. Print instructions otherwise. | |

**User's choice:** All recommended options selected per user request. Chain via wrapper chosen, with husky detection for framework-aware installation. Referenced boidolr/ast-grep-pre-commit pattern.
**Notes:** User directed to use recommended options aligned with competitive repos being referenced for v2 features.

---

## Enforcement Output UX

| Option | Description | Selected |
|--------|-------------|----------|
| Three-tier severity (Recommended) | suggest-only (exit 0, colored output), warn (exit 0, yellow banner), block (exit 2, red banner) | |

**User's choice:** Recommended three-tier severity with standard pre-commit exit codes. Referenced ast-grep lint rule exit codes and pre-commit framework conventions.
**Notes:** Compact terminal output matching ESLint/Prettier developer expectations.

---

## Handoff Document Design

| Option | Description | Selected |
|--------|-------------|----------|
| Structured markdown with YAML frontmatter (Recommended) | Task slug, phase, wave, timestamp in frontmatter. Sections for completed/remaining/decisions/findings/resume command. | |

**User's choice:** Recommended structured markdown format. Referenced Session Context Management MCP /handoff pattern.
**Notes:** Stored in `.claude/codescope/sessions/`, 7-day auto-cleanup. PreCompact hook auto-generates same format.

---

## Resume Pipeline Re-entry

| Option | Description | Selected |
|--------|-------------|----------|
| Handoff-first with artifact validation (Recommended) | Read handoff doc for state, validate against actual artifacts on disk, warn on mismatches. | |

**User's choice:** Recommended approach. Referenced Session Context Management MCP /start pattern and Claude Code SessionStart hook with source: "resume" matcher.
**Notes:** --resume flag on orient scans for completed artifacts and skips finished phases.

---

## Claude's Discretion

- ast-grep YAML rule generation from detected conventions
- Hook script implementation language (shell vs Node.js)
- Handoff document formatting details
- Session cleanup implementation
- lint-staged vs raw git diff for staged file filtering

## Deferred Ideas

None -- discussion stayed within phase scope
