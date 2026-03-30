# CodeScope Comparison Test — Fastify

## Why Fastify

Fastify is the ideal test repo because it has **strong conventions that are invisible without codebase analysis**. Vanilla Claude will get these wrong:

| Convention | What Fastify does | What Claude will likely do |
|------------|-------------------|---------------------------|
| **Module system** | `require()` / `module.exports` (CommonJS) — zero ESM in core | Write `import`/`export` (ESM) |
| **No JSDoc** | Zero JSDoc comments in the entire codebase | Add JSDoc to exported functions |
| **Symbol-based privacy** | Internal state via `kRequest`, `kReply` from `./symbols.js` | Use `_private` prefix or `#private` |
| **Error pattern** | Custom error classes from `./errors.js` with `FST_ERR_*` codes | `throw new Error('message')` |
| **Export aliasing** | `module.exports = { add: decorateFastify, exist: checkExistence }` | Export functions by their original names |
| **Test framework** | `node:test` with `t.plan(N)`, `t.assert.strictEqual()`, `t.after()` | Use Jest or Vitest patterns (`describe`, `it`, `expect`) |
| **Test naming** | `feature-name.test.js` (flat in `test/` root) | Create `__tests__/` or `test/feature/` directories |
| **HTTP testing** | `fastify.inject()` — no real sockets | Use `supertest` or start a real server |
| **Plugin pattern** | `fastify-plugin` wrapper (`fp()`) with dependency metadata | Write plain middleware functions |
| **Hook registration** | `instance.addHook('onRequest', fn)` with error-first callbacks | Use Express-style `app.use()` middleware |
| **Promise detection** | `typeof result.then === 'function'` (duck-typing) | `result instanceof Promise` |
| **Performance loops** | `for` loops, not `.forEach()` / `.map()` in hot paths | Use array methods |

These aren't documented anywhere obvious — you have to read the code to know them. That's exactly what CodeScope does.

---

## The Task

> **"Add a request timeout plugin to Fastify that aborts requests exceeding a configurable time limit."**

This task is designed to expose the most conventions at once:

1. **New file creation** — where to put it, how to name it
2. **Plugin pattern** — must use `fastify-plugin` (`fp()`) wrapper
3. **Hook system** — must use `addHook('onRequest', ...)` not Express middleware
4. **Error handling** — must use Fastify's error class pattern with `FST_ERR_*` code
5. **Symbol usage** — should use symbols for internal state
6. **Test file** — must use `node:test`, `t.plan()`, `fastify.inject()`, not Jest
7. **CommonJS** — must use `require`/`module.exports`, not ESM
8. **No JSDoc** — should match the zero-JSDoc convention
9. **Performance** — should use `for` loops, not array methods in hot paths

### Exact Prompt (Use This Verbatim in Both Sessions)

```
Add a request timeout plugin to Fastify's core library.

Requirements:
- New plugin in lib/ that aborts requests exceeding a configurable timeout (default 30s)
- Use the onRequest hook to start a timer and the onResponse hook to clear it
- When timeout fires, reply with 408 Request Timeout
- Support per-route timeout override via route options
- Add a test file covering: default timeout, custom timeout, per-route override, and timeout cancellation on normal response
```

---

## Step-by-Step Testing Guide

### Setup (Do This Once)

```bash
# Clone Fastify twice into separate directories
git clone https://github.com/fastify/fastify.git ~/codescope-eval/fastify-with-codescope
git clone https://github.com/fastify/fastify.git ~/codescope-eval/fastify-vanilla

# Pin both to the same commit
cd ~/codescope-eval/fastify-with-codescope && git checkout v5.3.2
cd ~/codescope-eval/fastify-vanilla && git checkout v5.3.2

# Install dependencies in both
cd ~/codescope-eval/fastify-with-codescope && npm install
cd ~/codescope-eval/fastify-vanilla && npm install
```

### Test A: With CodeScope (Your Plugin Active)

```bash
cd ~/codescope-eval/fastify-with-codescope
claude
```

In the Claude Code session:

```
# 1. Bootstrap CodeScope on this repo
/codescope:bootstrap

# 2. Wait for analysis to complete (1-3 min for Fastify)

# 3. Run the task (paste the exact prompt above)
Add a request timeout plugin to Fastify's core library...

# 4. After Claude finishes, save the diff
# In a separate terminal:
cd ~/codescope-eval/fastify-with-codescope
git diff > ../diff-with-codescope.patch
git diff --stat > ../stats-with-codescope.txt
```

### Test B: Vanilla Claude Code (No Plugin)

```bash
cd ~/codescope-eval/fastify-vanilla
claude
```

In the Claude Code session:

```
# Just paste the exact same prompt — no CodeScope, no bootstrap
Add a request timeout plugin to Fastify's core library...

# After Claude finishes, save the diff
cd ~/codescope-eval/fastify-vanilla
git diff > ../diff-vanilla.patch
git diff --stat > ../stats-vanilla.txt
```

---

## Evaluation Rubric

Score each output on these 12 criteria. Each is pass/fail.

### Convention Adherence (8 points)

| # | Criteria | With CodeScope | Vanilla |
|---|----------|:-:|:-:|
| 1 | **CommonJS** — uses `require()` / `module.exports`, not `import`/`export` | | |
| 2 | **No JSDoc** — no JSDoc comments on functions | | |
| 3 | **Error pattern** — uses custom error class from `errors.js` with `FST_ERR_*` code | | |
| 4 | **Symbol usage** — uses symbols from `symbols.js` for internal state | | |
| 5 | **Export aliasing** — exports use the `{ publicName: internalFn }` pattern | | |
| 6 | **Plugin wrapper** — wraps in `fastify-plugin` (`fp()`) | | |
| 7 | **Hook pattern** — uses `addHook('onRequest', ...)` not Express-style middleware | | |
| 8 | **Performance** — uses `for` loops instead of `.forEach()` in hot path | | |

### Test Quality (4 points)

| # | Criteria | With CodeScope | Vanilla |
|---|----------|:-:|:-:|
| 9 | **Test framework** — uses `node:test` with `t.plan()`, not Jest/Vitest | | |
| 10 | **Test assertions** — uses `t.assert.strictEqual()` not `expect()` | | |
| 11 | **HTTP testing** — uses `fastify.inject()` not `supertest` or real server | | |
| 12 | **Test location** — file is `test/request-timeout.test.js` (flat, not nested) | | |

### Scoring

```
10-12: CodeScope clearly demonstrates value
7-9:   Meaningful improvement
4-6:   Moderate improvement
0-3:   No significant difference
```

---

## What to Screenshot for GitHub

### 1. Side-by-side diff comparison

Show the plugin file from both runs. Highlight:
- ESM vs CommonJS
- JSDoc presence vs absence
- Error handling pattern differences
- Plugin wrapping (fp() vs none)

### 2. Test file comparison

Show the test file from both runs. Highlight:
- Jest/Vitest vs node:test
- supertest vs fastify.inject()
- describe/it/expect vs test/t.plan/t.assert

### 3. Scorecard

Fill in the rubric table above with checkmarks. The visual is immediate.

### 4. The "aha" moment

Find the single most striking difference — usually the plugin pattern or test framework — and highlight it as a callout:

```
Without CodeScope: Claude wrote Jest tests with describe/it/expect
With CodeScope:    Claude matched Fastify's node:test convention perfectly

Claude had no way to know Fastify uses node:test — unless something told it.
That's CodeScope.
```

---

## README Section (Add After Testing)

Once you have results, add this section to the README:

```markdown
## Does It Work?

We ran the same task on [Fastify](https://github.com/fastify/fastify) — once with CodeScope, once without.

**Task:** Add a request timeout plugin to Fastify's core library.

| Criteria | Without CodeScope | With CodeScope |
|----------|:-:|:-:|
| CommonJS (not ESM) | X | Y |
| No JSDoc (matches codebase) | X | Y |
| Fastify error pattern (FST_ERR_*) | X | Y |
| Symbol-based internal state | X | Y |
| fastify-plugin wrapper | X | Y |
| node:test (not Jest) | X | Y |
| fastify.inject() (not supertest) | X | Y |
| **Score** | **X/12** | **Y/12** |

> Claude had no way to know Fastify uses node:test instead of Jest —
> unless something analyzed the codebase first. That's CodeScope.
```

---

## Expected Results

Based on Fastify's conventions, vanilla Claude will almost certainly:

- **Write ESM** (`import`/`export`) — Claude defaults to modern JS
- **Add JSDoc** — Claude's training strongly favors documentation
- **Use Jest or Vitest** — these are the dominant test frameworks
- **Use supertest** — the standard HTTP testing library
- **Skip fastify-plugin wrapper** — this is Fastify-specific knowledge
- **Use `throw new Error()`** — not the custom `FST_ERR_*` pattern
- **Skip symbols** — this is an uncommon pattern

CodeScope should catch most of these because it analyzes the actual codebase patterns before Claude writes anything.

**Prediction: Vanilla scores 2-4/12, CodeScope scores 9-12/12.**
