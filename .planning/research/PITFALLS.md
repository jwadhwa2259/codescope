# Pitfalls Research

**Domain:** Claude Code plugin with codebase intelligence (CodeScope)
**Researched:** 2026-03-22
**Confidence:** HIGH (verified across official docs, GitHub issues, and multiple independent sources)

## Critical Pitfalls

### Pitfall 1: Sub-Agent File Content Blindness (Issue #5812)

**What goes wrong:**
Parent agents delegate file creation to sub-agents via the Task tool. The sub-agent writes files successfully, but the parent agent has zero knowledge of file contents -- only that the task "completed." The parent cannot proceed with integration steps (adding imports, wiring components) because the new file's content is not in its context window. Issue #5812 was closed as NOT_PLANNED, meaning this is a permanent platform constraint, not a temporary bug.

**Why it happens:**
Sub-agents operate in isolated context windows. When a sub-agent creates a file via the Write tool, the content exists on disk but is never propagated back to the parent's context. The Task tool returns a completion summary, not file contents.

**How to avoid:**
Use filesystem coordination exclusively. Every sub-agent must write its outputs to well-known paths (e.g., `.claude/codescope/execution/{agent-id}/output.md`). The orchestrator reads these files after task completion rather than expecting return values. Design the entire coordination protocol around append-only files and polling, never around return values.

**Warning signs:**
- Sub-agent tasks complete but orchestrator asks "what was created?"
- Orchestrator re-reads files it just delegated creation of
- Extra conversational turns spent discovering filesystem state

**Phase to address:**
Phase 1 (Plugin Skeleton / Orchestrator) -- this must be the foundational coordination pattern from day one. Retrofitting filesystem coordination onto a return-value architecture requires a rewrite.

---

### Pitfall 2: context:fork Silently Ignored on Auto-Invoked Skills (Issue #17283)

**What goes wrong:**
Skills that specify `context: fork` and `agent: Explore` in their frontmatter execute in the main conversation context instead of spawning a separate agent. This means exploration-heavy skills (codebase scanning, graph traversal) consume main context tokens and pollute the primary conversation with thousands of tokens of intermediate output.

**Why it happens:**
The Skill tool does not honor `context: fork` or `agent:` frontmatter fields when skills are invoked programmatically or via auto-invocation. Only manual slash-command invocation respects some of these settings.

**How to avoid:**
Never rely on `context: fork` for any skill that will be auto-invoked. Instead, have skills explicitly delegate to sub-agents via the Task tool within their execution logic. Structure skills as thin dispatchers that immediately spawn a Task tool call with the appropriate agent configuration.

**Warning signs:**
- Main context growing rapidly during skill execution
- Compaction triggering during what should be isolated operations
- Skills that work correctly when manually invoked but misbehave when auto-invoked

**Phase to address:**
Phase 1 (Plugin Skeleton) -- skill architecture must use Task tool delegation from the start. Skills should be thin wrappers that delegate, not monoliths that execute.

---

### Pitfall 3: Sub-Agent Write Operations Silently Fail (Issue #9458)

**What goes wrong:**
Sub-agents spawned via the Task tool report successful Write/Edit operations, but files do not persist to the filesystem. Directory creation (mkdir -p) succeeds, but file content writes fail silently. This creates a "partial sandboxing" scenario with 100% failure rate on Task tool Write operations in affected versions.

**Why it happens:**
Sub-agents may operate in temporary/sandboxed execution contexts. File operations appear to succeed from the sub-agent's perspective because the sandbox accepts them, but changes are discarded when the sub-agent session terminates.

**How to avoid:**
Have sub-agents write content to their output coordination files (which the main session reads and writes to disk), OR have sub-agents use Bash tool `cat <<'EOF' > file.txt` instead of the Write tool (Bash file operations may bypass sandbox restrictions). Test Write tool persistence in sub-agents early and establish a verified pattern. Have the orchestrator verify file existence after each sub-agent completes.

**Warning signs:**
- Sub-agent reports "file created successfully" but file does not exist
- Directory structure exists but files are empty or missing
- Inconsistent behavior between main session and sub-agent file operations

**Phase to address:**
Phase 1 (Plugin Skeleton) -- must be validated in the first prototype. If Write tool fails in sub-agents, the entire filesystem coordination pattern needs the Bash-tool workaround baked in.

---

### Pitfall 4: web-tree-sitter WASM Version/ABI Incompatibility

**What goes wrong:**
WASM grammar files built with one version of tree-sitter-cli fail to load in a different version of web-tree-sitter. The ABI changed between major versions (e.g., grammars built with tree-sitter-cli 0.20.x are incompatible with web-tree-sitter 0.26.x). Language.load() silently fails or throws cryptic "incompatible language version" errors. The Emscripten toolchain version must also match precisely.

**Why it happens:**
Tree-sitter's WASM ABI has no backward compatibility guarantees across major versions. Pre-built WASM grammar packages (like tree-sitter-wasms) may lag behind web-tree-sitter releases. There is no compatibility matrix in the official docs.

**How to avoid:**
Pin web-tree-sitter and all grammar WASM files to the same ABI version. Build grammars from source using the same tree-sitter-cli version that matches your web-tree-sitter. Create a version lockfile documenting the exact versions. Test grammar loading for all supported languages in CI. Never upgrade web-tree-sitter without rebuilding all grammar files.

**Warning signs:**
- `Language.load()` throws with "incompatible language version N"
- Parsing works for some languages but not others (inconsistent grammar versions)
- Upgrading web-tree-sitter breaks previously working parsers

**Phase to address:**
Phase 2 (Convention Detection / AST Parsing) -- lock versions in the first commit and create a grammar build script.

---

### Pitfall 5: web-tree-sitter WASM Memory Leaks Over Long Sessions

**What goes wrong:**
WASM operates outside JavaScript's garbage collector. Tree objects, parser instances, and language objects accumulate in WASM memory and are never freed unless explicitly deleted. Over a bootstrap session analyzing thousands of files, memory grows unbounded until the process crashes or slows to a crawl.

**Why it happens:**
Developers accustomed to JavaScript's GC assume objects are cleaned up automatically. web-tree-sitter allocates in WASM linear memory, which requires explicit `tree.delete()` and `parser.delete()` calls. Forgetting even one `delete()` in a hot loop causes linear memory growth.

**How to avoid:**
Implement a strict resource lifecycle: call `tree.delete()` after extracting data from every parsed file. Periodically call `parser.delete()` and recreate the parser (e.g., every 500 files) to reclaim fragmented WASM memory. Wrap parsing in a try/finally to guarantee cleanup. Monitor WASM memory usage (via `Module.HEAPU8.length` or similar) and log warnings when it exceeds thresholds. Consider running the parser in a worker thread that can be terminated and restarted.

**Warning signs:**
- Node.js process memory growing linearly during bootstrap
- Parsing speed degrading over time (WASM heap fragmentation)
- OOM crashes during large codebase analysis (50K+ files)

**Phase to address:**
Phase 2 (Convention Detection / AST Parsing) -- implement resource lifecycle management alongside the first parser integration.

---

### Pitfall 6: SQLite Concurrent Write Contention From Multiple Agents

**What goes wrong:**
Multiple sub-agents attempt to write to graph.db simultaneously during bootstrap. SQLite allows only one writer at a time, even in WAL mode. Agents receive SQLITE_BUSY errors, causing graph construction to fail or produce incomplete data. Worse, without a busy_timeout, writes fail immediately rather than retrying.

**Why it happens:**
The bootstrap phase spawns multiple squads (Scout, Researcher, Convention Detector, Risk Analyzer) that may all attempt graph writes concurrently. SQLite's file-level write lock blocks all concurrent writers. WAL mode helps reads during writes but does not enable parallel writes.

**How to avoid:**
Designate a single writer process for graph.db. Have sub-agents write graph data to per-agent output files (JSONL), and have the orchestrator or a dedicated Graph Builder agent batch-insert all data sequentially. Set `PRAGMA busy_timeout = 5000` as a safety net. Set `PRAGMA journal_mode = WAL` for concurrent read/write. Keep write transactions as small as possible. Monitor for checkpoint starvation (WAL file growing without bound due to long-running reads).

**Warning signs:**
- "database is locked" errors during bootstrap
- Graph data missing nodes/edges that were logged by sub-agents
- WAL file growing much larger than the main database file

**Phase to address:**
Phase 3 (Knowledge Graph) -- design single-writer architecture from the start. The batch-insert-from-JSONL pattern avoids the problem entirely.

---

### Pitfall 7: LLM-as-Judge Inconsistent Scoring and Hallucinated Findings

**What goes wrong:**
The eval agent reports false findings -- claiming convention violations that do not exist, or scoring changes as incomplete when they are not. Scores vary across identical inputs (one run scores 8/10, the next scores 5/10). The judge hallucinates specific line numbers or file references that do not correspond to actual code.

**Why it happens:**
LLM judges suffer from well-documented biases: position bias (favoring first/last items), verbosity bias (preferring longer output), self-enhancement bias (favoring AI-generated code), and vagueness in rubric interpretation. High-precision numeric scales (1-10) without clear definitions produce unreliable results. Overly long evaluation prompts introduce confusion and hallucination.

**How to avoid:**
Use binary or low-precision scoring (PASS/FAIL, 3-point scale) instead of 1-10 scales. Require chain-of-thought reasoning before the score -- the model must explain its judgment before rating. Create a golden dataset of pre-scored examples for calibration. Validate every finding against actual file contents (the eval agent must cite specific evidence that can be mechanically verified). Set low temperature for consistency. Split evaluation into separate dimensions (convention compliance, scope adherence, completeness) with independent prompts rather than evaluating everything at once.

**Warning signs:**
- Eval findings reference files or line numbers that do not exist
- Scores fluctuate more than 1 point across identical inputs
- Eval consistently flags the same false patterns across different changes
- Eval agent produces very long reports (verbosity bias indicator)

**Phase to address:**
Phase 5 (Eval Agent) -- implement with binary scoring first, add granularity only after calibrating against golden datasets.

---

### Pitfall 8: Skill Auto-Invocation Overfiring on Vague Descriptions

**What goes wrong:**
Auto-invocable skills with vague descriptions fire on nearly every user message. A skill described as "helps with code" triggers on every coding task, consuming tokens and confusing the workflow. Skills that should only activate for specific file types or actions activate indiscriminately.

**Why it happens:**
Skill descriptions are the targeting instructions for auto-invocation. The LLM uses the description to decide relevance. Broad descriptions match broadly. The LLM errs on the side of invoking rather than skipping.

**How to avoid:**
Write extremely specific skill descriptions that include: exact file types, specific directory paths, precise action contexts, and negative conditions. Example: "Analyzes TypeScript convention compliance in .ts/.tsx files under src/ when the user asks about code patterns or conventions. Do NOT use for general coding questions." Use `disable-model-invocation: true` for skills that should only be manually triggered (deployment, destructive operations).

**Warning signs:**
- Skills firing on unrelated user messages
- Token usage spiking from unexpected skill invocations
- Users complaining that Claude "does extra stuff" they did not ask for

**Phase to address:**
Phase 1 (Plugin Skeleton) -- get skill descriptions right in the first iteration. Over-broad descriptions create noise from the start.

---

### Pitfall 9: Multi-Agent Error Amplification (The 17x Error Trap)

**What goes wrong:**
Errors in one sub-agent propagate to dependent agents, compounding at each stage. A small mistake in the Scout's service boundary detection cascades into wrong convention scoping, incorrect danger zones, and a fundamentally flawed execution plan. With N sequential agents, a 10% error rate per agent becomes a ~65% chance of at least one error in the chain.

**Why it happens:**
Multi-agent systems without validation gates pass outputs directly between agents. Each agent trusts its inputs completely. There is no closed-loop feedback or error suppression between stages. Adding more agents amplifies errors rather than improving quality.

**How to avoid:**
Implement validation gates between every pipeline stage. Each agent's output must pass a structural check before the next agent consumes it. Use schema validation (JSON Schema or Zod) on all inter-agent coordination files. Build the pipeline as a DAG with explicit dependency edges, not a linear chain. The orchestrator must verify each stage's output before proceeding. Implement early termination -- if a foundational agent (Scout, Researcher) produces clearly broken output, halt the pipeline rather than propagating garbage.

**Warning signs:**
- Downstream agents producing nonsensical output despite correct instructions
- Execution plans referencing files or modules that do not exist
- Convention reports contradicting the service manifest
- Each pipeline run producing wildly different results

**Phase to address:**
Phase 4 (Orient Pipeline) -- validation gates must be part of the pipeline architecture, not bolted on later.

---

### Pitfall 10: Orchestrator Context Exhaustion Despite Thin Design

**What goes wrong:**
Even a "thin" orchestrator gradually accumulates context through coordination file reads, status checks, error handling, and retry logic. After coordinating 6+ sub-agents, the orchestrator hits ~167K usable tokens and triggers compaction. Post-compaction, the orchestrator loses track of which agents have completed, what their outputs were, and what stage the pipeline is in.

**Why it happens:**
Each sub-agent coordination cycle requires: reading the agent's output file, validating it, logging status, and deciding the next step. With 6-8 agents in bootstrap and 3-5 in orient, the accumulated reads and decisions fill context. Auto-compaction at 83.5% usage summarizes away critical state.

**How to avoid:**
Persist ALL orchestrator state to disk, never in context. Maintain a machine-readable state file (e.g., `pipeline-state.json`) that tracks: which agents completed, which files were produced, current stage, and next actions. After each sub-agent completes, write state to disk. If compaction occurs, the orchestrator can reconstruct its state by reading the state file. Keep orchestrator prompts under 5K tokens by referencing file paths rather than inlining content. Use the 1M context window (`opus[1m]` or `sonnet[1m]`) for the orchestrator if available.

**Warning signs:**
- Orchestrator re-asking "what stage are we at?"
- Duplicate sub-agent spawns (orchestrator forgot one already ran)
- Pipeline stalling after compaction with no clear next step
- Orchestrator context exceeding 100K tokens mid-pipeline

**Phase to address:**
Phase 1 (Plugin Skeleton / Orchestrator) -- state persistence is the core orchestrator design principle. Must be there from the first prototype.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Inlining file contents in orchestrator context instead of reading from disk | Simpler orchestrator logic | Context exhaustion, compaction data loss, unreliable multi-agent coordination | Never -- this violates the core architecture |
| Skipping `tree.delete()` in parsing loops | Faster initial dev, simpler code | OOM on large codebases, unreliable bootstrap | Only in tests with <10 files |
| Using Write tool in sub-agents without verification | Simpler coordination code | Silent file loss (Issue #9458), broken outputs | Never -- always verify or use Bash workaround |
| 1-10 scale for eval scoring | Appears more granular/precise | Inconsistent, unreproducible scores, false confidence | Never in v1 -- start with binary, add granularity after calibration |
| Single ast-grep pattern per convention without frequency threshold | Quick convention detection | False positives on rare patterns, noise in reports | MVP only -- add frequency thresholds before user-facing release |
| Global graph.db writes from multiple agents | Simpler agent design, no coordination files | SQLITE_BUSY errors, data loss, corrupted graph | Never -- use single-writer pattern |
| Hardcoded grammar WASM paths | Works on dev machine | Breaks in different environments, version mismatches | Only during initial prototyping |
| Skipping validation gates between pipeline stages | Faster pipeline, fewer tokens per run | Error amplification, cascading failures, unreliable output | Never -- gates are cheap insurance |

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| web-tree-sitter + Grammar WASM | Using pre-built WASM packages (tree-sitter-wasms) that lag behind web-tree-sitter ABI version | Build grammars from source with matching tree-sitter-cli version, pin all versions together |
| better-sqlite3 + WAL mode | Assuming WAL enables parallel writes | WAL enables concurrent reads with a single writer; batch writes through one process |
| enhanced-resolve + tsconfig-paths | Assuming path aliases resolve identically across all tsconfig contexts in a monorepo | Each package may have its own tsconfig with different path aliases; resolve relative to the declaring package's tsconfig, not the root |
| ast-grep CLI + convention detection | Treating every pattern match as a convention | Require minimum frequency threshold (e.g., pattern appears in >60% of relevant files) and minimum sample size (>5 files) before flagging as a convention |
| graphology + Louvain community detection | Expecting dense, meaningful communities by default | Louvain with default resolution produces sparse communities; tune resolution parameter and validate community quality against known service boundaries |
| MCP SDK + Claude Code | Returning raw error objects/stack traces from tool calls | Return human-readable error strings with isError: true and include suggested next steps for the AI to recover |
| Claude Code hooks + plugin hooks | Declaring hooks in plugin.json manifest | Plugin hooks go in hooks/hooks.json only; declaring in plugin.json causes duplicate detection errors |
| Task tool + sub-agent file operations | Expecting sub-agent to write files and parent to see them | Sub-agent writes to coordination file; parent reads coordination file and performs final writes if needed |

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Parsing entire codebase without file filtering | Bootstrap takes 30+ minutes, WASM OOM | Filter by language extension first, skip node_modules/vendor/dist, respect .gitignore | >50K files without filtering |
| Full graph traversal for every blast radius query | Graph queries >1s, orient phase timeouts | Pre-compute in-degree centrality at bootstrap time, cache BFS results, index by file path | >10K nodes without indexing |
| Loading all graph nodes into memory via graphology | Memory exhaustion on large codebases | Use streaming/batch processing, load subgraphs on demand, keep full graph in SQLite | >100K nodes loaded simultaneously |
| Re-parsing unchanged files on every bootstrap | 5-minute bootstrap becomes 20 minutes | Store file hashes, only re-parse changed files (detect via mtime + content hash) | Second run on any codebase |
| Unbounded WAL file growth (checkpoint starvation) | Disk usage growing, query performance degrading | Call db.checkpoint() periodically, avoid long-running read transactions during writes | Concurrent reads blocking WAL recycling |
| MCP tool returning full file contents instead of summaries | Context window fills with raw data, compaction triggers | Return summaries, metadata, and file paths; let the caller read files if needed | Any tool returning >2K tokens regularly |
| Spawning max concurrent agents on Pro plan rate limits | API rate limit errors, agents timing out, pipeline stalls | Default to sequential spawning on Pro plans (configurable), implement exponential backoff, detect 429 responses | >3 concurrent agents on Pro plan |

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| MCP tools exposing arbitrary file reads outside project directory | Path traversal: AI reads ~/.ssh/*, credentials, env files | Validate all file paths are within the project root; reject absolute paths and ../ traversal |
| Storing API keys or secrets in codescope analysis files | Secrets persisted in .claude/codescope/ and potentially committed to git | Never include file content in analysis outputs that could contain secrets; scan for patterns (API_KEY, SECRET, TOKEN) before writing |
| Sub-agents executing arbitrary Bash commands from coordination files | Command injection if coordination file contents are interpolated into Bash | Never construct Bash commands from agent output; use structured data and validated parameters |
| MCP server running without input validation on tool arguments | Malformed arguments cause crashes, potential injection | Validate all tool inputs with Zod schemas; return isError: true for invalid inputs |
| Knowledge graph storing sensitive code patterns | Intellectual property exposure if graph.db is shared or leaked | graph.db stores structural relationships (file->imports->file), not code content; document this clearly |

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Convention detection reporting >20 findings on first run | User overwhelmed, dismisses the tool entirely | Show top 5 highest-confidence conventions, hide rest behind "show more"; progressive disclosure |
| Bootstrap providing no progress feedback | User thinks it is hung after 60 seconds, kills the process | Report progress at each pipeline stage: "Scout: mapping services (2/5 complete)..." |
| Danger zone reports without actionable guidance | User knows files are risky but not what to do about it | Always pair danger zone identification with specific guidance: "High in-degree (14 imports). Changes here affect: [list]. Recommend: test X, Y, Z" |
| Eval agent blocking user on false findings | User forced to triage hallucinated issues, loses trust | Default to auto-skip-minor mode for eval findings below confidence threshold; only gate on high-confidence issues |
| Learning system accumulating stale/wrong learnings | AI making decisions based on outdated or incorrect learnings | UNVERIFIED default, confidence decay (gotcha 90d, decision 180d), contradiction detection, max 50 active learnings |
| Orient pipeline taking >60s without explanation | User abandons the tool | Show each phase as it starts: "Phase A: Clarifying scope... Phase B: Researching... Phase C: Analyzing graph..." |

## "Looks Done But Isn't" Checklist

- [ ] **Plugin manifest:** Often missing -- hooks declared in plugin.json instead of hooks/hooks.json. Verify hooks load via `/reload-plugins`.
- [ ] **MCP tool error handling:** Often missing -- tools throw exceptions instead of returning `{isError: true, content: [...]}`. Verify every tool returns structured errors for all failure modes.
- [ ] **web-tree-sitter cleanup:** Often missing -- `tree.delete()` calls in parsing loops. Verify WASM heap does not grow unbounded over 1000+ file parses.
- [ ] **Graph query indexing:** Often missing -- SQLite indexes on node file paths and edge source/target columns. Verify graph queries return in <100ms on 10K+ node graphs.
- [ ] **Convention confidence thresholds:** Often missing -- raw pattern matches reported without frequency or sample size thresholds. Verify false positive rate is <5% on test codebases.
- [ ] **Orchestrator state persistence:** Often missing -- state tracked in context instead of on disk. Verify pipeline recovers correctly after simulated compaction.
- [ ] **Sub-agent file write verification:** Often missing -- orchestrator assumes Write tool succeeded. Verify file existence and content after every sub-agent task.
- [ ] **Import resolution for path aliases:** Often missing -- enhanced-resolve configured for root tsconfig only. Verify resolution works for packages with their own tsconfig path aliases.
- [ ] **Rate limit handling:** Often missing -- no backoff on 429 responses. Verify pipeline degrades gracefully under rate limiting.
- [ ] **eval agent finding verification:** Often missing -- findings accepted without checking cited evidence. Verify every eval finding references real files and line numbers.

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Sub-agent file content blindness | LOW | Switch to filesystem coordination pattern; refactor agent output paths |
| context:fork ignored | LOW | Replace with Task tool delegation; update skill frontmatter |
| Sub-agent Write failures | MEDIUM | Implement Bash-tool workaround or coordination-file pattern; re-run affected pipeline stages |
| WASM ABI mismatch | LOW | Pin versions, rebuild grammars from source, update lockfile |
| WASM memory leaks | MEDIUM | Add tree.delete()/parser.delete() calls in all parsing loops; may need worker thread isolation |
| SQLite write contention | HIGH | Redesign to single-writer pattern; migrate from direct writes to JSONL batch-insert; rebuild graph |
| LLM-as-judge inconsistency | MEDIUM | Switch to binary scoring; create golden dataset; re-evaluate all historical findings |
| Skill overfiring | LOW | Tighten descriptions; add disable-model-invocation where needed |
| Multi-agent error amplification | HIGH | Add validation gates between all pipeline stages; may require re-running affected pipelines |
| Orchestrator context exhaustion | HIGH | Implement disk-based state machine; requires rethinking orchestrator architecture |

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Sub-agent file blindness (#5812) | Phase 1: Plugin Skeleton | Sub-agent creates file, parent reads it from coordination path without re-discovery |
| context:fork ignored (#17283) | Phase 1: Plugin Skeleton | Auto-invoked skill executes in isolated Task tool context, main context unchanged |
| Sub-agent Write failures (#9458) | Phase 1: Plugin Skeleton | Sub-agent file operations verified to persist; fallback pattern documented |
| WASM ABI incompatibility | Phase 2: Convention Detection | All grammars load successfully; version lockfile in place; CI test for grammar loading |
| WASM memory leaks | Phase 2: Convention Detection | Bootstrap 10K files without memory growth beyond 2x initial; tree.delete() in all loops |
| SQLite write contention | Phase 3: Knowledge Graph | Bootstrap with 3 concurrent agents produces identical graph to sequential run |
| Skill overfiring | Phase 1: Plugin Skeleton | Skills only fire on matching contexts; token usage baseline established |
| Multi-agent error amplification | Phase 4: Orient Pipeline | Validation gate catches intentionally broken Scout output; pipeline halts with clear error |
| Orchestrator context exhaustion | Phase 1: Plugin Skeleton | Pipeline completes with simulated compaction at 50% progress; state recovered from disk |
| LLM-as-judge inconsistency | Phase 5: Eval Agent | Same input produces same score 9/10 times; all findings cite verifiable evidence |
| Convention false positives | Phase 2: Convention Detection | False positive rate <5% on test codebase with known conventions |
| Import resolution edge cases | Phase 3: Knowledge Graph | Monorepo with path aliases resolves 95%+ of imports correctly |
| Rate limit handling | Phase 4: Orient Pipeline | Pipeline completes under simulated rate limiting (1 agent at a time) |

## Sources

### Official Documentation and GitHub Issues
- [Claude Code Plugins Documentation](https://code.claude.com/docs/en/plugins)
- [Issue #5812: Feature Request - Allow Hooks to Bridge Context Between Sub-Agents](https://github.com/anthropics/claude-code/issues/5812) -- closed NOT_PLANNED
- [Issue #17283: Skill tool should honor context:fork and agent: frontmatter](https://github.com/anthropics/claude-code/issues/17283)
- [Issue #9458: Sub-agent Write tool operations don't persist to filesystem](https://github.com/anthropics/claude-code/issues/9458)
- [Issue #5171: web-tree-sitter 0.26.x incompatible with WASM files built by tree-sitter-cli 0.20.x](https://github.com/tree-sitter/tree-sitter/issues/5171)
- [Issue #1580: Recommended usage of web-tree-sitter](https://github.com/tree-sitter/tree-sitter/issues/1580)
- [MCP Tools Specification](https://modelcontextprotocol.io/docs/concepts/tools)
- [Claude Code Agent Teams](https://code.claude.com/docs/en/agent-teams)

### MCP Server Design
- [MCP Best Practices - Philipp Schmid](https://www.philschmid.de/mcp-best-practices)
- [MCP Server Naming Conventions](https://zazencodes.com/blog/mcp-server-naming-conventions)
- [15 Best Practices for Building MCP Servers - The New Stack](https://thenewstack.io/15-best-practices-for-building-mcp-servers-in-production/)
- [Error Handling in MCP Tools](https://apxml.com/courses/getting-started-model-context-protocol/chapter-3-implementing-tools-and-logic/error-handling-reporting)
- [Better MCP Tool Error Responses](https://alpic.ai/blog/better-mcp-tool-call-error-responses-ai-recover-gracefully)

### Multi-Agent Systems
- [Why Your Multi-Agent System is Failing: The 17x Error Trap - Towards Data Science](https://towardsdatascience.com/why-your-multi-agent-system-is-failing-escaping-the-17x-error-trap-of-the-bag-of-agents/)
- [AI Coding Agents in 2026: Coherence Through Orchestration - Mike Mason](https://mikemason.ca/writing/ai-coding-agents-jan-2026/)
- [Claude Code Context Buffer Management](https://claudefa.st/blog/guide/mechanics/context-buffer-management)

### LLM-as-Judge Evaluation
- [LLM-as-a-Judge Complete Guide - Evidently AI](https://www.evidentlyai.com/llm-guide/llm-as-a-judge)
- [LLM-As-Judge: 7 Best Practices - Monte Carlo Data](https://www.montecarlodata.com/blog-llm-as-judge/)
- [LLMs-as-Judges: A Comprehensive Survey](https://arxiv.org/html/2412.05579v2)

### Tree-sitter and Parsing
- [Modern Tree-sitter Part 7: Pain Points and Promise - Pulsar Edit](https://blog.pulsar-edit.dev/posts/20240902-savetheclocktower-modern-tree-sitter-part-7/)
- [ast-grep Pattern Syntax](https://ast-grep.github.io/guide/pattern-syntax.html)

### SQLite and Graph
- [better-sqlite3 Performance Documentation](https://github.com/WiseLibs/better-sqlite3/blob/master/docs/performance.md)
- [SQLite File Locking and Concurrency](https://sqlite.org/lockingv3.html)
- [Graphology Louvain Community Detection](https://graphology.github.io/standard-library/communities-louvain.html)

### Static Analysis and Conventions
- [DeepSource: How We Ensure Less Than 5% False Positive Rate](https://deepsource.com/blog/how-deepsource-ensures-less-false-positives)
- [Using LLMs to Filter False Positives - Datadog](https://www.datadoghq.com/blog/using-llms-to-filter-out-false-positives/)

### TypeScript Import Resolution
- [Managing TypeScript Packages in Monorepos - Nx](https://nx.dev/blog/managing-ts-packages-in-monorepos)
- [TypeScript Path Aliases Issue #58657](https://github.com/microsoft/TypeScript/issues/58657)

---
*Pitfalls research for: Claude Code plugin with codebase intelligence (CodeScope)*
*Researched: 2026-03-22*
