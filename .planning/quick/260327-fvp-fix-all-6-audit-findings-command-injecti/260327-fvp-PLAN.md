---
phase: quick
plan: 260327-fvp
type: execute
wave: 1
depends_on: []
files_modified:
  - src/tools/verify.ts
  - src/verify/static-verify.ts
  - src/conventions/runner.ts
  - src/verify/smoke-generator.ts
  - tests/verify/static-verify.test.ts
  - package.json
autonomous: true
must_haves:
  truths:
    - "All three execSync calls with template literals replaced with execFileSync array args"
    - "All 10 any types in smoke-generator.ts replaced with SyntaxNode from web-tree-sitter"
    - "npm audit shows no picomatch or brace-expansion advisories"
    - "All existing tests pass without modification (except static-verify test mock update)"
  artifacts:
    - path: "src/tools/verify.ts"
      provides: "Shell-safe ast-grep invocation via execFileSync"
      contains: 'execFileSync("sg"'
    - path: "src/verify/static-verify.ts"
      provides: "Shell-safe ast-grep invocation via execFileSync"
      contains: 'execFileSync("sg"'
    - path: "src/conventions/runner.ts"
      provides: "Shell-safe ast-grep invocation via execFileSync"
      contains: 'execFileSync("sg"'
    - path: "src/verify/smoke-generator.ts"
      provides: "Properly typed tree-sitter AST node parameters"
      contains: "SyntaxNode"
    - path: "package.json"
      provides: "Dependency overrides for vulnerability resolution"
      contains: "overrides"
  key_links:
    - from: "src/tools/verify.ts"
      to: "node:child_process"
      via: "execFileSync import"
      pattern: 'import.*execFileSync.*from "node:child_process"'
    - from: "tests/verify/static-verify.test.ts"
      to: "node:child_process"
      via: "mock must match execFileSync signature"
      pattern: "execFileSync"
---

<objective>
Fix all 6 audit findings from AUDIT_CUSTOM_REPORT.md to raise codebase health score.

Purpose: Eliminate command injection vectors in 3 files, restore type safety in smoke-generator.ts, and resolve transitive dependency advisories -- all identified in the security audit.
Output: 4 source files patched, 1 test file updated, package.json with dependency overrides.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@AUDIT_CUSTOM_REPORT.md
@src/tools/verify.ts
@src/verify/static-verify.ts
@src/conventions/runner.ts
@src/verify/smoke-generator.ts
@tests/verify/static-verify.test.ts
@package.json

<interfaces>
<!-- Existing pattern for SyntaxNode typing (from src/parser/extract.ts): -->
```typescript
import type { Node as SyntaxNode } from "web-tree-sitter";
```

<!-- Current execSync import pattern across all 3 files: -->
```typescript
import { execSync } from "node:child_process";
```

<!-- execFileSync replacement pattern (Node.js built-in, no new deps): -->
```typescript
import { execFileSync } from "node:child_process";
```

<!-- Static verify test mocks child_process at tests/verify/static-verify.test.ts:59-83.
     Currently mocks execSync -- must be updated to mock execFileSync with array signature:
     execFileSync(file: string, args: string[], opts?) instead of execSync(cmd: string, opts?) -->
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Replace execSync with execFileSync in 3 files and update test mock</name>
  <files>src/tools/verify.ts, src/verify/static-verify.ts, src/conventions/runner.ts, tests/verify/static-verify.test.ts</files>
  <action>
In all 3 source files, replace `execSync` with `execFileSync` to eliminate command injection via shell metacharacters in file paths (Audit Findings 1-3).

**src/tools/verify.ts (line 5 import, line 144-145 call):**
1. Change import from `import { execSync } from "node:child_process"` to `import { execFileSync } from "node:child_process"`.
2. Replace line 144-145:
   ```typescript
   const output = execSync(
     `sg scan --rule ${ruleFile} --json ${filePath}`,
   ```
   with:
   ```typescript
   const output = execFileSync(
     "sg", ["scan", "--rule", ruleFile, "--json", filePath],
   ```
3. Keep all other options (encoding, maxBuffer, stdio) unchanged.
4. In the catch block, the error handling stays the same -- execFileSync throws the same ExecFileSyncError shape with stdout/stderr properties.

**src/verify/static-verify.ts (line 14 import, line 98-99 call):**
1. Change import from `import { execSync } from "node:child_process"` to `import { execFileSync } from "node:child_process"`.
2. Replace line 98-99 with the same execFileSync array pattern as above.
3. Keep all other options unchanged.

**src/conventions/runner.ts (line 1 import, line 128-129 call):**
1. Change import from `import { execSync } from "node:child_process"` to `import { execFileSync } from "node:child_process"`.
2. Replace line 128-129:
   ```typescript
   const output = execSync(
     `sg scan --rule ${ruleFile} --json ${targetDir}`,
   ```
   with:
   ```typescript
   const output = execFileSync(
     "sg", ["scan", "--rule", ruleFile, "--json", targetDir],
   ```
3. Keep all other options unchanged.

**tests/verify/static-verify.test.ts (lines 31-83 mock):**
1. Update the mock tracking variable name from `mockExecSyncCalls` to `mockExecFileSyncCalls` (or keep the name but update the mock factory).
2. Update `vi.mock("node:child_process", ...)` at line 59 to export `execFileSync` instead of `execSync`.
3. The mock function signature changes from `(cmd: string, opts?)` to `(file: string, args: string[], opts?)`. The `cmd` that was a single string like `"sg scan --rule /path/rule.yml --json /path/file.ts"` is now split: `file` = `"sg"`, `args` = `["scan", "--rule", "/path/rule.yml", "--json", "/path/file.ts"]`.
4. Reconstruct the cmd string inside the mock for pattern matching: `const cmd = [file, ...args].join(" ")` so existing `cmd.includes(pattern)` checks in the test continue to work.
5. Update the `mockExecSyncCalls` push to use the reconstructed cmd string.

IMPORTANT: Do NOT touch the `execSync` call in `src/verify/smoke-generator.ts` (line 258, for `git diff`) -- that call does not interpolate untrusted paths and is intentionally a shell command (uses cwd option for projectRoot). Only the three `sg scan` calls are vulnerable.
  </action>
  <verify>
    <automated>cd /Users/jaywadhwa/codescope && npx vitest run tests/tools/verify.test.ts tests/verify/static-verify.test.ts tests/conventions/runner.test.ts --reporter=verbose 2>&1 | tail -5</automated>
  </verify>
  <done>All three execSync template-literal shell commands replaced with execFileSync array args. Static-verify test mock updated to match new signature. All 44 existing tests across the 3 test files pass.</done>
</task>

<task type="auto">
  <name>Task 2: Replace any types with SyntaxNode in smoke-generator.ts and add dependency overrides</name>
  <files>src/verify/smoke-generator.ts, package.json</files>
  <action>
**smoke-generator.ts -- Type safety fix (Audit Finding 4):**

1. Add a type-only import at the top of the file (after the existing `import { Parser, Language } from "web-tree-sitter"` on line 12):
   ```typescript
   import type { Node as SyntaxNode } from "web-tree-sitter";
   ```
   This matches the established pattern in `src/parser/extract.ts`.

2. Replace all 10 occurrences of `: any` with `: SyntaxNode`:
   - Line 50: `rootNode: any` -> `rootNode: SyntaxNode` (detectExpressEndpoints param)
   - Line 74: `(c: any)` -> `(c: SyntaxNode)` (find callback in Express detector)
   - Line 95: `rootNode: any` -> `rootNode: SyntaxNode` (detectNextJsAppRouterEndpoints param)
   - Line 116: `(c: any)` -> `(c: SyntaxNode)` (find callback in Next.js App Router)
   - Line 142: `rootNode: any` -> `rootNode: SyntaxNode` (detectNextJsPagesRouterEndpoints param)
   - Line 186: `rootNode: any` -> `rootNode: SyntaxNode` (detectFlaskEndpoints param)
   - Line 193: `(c: any)` -> `(c: SyntaxNode)` (find callback for decorator)
   - Line 196: `(c: any)` -> `(c: SyntaxNode)` (find callback for call)
   - Line 217: `(c: any)` -> `(c: SyntaxNode)` (find callback for string arg)
   - Line 226: `(c: any)` -> `(c: SyntaxNode)` (find callback for function_definition)

3. Note: The `Language` import on line 12 is unused after this change (was always unused). Remove it: change `import { Parser, Language } from "web-tree-sitter"` to `import { Parser } from "web-tree-sitter"` and keep the type import separate. This prevents a potential lint warning.

**package.json -- Dependency overrides (Audit Findings 5-6):**

Add an `"overrides"` field to package.json (after `"devDependencies"`):
```json
"overrides": {
  "picomatch": ">=4.0.4",
  "brace-expansion": ">=1.1.13"
}
```

Then run `npm install` to apply the overrides and update the lockfile.

Then run `npm audit` to confirm the advisories are resolved.
  </action>
  <verify>
    <automated>cd /Users/jaywadhwa/codescope && npx vitest run tests/verify/smoke-generator.test.ts --reporter=verbose 2>&1 | tail -5 && npx tsc --noEmit 2>&1 | tail -5 && npm audit 2>&1 | grep -E "found|picomatch|brace-expansion" | head -5</automated>
  </verify>
  <done>All 10 `any` types in smoke-generator.ts replaced with `SyntaxNode`. TypeScript compiles without errors. npm audit shows 0 vulnerabilities (or no picomatch/brace-expansion advisories). smoke-generator tests pass.</done>
</task>

</tasks>

<verification>
Run the full test suite to confirm no regressions:
```bash
cd /Users/jaywadhwa/codescope && npx vitest run --reporter=verbose 2>&1 | tail -10
```

Verify no execSync with template literals remain for sg commands:
```bash
grep -rn 'execSync.*`sg' src/
```
Should return 0 results.

Verify no `any` types remain in smoke-generator.ts:
```bash
grep -n ': any' src/verify/smoke-generator.ts
```
Should return 0 results.

Verify overrides applied:
```bash
npm ls picomatch 2>/dev/null | head -5
npm ls brace-expansion 2>/dev/null | head -5
```
</verification>

<success_criteria>
- Zero `execSync` template-literal shell commands for `sg scan` across all source files
- Zero `: any` annotations in smoke-generator.ts
- npm audit clean for picomatch and brace-expansion
- All 78 test files pass (full suite)
- TypeScript compiles without errors (`tsc --noEmit`)
</success_criteria>

<output>
After completion, create `.planning/quick/260327-fvp-fix-all-6-audit-findings-command-injecti/260327-fvp-SUMMARY.md`
</output>
