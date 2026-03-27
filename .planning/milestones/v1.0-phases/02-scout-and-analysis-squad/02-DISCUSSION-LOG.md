# Phase 2: Scout and Analysis Squad - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-03-22
**Phase:** 02-scout-and-analysis-squad
**Areas discussed:** Agent orchestration, Convention detection, Graph analytics, Output artifacts, Testing strategy, Performance bounds, Python support depth

---

## Agent Orchestration

### Invocation approach

| Option | Description | Selected |
|--------|-------------|----------|
| Skill orchestrator | /codescope:bootstrap is a skill that runs as orchestrator — spawns agents via Task tool, reads results from filesystem | ✓ |
| MCP tool orchestrator | A codescope_bootstrap MCP tool handles orchestration — adds MCP round-trip overhead | |
| Hybrid skill + helper | Skill handles sequencing, delegates prompt construction to TypeScript helper | |

**User's choice:** Skill orchestrator
**Notes:** Matches D-45 pattern from Phase 1

### Prompt structure

| Option | Description | Selected |
|--------|-------------|----------|
| Inline in skill body | Each agent's prompt written directly in skill markdown | ✓ |
| Separate prompt files | Each agent gets its own prompt template file | |
| TypeScript prompt builders | Prompts constructed programmatically in TypeScript | |

**User's choice:** Inline in skill body
**Notes:** Matches Phase 1's onboard skill pattern (D-79)

### Failure handling

| Option | Description | Selected |
|--------|-------------|----------|
| Skip and continue | Log failure, skip artifact, continue with remaining agents | ✓ |
| Retry once then skip | Retry failed agent once, then skip | |
| Abort bootstrap | Abort entire bootstrap if any agent fails | |

**User's choice:** Skip and continue
**Notes:** Matches D-20 graceful degradation

### Scout vs detectProject

| Option | Description | Selected |
|--------|-------------|----------|
| Extend detectProject | Scout reads detectProject output and enriches it | ✓ |
| Standalone Scout agent | Scout does full scan from scratch | |
| No Scout agent | Fold LOC/framework detection into Researcher | |

**User's choice:** Extend detectProject

### Phase 2 scope

| Option | Description | Selected |
|--------|-------------|----------|
| Individual agents only | Build each agent as callable module, Phase 3 wires into bootstrap | ✓ |
| Full bootstrap skill | Deliver complete bootstrap skill including orchestration | |

**User's choice:** Individual agents only

### Infrastructure access

| Option | Description | Selected |
|--------|-------------|----------|
| Direct import in agent code | Agents import from src/parser, src/resolver, src/graph directly | ✓ |
| MCP tool wrappers | Agents use MCP tools to interact with infrastructure | |
| CLI scripts | Agent logic as CLI scripts spawned via Bash | |

**User's choice:** Direct import in agent code

### ast-grep approach

| Option | Description | Selected |
|--------|-------------|----------|
| CLI via Bash | Agent runs sg scan via Bash tool, rules in YAML | ✓ |
| @ast-grep/napi | Programmatic API in TypeScript | |
| You decide | Let Claude choose | |

**User's choice:** CLI via Bash

---

## Convention Detection

### Pattern definition

| Option | Description | Selected |
|--------|-------------|----------|
| Bundled rule library | Curated set of ast-grep YAML rules, ship with plugin | ✓ |
| Agent-generated rules | Agent dynamically writes rules from observations | |
| Hybrid: bundled + dynamic | Bundled for common, agent generates for project-specific | |

**User's choice:** Bundled rule library

### Adoption metrics

| Option | Description | Selected |
|--------|-------------|----------|
| File-count ratio | Adoption % = files matching / total applicable files | ✓ |
| Instance-count ratio | Adoption % = instances of pattern / total instances | |
| Weighted hybrid | Combine file-count and instance-count with weights | |

**User's choice:** File-count ratio

### Golden file selection

| Option | Description | Selected |
|--------|-------------|----------|
| Highest convention density | Rank files by conventions followed, top 3-5 | ✓ |
| Recent + high-density | Filter to last 6 months, then rank by density | |
| You decide | Let Claude determine | |

**User's choice:** Highest convention density

### Conflict detection

| Option | Description | Selected |
|--------|-------------|----------|
| Competing pattern pairs | Define known pairs in rule library, flag when both >20% | ✓ |
| Automatic clustering | Cluster patterns by category, flag >1 above 20% | |
| You decide | Let Claude determine | |

**User's choice:** Competing pattern pairs

### TS/JS rule categories

| Option | Description | Selected |
|--------|-------------|----------|
| Core patterns | Error handling, imports, async, exports, components (~15-20 rules) | ✓ |
| Comprehensive | Core + naming, file org, tests, state mgmt (~30-40 rules) | |
| Minimal | Just error handling, imports, exports (~5-8 rules) | |

**User's choice:** Core patterns

### Trend detection

| Option | Description | Selected |
|--------|-------------|----------|
| Snapshot only for v1 | Calculate from current state, mark all as Stable | ✓ |
| Git-based trends | Compare recent vs all files via git log | |
| You decide | Let Claude decide | |

**User's choice:** Snapshot only for v1

---

## Graph Analytics

### Runtime

| Option | Description | Selected |
|--------|-------------|----------|
| graphology in-memory | Load from SQLite, run algorithms, write results back | ✓ |
| Pure SQLite | Implement as SQL queries (recursive CTEs) | |
| You decide | Let Claude choose | |

**User's choice:** graphology in-memory

### Danger zone identification

| Option | Description | Selected |
|--------|-------------|----------|
| Multi-signal scoring | Combine centrality, cross-boundary edges, file complexity | ✓ |
| Centrality threshold only | Files above centrality percentile | |
| You decide | Let Claude determine | |

**User's choice:** Multi-signal scoring

### Graph population

| Option | Description | Selected |
|--------|-------------|----------|
| Dedicated graph builder module | New src/graph/builder.ts, separation of building vs analyzing | ✓ |
| Risk Analyzer does everything | All-in-one agent | |
| You decide | Let Claude determine | |

**User's choice:** Dedicated graph builder module

### Blast radius API

| Option | Description | Selected |
|--------|-------------|----------|
| Module-level API | src/graph/analytics.ts with blastRadius(nodeId, maxHops) | ✓ |
| SQLite stored procedure | Pre-compute and store in table | |
| You decide | Let Claude determine | |

**User's choice:** Module-level API

### graphology persistence

| Option | Description | Selected |
|--------|-------------|----------|
| Load on demand | Load when needed, discard after | ✓ |
| Persistent in-memory | Keep loaded in MCP server process | |
| You decide | Let Claude determine | |

**User's choice:** Load on demand

### Community storage

| Option | Description | Selected |
|--------|-------------|----------|
| SQLite communities table | node_id, community_id, modularity_class (human-readable label) | ✓ |
| Just community_id | Numeric only, no labels | |
| You decide | Let Claude determine | |

**User's choice:** SQLite communities table with human-readable labels

---

## Output Artifacts

### Format

| Option | Description | Selected |
|--------|-------------|----------|
| Structured markdown | Consistent sections, headers, tables, YAML frontmatter | ✓ |
| YAML data files | Pure data as .yml | |
| Hybrid YAML + markdown | Data-heavy as YAML, narrative as markdown | |

**User's choice:** Structured markdown

### Overview detail level

| Option | Description | Selected |
|--------|-------------|----------|
| ~200 lines, scannable | Structure, frameworks, entry points, key dirs, tests | ✓ |
| Comprehensive deep-dive | 400+ lines covering architecture in detail | |
| Minimal summary | ~50 lines, just frameworks and entry points | |

**User's choice:** ~200 lines, scannable

### Convention evidence

| Option | Description | Selected |
|--------|-------------|----------|
| Top 3 examples per convention | Adoption %, trend, 3 file:line references | ✓ |
| File list only | Matching files but no line references | |
| No evidence | Just name, adoption %, trend | |

**User's choice:** Top 3 examples per convention

### Learnings initialization

| Option | Description | Selected |
|--------|-------------|----------|
| Empty with schema | Header/schema structure, no entries | ✓ |
| Seed with bootstrap observations | 3-5 initial observations | |
| You decide | Let Claude decide | |

**User's choice:** Empty with schema

---

## Testing Strategy

### Test approach

| Option | Description | Selected |
|--------|-------------|----------|
| Unit + fixture project | Unit tests with vitest + fixture project with known patterns | ✓ |
| Unit tests only | Mock filesystem and parser output | |
| Integration-heavy | Test against real open-source repos | |

**User's choice:** Unit + fixture project

### Accuracy validation

| Option | Description | Selected |
|--------|-------------|----------|
| Fixture with ground truth | Fixture with intentional patterns + violations, assert match | ✓ |
| Manual spot-check | Run on CodeScope itself, manually verify | |
| You decide | Let Claude determine | |

**User's choice:** Fixture with ground truth

---

## Performance Bounds

### File walking

| Option | Description | Selected |
|--------|-------------|----------|
| Glob + gitignore respect | Glob patterns, respect .gitignore, batch processing | ✓ |
| Streaming walk | Stream directory entries without full file list | |
| You decide | Let Claude choose | |

**User's choice:** Glob + gitignore respect

### Progress reporting

| Option | Description | Selected |
|--------|-------------|----------|
| Agent-level status | Report which agent is running and completion time | ✓ |
| File-level progress | Report per-file progress within agents | |
| Silent until done | No progress reporting | |

**User's choice:** Agent-level status

---

## Python Support Depth

### Python convention rules

| Option | Description | Selected |
|--------|-------------|----------|
| Minimal parity | 3-5 rules (import style, class patterns, error handling, type hints) | ✓ |
| Full parity | Match TS/JS rule count with Python equivalents | |
| TS/JS only for v1 | Skip Python convention rules entirely | |

**User's choice:** Minimal parity

---

## Claude's Discretion

No areas deferred to Claude's discretion — all gray areas received explicit user decisions.

## Deferred Ideas

- Git-based trend detection for conventions — future iteration
- Full Python convention parity — defer until usage patterns understood
- @ast-grep/napi programmatic API — defer unless CLI overhead is bottleneck
- Persistent in-memory graphology graph — revisit in Phase 3 if needed
