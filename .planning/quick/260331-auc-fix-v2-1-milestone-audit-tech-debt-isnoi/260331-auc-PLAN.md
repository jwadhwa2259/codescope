---
type: quick
plan: 260331-auc
autonomous: true
files_modified:
  - src/artifacts/violation-index.ts
  - .planning/phases/18-semantic-conventions/18-02-SUMMARY.md
  - .planning/phases/19-intelligence-features/19-02-SUMMARY.md
  - .planning/phases/20-eval-db-fix-audit-cleanup/20-02-SUMMARY.md
---

<objective>
Fix 4 tech debt items from the v2.1 milestone audit:
1. Replace local isNoiseFile in violation-index.ts with canonical import from golden-files.ts
2. Add missing requirements-completed frontmatter to 18-02-SUMMARY.md and 19-02-SUMMARY.md
3. Fix misleading requirements-completed in 20-02-SUMMARY.md to requirements-deferred

Purpose: Keep traceability accurate and eliminate code duplication between violation-index.ts and the canonical isNoiseFile in golden-files.ts.
Output: One source code fix (violation-index.ts) + three SUMMARY frontmatter corrections.
</objective>

<context>
@.planning/STATE.md
</context>

<tasks>

<task type="auto">
  <name>Task 1: Replace local isNoiseFile with canonical import in violation-index.ts</name>
  <files>src/artifacts/violation-index.ts</files>
  <action>
    1. Add `isNoiseFile` to the imports from `../conventions/golden-files.js` at the top of the file. Pattern from reference-index.ts line 20: `import { isNoiseFile } from "../conventions/golden-files.js";`
    2. Remove the local `isNoiseFile` function definition at lines 54-59 (the JSDoc comment + function body).
    3. Leave all call sites unchanged — the function signature is identical.

    The local definition at line 57 is:
    ```
    function isNoiseFile(filePath: string): boolean {
      return /\.(d\.ts|json|yml|yaml|md|txt|css|scss|html|svg|png|jpg|lock)$/.test(filePath);
    }
    ```
    Verify the canonical version in golden-files.ts has the same or broader coverage before removing the local one.
  </action>
  <verify>
    <automated>cd /Users/jaywadhwa/codescope && npx vitest run tests/artifacts/violation-index.test.ts</automated>
  </verify>
  <done>violation-index.ts imports isNoiseFile from golden-files.js, local function removed, all existing tests pass.</done>
</task>

<task type="auto">
  <name>Task 2: Fix SUMMARY frontmatter for 18-02, 19-02, and 20-02</name>
  <files>
    .planning/phases/18-semantic-conventions/18-02-SUMMARY.md
    .planning/phases/19-intelligence-features/19-02-SUMMARY.md
    .planning/phases/20-eval-db-fix-audit-cleanup/20-02-SUMMARY.md
  </files>
  <action>
    **18-02-SUMMARY.md:** The frontmatter currently has no `requirements-completed` field. Add the following line after the `patterns-established` block (or before the closing `---`):
    ```
    requirements-completed: [CONV-06]
    ```

    **19-02-SUMMARY.md:** The frontmatter currently has no `requirements-completed` field. Add:
    ```
    requirements-completed: [EVAL-03]
    ```

    **20-02-SUMMARY.md:** Line 34 currently reads:
    ```
    requirements-completed: [VALID-02, VALID-03]
    ```
    This is misleading — these were deferred, not completed. Change to:
    ```
    requirements-deferred: [VALID-02, VALID-03]
    ```
    Remove (or do not add) the `requirements-completed` line. If a `requirements-completed` key is needed for schema consistency, set it to an empty list: `requirements-completed: []`
  </action>
  <verify>
    <automated>cd /Users/jaywadhwa/codescope && grep -n "requirements-completed\|requirements-deferred" .planning/phases/18-semantic-conventions/18-02-SUMMARY.md .planning/phases/19-intelligence-features/19-02-SUMMARY.md .planning/phases/20-eval-db-fix-audit-cleanup/20-02-SUMMARY.md</automated>
  </verify>
  <done>
    - 18-02-SUMMARY.md has `requirements-completed: [CONV-06]`
    - 19-02-SUMMARY.md has `requirements-completed: [EVAL-03]`
    - 20-02-SUMMARY.md has `requirements-deferred: [VALID-02, VALID-03]` and no misleading requirements-completed entry
  </done>
</task>

</tasks>

<success_criteria>
- `npx vitest run tests/artifacts/violation-index.test.ts` passes with no failures
- violation-index.ts has no local `isNoiseFile` function (grep returns no match)
- 18-02-SUMMARY.md frontmatter contains `requirements-completed: [CONV-06]`
- 19-02-SUMMARY.md frontmatter contains `requirements-completed: [EVAL-03]`
- 20-02-SUMMARY.md frontmatter contains `requirements-deferred: [VALID-02, VALID-03]` with no misleading requirements-completed
</success_criteria>

<output>
After completion, commit with message: `fix(audit): replace local isNoiseFile, fix SUMMARY frontmatter gaps`
No SUMMARY file needed for quick tasks.
</output>
