# Comparison Results — Effect-TS (Stream.slidingWindow)

## Key Finding

**The internal implementations are byte-for-byte identical.** Both vanilla and CodeScope produced the exact same `internal/stream.ts` diff (commit hash `7d6f9ebe9`). The only differences are in the JSDoc of the public API file.

---

## Patch Analysis

### Files Modified

| File | Vanilla | CodeScope |
|------|:-------:|:---------:|
| `packages/effect/src/Stream.ts` (public API) | Yes | Yes |
| `packages/effect/src/internal/stream.ts` (impl) | Yes (identical) | Yes (identical) |
| Test files | Not created | Not created |
| `.changeset/` | Not created | Not created |

### Implementation Details (Identical in Both)

Both correctly produced:
- `dual<>()` wrapper with arity 2
- Channel-based implementation using `core.readWithCause`
- `RingBuffer<A>` for window state
- `Chunk.filterMap` with `Option.none()`/`Option.some()` for window emission
- `Cause.IllegalArgumentException` for invalid input
- `StreamImpl` + `core.suspend` for lazy construction
- Proper `Channel.Channel<>` type annotation on the reader

### JSDoc Differences (The Only Difference)

| Aspect | Vanilla | CodeScope |
|--------|---------|-----------|
| `@example` tag | Yes, with runnable code | No tag, code is commented out |
| Number of examples | 2 (basic + edge case) | 1 (basic only, commented) |
| `@since` | `2.0.0` | `2.0.0` |
| `@category` | `utils` | `utils` |
| Bold `**Details**` header | No | No |

**Vanilla had slightly better JSDoc** — runnable `@example` blocks vs commented-out code.

---

## 19-Point Scorecard

### Architecture & Patterns (7 points)

| # | Criteria | CodeScope | Vanilla | Notes |
|---|----------|:---------:|:-------:|-------|
| 1 | `Effect.gen` + `yield*` (or correct idiom) | PASS | PASS | Both used Channel primitives — the correct pattern for Stream internals |
| 2 | `dual()` wrapper | PASS | PASS | Identical |
| 3 | Public/internal split | PASS | PASS | Both: signature in `Stream.ts`, impl in `internal/stream.ts` |
| 4 | Namespace imports | PASS | PASS | Both use existing `Chunk.*`, `core.*`, `Option.*` namespace refs |
| 5 | `.js` import extensions | N/A | N/A | No new imports added by either (modified existing files) |
| 6 | No barrel imports | PASS | PASS | Neither imported from `"effect"` |
| 7 | `Chunk` type usage | PASS | PASS | Both emit `Chunk.Chunk<A>` |

**Architecture: CodeScope 6/6, Vanilla 6/6** (1 N/A)

### Code Style & Conventions (6 points)

| # | Criteria | CodeScope | Vanilla | Notes |
|---|----------|:---------:|:-------:|-------|
| 8 | No semicolons | PASS | PASS | |
| 9 | Double quotes | PASS | PASS | |
| 10 | `Array<T>` syntax | PASS | PASS | No array shorthand used |
| 11 | `import type` separation | N/A | N/A | No new imports |
| 12 | JSDoc format (`@since`, `@category`, bold headers) | PARTIAL | PASS | Vanilla had proper `@example` tag; CodeScope had commented-out example |
| 13 | Barrel untouched | PASS | PASS | Neither edited auto-generated files |

**Style: CodeScope 4.5/5, Vanilla 5/5** (1 N/A)

### Test Conventions (4 points)

| # | Criteria | CodeScope | Vanilla |
|---|----------|:---------:|:-------:|
| 14 | `@effect/vitest` imports | FAIL | FAIL |
| 15 | `it.effect()` pattern | FAIL | FAIL |
| 16 | `assert.*` assertions | FAIL | FAIL |
| 17 | Generator in tests | FAIL | FAIL |

**Tests: CodeScope 0/4, Vanilla 0/4** — Neither created test files.

### PR Conventions (2 points)

| # | Criteria | CodeScope | Vanilla |
|---|----------|:---------:|:-------:|
| 18 | Changeset file | FAIL | FAIL |
| 19 | Changeset format | FAIL | FAIL |

**PR: CodeScope 0/2, Vanilla 0/2**

---

## Final Scores

| Category | CodeScope | Vanilla |
|----------|:---------:|:-------:|
| Architecture (7) | 6/6* | 6/6* |
| Style (6) | 4.5/5* | 5/5* |
| Tests (4) | 0/4 | 0/4 |
| PR (2) | 0/2 | 0/2 |
| **Total** | **10.5/17** | **11/17** |

*Adjusted for 2 N/A criteria that neither could be scored on.

**Predicted: Vanilla 0-3/19, CodeScope 13-19/19**
**Actual: Vanilla 11/17, CodeScope 10.5/17**

---

## Why The Prediction Was Wrong

### 1. Claude Has Effect-TS Training Data

Our prediction assumed Claude had minimal training data on Effect's internal patterns. **This was wrong.** Claude clearly knows:
- The `dual()` pattern
- Channel-based Stream implementation
- `RingBuffer`, `core.readWithCause`, `core.flatMap`
- The public/internal module split
- Effect's style conventions (no semicolons, double quotes)

### 2. The Adjacent Code Problem

The biggest factor: **`slidingSize` (an almost identical combinator) exists directly above where both inserted their code.** Claude didn't need codebase analysis — it had a perfect template in its context window. Both implementations followed `slidingSize`'s pattern exactly.

This is the "adjacent code" effect: when the task is "add something similar to what's nearby," vanilla Claude pattern-matches from the immediate file context. CodeScope's codebase analysis adds minimal value because all the patterns are already visible.

### 3. Neither Session Created Tests or Changesets

Both sessions stopped after the implementation files. The 6 rubric points for tests/changesets were available to neither. If either had been prompted to also write tests, the difference might have emerged — the test framework (`@effect/vitest` vs `vitest`) is harder to discover from file context alone.

---

## Lessons for the Next Comparison

The task was **too localized**. Both sessions only modified existing files where the conventions were already visible. For CodeScope to demonstrate value, the task needs to:

1. **Force new file creation** — where do tests go? What naming? What imports?
2. **Span multiple packages** — e.g., add a feature touching `-node`, `-common`, and `-backend` packages
3. **Require cross-file pattern discovery** — conventions not visible in the current file's context
4. **Include non-code artifacts** — changesets, config, documentation

### Better Task Ideas

- **"Add a new package to the Effect monorepo"** — forces discovery of package structure, tsconfig, build config, barrel file patterns
- **"Add a new `@effect/vitest` test matcher"** — forces discovery of the custom test harness patterns
- **"Port a utility from one Effect package to another"** — forces discovery of cross-package conventions
- A task in a repo where conventions are NOT adjacent to where new code goes (e.g., Backstage's multi-package plugin architecture)
