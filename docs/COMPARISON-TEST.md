# CodeScope Comparison Test — h3

## Why h3

[h3](https://github.com/h3js/h3) is the HTTP framework that powers Nuxt and Nitro. Unlike Fastify or Express, Claude has far less training data on h3's **internal source conventions**. It has highly distinctive patterns that vanilla Claude will get wrong:

| Convention | What h3 does | What Claude will likely do |
|------------|-------------|---------------------------|
| **Event-based context** | `H3Event` object — not `req`/`res` | Use `Request`/`Response` or Express-style `req, res` |
| **`defineHandler` wrapper** | All handlers wrapped in `defineHandler()` | Write plain `async function` handlers |
| **`HTTPError` class** | Custom error via `new HTTPError({ status: 429, message: "..." })` | `throw new Error("Too many requests")` or `res.status(429)` |
| **Utility function architecture** | Flat exported functions, no classes | Create a `RateLimiter` class |
| **Internal `_` prefix** | Private helpers use `_` prefix (`_fetchHandler`, `_dynamicEventHandler`) | Use `#private` fields or no prefix |
| **Section comments** | `// --- Rate Limiting ---` style dividers | Standard `/** JSDoc */` or no comments |
| **`import type` separation** | Type imports always use `import type { ... }` | Mix type and value imports |
| **Generic type params** | Single uppercase: `Req`, `Res`, `T`, `K` | Full words: `Request`, `Response`, `Data` |
| **Function overloads** | Multiple `export function` signatures for polymorphic APIs | Single function with union types or optional params |
| **Test setup** | `describeMatrix()` running tests across web + Node.js targets | Plain `describe/it` blocks |
| **Test context** | Shared `TestContext` with `ctx.fetch()`, `ctx.app`, `ctx.errors[]` | Create new app instance per test |
| **Test file naming** | `feature.test.ts` flat in `test/` | `__tests__/feature.spec.ts` or nested |
| **File naming** | kebab-case in `src/utils/` | camelCase or PascalCase |

These patterns are **not documented** and **not common** across the JS/TS ecosystem. You have to read the source to know them.

---

## The Task

> **"Add a rate limiting utility to h3 that tracks requests per IP and returns 429 when limits are exceeded."**

This task forces Claude to hit the most conventions at once:

1. **New utility file** — must go in `src/utils/rate-limit.ts` (kebab-case)
2. **Utility function pattern** — must export flat functions, not a class
3. **H3Event context** — must accept `H3Event`, not `req`/`res`
4. **HTTPError** — must use `new HTTPError({ status: 429 })`, not `throw new Error()`
5. **Internal helpers** — should use `_` prefix for private state/functions
6. **Section comments** — should use `// --- section ---` dividers
7. **`import type`** — type imports must be separate
8. **Test file** — must use `describeMatrix()` with shared `TestContext`
9. **Test assertions** — must use Vitest `expect().toBe()` pattern
10. **File placement** — utility in `src/utils/`, test in `test/`

### Exact Prompt (Use This Verbatim in Both Sessions)

```
Add a rate limiting utility to h3.

Requirements:
- New utility in src/utils/ that tracks requests per IP address
- Configurable window (default 60s) and max requests (default 100)
- When limit exceeded, respond with 429 Too Many Requests
- Provide both a middleware function and a manual check function
- Support custom key extraction (not just IP)
- Add a test file covering: basic rate limiting, custom window/max, custom key function, limit reset after window, and 429 response format
```

---

## Step-by-Step Testing Guide

### Setup

```bash
# Clone h3 twice
git clone https://github.com/h3js/h3.git ~/codescope-eval/h3-with-codescope
git clone https://github.com/h3js/h3.git ~/codescope-eval/h3-vanilla

# Install dependencies in both
cd ~/codescope-eval/h3-with-codescope && pnpm install
cd ~/codescope-eval/h3-vanilla && pnpm install
```

### Test A: With CodeScope

```bash
cd ~/codescope-eval/h3-with-codescope
claude --plugin-dir /Users/jaywadhwa/codescope
```

Or if plugin marketplace works:

```bash
cd ~/codescope-eval/h3-with-codescope
claude
# Then: /bootstrap
# Wait for analysis, then paste the task prompt
```

### Test B: Vanilla Claude Code

```bash
cd ~/codescope-eval/h3-vanilla
claude
# Just paste the exact same task prompt — no CodeScope
```

### Save Results

```bash
# After each session, save the new files
cd ~/codescope-eval/h3-with-codescope
git diff --no-index /dev/null src/utils/rate-limit.ts > ../h3-codescope-util.patch 2>/dev/null
git diff --no-index /dev/null test/rate-limit.test.ts > ../h3-codescope-test.patch 2>/dev/null

cd ~/codescope-eval/h3-vanilla
# Find whatever files Claude created (might be different names/locations)
find . -name "*rate*limit*" -not -path "./node_modules/*"
```

---

## Evaluation Rubric (14 points)

### Architecture (5 points)

| # | Criteria | CodeScope | Vanilla |
|---|----------|:-:|:-:|
| 1 | **Utility functions** — exports flat functions, not a class | | |
| 2 | **H3Event context** — functions accept `H3Event`, not `req`/`res`/`Request` | | |
| 3 | **HTTPError** — uses `new HTTPError({ status: 429 })` for limit exceeded | | |
| 4 | **`_` prefix** — internal helpers/state use `_` prefix | | |
| 5 | **`import type`** — type imports separated from value imports | | |

### File Conventions (4 points)

| # | Criteria | CodeScope | Vanilla |
|---|----------|:-:|:-:|
| 6 | **Utility location** — file is `src/utils/rate-limit.ts` (kebab-case, in utils/) | | |
| 7 | **Section comments** — uses `// --- section ---` dividers | | |
| 8 | **Function overloads** — uses multiple signatures for flexible API | | |
| 9 | **Export style** — uses `export function` declarations (not `export default` or `export const`) | | |

### Test Conventions (5 points)

| # | Criteria | CodeScope | Vanilla |
|---|----------|:-:|:-:|
| 10 | **`describeMatrix()`** — uses h3's matrix test pattern (web + Node.js) | | |
| 11 | **Shared TestContext** — uses `ctx.fetch()`, `ctx.app` from `_setup.ts` | | |
| 12 | **Vitest** — uses `describe/it/expect`, not `node:test` or Jest | | |
| 13 | **Test location** — file is `test/rate-limit.test.ts` (flat in test/) | | |
| 14 | **Error assertions** — tests 429 response via `expect(res.status).toBe(429)` | | |

### Scoring

```
12-14: CodeScope clearly demonstrates value
9-11:  Strong improvement
6-8:   Moderate improvement
0-5:   Minimal difference
```

---

## What to Screenshot for GitHub

### 1. The utility file side-by-side

Highlight:
- Class vs utility functions
- `req/res` vs `H3Event`
- `throw new Error()` vs `new HTTPError()`
- `_` prefix usage

### 2. The test file side-by-side

Highlight:
- `describeMatrix()` vs plain `describe()`
- `ctx.fetch()` vs standalone app creation
- Import paths and setup

### 3. The filled-in scorecard

### 4. The money quote

```
Vanilla Claude wrote a RateLimiter class with req/res params.
CodeScope Claude wrote utility functions accepting H3Event — matching
h3's architecture exactly.

Claude had no way to know h3 uses H3Event and utility functions
instead of classes — unless something analyzed the codebase first.
```

---

## Expected Results

Vanilla Claude will almost certainly:
- **Create a class** (`class RateLimiter`) — Claude defaults to OOP for stateful utilities
- **Use `Request`/`Response`** — standard web API or Express-style `req, res`
- **Use `throw new Error()`** — not h3's `HTTPError`
- **Write plain `describe/it`** — not `describeMatrix()`
- **Skip `import type`** — mix type and value imports
- **Use camelCase filename** — `rateLimit.ts` or `rateLimiter.ts`
- **Put tests in wrong structure** — nested or wrong naming

CodeScope should detect h3's patterns from the codebase analysis and guide Claude to match them.

**Prediction: Vanilla scores 3-5/14, CodeScope scores 10-14/14.**

---

## README Section (After Testing)

```markdown
## Does It Work?

We ran the same task on [h3](https://github.com/h3js/h3) (the HTTP framework behind Nuxt) — once with CodeScope, once without.

**Task:** Add a rate limiting utility to h3.

| Criteria | Without CodeScope | With CodeScope |
|----------|:-:|:-:|
| Utility functions (not class) | X | Y |
| H3Event context (not req/res) | X | Y |
| HTTPError (not throw Error) | X | Y |
| Internal `_` prefix | X | Y |
| `import type` separation | X | Y |
| kebab-case file in src/utils/ | X | Y |
| Section comment dividers | X | Y |
| `describeMatrix()` test pattern | X | Y |
| Shared TestContext | X | Y |
| **Score** | **X/14** | **Y/14** |

> Claude had no way to know h3 uses `H3Event` and utility functions
> instead of classes — unless something analyzed the codebase first.
> That's CodeScope.
```
