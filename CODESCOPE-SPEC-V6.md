# CodeScope — Product Specification

---

## Part 1: What CodeScope Is

### The One-Sentence Pitch

CodeScope is a Claude Code plugin that deeply analyzes your brownfield codebase once, then autonomously researches, plans, executes, verifies, evaluates, and self-corrects code changes using coordinated sub-agents — with the user only stepping in twice: to describe what they want, and to approve what gets shipped.

### Who It's For

Developers working in existing codebases — the 99% of software that isn't greenfield. Codebases with millions of lines, multiple services, mixed conventions, legacy patterns alongside modern ones, and no single person who understands the whole thing. Codebases where AI agents break things because they don't understand the conventions, the danger zones, or the architectural decisions that led to the current state.

### Why It Exists

AI tools are good at writing code. They are bad at writing code that fits into existing systems. GitClear's analysis of 211M lines found AI-assisted code churn doubled while refactoring collapsed. The METR RCT showed experienced developers were 19% slower with AI tools in their own repos. The root cause: AI agents lack persistent understanding of existing codebases. Every session starts from zero. CodeScope fixes this.

### The 6 Things Only CodeScope Does

1. **Autonomous research-to-ship pipeline** — One human input triggers: research → plan → execute → verify → eval → debug. Nobody else has this.
2. **LLM-as-judge evaluation with user-controlled debug** — Self-evaluates its own work, presents findings, lets the user choose what to fix. Nobody else has this.
3. **Deep graph-informed clarification** — Asks questions only a system with full codebase knowledge could ask. Uses conventions, learnings, service boundaries, and dependency graphs to scope the task precisely.
4. **Coordinated multi-agent execution** — Sub-agents per service/concern with filesystem coordination. Dependency-ordered execution across connected services.
5. **Full-stack verification** — Convention compliance + blast radius diff + unit tests + build verification + E2E (Playwright/Xcode/Gradle).
6. **Dual-layer learning** — Project memory (codebase gotchas, patterns) + global memory (user preferences, ignore patterns, tech stack tendencies).

---

## Part 2: Architecture

### The Five Components

**1. Orchestrator (Main Context)**
The thin coordination layer. Never does heavy work. Reads files, spawns agents, makes routing decisions. Stays under 10-15K tokens at all times. This is the key architectural decision — the orchestrator's thinness is what makes context management a non-issue. Compaction either never triggers or doesn't matter because all state lives on disk.

**2. Sub-Agents**
Every real task runs in an isolated 200K-token context window. Agents communicate through the filesystem (`.claude/codescope/`), not through the orchestrator. Each agent gets only the context it needs baked into its instructions. Sub-agents cannot spawn further sub-agents (no nesting) — the orchestrator manages all spawning.

**3. MCP Server**
The backend intelligence layer. Graph queries, convention recall, blast radius calculations, orient tools, verify tools. Agents call these tools. The heavy data (SQLite graph, convention database) never enters any context window directly — it's queried on demand.

**4. Persistent Files (`.claude/codescope/`)**
The source of truth. Everything that matters lives here:

```
.claude/codescope/
├── config.md                      # User preferences (created by onboard)
├── overview.md                    # Architecture summary (created by bootstrap)
├── conventions.md                 # All detected conventions with evidence
├── conventions-enforced.md        # High-confidence conventions promoted to rules
├── danger-zones.md                # High-risk areas
├── readiness.md                   # AI readiness score
├── golden-files.md                # Best implementation examples
├── learnings.md                   # Project-specific learnings
├── graph.db                       # SQLite knowledge graph
├── services/                      # Per-service analysis (monorepos)
│   ├── auth-service/
│   │   ├── overview.md
│   │   ├── conventions.md
│   │   └── danger-zones.md
│   └── payment-service/
│       └── ...
├── orient/                        # Saved orient briefs
│   └── [task-slug].md
├── plans/                         # Execution plans
│   └── [task-slug].md
├── execution/                     # Execution state
│   ├── coordination.md            # Agent communication log
│   ├── research.md                # External research output
│   └── [agent-name]-changes.md    # Per-agent change reports
├── reports/                       # Verify + eval reports
│   ├── [task]-[date].md
│   └── screenshots/               # E2E screenshots
└── usage.md                       # Local telemetry (which commands run)
```

Global memory lives outside any project:

```
~/.codescope/
├── global-memory.md               # Cross-project user preferences
└── preferences.md                 # Learned behavior patterns
```

**5. Skills**
The user-facing entry points:

| Skill | Purpose | Human Input? |
|-------|---------|-------------|
| `/codescope:onboard` | Configure CodeScope for this user/project | Yes — interactive Q&A |
| `/codescope:bootstrap` | Deep codebase analysis | No — fully autonomous |
| `/codescope:orient [task]` | Full pipeline: clarify → research → plan → execute → verify → eval | Yes at clarify, yes at eval gate |
| `/codescope:settings` | Change configuration interactively | Yes |
| `/codescope:review-learnings` | Review and confirm/reject accumulated learnings | Yes |

---

## Part 3: The 7-Step Flow

### Overview

```
1. BOOTSTRAP  → Scout → squads per service → synthesis (one-time)
2. ORIENT     → Deep clarify (human) → Research (auto) → Analyze (auto) → Plan (auto)
3. EXECUTE    → Sub-agents per concern, filesystem coordination, dependency-ordered
4. VERIFY     → Static check + Runtime check (build + tests + E2E)
5. EVAL       → LLM-as-judge scores scope/conventions/completeness/correctness
6. USER GATE  → User selects which findings to debug (or auto per settings)
7. DEBUG      → Targeted fixes → re-execute → re-verify → re-eval (max 3 cycles)
   LEARN      → Project memory + Global memory update after completion
```

After clarify in step 2, steps 2-6 run autonomously. The user only gets pulled back in at the eval gate (step 6) — or not at all if auto-debug is configured.

---

### Step 1: BOOTSTRAP

**Trigger:** User runs `/codescope:bootstrap` (after `/codescope:onboard` has created config.md)

**What happens:**

**Phase A — Scout**
A lightweight scout agent (Haiku, read-only) maps the top-level structure:
- Reads root configs: package.json, docker-compose.yml, workspace configs, monorepo structure, CI/CD files
- Identifies service boundaries, entry points, primary languages
- Produces a **service manifest**: list of services with paths, approximate LOC, detected frameworks
- Writes: `.claude/codescope/service-manifest.md`
- Time: ~30 seconds

**Phase B — Squad Deployment**
Based on the service manifest, the orchestrator spawns analysis squads.

Scaling rules:
- Under 100K LOC total, or single service: **one squad** (4 agents)
- Over 100K LOC with multiple services: **one squad per service**
- Squad cap: configurable, default 10 (prevents runaway on massive monorepos)

Each squad consists of 4 agents, spawned sequentially (not in parallel — rate limit protection):

| Agent | Model | Tools | Job | Output |
|-------|-------|-------|-----|--------|
| Researcher | Haiku | Read, Grep, Glob | Map structure, frameworks, entry points | `overview.md` (~200 lines) |
| Convention Detector | Inherited | Read, Grep, Glob, Bash | ast-grep frequency analysis, trend detection, golden files, conflict detection | `conventions.md`, `golden-files.md` |
| Risk Analyzer | Inherited | Read, Grep, Glob, MCP tools | Build knowledge graph, calculate in-degree centrality, identify danger zones | `danger-zones.md`, writes to `graph.db` |
| Learning Synthesizer | Haiku | Read, Write | Initialize learnings, capture any initial observations | `learnings.md` (empty or minimal) |

For monorepos, each squad writes to `.claude/codescope/services/[service-name]/`.

**Phase C — Synthesis**
After all squads complete, a synthesis agent reads every service's output and produces:
- Cross-service dependency map (which services call which, shared types, API contracts, message queues)
- Merged convention summary (conventions that span services vs service-specific ones)
- Global danger zones (cross-service risks)
- AI readiness score with transparent rubric and actionable steps
- Writes: top-level `overview.md`, `readiness.md`, updated `conventions.md`

**Performance budget:** <5 minutes for 100K LOC. Scales linearly with service count.

**Parent-child communication pattern (Issue #5812):**
Sub-agents CANNOT return file contents to the parent. The pattern:
1. Agent writes to `.claude/codescope/` files
2. Agent's final message says "Wrote conventions to .claude/codescope/conventions.md — 12 conventions detected"
3. Parent reads the file after agent returns
4. Parent spawns next agent

---

### Step 2: ORIENT

**Trigger:** User runs `/codescope:orient [task description]`

Orient is the brain of CodeScope. It has four phases, and after the first (clarify), the rest run autonomously.

**Phase A — Deep Clarification (Human Input)**

This is NOT a quick "which area?" question. CodeScope uses everything it learned during bootstrap to conduct a graph-informed requirements interview.

The clarification is informed by:
- Knowledge graph (which modules match the task keywords, dependency chains)
- Conventions (including conflicts — "team hasn't converged on Zustand vs Redux")
- Learnings (past gotchas in related modules)
- Service boundaries (which services are involved)
- Danger zones (high-risk areas in the blast radius)
- Golden files (existing patterns that could serve as templates)

**Clarification triggers when:**
- Task is <4 words
- Task contains vague terms: fix, improve, refactor, update, change, broken, slow, wrong
- Task keywords match multiple unrelated areas in the graph
- User's clarification style is set to `thorough`

**Clarification is skipped when:**
- Task is specific enough (>6 words with concrete nouns like file names, feature names, endpoint paths)
- User's clarification style is set to `minimal` and task is reasonably specific
- User explicitly says "just do it" or passes `--no-clarify`

**Example deep clarification:**

```
User: /codescope:orient add webhook support for order updates

CodeScope:
I know enough about this codebase to ask specific questions before planning.

SCOPE
1. Which webhook direction?
   - SEND (your system → external): Order Service emits events to an external URL
   - RECEIVE (external → your system): External service sends events to your endpoint
   - Both?

2. I found an existing webhook pattern in Payment Service:
   - Uses express route + Stripe signature verification
   - Follows AppError convention (87.8%, golden file: src/auth/login.ts:12)
   - Has retry logic with exponential backoff
   → Should I use this as the template?

BOUNDARIES
3. Known issue: Payment module has a race condition with concurrent webhooks
   (Learning L001, March 20). The new webhook handler will be in the
   same blast radius.
   → Account for this in the implementation, or separate fix?

4. Three files in the blast radius have NO test coverage:
   - src/order/processor.ts
   - src/notification/dispatcher.ts
   - src/order/events.ts
   → Include test creation in scope?

CONSTRAINTS
5. Convention conflict: Order Service uses Zustand (62%) AND Redux (38%).
   → Which pattern for new code?

6. Auth middleware skip list is hardcoded (Learning L002).
   Webhook endpoints need manual addition.
   → Include in scope or flag as follow-up?
```

After answers, CodeScope produces an **In Scope / Out of Scope contract** that locks down exactly what gets built:

```markdown
## Scope Contract
**In Scope:**
- Receive webhooks from external service (POST /api/v1/webhooks/orders)
- Use Payment Service webhook pattern as template
- Follow AppError convention
- Use Zustand for any state management
- Add webhook endpoint to auth skip list
- Create tests for new webhook handler + processor

**Out of Scope:**
- Payment module race condition (separate task)
- Existing test gaps in processor.ts, dispatcher.ts, events.ts
- Outbound webhook sending

**Clarified from:** "add webhook support for order updates"
```

**Phase B — Research (Autonomous, Sub-Agent)**

A research sub-agent investigates the external domain:
- **Context7:** Current library documentation (Stripe SDK, webhook libraries, framework-specific patterns)
- **Web search:** Best practices, known issues, migration guides, security considerations
- Writes: `.claude/codescope/execution/research.md`

Research is scoped to what the task actually needs. "Add Stripe webhooks" triggers Stripe API research. "Refactor auth middleware" triggers security best practices research. The research agent reads the scope contract to know what to look for.

**Phase C — Analyze (Autonomous)**

Internal analysis using the knowledge graph and MCP tools:
- Graph traversal to identify all affected files (beyond what clarification surfaced)
- Hop-distance blast radius calculation (🔴 hop 0, 🟠 hop 1, 🟡 hop 2, 🟢 hop 3+)
- Convention matching for affected modules
- Test mapping (which tests cover affected code paths)
- Cross-service impact analysis for monorepos

**Phase D — Plan (Autonomous, Sub-Agent)**

A planning sub-agent reads: scope contract + research output + internal analysis. Produces an execution plan:

```markdown
# Execution Plan: Add webhook support for order updates
**Agents to spawn:** 3
**Execution order:** Sequential (payment-template-reader → order-service → test-writer)
**Estimated changes:** 4 new files, 3 modified files

## Agent 1: payment-template-reader (read-only)
- Read src/payment/webhook-handler.ts (the template)
- Extract: route pattern, signature verification approach, error handling
- Write findings to: execution/payment-template.md

## Agent 2: order-service-agent
- Dependencies: reads execution/payment-template.md
- Create: src/order/webhook-handler.ts (new)
- Create: src/order/webhook-types.ts (new)
- Modify: src/routes/order.ts (add webhook route)
- Modify: src/middleware/auth.ts (add to skip list)
- Conventions to follow: AppError (87.8%), Zustand, route pattern /api/v1/
- Write changes to: execution/order-service-changes.md
- Append to: execution/coordination.md

## Agent 3: test-writer-agent
- Dependencies: reads execution/order-service-changes.md
- Create: tests/order/webhook-handler.test.ts (new)
- Create: tests/order/webhook-types.test.ts (new)
- Write changes to: execution/test-changes.md

## Verify Criteria:
- Build: npm run build (clean)
- Unit tests: npm test -- --grep webhook (all pass)
- E2E: npx playwright test tests/e2e/webhook.spec.ts
- Conventions: ast-grep scan on all new/modified files
- Blast radius: compare predicted (7 files) vs actual
```

Plan is saved to `.claude/codescope/plans/[task-slug].md` before execution starts.

---

### Step 3: EXECUTE

**Trigger:** Automatic after plan is complete

The orchestrator reads the execution plan and spawns agents in the specified order. Each agent gets:
- The scope contract (what to build, what not to build)
- Its specific task from the plan
- Relevant conventions from `conventions.md`
- The coordination file (what previous agents did)
- Research output (if relevant to its task)
- Golden files as implementation references

**Coordination file** (`.claude/codescope/execution/coordination.md`):

Append-only during a task. Every agent reads it before starting and appends what it changed:

```markdown
# Coordination: Add webhook support for order updates
**Started:** 2026-03-22T14:30:00Z

## Agent Log

### payment-template-reader (14:30:15)
STATUS: complete
- Extracted webhook pattern from src/payment/webhook-handler.ts
- Pattern: express route + crypto.timingSafeEqual for signature verification
- Error handling: AppError with HTTP 400 for invalid signatures
- Retry logic: exponential backoff with jitter, max 3 attempts
- Wrote to: execution/payment-template.md

### order-service-agent (14:31:02)
STATUS: complete
- Created: src/order/webhook-handler.ts
- Created: src/order/webhook-types.ts
- Modified: src/routes/order.ts — added POST /api/v1/webhooks/orders
- Modified: src/middleware/auth.ts — added /webhooks/orders to skip list
- Convention followed: AppError (matched golden file)
- Convention followed: Zustand (per scope contract)
- New export: WebhookEvent type from order/webhook-types.ts
- Append to auth skip list: /webhooks/orders
- NOTE FOR DOWNSTREAM: Tests should cover signature verification failure path

### test-writer-agent (14:32:18)
STATUS: complete
- Created: tests/order/webhook-handler.test.ts (8 test cases)
- Created: tests/order/webhook-types.test.ts (3 test cases)
- Test cases cover: valid webhook, invalid signature, missing headers,
  duplicate event (idempotency), malformed body, timeout, retry logic,
  auth skip list verification
```

**Parallel execution rules:**
- Agents with no dependencies on each other can run in parallel (configurable, default max 3 concurrent)
- Agents with dependencies run sequentially in the plan's specified order
- The plan agent determines which tasks are independent based on the dependency graph

**Rate limit protection:**
- Max concurrent agents configurable (default 3)
- Sequential spawning on Pro plans (rate limits hit at 5+ parallel agents)
- Token economics: multi-agent workflows use 4-7x more tokens than single-agent. On Max plan, >90% are prompt cache reads at $0.50/MTok.

---

### Step 4: VERIFY

**Trigger:** Automatic after all execution agents complete

Two verify sub-agents run:

**Static Verify Agent (fast):**
1. **Convention compliance** — ast-grep scans all new/modified files against `conventions-enforced.md`. Reports which conventions were followed, which were violated, with evidence.
2. **Blast radius diff** — Compares the orient brief's predicted files against actual files changed (via `git diff --name-only`). Reports: surprise changes (files changed that weren't predicted), skipped files (predicted but not changed), blast radius files that should be reviewed.
3. **Code review** — Semantic review of the changes. Do they make sense? Obvious bugs? Missing error handling? Unused imports?

**Runtime Verify Agent (slower):**
4. **Build verification** — Runs the project's build command. Reports: clean build or errors with file/line.
5. **Unit/integration tests** — Runs the test commands specified in the orient brief and config. Reports: pass/fail with output.
6. **E2E / smoke verification** — Runs the appropriate tool based on project type:

| Project Type | E2E Tool | What It Does |
|-------------|----------|-------------|
| Web app / frontend | Playwright | Start dev server, navigate affected routes, run existing Playwright suite, auto-generate smoke tests for new routes/views |
| iOS / macOS | Xcode | `xcodebuild test` on target simulator, run UI tests |
| Android | Gradle | `./gradlew connectedAndroidTest` or `assembleDebug` |
| API / backend | HTTP | Start server, hit health check, send test request to modified endpoints |
| CLI tool | Shell | Run binary with known command, verify clean exit |
| Monorepo | Mixed | Detect which services were touched, run appropriate verification per service |

**Auto-smoke generation:** If the task added a new route/view/endpoint and no E2E tests exist for it, the verify agent generates a minimal smoke test:
- Web: Playwright test that navigates to the page and confirms no console errors
- API: HTTP request that confirms the endpoint responds with the expected status code
- These are throwaway smoke tests, not a full test suite

**Verify report** written to `.claude/codescope/reports/[task]-[date].md`:

```markdown
# Verify Report: Add webhook support for order updates
**Date:** 2026-03-22T14:35:00Z

## Static Checks
### Convention Compliance ✅
- 4/4 new files follow AppError pattern
- 1/1 modified route follows /api/v1/ pattern
- Auth skip list updated correctly

### Blast Radius Diff ✅
- Predicted: 7 files | Changed: 6 files | Surprise: 0
- Skipped: src/notification/dispatcher.ts (out of scope per contract)

### Code Review ✅
- No obvious bugs detected
- Error handling consistent with codebase patterns
- All new exports properly typed

## Runtime Checks
### Build ✅
- `npm run build`: Clean (0 errors, 0 warnings)

### Tests ✅
- `npm test -- --grep webhook`: 11 passed, 0 failed
- `npm test -- --grep order`: 15 passed, 0 failed

### E2E (Playwright) ✅
- Dev server started on :3000 (2.1s)
- Existing suite: 42 passed, 0 failed
- Auto-smoke POST /api/v1/webhooks/orders: 200 ✅
- Screenshots saved to reports/screenshots/
```

---

### Step 5: EVAL

**Trigger:** Automatic after verify completes

An LLM-as-judge agent reads:
- The scope contract (the agreement from clarification)
- The execution plan
- The coordination log
- All code changes (via git diff)
- The verify report
- The research output

Judges against four criteria:

**1. Scope Compliance** — Did the agents stay within the in-scope / out-of-scope contract? Did any agent touch files outside the plan? Were any in-scope items skipped?

**2. Convention Adherence** — Beyond the mechanical ast-grep check (which verify already did), does the code *feel* like it belongs? Naming patterns, abstraction levels, code organization, documentation style.

**3. Completeness** — Cross-reference every item in the plan against the coordination log and the actual changes. Was anything planned but not executed? Any edge cases from the research that weren't handled?

**4. Correctness** — Does the implementation match the best practices from the research? Were the known gotchas addressed? Does the approach make sense architecturally?

**Eval report:**

```markdown
## Eval: Add webhook support for order updates
**Overall: ⚠️ ISSUES FOUND**

### Scope Compliance ✅ PASS
All changes within planned scope. No surprise files.
Out-of-scope items correctly excluded.

### Convention Adherence ✅ PASS
Code matches codebase patterns. AppError used correctly.
Zustand used as specified. Naming follows conventions.

### Completeness ⚠️ ISSUES
- ✅ Webhook handler created with signature verification
- ✅ Route registered at /api/v1/webhooks/orders
- ✅ Auth skip list updated
- ✅ Tests cover 8 scenarios including signature failure
- ⚠️ FINDING-1: Idempotency key implemented with in-memory Set
  → Research identified Stripe sends duplicates within 5-min window
  → In-memory Set won't survive server restart or scale across instances
  → Severity: MEDIUM
- ❌ FINDING-2: Auth skip list updated but no test verifies the skip
  → The skip list is hardcoded; a test should confirm webhooks bypass auth
  → Severity: LOW

### Correctness ✅ PASS
Signature verification uses crypto.timingSafeEqual (correct per research).
Error responses follow Stripe's expected format.
Retry logic matches the existing payment service pattern.
```

---

### Step 6: USER GATE

**Trigger:** Automatic after eval completes (unless auto-debug configured)

**Default mode (interactive):**
The eval report is presented to the user with each finding as a selectable item:

```
EVAL COMPLETE: 2 findings

☑️ [MEDIUM] Idempotency uses in-memory Set — won't survive restart
☐ [LOW] No test for auth skip list bypass

→ Debug selected  |  Ignore all & push  |  Defer to TODO
```

The user picks which findings to fix, which to ignore, which to defer:
- **Debug selected:** Selected findings go to the debug cycle
- **Ignore all & push:** All findings logged in the change report but not fixed. The task is considered complete.
- **Defer to TODO:** Findings are written to a TODO file for later

**Auto-debug mode:**
Configured in `config.md` (`eval.mode: auto_debug`). The eval report is still written to disk, but the flow doesn't pause. All findings go straight to debug. Pauses only after 3 failed cycles or when a finding requires a human design decision.

**Auto-skip-minor mode:**
Only major findings (MEDIUM+) go to debug. Minor findings are auto-ignored and logged.

**What the user chose to ignore is captured by the learning system.** If a user consistently ignores idempotency findings, global memory learns this pattern and future evals can deprioritize or skip them.

---

### Step 7: DEBUG

**Trigger:** User selects findings to debug (or auto per settings)

For each selected finding:

1. **Debug agent** reads the finding and categorizes it:
   - **Missing implementation** — something in scope that wasn't built
   - **Incorrect implementation** — built but wrong
   - **Design decision** — needs human input (e.g., "in-memory vs Redis for idempotency")

**Debug agent tool access:**
The debug agent needs the broadest tool set of any agent — it's doing both research and execution in a tight loop:
- All file tools (Read, Write, Edit, Grep, Glob)
- Bash (for running ast-grep, build commands, targeted re-verification)
- CodeScope MCP tools (conventions, graph queries, blast radius on its fixes)
- Context7 (if the fix requires current library documentation)
- Web search (if the fix requires current best practices or API references)

2. For missing/incorrect: debug agent writes a **targeted fix plan** — not a full re-orient, just the gaps.

3. Fix plan goes to execution agents — only the agents responsible for the broken pieces. Unchanged services are not re-executed.

4. Verify runs again on just the changed files.

5. Eval runs again on just the fixed findings.

**Design decisions escalate to the user:**

```
FINDING-1 requires a design decision:

The idempotency approach needs to scale across instances.
Options:
  1. Redis (fast, requires Redis dependency)
  2. Database table (uses existing Postgres, slightly slower)
  3. Accept in-memory (single instance only — document the limitation)

→ Which approach?
```

After the user answers, the debug cycle continues autonomously.

**Bounded retry:** Max 3 debug cycles (configurable). After 3, the debug agent stops and presents a status report:

```
DEBUG EXHAUSTED (3/3 cycles)

Still open:
- FINDING-1: Idempotency implementation changed to Redis, but Redis
  connection config not found in environment. Needs REDIS_URL env var.

Recommend: Add REDIS_URL to .env and re-run /codescope:orient
```

**GSD's bounded retry pattern applies:** 3 attempts, then defer rather than loop forever.

---

### LEARN (After Completion)

**Trigger:** After the task completes (either all findings resolved, or user chose to push)

Two memory layers update:

**Project Memory** (`.claude/codescope/learnings.md`):
- What worked: conventions that held, patterns that were effective, research sources that were accurate
- What didn't: what eval caught, what the fix was, root cause
- Gotchas discovered: race conditions, undocumented dependencies, surprising behaviors
- New learnings start as UNVERIFIED and must be confirmed via `/codescope:review-learnings`
- Confidence decay: gotchas expire after 90 days, decisions after 180 days
- Contradiction detection: if a new learning contradicts an existing one or contradicts actual code, it's flagged
- Max 50 active learnings (~4,000 tokens when fully loaded)
- Learnings NEVER auto-promote to enforced conventions (requires human confirmation)

**Global Memory** (`~/.codescope/global-memory.md`):
- User preferences: verbosity, clarification style, eval tolerance
- Tech stack tendencies: "this user always uses Zustand", "prefers Playwright"
- Ignore patterns: findings the user consistently ignores at the eval gate
- Cross-project patterns: common conventions across the user's projects
- Updated automatically from observed behavior — not explicitly set by the user
- Makes future onboarding on new projects faster: "Last time you used Haiku for researcher and auto-debug mode. Same setup?"

---

## Part 4: Onboarding & Settings

### `/codescope:onboard` — First-Time Setup

Runs once per project (or once per user on a new project). Creates `config.md`. Does NOT analyze the codebase — that's bootstrap's job.

**Phase 1: Project Detection**
CodeScope reads top-level files (package.json, docker-compose, README, CI configs) and confirms with the user:

```
I scanned your project structure. Let me confirm:

1. Project type: Monorepo with 4 services (auth, payment, order, notification)
   → Right, or am I missing services?

2. Languages: TypeScript (89%), Python (11%)
   → Anything else?

3. Build: npm workspaces + Docker Compose
   → Build command? (detected: npm run build)
   → Test command? (detected: npm test)

4. E2E: Found playwright.config.ts
   → Primary E2E tool? Command? (detected: npx playwright test)

5. CI/CD: Found .github/workflows/ci.yml
   → Should verify match CI?
```

For new projects where global memory exists, onboard pulls from it:
```
Found your global preferences. Use same setup?
  Agent models: 3 haiku, 3 inherited
  Eval mode: auto_debug
  Orient: brief verbosity, thorough clarification
  → Yes / Customize
```

**Phase 2: Agent Model Selection**

```
CodeScope uses sub-agents. Each can run on a different model:

  Researcher:            Haiku (fast/cheap)
  Convention Detector:   Inherited (needs reasoning)
  Risk Analyzer:         Inherited (needs reasoning)
  Learning Synthesizer:  Haiku (lightweight)
  Eval Judge:            Inherited (needs reasoning)
  Debug:                 Inherited (needs reasoning)

→ Accept defaults or customize?
```

**Phase 3: Workflow Preferences**

```
1. Orient verbosity:      Brief (~50 lines) or Detailed (~200 lines)?
2. Clarification style:   Thorough (ask lots of questions) or Minimal?
3. Eval gate mode:        Interactive (review findings) or Auto-debug?
4. Convention strictness:  Suggest only or Flag violations?
```

**Output:** `.claude/codescope/config.md` created with all settings.

**Time:** 2-3 minutes of interactive Q&A.

### `/codescope:settings` — Change Configuration

Interactive or direct edit:

```
User: /codescope:settings

CodeScope: Current config for acme-platform:
  Eval mode:        interactive
  Agent models:     3 haiku, 3 inherited
  Conventions:      suggest mode, 80% threshold
  Orient:           brief verbosity, thorough clarification
  Verify:           Playwright E2E, auto-smoke enabled
  Learning:         project + global memory active

  What would you like to change?

User: Switch eval to auto-debug and bump convention detector to opus

CodeScope:
  ✅ eval.mode: interactive → auto_debug
  ✅ agents.convention_detector.model: inherited → opus
  Changes take effect on your next /codescope:orient.
```

### Full Config Structure

```yaml
# .claude/codescope/config.md

# ── Project ──────────────────────────────────
project:
  name: "acme-platform"
  type: monorepo                    # single | monorepo | polyrepo
  languages: [typescript, python]
  services:
    - name: auth-service
      path: services/auth/
      build: "npm run build"
      test: "npm test"
    - name: payment-service
      path: services/payment/
      build: "npm run build"
      test: "npm test"
    - name: order-service
      path: services/order/
      build: "npm run build"
      test: "npm test"
    - name: notification-service
      path: services/notification/
      build: "npm run build"
      test: "npm test"

# ── Agent Models ─────────────────────────────
agents:
  researcher: { model: haiku }
  convention_detector: { model: inherited }
  risk_analyzer: { model: inherited }
  learning_synthesizer: { model: haiku }
  eval_judge: { model: inherited }
  debug: { model: inherited }

# ── Orient ───────────────────────────────────
orient:
  verbosity: brief                  # brief (~50 lines) | detailed (~200 lines)
  clarification: thorough           # thorough | minimal | auto
  research_sources: [context7, web_search]
  max_research_time: 60             # seconds

# ── Execute ──────────────────────────────────
execute:
  parallel: auto                    # auto | sequential | parallel
  max_agents_concurrent: 3

# ── Verify ───────────────────────────────────
verify:
  build_command: "npm run build"
  start_command: "npm run dev"
  health_check: "http://localhost:3000/health"
  ready_signal: "Server started"
  timeout_seconds: 120
  tests:
    unit: "npm test"
    integration: "npm run test:integration"
    e2e:
      tool: playwright              # playwright | xcode | gradle | pytest | none
      command: "npx playwright test"
      config: "playwright.config.ts"
  auto_smoke: true
  static_check: true
  blast_radius_diff: true

# ── Eval ─────────────────────────────────────
eval:
  mode: interactive                 # interactive | auto_debug | auto_skip_minor
  auto_debug_max_cycles: 3
  criteria:
    scope_compliance: true
    convention_adherence: true
    completeness: true
    correctness: true

# ── Conventions ──────────────────────────────
conventions:
  detection_threshold: 80           # minimum % adoption to flag
  min_files: 10                     # minimum file count
  strictness: suggest               # suggest | warn | block
  auto_confirm_high_confidence: false

# ── Learning ─────────────────────────────────
learning:
  project_memory: true
  global_memory: true
  global_memory_path: "~/.codescope/global-memory.md"
  max_active_learnings: 50
  confidence_decay:
    gotchas: 90                     # days
    decisions: 180                  # days
  auto_capture: true
  capture_ignores: true             # learn from eval gate ignore patterns

# ── Bootstrap Scaling ────────────────────────
bootstrap:
  scaling: auto                     # auto | single_squad | manual
  squad_threshold_loc: 100000
  max_squads: 10

# ── Display ──────────────────────────────────
display:
  progress_reports: true
  agent_activity: minimal           # silent | minimal | verbose
  eval_detail: full                 # summary | full
```

### Reset Commands

```bash
/codescope:settings --reset          # Reset config, re-run onboard
/codescope:settings --reset-global   # Wipe global memory
/codescope:bootstrap --force         # Re-analyze codebase from scratch
```

---

## Part 5: Technical Architecture

### Tech Stack

| Component | Technology | Why |
|-----------|-----------|-----|
| Language | TypeScript | Same as Claude Code ecosystem |
| AST Parsing | web-tree-sitter (WASM) | NOT node-tree-sitter (broken, no maintainer). What Claude Code uses internally. |
| Convention Detection | ast-grep CLI (27 languages) | Structural pattern matching by syntax, not text. Zero compilation. |
| Import Resolution | enhanced-resolve + tsconfig-paths | TS/JS (95-99% accuracy). Python via ast-grep patterns (~80%). |
| Graph Storage | better-sqlite3 | Synchronous SQLite. Knowledge graph lives here. |
| Graph Analysis | graphology + graphology-communities-louvain + graphology-metrics + graphology-shortest-path + graphology-traversal | In-degree centrality, Louvain community detection, BFS blast radius. |
| Text Search | ripgrep (via bash) | Fast exact identifier matching. |
| MCP SDK | @modelcontextprotocol/sdk | Standard MCP server implementation. |
| Testing | vitest | Fast, TypeScript-native, built-in snapshot testing. |
| Build | TypeScript compiler, tsx for development | Standard TS build pipeline. |

### V2 Additions (Future — Not In This Build)

These are deferred entirely. They may require additional research before implementation.

| Component | Technology | Notes |
|-----------|-----------|-------|
| Visual Map | sigma + @react-sigma/core | Codebase visualization, blast radius overlay |
| MCP Apps | @modelcontextprotocol/ext-apps + vite | Inline visual rendering in Claude |
| Semantic Search | @lancedb/lancedb + Ollama | "Find code related to X" by meaning, not keywords |
| Cross-project learning | TBD | Pattern library across codebases |
| ADR auto-generation | TBD | Auto-generate Architecture Decision Records |
| CI/CD integration | GitHub Actions, etc. | Hook into deployment pipelines |
| Cross-service HTTP linking | TBD | Route detection + HTTP call matching |
| Convention drift monitoring | TBD | Track pattern divergence over time |

### SQLite Knowledge Graph Schema

```sql
CREATE TABLE nodes (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  kind TEXT NOT NULL,          -- file, class, function, method, variable, module
  file_path TEXT NOT NULL,
  start_line INTEGER,
  end_line INTEGER,
  signature TEXT,
  complexity INTEGER,
  is_exported BOOLEAN DEFAULT 0,
  is_test BOOLEAN DEFAULT 0,
  metadata JSON
);

CREATE TABLE edges (
  id INTEGER PRIMARY KEY,
  source_id INTEGER REFERENCES nodes(id),
  target_id INTEGER REFERENCES nodes(id),
  kind TEXT NOT NULL,          -- CONTAINS, CALLS, IMPORTS, EXTENDS, IMPLEMENTS, USES_TYPE
  weight REAL DEFAULT 1.0,
  metadata JSON
);

CREATE TABLE communities (
  node_id INTEGER REFERENCES nodes(id),
  community_id INTEGER,
  modularity_class TEXT
);

CREATE INDEX idx_nodes_path ON nodes(file_path);
CREATE INDEX idx_nodes_kind ON nodes(kind);
CREATE INDEX idx_edges_source ON edges(source_id);
CREATE INDEX idx_edges_target ON edges(target_id);
CREATE INDEX idx_edges_kind ON edges(kind);
```

### MCP Server Tools

| Tool | Purpose | Called By |
|------|---------|----------|
| `codescope_recall` | Retrieve conventions, learnings, overview for a topic | Orient, Execute agents |
| `codescope_graph_query` | Query the knowledge graph (neighbors, paths, communities) | Orient, Risk Analyzer |
| `codescope_blast_radius` | BFS traversal with hop-distance classification | Orient, Verify |
| `codescope_conventions` | Get conventions for specific files/modules | Execute agents |
| `codescope_orient` | Generate orient brief programmatically | Orient skill |
| `codescope_verify` | Run verification checks programmatically | Verify agents |
| `codescope_search` | Hybrid search (graph + text) across the codebase | Research, Orient |
| `codescope_readiness` | Get AI readiness score | On demand |
| `codescope_status` | Current state of CodeScope (last bootstrap, active task, etc.) | Orchestrator |
| `codescope_detect_changes` | Map git diff → affected symbols with risk classification | Verify |
| `codescope_service_map` | Cross-service dependency overview | Orient (monorepos) |

### Sub-Agent Architecture

**Critical constraints (from research):**
- Sub-agents CANNOT spawn sub-agents (no nesting)
- Sub-agents CANNOT return file contents to parent (Issue #5812) — use filesystem coordination
- `context: fork` in skill frontmatter is SILENTLY IGNORED on auto-invoked skills (Issue #17283) — use Task tool delegation
- Sub-agents are spawned sequentially by default (parallel has rate limit risk on Pro plans)
- Each sub-agent has ~150-250ms creation overhead
- web-tree-sitter memory leaks over long sessions — periodically call `parser.delete()` and recreate

**The Task tool delegation pattern:**
```markdown
# In SKILL.md body (not frontmatter):
Use the Task tool to spawn a subagent with the following task:
"Explore the codebase structure. Read package.json, scan src/ directory,
identify frameworks and entry points. Write your findings to
.claude/codescope/overview.md in the format specified below..."
```

### Convention Detection

**How it works:**
1. ast-grep structural patterns for each convention category (error handling, naming, imports, state management, API calls, test organization, logging, auth patterns, database access, comments)
2. Frequency analysis: count pattern occurrences across the codebase
3. Cluster by module: conventions may vary by service/layer
4. Confidence scoring: >80% = high, 50-80% = medium, <50% = low
5. Cross-reference with config files (.eslintrc, tsconfig, biome.json)

**Enrichment (adopted from competitors):**
- **Trend direction** (from codebase-context): Rising/Declining/Stable based on git recency
- **Golden files** (from codebase-context): Best implementation ranked by modern pattern density
- **Conflict detection** (from codebase-context): Competing patterns >20% adoption flagged
- **Confidence decay** (from codebase-context): Gotchas expire 90 days, decisions 180 days
- **Git commit mining** (from codebase-context): Auto-extract from refactor:/migrate:/fix: commits

**Output format:**
```yaml
- category: error_handling
  pattern: "AppError class with HTTP status codes"
  adoption: 87.8%
  files: 43/49
  trend: Rising
  golden_file: src/auth/login.ts
  conflict: false
  confidence: high
  evidence:
    - src/auth/login.ts:12
    - src/payment/handler.ts:45
    - src/user/service.ts:8
```

**Quality targets:**
- <5% false positive rate on high-confidence conventions
- Suggestion-only in Phase 1 (never block)
- Dismiss/correct feedback: user can mark any convention as wrong, correction persists permanently

### Blast Radius

**Hop-distance BFS traversal (CodeLayers pattern):**

```
Hop 0 (🔴 Red):     src/payment/handler.ts      ← THE FILE YOU'RE CHANGING
Hop 1 (🟠 Orange):  src/payment/service.ts       ← Direct dependent
                     src/routes/payment.ts        ← Direct dependent
Hop 2 (🟡 Yellow):  src/order/processor.ts       ← Imports payment/service
                     src/middleware/auth.ts        ← Imported by routes/payment
Hop 3 (🟢 Green):   src/notification/email.ts    ← Imports order/processor
                     tests/payment.test.ts        ← Tests for payment/handler
```

- Default maxHops: 3 (configurable)
- For codebases with >1000 files at hop 1, show top 10 by in-degree with "and 47 more"

---

## Part 6: Build Plan

Build straight through — no hard stops between phases. Fix issues as you go, keep moving. See `CODESCOPE-BUILD-INSTRUCTIONS.md` for environment setup, GSD commands, and tooling installation.

### Phase 1a: Plugin Skeleton + Onboard + Scout + Researcher (Days 1-5)

**Goal:** A working plugin with onboard, scout agent, and one researcher squad producing useful output.

**Build:**
- Plugin skeleton: manifest, skills (onboard, bootstrap), hooks.json, scripts/
- `/codescope:onboard` skill — interactive config creation
- Scout agent — maps service boundaries, produces service manifest
- Researcher agent + Task tool delegation
- web-tree-sitter WASM parsing for TS/JS/Python → SQLite graph
- Import resolution: enhanced-resolve + tsconfig-paths (TS/JS), ast-grep patterns (Python)
- In-degree centrality for file importance
- `/codescope:bootstrap` skill (partial — scout + researcher only)
- Persistent artifacts: config.md, service-manifest.md, overview.md

**Phase 1a Gate Test:**
```bash
/codescope:onboard                    # Creates config.md with all settings
/codescope:bootstrap                  # Runs scout + researcher
cat .claude/codescope/config.md       # Settings present and correct?
cat .claude/codescope/overview.md     # Accurate architecture summary?
# Check: File importance rankings present?
# Check: Sub-agent isolation working (main context <5K tokens)?
```

### Phase 1b: Full Bootstrap Squad + Learning (Days 6-10)

**Goal:** Convention detection, risk analysis, readiness scoring, learning system.

**Build:**
- Convention Detector agent (ast-grep + frequency + trends + golden files + conflicts)
- Risk Analyzer agent (graph-based danger zones, blast radius)
- Learning Synthesizer agent (initialize learnings)
- Synthesis agent (cross-service map for monorepos)
- Full bootstrap pipeline: scout → squads (researcher → convention-detector → risk-analyzer) → synthesis
- AI readiness score with transparent rubric
- Remaining persistent artifacts: conventions.md, conventions-enforced.md, danger-zones.md, readiness.md, golden-files.md, learnings.md

**Phase 1b Gate Test:**
```bash
/codescope:bootstrap                  # Full pipeline
cat .claude/codescope/conventions.md  # Trends? Golden files? Conflicts? Evidence?
cat .claude/codescope/readiness.md    # Score with breakdown?
# Check: Convention FP rate <5% for high-confidence?
# Check: Bootstrap <5 min for 50K LOC?
```

### Phase 1c: Orient + Execute + Verify (Days 11-18)

**Goal:** The core autonomous pipeline from clarification through verified code changes.

**Build:**
- MCP server with 11 tools
- `/codescope:orient [task]` skill — the full pipeline trigger
- Deep clarification with graph-informed questions
- Research sub-agent (Context7 + web search integration)
- Plan sub-agent (execution plan generation)
- Execution agent spawning with coordination file
- Static verify agent (conventions, blast radius diff, code review)
- Runtime verify agent (build, tests, E2E with Playwright/Xcode/Gradle detection)
- Auto-smoke test generation for new routes/views

**Phase 1c Gate Test:**
```bash
# Orient clarification
/codescope:orient fix the auth
# Check: Graph-informed questions? In Scope / Out of Scope contract?

# Full orient → execute → verify pipeline
/codescope:orient add webhook support
# Check: Research runs? Plan generated? Agents execute?
# Check: Verify: build passes? Tests run? E2E runs?
# Check: Auto-smoke generated for new endpoint?
# Check: Convention compliance scanned? Blast radius diff correct?
```

### Phase 1d: Eval + User Gate + Debug + Learn (Days 19-25)

**Goal:** Self-evaluation, user-controlled debug, and the learning system.

**Build:**
- Eval agent (LLM-as-judge with 4 criteria: scope, conventions, completeness, correctness)
- User gate (interactive finding selection with configurable auto-debug)
- Debug agent (full tool access: file tools + Bash + CodeScope MCP + Context7 + web search)
- Debug cycle: targeted fix → re-execute → re-verify → re-eval (max 3 cycles)
- Design decision escalation (pause for human input when needed)
- Learning capture (project memory + global memory)
- `/codescope:review-learnings` skill
- `/codescope:settings` skill

**Phase 1d Gate Test:**
```bash
# Full pipeline end-to-end
/codescope:orient add user webhook support
# Check: Entire pipeline runs: clarify → research → plan → execute → verify → eval
# Check: Eval produces finding report with 4 criteria scored
# Check: User gate presents findings for selection
# Check: Debug fixes selected findings within 3 cycles
# Check: Learning captures what happened (project + global)
# Check: Change report generated at .claude/codescope/reports/

# Eval + Debug loop
# Intentionally introduce an issue and verify eval catches it
# Check: Debug agent has access to Context7 and web search for research
# Check: Debug agent can make code fixes and re-verify
# Check: Design decisions escalate to user correctly
# Check: Auto-debug mode works when configured
```

### V1 Comparison Testing (Days 26-30)

**Goal:** Validate CodeScope works end-to-end on real codebases and benchmark against GSD.

**Test codebases:**
1. **CodeScope itself** (dogfooding)
2. **An unfamiliar medium-sized TS/JS open-source repo** (real brownfield — candidates: Fastify, Hono, or GSD itself)
3. **A larger monorepo** if available (stress test squad scaling)

**Comparison test: CodeScope vs GSD**

Run the same task on the same codebase using both tools. Measure:

| Metric | CodeScope | GSD | Notes |
|--------|-----------|-----|-------|
| Human touches required | Count interactions | Count interactions | CodeScope target: 2 (clarify + eval gate) |
| Time to first working change | End-to-end | End-to-end | Include all human wait time |
| Convention adherence | ast-grep scan result | Manual review | Does the output match codebase patterns? |
| Blast radius accuracy | Predicted vs actual | N/A (GSD doesn't predict) | CodeScope advantage |
| Build + E2E pass rate | Auto-verified | Manual verification | Does it actually run? |
| Issues caught by eval | Count findings | N/A (GSD doesn't eval) | Self-correction value |
| Learning captured | Check learnings.md | N/A | Compounding value over time |

**Test tasks (run on the unfamiliar repo):**
1. **Simple:** Add a new API endpoint following existing patterns
2. **Medium:** Refactor error handling in one service to match a new pattern
3. **Complex:** Add a feature that spans multiple services/modules

**What we're looking for:**
- Does CodeScope actually produce safer code changes than GSD on brownfield?
- Does the clarification phase result in better-scoped work?
- Does the eval/debug loop catch real issues?
- Is the overhead (bootstrap time, agent spawning) worth the safety?
- Where does CodeScope fail? (These become V2 priorities)

**Keep a pain journal** during testing. Track what's useful, what's broken, what's missing.

**Telemetry review:** After testing, check `.claude/codescope/usage.md`. Which commands were run? Which MCP tools did Claude call? Which features were never touched?

---

## Part 7: Constraints & Performance Budgets

| Constraint | Target |
|-----------|--------|
| Plugin context overhead at startup | <5,000 tokens |
| Orchestrator working state | <15,000 tokens |
| Bootstrap time (100K LOC) | <5 minutes |
| Orient time (after clarification) | <60 seconds |
| Graph queries | <100ms |
| Convention false positive rate (high-confidence) | <5% |
| Phase 1 language support | TypeScript/JavaScript + Python |
| Debug cycle cap | 3 (configurable) |
| Max active learnings | 50 (~4,000 tokens) |
| Max concurrent agents | 3 (configurable, rate limit protection) |
| E2E verification timeout | 120 seconds (configurable) |

---

## Part 8: Success Metrics

| Metric | Target |
|--------|--------|
| Faster onboarding (cloned repo → ready to change) | 50%+ improvement |
| Convention adherence in AI-generated code | 90%+ post-bootstrap |
| Orient blast radius accuracy | >80% predicted vs actual |
| Convention precision | >85% across 3+ test codebases |
| Eval finding accuracy | >70% of flagged issues are real issues |
| Debug resolution rate | >80% of findings fixed within 3 cycles |
| User touches per task | 2 (clarify + eval gate) or 1 (with auto-debug) |

---

## Part 9: Known Risks & Mitigations

| Risk | Mitigation |
|------|-----------|
| `context: fork` ignored on auto-skills (#17283) | Task tool delegation for all agent spawning |
| web-tree-sitter WASM memory leaks | Periodic `parser.delete()` and recreate |
| Import resolution varies by language | TS/JS first (95-99%). Python ~80%. Others Phase 2+. |
| Convention false positives erode trust | Suggestion-only, evidence chains, dismiss/correct, <5% FP target |
| Parent can't read sub-agent files (#5812) | Filesystem coordination via `.claude/codescope/` |
| Rate limits on parallel agents (Pro plan) | Sequential spawning default, max 3 concurrent |
| Learning synthesizer codifies LLM mistakes | UNVERIFIED default, review command, contradiction detection, never auto-promote |
| Eval judge misses real issues | Research-informed criteria, bounded retry as safety net |
| Eval judge flags non-issues | User gate allows ignoring, global memory learns ignore patterns |
| Bootstrap too slow on massive monorepos | Scout-first scaling, configurable squad cap |
| Research agent returns outdated info | Context7 for current docs, web search with date filters |
| Coordination file conflicts on parallel agents | Append-only design, dependency ordering from plan |
| Debug loop doesn't converge | Hard cap at 3 cycles, then defer to user |

---
