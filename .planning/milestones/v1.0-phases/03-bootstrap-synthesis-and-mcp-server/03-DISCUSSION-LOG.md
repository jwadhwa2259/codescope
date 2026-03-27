# Phase 3: Bootstrap Synthesis and MCP Server - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md -- this log preserves the alternatives considered.

**Date:** 2026-03-23
**Phase:** 03-bootstrap-synthesis-and-mcp-server
**Areas discussed:** AI readiness score, Bootstrap experience, Convention enforcement, MCP tool responses, Change detection behavior, Monorepo squad cap, codescope_orient tool, Bootstrap --force, Performance budget, Service map output, Tool discoverability, Verify/search tool scope

---

## AI Readiness Score

### Dimensions
| Option | Description | Selected |
|--------|-------------|----------|
| Convention coverage | % of files following detected conventions | ✓ |
| Type safety coverage | % of files with TS types vs any/untyped | ✓ |
| Test coverage proxy | Presence of test files, test/src ratio | ✓ |
| Import graph health | Circular deps, orphan files, modularity score | ✓ |

**User's choice:** All four dimensions
**Notes:** None

### Score Format
| Option | Description | Selected |
|--------|-------------|----------|
| Letter grade + breakdown | A-F grade with per-dimension scores | ✓ |
| Numeric 0-100 + breakdown | Overall 0-100 with per-dimension percentages | |
| Traffic light per dimension | Red/Yellow/Green per dimension, no overall | |

**User's choice:** Letter grade + breakdown
**Notes:** Selected the preview showing the table format with Top 3 Improvements section

### Improvement Steps Count
| Option | Description | Selected |
|--------|-------------|----------|
| Top 3 | Focused, achievable, regenerates after each bootstrap | ✓ |
| Top 5 | More comprehensive | |
| All by dimension | Group all improvements under dimension headings | |

**User's choice:** Top 3
**Notes:** None

### AI Explainers
| Option | Description | Selected |
|--------|-------------|----------|
| Yes, brief | One sentence per dimension explaining WHY it matters for AI | ✓ |
| No, scores only | Just grades and improvement steps | |
| You decide | Claude's discretion | |

**User's choice:** Yes, brief
**Notes:** None

### Grade Thresholds
| Option | Description | Selected |
|--------|-------------|----------|
| Standard academic | A: 90-100%, B: 80-89%, etc. | ✓ |
| Shifted for AI context | A: 80-100%, B: 60-79%, etc. | |
| You decide | Claude picks | |

**User's choice:** Standard academic
**Notes:** None

### Dimension Weighting
| Option | Description | Selected |
|--------|-------------|----------|
| Equal weight | Each dimension 25% | ✓ |
| Convention-heavy | Conventions 40%, Graph 25%, Tests 20%, Types 15% | |
| You decide | Claude picks | |

**User's choice:** Equal weight
**Notes:** None

### Delta Tracking
| Option | Description | Selected |
|--------|-------------|----------|
| Yes, show changes | Compare current to previous bootstrap | ✓ |
| No, current only | Standalone snapshot | |
| You decide | Claude's discretion | |

**User's choice:** Yes, show changes
**Notes:** None

---

## Bootstrap Experience

### Progress Reporting
| Option | Description | Selected |
|--------|-------------|----------|
| Phase banner + agent status | Major phases with agent checkmarks and timing | ✓ |
| Minimal summary only | Just 'Bootstrapping...' then results | |
| Detailed per-file | Each file being processed | |

**User's choice:** Phase banner + agent status
**Notes:** Selected preview showing the phase/agent progress format

### Monorepo Squad Launching
| Option | Description | Selected |
|--------|-------------|----------|
| Sequential per service | One squad at a time, rate-limit safe | ✓ |
| Parallel services, sequential agents | Multiple squads concurrent up to cap | |
| You decide | Claude picks based on constraints | |

**User's choice:** Sequential per service
**Notes:** None

### Completion Summary
| Option | Description | Selected |
|--------|-------------|----------|
| Artifact list + readiness grade | List artifacts, stats, grade, next step | ✓ |
| Brief one-liner | Minimal completion message | |
| Full readiness report inline | Embed entire readiness.md | |

**User's choice:** Artifact list + readiness grade
**Notes:** None

### Re-bootstrap Behavior
| Option | Description | Selected |
|--------|-------------|----------|
| Incremental update | Detect changes, re-analyze affected only | ✓ |
| Full re-bootstrap | Always re-analyze everything | |
| Ask user each time | Let user choose | |

**User's choice:** Incremental update
**Notes:** None

### Cross-Service Synthesis
| Option | Description | Selected |
|--------|-------------|----------|
| Shared type imports | Which services import types from others | ✓ |
| Shared npm packages | Services depending on same packages | |
| API contract references | String matching on URLs/fetch calls | |
| Convention conflicts | Where services disagree on conventions | |

**User's choice:** Shared type imports only
**Notes:** None

### Convention Merging
| Option | Description | Selected |
|--------|-------------|----------|
| Merged with source tags | Single file, each convention tagged by service | ✓ |
| Separate per service | Each service keeps own conventions.md | |
| Both | Per-service files AND merged global | |

**User's choice:** Merged with source tags
**Notes:** None

---

## Convention Enforcement

### Promotion Method
| Option | Description | Selected |
|--------|-------------|----------|
| Interactive review command | /codescope:review-learnings with confirm/reject | ✓ |
| Bootstrap prompt | Prompt at end of bootstrap | |
| MCP tool command | codescope_conventions with enforce action | |

**User's choice:** Interactive review command
**Notes:** None

### Enforcement Meaning
| Option | Description | Selected |
|--------|-------------|----------|
| Warning with evidence | Flag violations as warnings, never block | ✓ |
| Soft block with override | Treat as errors requiring override | |
| Score impact only | Reduce convention score, no standalone warnings | |

**User's choice:** Warning with evidence
**Notes:** None

### Initial State
| Option | Description | Selected |
|--------|-------------|----------|
| Start empty | No auto-promotion, requires explicit confirmation | ✓ |
| Pre-populate 95%+ | Very high adoption auto-detected | |
| You decide | Claude's discretion | |

**User's choice:** Start empty
**Notes:** None

### Rollback Method
| Option | Description | Selected |
|--------|-------------|----------|
| /codescope:settings command | Settings skill includes convention management | ✓ |
| Edit file directly | User deletes entry from markdown | |
| Both | Command + direct edit | |

**User's choice:** /codescope:settings command
**Notes:** None

### Enforcement Eligibility
| Option | Description | Selected |
|--------|-------------|----------|
| High-confidence only | >=80% adoption, >=10 files | ✓ |
| Any with warning | All detected, low-confidence gets warning | |
| Configurable threshold | Default high, user can lower | |

**User's choice:** High-confidence only
**Notes:** None

---

## MCP Tool Responses

### Response Format
| Option | Description | Selected |
|--------|-------------|----------|
| Structured JSON | { status, data, metadata } | ✓ |
| Markdown text | Human-readable markdown | |
| Hybrid JSON + text | Both structured and readable | |

**User's choice:** Structured JSON
**Notes:** None

### Stale Data Handling
| Option | Description | Selected |
|--------|-------------|----------|
| Staleness warning in metadata | last_bootstrap + staleness field | ✓ |
| Auto-trigger incremental update | Re-analyze before returning | |
| Return as-is silently | No staleness tracking | |

**User's choice:** Staleness warning in metadata
**Notes:** None

### Error Handling
| Option | Description | Selected |
|--------|-------------|----------|
| Structured error with recovery hint | { code, message, recovery } | ✓ |
| MCP standard error | Built-in MCP error format | |
| You decide | Claude picks | |

**User's choice:** Structured error with recovery hint
**Notes:** None

### codescope_recall Behavior
| Option | Description | Selected |
|--------|-------------|----------|
| Combined inline response | Reads and merges multiple artifacts | ✓ |
| File pointers only | Returns paths, agent reads separately | |
| You decide | Claude picks | |

**User's choice:** Combined inline response
**Notes:** None

### Graph Caching
| Option | Description | Selected |
|--------|-------------|----------|
| Lazy-load + cache with TTL | First call loads, 5-min TTL | ✓ |
| Per-query reload | Load from SQLite every time | |
| Persistent in-memory | Load at startup, keep always | |

**User's choice:** Lazy-load + cache with TTL
**Notes:** None

### Search Approaches
| Option | Description | Selected |
|--------|-------------|----------|
| Graph-based | Search by symbol, path, or relationship | ✓ |
| Text-based grep | Ripgrep-style text search | |
| Convention-filtered | Filter by convention compliance | |

**User's choice:** Graph-based only
**Notes:** None

---

## Change Detection Behavior

### Risk Classification
| Option | Description | Selected |
|--------|-------------|----------|
| Graph-based risk tiers | HIGH/MEDIUM/LOW from in-degree centrality | ✓ |
| Multi-signal scoring | Combine centrality, boundaries, danger zones | |
| You decide | Claude picks | |

**User's choice:** Graph-based risk tiers
**Notes:** None

### Blast Radius Scope
| Option | Description | Selected |
|--------|-------------|----------|
| Risk + blast radius count | Risk level + count, not full list | ✓ |
| Risk + full blast radius | Complete affected file list per hop | |
| Risk level only | Just HIGH/MEDIUM/LOW | |

**User's choice:** Risk + blast radius count
**Notes:** None

---

## Monorepo Squad Cap

### Over-Cap Strategy
| Option | Description | Selected |
|--------|-------------|----------|
| Largest by LOC | Analyze N largest, lightweight scan rest | ✓ |
| User picks | Interactive service selection | |
| All with warning | Analyze all, warn about time | |

**User's choice:** Largest by LOC
**Notes:** None

### Cap Configuration
| Option | Description | Selected |
|--------|-------------|----------|
| config.yml | bootstrap.squad_cap in config | ✓ |
| CLI flag only | Per-invocation --cap flag | |
| Both | Config default + CLI override | |

**User's choice:** config.yml
**Notes:** None

---

## codescope_orient Tool

### Tool vs Skill Scope
| Option | Description | Selected |
|--------|-------------|----------|
| Brief context package | Lightweight orient brief, not full pipeline | ✓ |
| Full pipeline trigger | Same as /codescope:orient but programmatic | |
| File pointer to orient brief | Generate file, return path | |

**User's choice:** Brief context package
**Notes:** None

### File Matching Strategy
| Option | Description | Selected |
|--------|-------------|----------|
| Keyword + graph walk | Extract keywords, match nodes, walk 1-2 hops | ✓ |
| File path grep only | Path matching only | |
| Community-based | Return all files in matched community | |

**User's choice:** Keyword + graph walk
**Notes:** None

---

## Bootstrap --force

### Reset Scope
| Option | Description | Selected |
|--------|-------------|----------|
| Reset analysis, preserve user data | Rebuild graph/artifacts, keep config/learnings | ✓ |
| Full reset everything | Drop all except config.yml | |
| Ask user what to reset | Interactive reset selection | |

**User's choice:** Reset analysis, preserve user data
**Notes:** None

### Confirmation
| Option | Description | Selected |
|--------|-------------|----------|
| Yes, brief confirmation | Show what will be rebuilt/preserved | ✓ |
| No, --force means force | Flag IS the confirmation | |
| You decide | Claude's discretion | |

**User's choice:** Yes, brief confirmation
**Notes:** None

---

## Performance Budget

### Time Allocation
| Option | Description | Selected |
|--------|-------------|----------|
| Parsing-heavy budget | ~260s for 100K LOC, parsing is bottleneck | ✓ |
| Parallel-optimized | Run parsing and convention detection in parallel | |
| You decide | Claude benchmarks and picks | |

**User's choice:** Parsing-heavy budget
**Notes:** None

### Over-Budget Handling
| Option | Description | Selected |
|--------|-------------|----------|
| Complete with timing warning | Finish full analysis, report slowdowns | ✓ |
| Hard timeout with partial | Stop at 5 minutes, save what's done | |
| You decide | Claude picks | |

**User's choice:** Complete with timing warning
**Notes:** None

---

## Service Map Output

### Monorepo Response
| Option | Description | Selected |
|--------|-------------|----------|
| Service graph + shared types | Services with LOC/framework + dependency edges with types | ✓ |
| Simple adjacency list | Just service names and which depend on which | |
| You decide | Claude picks | |

**User's choice:** Service graph + shared types
**Notes:** None

### Single-Service Response
| Option | Description | Selected |
|--------|-------------|----------|
| Single service summary | One-service response, empty dependencies | ✓ |
| Not applicable response | Return not_applicable status | |
| You decide | Claude picks | |

**User's choice:** Single service summary
**Notes:** None

### Markdown Artifact
| Option | Description | Selected |
|--------|-------------|----------|
| Yes, cross-service-map.md | Human-readable markdown + MCP tool | ✓ |
| MCP tool only | Data in SQLite only | |
| You decide | Claude picks | |

**User's choice:** Yes, cross-service-map.md
**Notes:** None

---

## Tool Discoverability

### Discovery Mechanism
| Option | Description | Selected |
|--------|-------------|----------|
| Rich tool descriptions | Detailed descriptions with use-cases and related tools | ✓ |
| codescope_status tool guide | Status tool includes tool directory | |
| You decide | Claude picks | |

**User's choice:** Rich tool descriptions
**Notes:** None

---

## Verify/Search Tool Scope

### Phase 3 Functionality
| Option | Description | Selected |
|--------|-------------|----------|
| Partial functionality | verify: convention check only. search: graph-based only | ✓ |
| Keep as stubs | Stay as not_bootstrapped until full phases | |
| You decide | Claude picks | |

**User's choice:** Partial functionality
**Notes:** None

### Partial Tool Metadata
| Option | Description | Selected |
|--------|-------------|----------|
| Capabilities in metadata | capabilities + upcoming arrays | ✓ |
| No distinction | Return what works, omit what doesn't | |
| You decide | Claude picks | |

**User's choice:** Include capabilities in metadata
**Notes:** None

---

## Claude's Discretion

No areas deferred to Claude's discretion.

## Deferred Ideas

- Text-based and hybrid search for codescope_search -- Phase 4
- Full verification (blast radius diff, build/test) for codescope_verify -- Phase 5
- Convention enforcement rollback via /codescope:settings -- Phase 7
- Convention promotion via /codescope:review-learnings -- Phase 7
