# Phase 19: Intelligence Features - Research

**Researched:** 2026-03-30
**Domain:** Hook injection, pre-computed artifact indexing, deterministic code evaluation
**Confidence:** HIGH

## Summary

Phase 19 adds three capabilities to CodeScope: (1) reference file injection in the PreToolUse hook that suggests the most structurally similar existing file when Claude edits/creates code, (2) post-edit validation in the PostToolUse hook that checks written code against HIGH-CONF conventions and reports deviations as advisory warnings, and (3) a `/codescope:eval` skill that produces a deterministic scorecard for uncommitted changes.

All three capabilities follow the established pre-computed artifact pattern: heavy computation happens at bootstrap/incremental rebuild time, results are written as JSON index files, and hooks read those files at O(1) cost. No new dependencies are required -- every building block already exists in the codebase. The primary technical challenges are: computing pairwise file similarity efficiently at bootstrap time, designing the violation index schema to enable accurate post-edit checking without false positives, and assembling the deterministic scorecard from existing MCP tool outputs.

**Primary recommendation:** Follow the existing artifact builder pattern exactly (see `convention-index.ts`, `danger-zone-index.ts`, `blast-radius-index.ts`). Build two new artifact builders (`reference-index.ts`, `violation-index.ts`), extend `readAllArtifacts()`, add injection items at the specified priorities, and create a standalone `deterministic-scorecard.ts` module for the eval skill.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- D-01: Pre-computed `references-index.json` artifact built at bootstrap time. Hook reads JSON -- no heavy imports, no on-the-fly computation.
- D-02: Similarity scored with weighted signals: convention density (40%) + community proximity (25%) + directory proximity (20%) + shared imports (15%). Returns top-1 reference per file.
- D-03: Candidates scoped by file role (utility -> utility, route-handler -> route-handler). Uses existing `classifyFileRole()` from `src/classifier/file-role.ts`.
- D-04: Noise files excluded from candidates using existing `isNoiseFile()` from `src/conventions/golden-files.ts` (REF-03 compliance).
- D-05: New file creation handled by path-only signals: directory proximity + file role classification (deterministic from path, no file content needed).
- D-06: New builder `src/artifacts/reference-index.ts` integrated into `generateInjectionArtifacts()` in `src/artifacts/generator.ts`. Atomic write, same pattern as danger-zones.json.
- D-07: Hook injection format is one line at priority 2.5: `Reference: see \`src/utils/session.ts\` for this codebase's utility pattern` (~20 tokens).
- D-08: Pre-computed `convention-violations.json` artifact for the PostToolUse hook. Type names and import paths pre-extracted at bootstrap/incremental rebuild time.
- D-09: New builder `src/artifacts/violation-index.ts` integrated into `generateInjectionArtifacts()`. Schema: `{ generated, files: { "path": [{ ruleId, detected, expected, line }] } }`.
- D-10: Hook reads violations JSON, filters by edited file path, injects advisory warnings at PostToolUse priority 1 (~100 tokens). Deviations are problems, not reminders -- higher priority than convention reminders.
- D-11: Only HIGH-CONF conventions trigger validation warnings (VALID-04: <5% false positive rate).
- D-12: VALID-02 (type name checking): pre-compute detected type names during bootstrap, store in violations index. Hook compares written code type references against known types.
- D-13: VALID-03 (import path checking): pre-compute resolved import paths, store valid import targets in violations index. Hook flags imports to non-existent or incorrect paths.
- D-14: Do NOT add @ast-grep/napi to hooks in Phase 19. Start with pre-computed violations. Only escalate to napi if measured false positive rate exceeds 5% on real codebases.
- D-15: Advisory only -- validation output is informational, never blocking. No `decision: "block"` in Phase 19.
- D-16: Mode 2 (score uncommitted changes) is the MVP -- ship first. Uses deterministic scorecard computed from existing MCP tools and graph data. No LLM calls. Fast (<1s), free, reproducible.
- D-17: Deterministic scorecard fields (all computable without LLM): Convention Adherence %, Blast Radius, Violation Count, Import Correctness %, Risk Files Modified, Composite Score.
- D-18: Mode 1 (run task + score) reuses the orient pipeline for task execution, then scores with Mode 2 deterministic logic. Revert via `git stash --include-untracked && git stash drop` when user opts in.
- D-19: Mode 3 (benchmark suite) is deferred -- Phase 20+ scope. YAML task definitions in `.claude/codescope/benchmarks/`. Mode 3 UI shows "Coming soon" placeholder.
- D-20: New `src/eval/deterministic-scorecard.ts` module (~150-200 lines). Functions: `computeConventionAdherence()`, `computeBlastRadiusScore()`, `computeImportCorrectness()`, `computeCompositeScore()`.
- D-21: Composite score weights: convention adherence 25%, blast radius (normalized) 25%, violation impact (normalized) 25%, import correctness 25%. Letter grades: A=90-100%, B+=85-89%, B=80-84%, C+=70-74%, C=60-69%, F=<60%.
- D-22: Keep 500-token budget limit. No increase needed.
- D-23: PreToolUse priority order: danger zones (P1, ~80 tokens) > conventions (P2, ~150 tokens) > reference suggestion (P2.5, ~20 tokens) > blast radius (P3, ~60 tokens). Total ~310 tokens (62%).
- D-24: PostToolUse priority order: validation warnings (P1, ~100 tokens) > convention reminder (P2, ~80 tokens) > blast radius warning (P3, ~50 tokens). Total ~230 tokens (46%).
- D-25: Reference suggestion is PreToolUse only (before edit). Validation warnings are PostToolUse only (after edit). No overlap between hooks.

### Claude's Discretion
- Exact similarity weight tuning (40/25/20/15 starting point, adjust based on testing)
- Whether to add a complementary MCP tool for deeper on-demand validation alongside the hook
- Scorecard markdown rendering format and styling
- Whether Mode 1 task execution uses full orient pipeline or a lightweight variant
- Pairwise similarity pre-computation strategy (all pairs vs. same-role only)

### Deferred Ideas (OUT OF SCOPE)
- Mode 3 benchmark suite (YAML task definitions, batch execution, aggregate scoring) -- Phase 20+
- Optional full LLM-based eval detail (semantic judgment, scope compliance, completeness) -- Phase 20+
- @ast-grep/napi in-process validation (only if pre-computed violations have >5% FP rate) -- Phase 20+
- Community benchmark YAML files for popular frameworks (Fastify, Express, h3) -- Phase 20+
- Complementary MCP validation tool for deep on-demand analysis -- consider during planning
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| REF-01 | MCP tool identifies most similar existing file using structural similarity | Reference index builder with 4-signal weighted similarity (D-02); same-role scoping (D-03); existing `classifyFileRole()`, `isNoiseFile()`, community detection, import graph |
| REF-02 | PreToolUse hook injects one-line reference suggestion within token budget | Priority 2.5 injection item in budget composer (~20 tokens); `readAllArtifacts()` extension to load `references-index.json`; established hook pattern |
| REF-03 | Reference file suggestion excludes deprecated, generated, and test files | `isNoiseFile()` from `golden-files.ts` already excludes these categories; filter applied during index building |
| VALID-01 | PostToolUse hook validates written code against HIGH-CONF conventions | Violation index builder pre-computes per-file violations; hook reads JSON and injects at P1; convention confidence filtering (D-11) |
| VALID-02 | Validation catches wrong type names by comparing against detected types | Pre-compute type names from graph nodes (kind="type" or "interface") during bootstrap; store in violation index; hook pattern-matches written code |
| VALID-03 | Validation catches import path errors by checking resolved import graph | Pre-compute resolved import targets from edges table; store valid targets in violation index; hook checks import statements |
| VALID-04 | False positive rate below 5% on HIGH-CONF conventions | Only HIGH-CONF conventions (>=70% adoption) trigger validation; pre-computed at bootstrap with full codebase context; no runtime heuristics |
| EVAL-01 | `/codescope:eval` Mode 2 -- score uncommitted changes deterministically | `deterministic-scorecard.ts` module; reads graph data + conventions + git diff; no LLM calls; <1s execution |
| EVAL-02 | `/codescope:eval` Mode 1 -- run task, score output, optionally revert | Reuses orient pipeline; scores with Mode 2 logic; revert via `git stash --include-untracked && git stash drop` |
| EVAL-03 | `/codescope:eval` Mode 3 -- benchmark suite (deferred) | Placeholder "Coming soon" in Phase 19; full implementation Phase 20+ per D-19 |
| EVAL-04 | Scorecard includes convention adherence %, blast radius, violation count, import correctness, risk files, composite score | All 6 metrics computable from existing graph data + convention data + git diff; composite score with equal weights (D-21) |
</phase_requirements>

## Standard Stack

No new dependencies required. Phase 19 uses only existing project dependencies.

### Core (already installed)
| Library | Version | Purpose | Why Used |
|---------|---------|---------|----------|
| better-sqlite3 | ^12.8.0 | Graph DB queries for similarity signals | Community data, import edges, file nodes -- all needed for reference index building |
| graphology | ^0.26.0 | In-memory graph for BFS and community lookup | Community proximity signal in reference matching |
| graphology-communities-louvain | ^2.0.2 | Community assignments | Community proximity computation for similarity scoring |
| graphology-traversal | ^0.3.1 | BFS traversal | Shared import counting between file pairs |
| vitest | ^4.1.0 | Test framework | All new modules need tests |

### No New Libraries Needed
All four similarity signals (convention density, community proximity, directory proximity, shared imports) are computable from existing data structures. The deterministic scorecard computes metrics from existing MCP tool outputs and graph data. No new npm packages to install.

## Architecture Patterns

### Recommended Project Structure
```
src/
├── artifacts/
│   ├── reference-index.ts      # NEW: Build references-index.json
│   ├── violation-index.ts      # NEW: Build convention-violations.json
│   ├── generator.ts            # EXTEND: Add two new builder calls
│   ├── types.ts                # EXTEND: Add ReferenceIndex, ViolationIndex types
│   ├── convention-index.ts     # Existing (pattern to follow)
│   ├── danger-zone-index.ts    # Existing (pattern to follow)
│   └── blast-radius-index.ts   # Existing (pattern to follow)
├── hooks/
│   ├── pre-tool-use.ts         # EXTEND: Add P2.5 reference suggestion
│   ├── post-tool-use.ts        # EXTEND: Add P1 validation warning
│   └── lib/
│       ├── artifact-reader.ts  # EXTEND: Read 2 new JSON files
│       ├── types.ts            # EXTEND: Add ReferenceIndex, ViolationIndex types (duplicated for build isolation)
│       └── budget-composer.ts  # No changes needed (supports fractional priorities)
├── eval/
│   ├── deterministic-scorecard.ts  # NEW: Deterministic scoring module
│   ├── eval-agent.ts               # Existing LLM eval (unchanged)
│   └── types.ts                    # EXTEND: Add DeterministicScorecard types
└── skills/
    └── eval/                    # NEW: /codescope:eval skill
        └── SKILL.md
```

### Pattern 1: Artifact Builder Pattern (follow exactly)
**What:** Synchronous function that takes db/codescopeDir, computes an index, returns typed data. Generator writes atomically.
**When to use:** All new pre-computed indexes.
**Example:**
```typescript
// Source: src/artifacts/danger-zone-index.ts (existing pattern)
export function buildReferenceIndex(db: DatabaseType): ReferenceIndex {
  const graph = loadGraphFromSQLite(db);
  const { centralities } = computeCentrality(graph);
  const { communities } = runCommunityDetection(graph, db);

  // ... compute similarity, build index ...

  return {
    generated: new Date().toISOString(),
    files: indexData,
  };
}
```

### Pattern 2: Hook Injection Item Pattern
**What:** Build an `InjectionItem` with priority and content, push to items array, let `composeBudgetedMessage()` handle budget.
**When to use:** Adding new context to PreToolUse or PostToolUse hooks.
**Example:**
```typescript
// Source: src/hooks/pre-tool-use.ts (existing pattern)
// Priority 2.5: Reference suggestion (between conventions P2 and blast radius P3)
const refEntry = artifacts.references?.files[relPath];
if (refEntry) {
  items.push({
    priority: 2.5,
    content: `Reference: see \`${refEntry.referencePath}\` for this codebase's ${refEntry.roleLabel} pattern`,
  });
}
```

### Pattern 3: Build Isolation for Hooks
**What:** Hook modules (src/hooks/) MUST NOT import from src/graph/, src/tools/, src/parser/, src/server.ts, or any module that transitively imports better-sqlite3/graphology/web-tree-sitter.
**When to use:** Always for hook code. Types needed in hooks are duplicated in `src/hooks/lib/types.ts`.
**Critical:** New artifact types (ReferenceIndex, ViolationIndex) must be defined BOTH in `src/artifacts/types.ts` AND duplicated in `src/hooks/lib/types.ts`.

### Pattern 4: Skill File Pattern
**What:** Markdown file with YAML frontmatter (name, description, allowed-tools) followed by step-by-step instructions.
**When to use:** Creating the `/codescope:eval` skill.
**Example:**
```markdown
---
name: eval
description: Score uncommitted changes or run benchmark tasks against codebase conventions.
allowed-tools:
  - Bash
  - Read
  - mcp__codescope__codescope_eval
  - mcp__codescope__codescope_detect_changes
  - mcp__codescope__codescope_blast_radius
  - mcp__codescope__codescope_conventions
---

# /codescope:eval

You are the eval assistant. ...
```

### Pattern 5: Deterministic Scorecard Module Pattern
**What:** Pure function module with typed Options + Result, no side effects, no LLM calls. Similar to `computeReadiness()` in `bootstrap/readiness.ts`.
**When to use:** The eval scorecard computation.

### Anti-Patterns to Avoid
- **Importing graph modules in hooks:** Hooks must read pre-computed JSON only. Any `import from "../graph/"` in hook code is a build isolation violation.
- **Running ast-grep in hooks:** Per D-14, hooks do NOT run ast-grep at runtime. All convention checking uses pre-computed data.
- **Blocking hook output:** Per D-15, validation output is advisory only. Never return `decision: "block"` from PostToolUse in Phase 19.
- **Computing similarity at hook time:** Per D-01, all similarity computation happens at bootstrap. The hook just reads the pre-computed JSON.
- **LLM calls in deterministic scorecard:** Per D-16, the scorecard is deterministic. No LLM calls, no network requests. All data comes from local graph DB and artifact files.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| File role classification | Custom classifier | `classifyFileRole()` from `src/classifier/file-role.ts` | Already handles 6 roles with 3-tier signal chain |
| Noise file filtering | Custom filter | `isNoiseFile()` from `src/conventions/golden-files.ts` | Already excludes test/config/generated/deprecated files |
| Token budget composition | Manual string truncation | `composeBudgetedMessage()` from `src/hooks/lib/budget-composer.ts` | Priority queue with greedy budget allocation |
| Convention parsing | Custom markdown parser | `parseDetectorConventions()` from `src/conventions/parser.ts` | Canonical parser, no duplicates allowed |
| Letter grade mapping | Custom grade function | `percentToGrade()` from `src/bootstrap/readiness.ts` | Already maps 0-100% to A+/A/A-/B+/.../F |
| Graph loading | Direct SQL queries | `loadGraphFromSQLite()` from `src/graph/analytics.ts` | Handles node/edge loading with dedup |
| Centrality computation | Custom centrality | `computeCentrality()` from `src/graph/analytics.ts` | Wraps graphology-metrics correctly |
| Community detection | Custom clustering | `runCommunityDetection()` from `src/graph/analytics.ts` | Wraps Louvain with label derivation |
| Blast radius BFS | Custom BFS | `blastRadius()` from `src/graph/analytics.ts` | Hop-classified BFS traversal |
| Atomic file write | Direct fs.writeFileSync | `writeArtifactAtomic()` from `src/artifacts/generator.ts` | Write-to-tmp-then-rename pattern |

**Key insight:** Phase 19 is an integration phase. Every computational primitive exists. The work is: (1) composing these primitives into new artifact builders, (2) wiring the artifacts into hooks, and (3) assembling a scorecard from existing tool outputs.

## Common Pitfalls

### Pitfall 1: Build Isolation Violation in Hooks
**What goes wrong:** Importing `src/graph/analytics.ts` or `src/artifacts/types.ts` in hook code causes hook scripts to transitively pull in better-sqlite3, graphology, and web-tree-sitter native addons. Hook execution fails or becomes extremely slow.
**Why it happens:** Developer forgets the hook build isolation constraint and imports a "simple" type from the wrong module.
**How to avoid:** All types used in hooks must be duplicated in `src/hooks/lib/types.ts`. Lint rule: hook files must only import from `node:fs`, `node:path`, `node:process`, and `./lib/`.
**Warning signs:** Hook test file imports working but hook fails when run as subprocess from Claude Code.

### Pitfall 2: All-Pairs Similarity Explosion
**What goes wrong:** Computing pairwise similarity between all N files produces O(N^2) comparisons. For 1000 files, that's 500K pairs. For 10K files, 50M pairs.
**Why it happens:** Naive implementation iterates over every file pair.
**How to avoid:** Scope comparisons to same-role files only (per D-03). A codebase with 1000 files might have ~200 utilities, ~150 route handlers, etc. Same-role scoping reduces pairs by ~80%. Additionally, convention density and community ID can be pre-looked-up in O(1) maps, making each comparison O(1).
**Warning signs:** Bootstrap taking >5 minutes on medium codebases (~5K files).

### Pitfall 3: Priority 2.5 Not Sorting Correctly
**What goes wrong:** The budget composer sorts by priority ascending. A priority of 2.5 should sort between 2 (conventions) and 3 (blast radius). If the sort function uses integer comparison or string comparison, 2.5 may sort incorrectly.
**Why it happens:** JavaScript sort with `(a, b) => a.priority - b.priority` handles floats correctly. But if someone changes the priority type to integer, fractional priorities break.
**How to avoid:** The existing `composeBudgetedMessage()` uses `a.priority - b.priority` numeric comparison, which handles 2.5 correctly. Verify with a test that includes items at priorities 1, 2, 2.5, and 3.
**Warning signs:** Reference suggestion appearing before conventions or after blast radius.

### Pitfall 4: Violation Index Stale After Incremental Rebuild
**What goes wrong:** After incremental rebuild only reparses changed files, but the violation index was built from the full bootstrap scan. Changed files may have new violations not reflected in the index.
**Why it happens:** `generateInjectionArtifacts()` is called after both full bootstrap and incremental rebuild, but the violation index builder needs the full convention scan data which may not be refreshed during incremental.
**How to avoid:** The violation index builder should read from the conventions.md file (which IS updated during incremental rebuild) and the graph DB (which IS updated). Do NOT cache violation data in memory across bootstraps.
**Warning signs:** Validation warnings referencing conventions or types that no longer exist after code changes.

### Pitfall 5: PostToolUse Hook Checking Wrong File Content
**What goes wrong:** The PostToolUse hook receives `tool_input.file_path` and optionally `tool_input.content` or `tool_input.new_string`. For VALID-02 (type name checking) and VALID-03 (import path checking), the hook needs to check what was actually written.
**Why it happens:** With pre-computed violations, the hook can only check if the FILE has known violations, not if the specific EDIT introduced new ones. This is by design (D-14: no runtime analysis).
**How to avoid:** The violation index stores per-file violations detected at bootstrap time. The hook simply reports these. It does NOT try to parse the newly written content. This is advisory ("this file has known deviations") not real-time validation.
**Warning signs:** Hook trying to parse `tool_input.content` with regex or AST tools.

### Pitfall 6: Scorecard Git Diff Fails on Fresh Repos
**What goes wrong:** `git diff --name-only HEAD` fails when there are no commits yet, or when the user has staged changes with `git add` but the diff shows nothing.
**Why it happens:** The detect-changes tool uses `git diff --name-only HEAD` which requires at least one commit.
**How to avoid:** The existing `getWorkingDirChanges()` in `src/tools/detect-changes.ts` already handles this with try/catch returning empty array. The scorecard should handle the empty-changes case gracefully (return perfect score with "no changes detected" note).
**Warning signs:** Scorecard throwing errors on new repositories.

### Pitfall 7: Eval Skill Mode 1 Revert Loses User Work
**What goes wrong:** Mode 1 runs a task and then reverts via `git stash`. If the user had uncommitted changes before running Mode 1, those changes get stashed too and dropped.
**Why it happens:** `git stash --include-untracked` captures ALL uncommitted work, not just the eval task's changes.
**How to avoid:** Mode 1 should check for existing uncommitted changes BEFORE starting. If changes exist, warn the user and refuse to run (or offer to stash user changes first and restore after). Per D-18, revert happens "when user opts in."
**Warning signs:** User losing their work-in-progress after running eval Mode 1.

### Pitfall 8: Type Duplication Drift
**What goes wrong:** Types defined in `src/artifacts/types.ts` and duplicated in `src/hooks/lib/types.ts` drift apart when one is updated but not the other. Hook reads JSON with one schema, builder writes with another.
**Why it happens:** No automated mechanism enforces synchronization between the two type definitions.
**How to avoid:** Add a comment cross-referencing the other file. Write a test that validates the JSON output from the builder can be parsed by the hook's type (integration test with shared fixture).
**Warning signs:** Hook silently returning null/undefined when reading a new artifact field.

## Code Examples

### Reference Index Builder Structure
```typescript
// Source: Pattern from src/artifacts/danger-zone-index.ts + D-02 decisions
import type { Database as DatabaseType } from "better-sqlite3";
import { loadGraphFromSQLite, computeCentrality, runCommunityDetection } from "../graph/analytics.js";
import { classifyFileRole } from "../classifier/file-role.js";
import { isNoiseFile } from "../conventions/golden-files.js";
import type { ReferenceIndex } from "./types.js";

export function buildReferenceIndex(
  db: DatabaseType,
  codescopeDir: string,
): ReferenceIndex {
  const graph = loadGraphFromSQLite(db);
  const { centralities } = computeCentrality(graph);
  const { communities } = runCommunityDetection(graph, db);

  // 1. Collect all file nodes with role + community + convention data
  // 2. Filter out noise files (isNoiseFile)
  // 3. Group by file role (classifyFileRole)
  // 4. For each file, find top-1 reference among same-role files using weighted similarity
  // 5. Build index: { files: { "path": { referencePath, roleLabel, similarityScore } } }

  const files: Record<string, { referencePath: string; roleLabel: string; score: number }> = {};

  // ... implementation ...

  return { generated: new Date().toISOString(), files };
}
```

### Violation Index Builder Structure
```typescript
// Source: Pattern from D-08, D-09, D-11, D-12, D-13
import type { Database as DatabaseType } from "better-sqlite3";
import type { ViolationIndex, ViolationEntry } from "./types.js";
import { parseDetectorConventions } from "../conventions/parser.js";

export function buildViolationIndex(
  db: DatabaseType,
  codescopeDir: string,
): ViolationIndex {
  // 1. Read conventions.md and parse with canonical parser
  // 2. Filter to HIGH-CONF only (D-11)
  // 3. For each file, detect deviations from HIGH-CONF conventions
  // 4. Extract type names from graph (kind='type' or 'interface')
  // 5. Extract resolved import targets from edges table
  // 6. Build per-file violation entries

  const files: Record<string, ViolationEntry[]> = {};

  return { generated: new Date().toISOString(), files };
}
```

### Hook Extension for Reference Suggestion
```typescript
// Source: Pattern from src/hooks/pre-tool-use.ts lines 80-133
// Add after Priority 2 (conventions) block, before Priority 3 (blast radius):

// Priority 2.5: Reference suggestion
const refEntry = artifacts.references?.files[relPath];
if (refEntry) {
  items.push({
    priority: 2.5,
    content: `Reference: see \`${refEntry.referencePath}\` for this codebase's ${refEntry.roleLabel} pattern`,
  });
}
```

### Hook Extension for Validation Warnings
```typescript
// Source: Pattern from src/hooks/post-tool-use.ts lines 69-98
// Add BEFORE Priority 2 (convention reminder) block:

// Priority 1: Validation warnings (advisory, per D-10, D-15)
const violations = artifacts.violations?.files[relPath];
if (violations && violations.length > 0) {
  const lines = [`[VALIDATION] ${violations.length} deviation(s) in ${relPath}:`];
  for (const v of violations.slice(0, 3)) { // Cap at 3 to stay within budget
    lines.push(`  - ${v.ruleId}: detected \`${v.detected}\`, expected \`${v.expected}\` (line ${v.line})`);
  }
  if (violations.length > 3) {
    lines.push(`  ... and ${violations.length - 3} more`);
  }
  items.push({ priority: 1, content: lines.join("\n") });
}
```

### Deterministic Scorecard Structure
```typescript
// Source: Pattern from src/bootstrap/readiness.ts + D-17, D-20, D-21
export interface DeterministicScorecard {
  conventionAdherence: { percent: number; violatingFiles: number; totalFiles: number };
  blastRadius: { totalAffected: number; normalized: number; riskBreakdown: Record<string, number> };
  violationCount: { total: number; byRule: Record<string, number> };
  importCorrectness: { percent: number; broken: number; total: number };
  riskFilesModified: { count: number; files: string[] };
  composite: { percent: number; grade: string };
}

export function computeCompositeScore(
  conventionAdherence: number,
  blastRadius: number,
  violationImpact: number,
  importCorrectness: number,
): { percent: number; grade: string } {
  const raw = (conventionAdherence * 0.25) + (blastRadius * 0.25) +
              (violationImpact * 0.25) + (importCorrectness * 0.25);
  const percent = Math.round(Math.max(0, Math.min(100, raw)));
  // Grade mapping per D-21
  const grade = percent >= 90 ? 'A' : percent >= 85 ? 'B+' : percent >= 80 ? 'B' :
                percent >= 70 ? 'C+' : percent >= 60 ? 'C' : 'F';
  return { percent, grade };
}
```

### Artifact Reader Extension
```typescript
// Source: src/hooks/lib/artifact-reader.ts - extend readAllArtifacts
export interface ArtifactData {
  dangerZones: DangerZoneIndex | null;
  conventions: ConventionIndex | null;
  blastRadius: BlastRadiusIndex | null;
  references: ReferenceIndex | null;     // NEW
  violations: ViolationIndex | null;     // NEW
}

export function readAllArtifacts(injectionDir: string): ArtifactData {
  // ... existing reads ...
  const references = readJsonSafe<ReferenceIndex>(
    join(injectionDir, "references-index.json"),
  );
  const violations = readJsonSafe<ViolationIndex>(
    join(injectionDir, "convention-violations.json"),
  );
  return { dangerZones, conventions, blastRadius, references, violations };
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| LLM-based eval only | Deterministic + LLM eval | Phase 19 | Deterministic scorecard provides instant, free, reproducible scoring; LLM eval remains for semantic judgment |
| Convention reminders only (PostToolUse) | Validation warnings + convention reminders | Phase 19 | Proactive deviation detection rather than passive reminders |
| No reference suggestions | Pre-computed reference injection | Phase 19 | Claude gets structural context before writing code |

## Open Questions

1. **Same-Role-Only vs All-Pairs Similarity**
   - What we know: D-03 scopes candidates by file role. D-02 says same-role matching.
   - What's unclear: For `general` role files (fallback classification with confidence 0.50), should we compare against all other `general` files? The `general` bucket could be large.
   - Recommendation: Compare `general` files against all non-noise files since the role classification is low-confidence. This is in Claude's discretion per CONTEXT.md.

2. **Violation Index Scope for Type Names (VALID-02)**
   - What we know: D-12 says pre-compute detected type names and store in violations index.
   - What's unclear: The graph stores type/interface nodes with names. But the "violation" is when written code uses a WRONG type name. Pre-computing this requires knowing which type the file SHOULD use vs what it DOES use.
   - Recommendation: Store a lookup of all known type names per file (from imports + local declarations). The hook can then flag if the written code references a type name that doesn't exist in the codebase at all (typo detection). This is a subset of VALID-02 but achievable with pre-computed data.

3. **Import Correctness Metric for Files Not in Graph**
   - What we know: Some changed files may not have nodes in the graph (new files, files outside the scanned directory).
   - What's unclear: How should the scorecard handle import correctness for files not in the graph?
   - Recommendation: Score unknown files as 100% correct (assume correct until proven otherwise). Flag with a note that these files were not analyzed.

4. **Complementary MCP Tool for On-Demand Validation**
   - What we know: CONTEXT.md lists this as Claude's discretion.
   - What's unclear: Whether an MCP tool adds value beyond what hooks provide.
   - Recommendation: Skip for Phase 19. The hooks provide proactive validation. An MCP tool would require the user to explicitly call it, which is lower value. Revisit if users request deeper on-demand analysis.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest ^4.1.0 |
| Config file | vitest.config.ts |
| Quick run command | `npx vitest run tests/{module}` |
| Full suite command | `npx vitest run` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| REF-01 | Reference index builds correctly with 4-signal similarity | unit | `npx vitest run tests/artifacts/reference-index.test.ts -x` | Wave 0 |
| REF-02 | PreToolUse hook injects reference at P2.5 | unit | `npx vitest run tests/hooks/pre-tool-use.test.ts -x` | Exists (extend) |
| REF-03 | Noise files excluded from reference candidates | unit | `npx vitest run tests/artifacts/reference-index.test.ts -x` | Wave 0 |
| VALID-01 | PostToolUse hook injects validation warnings at P1 | unit | `npx vitest run tests/hooks/post-tool-use.test.ts -x` | Exists (extend) |
| VALID-02 | Type name violations detected and stored | unit | `npx vitest run tests/artifacts/violation-index.test.ts -x` | Wave 0 |
| VALID-03 | Import path violations detected and stored | unit | `npx vitest run tests/artifacts/violation-index.test.ts -x` | Wave 0 |
| VALID-04 | Only HIGH-CONF conventions trigger violations | unit | `npx vitest run tests/artifacts/violation-index.test.ts -x` | Wave 0 |
| EVAL-01 | Deterministic scorecard computes all 6 metrics | unit | `npx vitest run tests/eval/deterministic-scorecard.test.ts -x` | Wave 0 |
| EVAL-02 | Mode 1 runs task and scores with Mode 2 logic | integration | `npx vitest run tests/eval/deterministic-scorecard.test.ts -x` | Wave 0 |
| EVAL-03 | Mode 3 placeholder shows "Coming soon" | unit | `npx vitest run tests/skills/eval.test.ts -x` | Wave 0 |
| EVAL-04 | Composite score weights and letter grades correct | unit | `npx vitest run tests/eval/deterministic-scorecard.test.ts -x` | Wave 0 |

### Sampling Rate
- **Per task commit:** `npx vitest run tests/{module-under-change} -x`
- **Per wave merge:** `npx vitest run`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `tests/artifacts/reference-index.test.ts` -- covers REF-01, REF-03
- [ ] `tests/artifacts/violation-index.test.ts` -- covers VALID-01, VALID-02, VALID-03, VALID-04
- [ ] `tests/eval/deterministic-scorecard.test.ts` -- covers EVAL-01, EVAL-02, EVAL-04
- [ ] Extend `tests/hooks/pre-tool-use.test.ts` -- covers REF-02
- [ ] Extend `tests/hooks/post-tool-use.test.ts` -- covers VALID-01
- [ ] `tests/artifacts/generator.test.ts` -- extend for 2 new builders (exists, extend)

## Environment Availability

Step 2.6: SKIPPED (no external dependencies identified). Phase 19 is purely code/config changes using existing project dependencies. All computation is local -- no external services, databases, or CLI tools beyond what's already installed.

## Sources

### Primary (HIGH confidence)
- `src/hooks/pre-tool-use.ts` - Existing PreToolUse hook pattern, priority injection, build isolation
- `src/hooks/post-tool-use.ts` - Existing PostToolUse hook pattern, advisory output
- `src/hooks/lib/budget-composer.ts` - Token budget composition with priority queue
- `src/hooks/lib/artifact-reader.ts` - Artifact loading pattern
- `src/hooks/lib/types.ts` - Hook type definitions, build isolation duplication pattern
- `src/artifacts/generator.ts` - Artifact generation orchestration, atomic writes
- `src/artifacts/convention-index.ts` - Convention index builder pattern
- `src/artifacts/danger-zone-index.ts` - Danger zone index builder pattern (graph-dependent)
- `src/artifacts/blast-radius-index.ts` - Blast radius index builder pattern (graph-dependent)
- `src/artifacts/types.ts` - Artifact type definitions
- `src/conventions/golden-files.ts` - `isNoiseFile()`, `rankGoldenFiles()` convention density
- `src/classifier/file-role.ts` - `classifyFileRole()` 3-tier signal chain
- `src/classifier/types.ts` - FileRole type, RULE_ROLE_APPLICABILITY
- `src/graph/analytics.ts` - `loadGraphFromSQLite()`, `computeCentrality()`, `runCommunityDetection()`, `blastRadius()`
- `src/graph/schema.ts` - Database schema, nodes/edges/communities tables
- `src/eval/eval-agent.ts` - Existing LLM eval agent pattern
- `src/eval/types.ts` - Eval type definitions
- `src/tools/detect-changes.ts` - Git diff parsing, risk classification
- `src/tools/blast-radius.ts` - Blast radius MCP tool
- `src/tools/conventions.ts` - Conventions MCP tool
- `src/tools/eval.ts` - Eval MCP tool (lightweight entry point)
- `src/bootstrap/readiness.ts` - `percentToGrade()`, multi-dimensional scoring pattern
- `src/conventions/parser.ts` - Canonical convention parser
- `src/conventions/rule-metadata.ts` - Rule metadata pure data module
- `src/enforcement/pre-commit-check.ts` - Convention check subprocess pattern

### Secondary (MEDIUM confidence)
- `hooks/hooks.json` - Hook registration configuration
- `skills/review/SKILL.md` - Skill file structure pattern
- `skills/orient/SKILL.md` - Complex skill file pattern
- `.claude-plugin/plugin.json` - Plugin manifest structure
- `vitest.config.ts` - Test configuration
- `tests/hooks/pre-tool-use.test.ts` - Hook test fixture pattern

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - No new dependencies, all existing libraries verified and in use
- Architecture: HIGH - All patterns well-established in codebase with multiple existing examples
- Pitfalls: HIGH - Identified from actual codebase patterns (build isolation, O(N^2) similarity, type duplication)
- Code examples: HIGH - Based on actual source code patterns read during research

**Research date:** 2026-03-30
**Valid until:** 2026-04-30 (stable -- no external dependency changes expected)

## Project Constraints (from CLAUDE.md)

- **Tech stack:** TypeScript, web-tree-sitter WASM (not node-tree-sitter), ast-grep CLI, better-sqlite3, graphology, vitest
- **Performance:** Bootstrap <5 min for 100K LOC, graph queries <100ms, plugin startup <5K tokens
- **Quality:** Convention false positive rate <5% (high-confidence)
- **Testing:** Always write and run tests. Task not done until tests pass. Run full regression suite.
- **TypeScript:** Handle both ESM and CJS imports
- **Build isolation:** Hooks must not import from heavy modules (better-sqlite3, graphology, web-tree-sitter)
- **Stale dist/ builds:** Rebuild before verification
- **GSD workflow:** Start work through GSD commands
