---
phase: 2
slug: scout-and-analysis-squad
status: draft
shadcn_initialized: false
preset: none
created: 2026-03-22
---

# Phase 2 -- UI Design Contract

> Visual and interaction contract for Phase 2. This phase produces **no graphical UI** -- CodeScope is a CLI plugin (MCP server + skills). The "user interface" consists of structured markdown artifacts consumed by humans and downstream agents, plus CLI progress output. This contract defines the formatting, structure, and copy standards for those outputs.

---

## Design System

| Property | Value |
|----------|-------|
| Tool | none |
| Preset | not applicable |
| Component library | none -- backend-only phase, no visual components |
| Icon library | not applicable |
| Font | monospace terminal output (user's terminal font) |

**Rationale:** CodeScope is a Claude Code plugin. All Phase 2 output is structured markdown files written to `.claude/codescope/` and CLI text printed to the terminal. There is no browser-rendered UI, no React components, no CSS. The design contract below governs markdown artifact structure and terminal output formatting.

---

## Spacing Scale

Not applicable for this phase. No pixel-based layout exists.

**Markdown structural spacing rules:**

| Token | Markdown Equivalent | Usage |
|-------|---------------------|-------|
| section-break | `\n---\n` (horizontal rule) | Between major artifact sections |
| heading-gap | One blank line before `##` heading | Before each section heading |
| list-gap | No blank lines between list items | Within bulleted or numbered lists |
| table-gap | One blank line before and after tables | Surrounding all markdown tables |
| paragraph-gap | One blank line between paragraphs | Between prose blocks |

Exceptions: YAML frontmatter blocks use `---` delimiters with no blank line after the closing `---`.

---

## Typography

Not applicable for this phase. No font-size or font-weight control exists in terminal/markdown output.

**Markdown heading hierarchy (all artifacts must follow):**

| Role | Markdown | Usage |
|------|----------|-------|
| Document title | `# Title` (H1) | Exactly one per artifact file. The artifact name. |
| Major section | `## Section` (H2) | Top-level sections within the artifact (e.g., `## Frameworks`, `## Entry Points`). |
| Subsection | `### Subsection` (H3) | Groupings within a section (e.g., `### Frontend`, `### Backend` under `## Services`). |
| Detail | `**Bold label:**` inline | Key-value pairs within prose. Never use H4+ headings. |

**Prose rules:**

- Maximum line length: no hard wrap (markdown files are rendered, not read raw in 80-col terminals).
- Lists preferred over paragraphs for scannable content.
- Tables required for structured multi-column data (adoption %, file counts, centrality scores).
- Code references use backtick inline code: `src/parser/extract.ts`, not bare paths.

---

## Color

Not applicable for this phase. No hex colors, no theming.

**Severity/classification markers (text-based):**

| Classification | Marker | Usage |
|----------------|--------|-------|
| High risk | `[HIGH]` prefix or Red hop-0 | Danger zone files, blast radius hop 0 |
| Medium risk | `[MEDIUM]` prefix or Orange hop-1 | Blast radius hop 1 |
| Low risk | `[LOW]` prefix or Yellow hop-2 | Blast radius hop 2 |
| Safe | `[SAFE]` prefix or Green hop-3+ | Blast radius hop 3+ |
| Conflict | `[CONFLICT]` prefix | Convention conflicts (>20% competing patterns) |
| High confidence | `[HIGH-CONF]` | Conventions with >80% adoption and >10 files |

These text markers are machine-parseable by downstream agents (Phase 3 MCP tools, Phase 4 orient, Phase 6 eval).

---

## Copywriting Contract

### Artifact: service-manifest.md (Scout output, BOOT-01/02)

| Element | Copy |
|---------|------|
| Document title | `# Service Manifest` |
| YAML frontmatter keys | `generated`, `scout_duration_ms`, `project_type` |
| Service table columns | `Service`, `Path`, `LOC (approx)`, `Languages`, `Frameworks`, `Entry Points` |
| Empty state (no services) | `## Services\n\nSingle-service project. See root-level analysis artifacts.` |
| CI/CD section heading | `## CI/CD` |
| CI/CD empty state | `No CI/CD configuration detected.` |

### Artifact: overview.md (Researcher output, BOOT-04)

| Element | Copy |
|---------|------|
| Document title | `# Codebase Overview` |
| YAML frontmatter keys | `generated`, `service` (if per-service) |
| Required sections (in order) | `## Project Structure`, `## Frameworks and Libraries`, `## Entry Points`, `## Key Directories`, `## Test Setup`, `## Build and Deploy` |
| Target length | ~200 lines. Scannable bullet-point format. A map, not a tutorial. |
| Empty section fallback | `Not detected.` (single line, no further explanation) |

### Artifact: conventions.md (Convention Detector output, BOOT-05/06/10)

| Element | Copy |
|---------|------|
| Document title | `# Conventions` |
| YAML frontmatter keys | `generated`, `total_rules_evaluated`, `total_conventions_detected`, `false_positive_target` |
| Convention entry format | `### {Convention Name}\n\n| Metric | Value |\n|--------|-------|\n| Adoption | {N}% ({files matching}/{total applicable files}) |\n| Confidence | {HIGH-CONF/MEDIUM-CONF/LOW-CONF} |\n| Trend | Stable |\n| Category | {error-handling/imports/async/exports/components/...} |\n\n**Evidence:**\n- \`{file1}:{line}\` -- {brief description}\n- \`{file2}:{line}\` -- {brief description}\n- \`{file3}:{line}\` -- {brief description}` |
| Conflict entry format | `### [CONFLICT] {Pattern A} vs {Pattern B}\n\n{Pattern A}: {N}% adoption\n{Pattern B}: {M}% adoption\n\nBoth patterns exceed 20% adoption. Resolution recommended before enforcement.` |
| Empty state | `No conventions detected with sufficient adoption (>10 files required).` |

### Artifact: golden-files.md (Convention Detector output, BOOT-10)

| Element | Copy |
|---------|------|
| Document title | `# Golden Files` |
| YAML frontmatter keys | `generated`, `selection_criteria` |
| Entry format | Ranked list: `1. \`{file_path}\` -- {N}/{M} conventions followed ({percentage}%)` |
| Selection criteria line | `Files ranked by modern pattern density (conventions followed / conventions applicable).` |
| Empty state | `No golden files identified. Insufficient convention data for ranking.` |

### Artifact: danger-zones.md (Risk Analyzer output, BOOT-07/08)

| Element | Copy |
|---------|------|
| Document title | `# Danger Zones` |
| YAML frontmatter keys | `generated`, `total_nodes`, `total_edges`, `communities_detected` |
| Required sections (in order) | `## High-Centrality Nodes`, `## Cross-Boundary Dependencies`, `## Risk Summary` |
| Danger zone entry format | `| Rank | File | In-Degree | Communities Touched | Risk Score |\n|------|------|-----------|---------------------|------------|` |
| Blast radius format | `### Blast Radius: \`{node}\`\n\n| Hop | Classification | Files |\n|-----|----------------|-------|\n| 0 | Red (direct) | \`{file}\` |\n| 1 | Orange (1 hop) | \`{file1}\`, \`{file2}\` |\n| 2 | Yellow (2 hops) | ... |\n| 3+ | Green (3+ hops) | ... |` |
| Empty state | `Knowledge graph contains insufficient edges for danger zone analysis.` |

### Artifact: learnings.md (Learning Synthesizer output, BOOT-09)

| Element | Copy |
|---------|------|
| Document title | `# Learnings` |
| YAML frontmatter keys | `generated`, `total_learnings` |
| Schema section | `## Schema\n\nEach learning entry follows this format:\n\n\`\`\`\n### {Learning Title}\n- **Status:** UNVERIFIED\n- **Type:** {gotcha/decision/pattern}\n- **Discovered:** {date}\n- **Expires:** {date based on type decay}\n- **Evidence:** {file:line or description}\n\`\`\`` |
| Initial content | `## Entries\n\nNo learnings recorded yet. Learnings accumulate from completed orient-to-debug pipeline runs.` |

### CLI Progress Output (D-28)

| Element | Copy |
|---------|------|
| Agent start | `Scout running...` |
| Agent complete | `Scout complete ({N}s)` |
| Agent failure | `Scout failed: {error message}. Skipping.` |
| Agent sequence | `Scout complete (12s) -> Researcher running...` |
| Overall complete | `Analysis complete. {N}/{M} agents succeeded. Artifacts written to .claude/codescope/` |
| Overall with failures | `Analysis complete with errors. {N}/{M} agents succeeded. Missing artifacts: {list}. Partial results available.` |

### Error States

| Error | Copy |
|-------|------|
| No source files found | `No parseable source files found in project. Ensure project root is correct and contains .ts, .js, or .py files.` |
| Parser initialization failure | `Failed to initialize parser: {error}. Check that WASM grammar files exist in grammars/ directory.` |
| SQLite database error | `Failed to open knowledge graph database: {error}. Check .claude/codescope/ directory permissions.` |
| ast-grep not available | `ast-grep CLI (sg) not found. Convention detection skipped. Install with: npm install -g @ast-grep/cli` |
| Agent timeout | `{Agent name} timed out after {N}s. Skipping. Partial results may be incomplete.` |

### Destructive Actions

No destructive actions exist in Phase 2. All agents are additive -- they produce new artifacts and populate database tables. No user data is deleted or overwritten (bootstrap --force is Phase 3).

---

## Registry Safety

Not applicable. No shadcn, no component registries, no third-party UI blocks.

| Registry | Blocks Used | Safety Gate |
|----------|-------------|-------------|
| none | none | not applicable |

---

## Artifact Format Contract

> This section replaces the visual component inventory for this backend-only phase. It defines the structural contract that all markdown artifacts must follow.

### YAML Frontmatter (required on all artifacts)

```yaml
---
generated: "YYYY-MM-DDTHH:mm:ss.sssZ"  # ISO 8601 timestamp
generator: "{agent-name}"                # scout | researcher | convention-detector | risk-analyzer | learning-synthesizer
phase: 2
service: "{service-name}"               # omit for single-service projects
---
```

### Section Ordering

Every artifact must have sections in the order specified in its copywriting contract above. Downstream agents rely on section heading text for grep-based extraction.

### Table Formatting

- All tables use GitHub-Flavored Markdown pipe syntax.
- Header row + separator row required.
- Numeric columns right-aligned in content (convention, not enforced by markdown).
- No empty cells -- use `--` for missing values.

### File Path References

- Always relative to project root: `src/parser/extract.ts`, not absolute paths.
- Always in backtick inline code: `` `src/parser/extract.ts` ``.
- Line references use colon separator: `` `src/parser/extract.ts:42` ``.

### Evidence Chains (conventions.md)

- Exactly 3 file:line references per convention (top 3 most representative).
- Each reference includes a brief description (under 80 characters).
- References must be actual files that exist in the project.

---

## Checker Sign-Off

- [ ] Dimension 1 Copywriting: PASS
- [ ] Dimension 2 Visuals: PASS (adapted: artifact structure contract)
- [ ] Dimension 3 Color: PASS (adapted: severity/classification markers)
- [ ] Dimension 4 Typography: PASS (adapted: markdown heading hierarchy)
- [ ] Dimension 5 Spacing: PASS (adapted: markdown structural spacing)
- [ ] Dimension 6 Registry Safety: PASS (not applicable -- no registries)

**Approval:** pending
