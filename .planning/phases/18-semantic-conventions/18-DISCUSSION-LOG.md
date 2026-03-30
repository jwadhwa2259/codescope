# Phase 18: Semantic Conventions - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md -- this log preserves the alternatives considered.

**Date:** 2026-03-30
**Phase:** 18-semantic-conventions
**Areas discussed:** Framework detection & rules, Golden file filtering, File-role classification, Safety & integration guardrails

---

## Discussion Mode

User requested research-first approach: "Lets research what the recommended options are for making this plugin useful and not breaking any feature."

Four parallel research agents were spawned:
1. **Framework detection research** -- analyzed runner.ts, existing rules, onboard/detect.ts, convention-detector.ts
2. **Golden file filtering research** -- analyzed golden-files.ts, countApplicableFiles(), cross-language bug
3. **File-role classification research** -- analyzed parser, graph schema, builder patterns, storage options
4. **Breaking risk analysis** -- traced convention data flow, identified integration points, enforcement coupling

User reviewed synthesized findings and selected: "Go with the recommended options from research" -- all recommended defaults applied across all four areas.

---

## Framework Detection & Rules (CONV-05/06)

| Option | Description | Selected |
|--------|-------------|----------|
| package.json dependency scan | Detect frameworks by scanning dependencies + devDependencies for known package names | :heavy_check_mark: |
| AST-based detection | Scan source files for framework import patterns | |
| Config file detection | Look for framework-specific config files (fastify.config.js, etc.) | |

**User's choice:** package.json dependency scan (recommended default)

| Option | Description | Selected |
|--------|-------------|----------|
| Fastify + Express + h3 | 3 frameworks matching eval test targets + most popular | :heavy_check_mark: |
| Fastify + h3 only | Just the eval-tested frameworks | |
| 5+ frameworks including React/Next.js | Broader coverage from day one | |

**User's choice:** Fastify + Express + h3 (recommended default)

| Option | Description | Selected |
|--------|-------------|----------|
| Subdirectory per framework | rules/frameworks/{name}/*.yml, only loaded when detected | :heavy_check_mark: |
| All rules in typescript/ | Framework rules mixed with generic rules, filtered by metadata | |
| Separate rules directory per language+framework | rules/typescript-fastify/, rules/typescript-express/ | |

**User's choice:** Subdirectory per framework (recommended default)

---

## Golden File & Language Filtering (CONV-03/04)

| Option | Description | Selected |
|--------|-------------|----------|
| Filename-based filtering (cheap) | Pattern match on filenames/paths only, no file content reading | :heavy_check_mark: |
| Content-based filtering | Read first 10 lines for @generated markers, @deprecated JSDoc | |
| Hybrid filename + content | Filename patterns plus content check for ambiguous files | |

**User's choice:** Filename-based filtering (recommended default)

| Option | Description | Selected |
|--------|-------------|----------|
| Hybrid (rankGoldenFiles + countApplicableFiles) | Filter in both golden ranking and file counting | :heavy_check_mark: |
| rankGoldenFiles only | Filter only at ranking time | |
| countApplicableFiles only | Filter only at counting time | |

**User's choice:** Hybrid approach (recommended default)

| Option | Description | Selected |
|--------|-------------|----------|
| Per-language density | TS density = TS followed / TS total (fix cross-language bug) | :heavy_check_mark: |
| Keep current (all conventions) | density = followed / ALL conventions regardless of language | |

**User's choice:** Per-language density (recommended default -- fixes bug)

---

## File-Role Classification (CONV-07)

| Option | Description | Selected |
|--------|-------------|----------|
| New dedicated module | src/classifier/file-role.ts with centralized logic | :heavy_check_mark: |
| Inline in runner.ts | Add classification directly in convention runner | |
| Extend builder.ts | Add role detection during graph building | |

**User's choice:** New dedicated module (recommended default)

| Option | Description | Selected |
|--------|-------------|----------|
| Post-filter (scan all, filter after) | Run all rules, then filter by file-role applicability | :heavy_check_mark: |
| Pre-filter (skip rules per file) | Determine role first, only run applicable rules | |

**User's choice:** Post-filter (recommended default -- safer)

| Option | Description | Selected |
|--------|-------------|----------|
| metadata JSON column | Store in existing metadata JSON, no schema change | :heavy_check_mark: |
| New file_role VARCHAR column | Add explicit column with migration | |
| In-memory only | Compute per session, don't persist | |

**User's choice:** metadata JSON column (recommended default)

---

## Safety & Integration Guardrails

| Option | Description | Selected |
|--------|-------------|----------|
| Refactor RULE_METADATA to shared module | Single source of truth imported by runner + rule-filter | :heavy_check_mark: |
| Keep duplication, add CI check | Validate both copies match | |

**User's choice:** Refactor to shared module (recommended default)

| Option | Description | Selected |
|--------|-------------|----------|
| Cap readiness + regression test | Cap highConfidenceConventions, test delta < 5% | :heavy_check_mark: |
| Store rule version in snapshots | Normalize deltas by baseline convention count | |

**User's choice:** Cap + regression test (recommended default)

---

## Claude's Discretion

- Recursive vs per-directory rule scanning approach
- Exact ast-grep YAML syntax for each framework rule
- Boolean vs confidence-scored file-role classification
- Whether to add barrel/middleware as additional roles

## Deferred Ideas

None -- discussion stayed within phase scope
