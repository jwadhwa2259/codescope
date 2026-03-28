---
phase: 11
slug: pr-review-impact-prediction
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-28
---

# Phase 11 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 4.x |
| **Config file** | vitest.config.ts |
| **Quick run command** | `npx vitest run --reporter=verbose` |
| **Full suite command** | `npx vitest run --reporter=verbose` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run --reporter=verbose`
- **After every plan wave:** Run `npx vitest run --reporter=verbose`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 11-01-01 | 01 | 1 | REVIEW-01 | unit | `npx vitest run tests/tools/review.test.ts` | ❌ W0 | ⬜ pending |
| 11-01-02 | 01 | 1 | REVIEW-02 | unit | `npx vitest run tests/tools/review.test.ts` | ❌ W0 | ⬜ pending |
| 11-01-03 | 01 | 1 | REVIEW-03 | unit | `npx vitest run tests/tools/review.test.ts` | ❌ W0 | ⬜ pending |
| 11-01-04 | 01 | 1 | REVIEW-04 | unit | `npx vitest run tests/tools/review.test.ts` | ❌ W0 | ⬜ pending |
| 11-02-01 | 02 | 1 | IMPACT-01 | unit | `npx vitest run tests/graph/reverse-bfs.test.ts` | ❌ W0 | ⬜ pending |
| 11-02-02 | 02 | 1 | IMPACT-02 | unit | `npx vitest run tests/tools/predict-impact.test.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/tools/review.test.ts` — stubs for REVIEW-01 through REVIEW-04
- [ ] `tests/graph/reverse-bfs.test.ts` — stubs for reverse BFS traversal (IMPACT-01)
- [ ] `tests/tools/predict-impact.test.ts` — stubs for codescope_predict_impact tool (IMPACT-02)

*Existing vitest infrastructure covers framework needs — no new framework install required.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| `/codescope:review` skill formatting | REVIEW-01 | Skill output is rendered by Claude Code — requires visual verification | Run `/codescope:review` on a test branch and verify markdown renders correctly |
| `gh pr diff` integration | REVIEW-04 | Requires authenticated gh CLI and a real PR | Create a test PR, run `codescope_review` with PR number, verify diff is parsed |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
