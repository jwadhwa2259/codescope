# Phase 1: Plugin Foundation and Infrastructure - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-03-22
**Phase:** 01-plugin-foundation-and-infrastructure
**Areas discussed:** Onboarding interaction style, Config format & defaults, First-run & install experience, Directory & naming conventions, AST parser lifecycle, Graph schema design, Plugin manifest & skill registration, MCP server behavior before bootstrap

---

## Onboarding Interaction Style

### How should /codescope:onboard present questions?

| Option | Description | Selected |
|--------|-------------|----------|
| AskUserQuestion menus | Structured menus like GSD — clean selection UI, fast, consistent with Claude Code | ✓ |
| Plain text conversation | Free-form conversational style — more flexible but slower | |
| Hybrid | Auto-detection as text, structured menus for choices | |

**User's choice:** AskUserQuestion menus
**Notes:** None

### How much auto-detection vs explicit confirmation?

| Option | Description | Selected |
|--------|-------------|----------|
| Detect and confirm | Auto-detect everything, show results for user to confirm/correct | ✓ |
| Detect and skip | Auto-detect silently, only ask about undetected items | |
| Ask everything | Minimal detection, ask for each setting | |

**User's choice:** Detect and confirm
**Notes:** None

### Returning user experience with global memory?

| Option | Description | Selected |
|--------|-------------|----------|
| Offer one-click accept | Show saved prefs, offer "Use same setup" vs "Customize" | ✓ |
| Pre-fill and walk through | Pre-fill menus with saved values but still walk through each step | |
| Always start fresh | Ignore global memory during onboarding | |

**User's choice:** Offer one-click accept
**Notes:** None

### What happens when detection fails?

| Option | Description | Selected |
|--------|-------------|----------|
| Fall back to manual entry | Show what was found, let user manually specify via menus | ✓ |
| Warn and proceed with defaults | Warning + sensible defaults, edit config later | |
| Block until resolved | Refuse to continue if key info can't be detected | |

**User's choice:** Fall back to manual entry
**Notes:** None

### Single skill or separate phases?

| Option | Description | Selected |
|--------|-------------|----------|
| Single skill, all phases | One /codescope:onboard runs detection → models → preferences | ✓ |
| Phased with resume | Single skill but tracks progress, resumes on re-invocation | |
| Separate sub-skills | Individual skills for detect, models, prefs | |

**User's choice:** Single skill, all phases
**Notes:** None

### Model selection presentation?

| Option | Description | Selected |
|--------|-------------|----------|
| Show defaults, offer override | Display recommended models, accept all or change specific ones | ✓ |
| Preset profiles | 2-3 profiles (Budget/Balanced/Quality), one-click selection | |
| Per-agent menu | Walk through each of 6 agents individually | |

**User's choice:** Show defaults, offer override
**Notes:** None

### Prerequisite validation?

| Option | Description | Selected |
|--------|-------------|----------|
| Check and block on critical | Block on critical prerequisites (Node.js 22+, WASM), warn on non-critical | ✓ |
| Check and warn only | Originally recommended — user pushed back: "Why would you recommend only a warn for critical things?" | |
| Check and block on everything | Block on any missing prerequisite | |
| Skip checks | Check at bootstrap time only | |

**User's choice:** Check and block on critical
**Notes:** User challenged the initial "warn only" recommendation. Changed to block on critical prerequisites. Good feedback — critical means critical.

### Onboarding output?

| Option | Description | Selected |
|--------|-------------|----------|
| Config + next steps | Write config, show summary + prompt to run /codescope:bootstrap | ✓ |
| Config only | Write config silently | |
| Config + dry-run preview | Write config, show preview of what bootstrap will do | |

**User's choice:** Config + next steps
**Notes:** None

### Re-onboarding behavior?

| Option | Description | Selected |
|--------|-------------|----------|
| Offer update or reset | Detect existing config, ask "Update" or "Start fresh" | ✓ |
| Redirect to /codescope:settings | Tell user config exists, suggest settings command | |
| Silently overwrite | Run full flow, overwrite config | |

**User's choice:** Offer update or reset
**Notes:** None

---

## Config Format & Defaults

### Config file format?

| Option | Description | Selected |
|--------|-------------|----------|
| config.yml — pure YAML | Standard YAML file, best editor support, human-editable | ✓ |
| config.md — YAML in markdown | Spec's original format, uniform .md extension | |
| config.json — JSON | Native to Node.js, no parser dep, but no comments | |
| TOML | Clean syntax, less common in Node.js ecosystem | |

**User's choice:** config.yml — pure YAML
**Notes:** User asked "What would you recommend instead?" — Claude recommended YAML over spec's config.md because config is machine-parsed data, not documentation. YAML gives editor support, validation, and is the standard for dev tool config.

### What does "inherited" mean for model selection?

| Option | Description | Selected |
|--------|-------------|----------|
| Use session's model | Sub-agent runs on same model as user's Claude Code session | ✓ |
| Default to Sonnet | Map "inherited" to Sonnet as middle ground | |
| Ask during onboarding | Force user to choose concrete model for every slot | |

**User's choice:** Use session's model
**Notes:** None

### Default workflow preferences?

| Option | Description | Selected |
|--------|-------------|----------|
| Thorough defaults | Brief verbosity, thorough clarification, interactive eval, suggest conventions | ✓ |
| Minimal defaults | Brief verbosity, minimal clarification, auto-debug, suggest conventions | |
| You decide | Claude's discretion | |

**User's choice:** Thorough defaults
**Notes:** None

### Environment-specific overrides?

| Option | Description | Selected |
|--------|-------------|----------|
| No overrides for v1 | Single config.yml, no environment variants | ✓ |
| Support env sections | Optional environment blocks in config | |

**User's choice:** No overrides for v1
**Notes:** CI/CD integration is out of scope for v1

### Schema version field?

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, include version field | schema_version: 1 at the top | ✓ |
| No version field | Handle migration by detecting missing/extra fields | |

**User's choice:** Yes, include version field
**Notes:** None

### Config validation approach?

| Option | Description | Selected |
|--------|-------------|----------|
| Zod schema validation | Full Zod schema, validates on load, clear errors | ✓ |
| Loose YAML with defaults | Read fields individually, fall back to defaults | |
| You decide | Claude's discretion | |

**User's choice:** Zod schema validation
**Notes:** None

### Git tracking for config?

| Option | Description | Selected |
|--------|-------------|----------|
| Committed to git | Team shares CodeScope config | ✓ |
| Gitignored | Personal to each developer | |
| You decide | Claude's discretion | |

**User's choice:** Committed to git
**Notes:** None

### Convention detection config?

| Option | Description | Selected |
|--------|-------------|----------|
| Config threshold + manual confirm | Config controls detection sensitivity, promotion requires user confirmation | ✓ |
| Purely manual | No threshold, flag everything | |
| You decide | Claude's discretion | |

**User's choice:** Config threshold + manual confirm
**Notes:** None

---

## First-Run & Install Experience

### First plugin load behavior?

| Option | Description | Selected |
|--------|-------------|----------|
| Auto-prompt onboarding | Suggest running /codescope:onboard | ✓ |
| Silent until invoked | Load quietly | |
| Auto-run onboarding | Start onboarding automatically | |

**User's choice:** Auto-prompt onboarding
**Notes:** None

### WASM grammar distribution?

| Option | Description | Selected |
|--------|-------------|----------|
| Prebuilt and bundled | Ship .wasm files in plugin package, zero setup | ✓ |
| Build on first use | Build via tree-sitter-cli on first bootstrap | |
| Download on first use | Download prebuilt from URL | |

**User's choice:** Prebuilt and bundled
**Notes:** None

### Runtime error handling?

| Option | Description | Selected |
|--------|-------------|----------|
| Graceful degradation with clear errors | Each capability checks independently, working tools still work | ✓ |
| Fail fast on any missing dependency | All-or-nothing MCP server startup | |
| You decide | Claude's discretion | |

**User's choice:** Graceful degradation with clear errors
**Notes:** None

### Directory structure creation timing?

| Option | Description | Selected |
|--------|-------------|----------|
| Eagerly on onboarding | Full tree during /codescope:onboard | ✓ |
| Lazily on demand | Create as needed | |
| Core eager, rest lazy | Top-level on onboard, subdirs when needed | |

**User's choice:** Eagerly on onboarding
**Notes:** None

### Gitignore strategy?

| Option | Description | Selected |
|--------|-------------|----------|
| Auto-add selective gitignore | Ignore transient (graph.db, execution/), track shareable (config.yml, conventions-enforced.md) | ✓ |
| Gitignore everything | All artifacts local-only | |
| Track everything | No gitignore | |
| Let user decide | Don't touch gitignore | |

**User's choice:** Auto-add selective gitignore
**Notes:** None

### Global memory directory creation?

| Option | Description | Selected |
|--------|-------------|----------|
| On first onboarding | Create ~/.codescope/ during first /codescope:onboard | ✓ |
| On first completed task | After first orient-execute-eval cycle | |
| On plugin install | Immediately on first load | |

**User's choice:** On first onboarding
**Notes:** None

### Health check approach?

| Option | Description | Selected |
|--------|-------------|----------|
| codescope_status includes diagnostics | Status tool doubles as health check, reports everything | ✓ |
| Separate /codescope:doctor command | Dedicated diagnostic command | |
| No health check | Debug through error messages | |

**User's choice:** codescope_status includes diagnostics
**Notes:** None

---

## Directory & Naming Conventions

### Task slug generation?

| Option | Description | Selected |
|--------|-------------|----------|
| Auto-generated from description | Slugify task description, truncate ~50 chars | ✓ |
| Timestamp prefix + slug | Date + slug for chronological sorting | |
| Sequential numbering + slug | Numbered in creation order | |

**User's choice:** Auto-generated from description
**Notes:** None

### Execution artifact scoping?

| Option | Description | Selected |
|--------|-------------|----------|
| Per-task subdirectories | execution/[task-slug]/ with coordination.md and agent reports | ✓ |
| Flat with task prefix | All files at one level | |
| Overwrite each run | Latest task only | |

**User's choice:** Per-task subdirectories
**Notes:** None

### Monorepo service naming?

| Option | Description | Selected |
|--------|-------------|----------|
| Directory name from filesystem | Use actual directory name | ✓ |
| Name from package.json | Read "name" field | |
| User-defined during onboarding | Let users name services | |

**User's choice:** Directory name from filesystem
**Notes:** None

### Artifact cleanup strategy?

| Option | Description | Selected |
|--------|-------------|----------|
| Accumulate, manual cleanup | Never auto-delete, user manages | ✓ |
| Auto-archive after N tasks | Move older to archive/ | |
| Auto-delete oldest | Keep last N only | |

**User's choice:** Accumulate, manual cleanup
**Notes:** None

### Usage tracking level?

| Option | Description | Selected |
|--------|-------------|----------|
| Full task history | Commands, descriptions, outcomes, debug cycles, models, eval scores, timing. Structured YAML/JSONL. | ✓ |
| Full history + per-agent breakdown | Above plus per-agent timing and token usage | |
| Command usage + timing only | Just commands and duration | |

**User's choice:** Full task history
**Notes:** User asked "What would you recommend? I want good tracking." Claude recommended full task history for visibility into effectiveness over time.

### Report organization?

| Option | Description | Selected |
|--------|-------------|----------|
| By task slug | reports/[task-slug].md, overwritten on re-run | ✓ |
| By task + date | reports/[task-slug]-[date].md | |
| In task subdirectories | reports/[task-slug]/[date].md | |

**User's choice:** By task slug
**Notes:** None

### Screenshot organization?

| Option | Description | Selected |
|--------|-------------|----------|
| Per-task subdirectory | reports/screenshots/[task-slug]/ | ✓ |
| Flat with task prefix | All screenshots at one level | |
| You decide | Claude's discretion | |

**User's choice:** Per-task subdirectory
**Notes:** None

### Graph database location?

| Option | Description | Selected |
|--------|-------------|----------|
| Top level | .claude/codescope/graph.db | ✓ |
| data/ subdirectory | .claude/codescope/data/graph.db | |
| You decide | Claude's discretion | |

**User's choice:** Top level
**Notes:** None

### Orient/plans/execution organization?

| Option | Description | Selected |
|--------|-------------|----------|
| Separate directories per spec | orient/, plans/, execution/ as separate dirs | ✓ |
| Unified tasks/ directory | Everything per-task in one place | |
| You decide | Claude's discretion | |

**User's choice:** Separate directories per spec
**Notes:** None

---

## AST Parser Lifecycle

### Parser instance management?

| Option | Description | Selected |
|--------|-------------|----------|
| Single parser, recreate periodically | One per language, recreate after N parses | ✓ |
| Parser pool with round-robin | Pool of N instances, round-robin | |
| Fresh parser per file | New parser per file, delete immediately | |
| You decide | Claude's discretion | |

**User's choice:** Single parser, recreate periodically
**Notes:** None

### Parse failure handling?

| Option | Description | Selected |
|--------|-------------|----------|
| Skip and log | Log path + error, skip, continue, report in summary | ✓ |
| Attempt recovery then skip | Try different encoding, truncate, then skip | |
| Fail the batch | Abort on any parse failure | |

**User's choice:** Skip and log
**Notes:** None

### API design?

| Option | Description | Selected |
|--------|-------------|----------|
| High-level with escape hatch | Primary: { imports, exports, classes, functions, variables }. Also expose raw tree. | ✓ |
| High-level only | Structured output only, no raw tree | |
| Low-level only | Raw tree, every caller traverses | |
| You decide | Claude's discretion | |

**User's choice:** High-level with escape hatch
**Notes:** None

### Large file handling?

| Option | Description | Selected |
|--------|-------------|----------|
| Shallow parse large files | Top-level only (imports, exports, declarations), no function body descent | ✓ |
| Size limit with skip | Skip files exceeding limit entirely | |
| Parse everything | No size limit | |

**User's choice:** Shallow parse large files
**Notes:** User asked "Is there a better option than skipping files or clogging our memory? Something in the middle?" Claude proposed shallow parsing as the middle ground — preserves graph edges while managing memory.

---

## Graph Schema Design

### Node granularity?

| Option | Description | Selected |
|--------|-------------|----------|
| File + symbol level | Files, classes, functions/methods, exported variables, modules | ✓ |
| File level only | Nodes are files, edges are file-to-file | |
| Fine-grained | All above plus variables, type aliases, interfaces, enums | |

**User's choice:** File + symbol level
**Notes:** None

### Node metadata?

| Option | Description | Selected |
|--------|-------------|----------|
| Store key metadata | file_path, language, LOC, last_modified, node_type | ✓ |
| Minimal nodes + on-demand | Only id, name, type, file_path | |
| Rich metadata | Above plus git blame, churn, complexity, coverage | |

**User's choice:** Store key metadata
**Notes:** None

### Multi-agent write pattern?

| Option | Description | Selected |
|--------|-------------|----------|
| JSONL queue, batch insert | Agents write JSONL, batch inserter reads and inserts | ✓ |
| WAL mode with retry | SQLite WAL + SQLITE_BUSY retry | |
| You decide | Claude's discretion | |

**User's choice:** JSONL queue, batch insert
**Notes:** Matches single-writer pattern already decided in STATE.md

### Communities table timing?

| Option | Description | Selected |
|--------|-------------|----------|
| Create table now, populate in Phase 2 | Phase 1 = schema, Phase 2 = data | ✓ |
| Create and populate in Phase 2 | Don't create until needed | |
| You decide | Claude's discretion | |

**User's choice:** Create table now, populate in Phase 2
**Notes:** None

---

## Plugin Manifest & Skill Registration

### Skill file organization?

| Option | Description | Selected |
|--------|-------------|----------|
| One file per skill | skills/onboard.md, skills/bootstrap.md, etc. | ✓ |
| Grouped by lifecycle | skills/setup/, skills/analysis/, skills/pipeline/ | |
| Single skills file | All in one file | |

**User's choice:** One file per skill
**Notes:** None

### Skill registration scope?

| Option | Description | Selected |
|--------|-------------|----------|
| Register all, stub unimplemented | All 5 skills from day one, stubs show "available after Phase N" | ✓ |
| Only functional skills | Add skills in their respective phases | |
| You decide | Claude's discretion | |

**User's choice:** Register all, stub unimplemented
**Notes:** None

### Hooks in Phase 1?

| Option | Description | Selected |
|--------|-------------|----------|
| No hooks in Phase 1 | Add hooks in phases where needed | ✓ |
| Skeleton hooks | Empty implementations now | |
| Pre-session context hook only | Load context on session startup | |

**User's choice:** No hooks in Phase 1
**Notes:** None

### MCP server build strategy?

| Option | Description | Selected |
|--------|-------------|----------|
| Built with tsdown to single JS | dist/server.js, fast startup, no runtime TS | ✓ |
| tsx for dev, tsdown for release | Two modes | |
| Always tsx | No build step, ~200ms overhead | |

**User's choice:** Built with tsdown to single JS
**Notes:** None

---

## MCP Server Behavior Before Bootstrap

### Pre-bootstrap tool responses?

| Option | Description | Selected |
|--------|-------------|----------|
| Structured error with guidance | { status: 'not_bootstrapped', message, tool } | ✓ |
| Empty results with warning | Valid but empty results + warning field | |
| Different behavior per tool | Nuanced per-tool responses | |

**User's choice:** Structured error with guidance
**Notes:** None

### Tool registration scope?

| Option | Description | Selected |
|--------|-------------|----------|
| Register all 11, gate on bootstrap | All tools visible, error before bootstrap | ✓ |
| Register progressively | Add tools across phases | |
| You decide | Claude's discretion | |

**User's choice:** Register all 11, gate on bootstrap
**Notes:** None

### codescope_status exception?

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, status always works | Reports config, bootstrap, graph, dependency health at any point | ✓ |
| Status also gated | All 11 behave the same | |
| Status + recall work early | Two tools available before bootstrap | |

**User's choice:** Yes, status always works
**Notes:** None

### Schema validation strictness?

| Option | Description | Selected |
|--------|-------------|----------|
| Strict with Zod | Reject unknown/malformed parameters | ✓ |
| Lenient, ignore unknowns | Accept extra fields silently | |
| You decide | Claude's discretion | |

**User's choice:** Strict with Zod
**Notes:** None

---

## Claude's Discretion

No areas deferred to Claude's discretion — all gray areas received explicit user decisions.

## Deferred Ideas

None — discussion stayed within phase scope.
