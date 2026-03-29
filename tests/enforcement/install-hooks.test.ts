import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, statSync, existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { installPreCommitHook } from "../../src/enforcement/install-hooks.js";
import type { InstallResult } from "../../src/enforcement/install-hooks.js";

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function createTempProject(): string {
  const dir = mkdtempSync(join(tmpdir(), "codescope-install-hooks-"));
  mkdirSync(join(dir, ".git", "hooks"), { recursive: true });
  return dir;
}

function createTempProjectWithHusky(): string {
  const dir = createTempProject();
  mkdirSync(join(dir, ".husky"), { recursive: true });
  return dir;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("installPreCommitHook", () => {
  let tmpDir: string;

  afterEach(() => {
    if (tmpDir && existsSync(tmpDir)) {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  // Test 1: installs wrapper to .git/hooks/pre-commit when no husky
  it("installs wrapper to .git/hooks/pre-commit when no husky", () => {
    tmpDir = createTempProject();
    const result: InstallResult = installPreCommitHook(tmpDir);

    expect(result.installed).toBe(true);
    expect(result.method).toBe("git-hooks");
    expect(result.backedUp).toBe(false);

    const hookPath = join(tmpDir, ".git", "hooks", "pre-commit");
    expect(existsSync(hookPath)).toBe(true);

    const content = readFileSync(hookPath, "utf-8");
    expect(content).toContain("pre-commit-check.mjs");
    expect(content).toContain("git diff --cached --name-only --diff-filter=ACM");
    expect(content).toContain("codescope-backup");
    expect(content).toContain("#!/bin/sh");
  });

  // Test 2: backs up existing .git/hooks/pre-commit to .codescope-backup
  it("backs up existing .git/hooks/pre-commit to .codescope-backup", () => {
    tmpDir = createTempProject();
    const hookPath = join(tmpDir, ".git", "hooks", "pre-commit");
    writeFileSync(hookPath, "#!/bin/sh\necho 'existing hook'\n", { mode: 0o755 });

    const result = installPreCommitHook(tmpDir);

    expect(result.installed).toBe(true);
    expect(result.method).toBe("git-hooks");
    expect(result.backedUp).toBe(true);

    const backupPath = join(tmpDir, ".git", "hooks", "pre-commit.codescope-backup");
    expect(existsSync(backupPath)).toBe(true);
    const backupContent = readFileSync(backupPath, "utf-8");
    expect(backupContent).toContain("existing hook");
  });

  // Test 3: wrapper script runs backup hook first, then CodeScope check
  it("wrapper script runs backup hook first, then CodeScope check", () => {
    tmpDir = createTempProject();
    const hookPath = join(tmpDir, ".git", "hooks", "pre-commit");
    writeFileSync(hookPath, "#!/bin/sh\necho 'existing'\n", { mode: 0o755 });

    installPreCommitHook(tmpDir);

    const content = readFileSync(hookPath, "utf-8");
    // Backup check should come before CodeScope check
    const backupIndex = content.indexOf("codescope-backup");
    const checkIndex = content.indexOf("pre-commit-check.mjs");
    expect(backupIndex).toBeGreaterThan(-1);
    expect(checkIndex).toBeGreaterThan(-1);
    expect(backupIndex).toBeLessThan(checkIndex);
  });

  // Test 4: detects .husky/ dir and appends to .husky/pre-commit
  it("detects .husky/ dir and appends to .husky/pre-commit", () => {
    tmpDir = createTempProjectWithHusky();
    const huskyHookPath = join(tmpDir, ".husky", "pre-commit");
    writeFileSync(huskyHookPath, "#!/bin/sh\nnpm test\n", { mode: 0o755 });

    const result = installPreCommitHook(tmpDir);

    expect(result.installed).toBe(true);
    expect(result.method).toBe("husky");
    expect(result.backedUp).toBe(false);

    const content = readFileSync(huskyHookPath, "utf-8");
    expect(content).toContain("npm test");
    expect(content).toContain("pre-commit-check.mjs");
  });

  // Test 5: with husky adds marker block (codescope-enforcement-start/end)
  it("with husky adds marker block with start/end markers", () => {
    tmpDir = createTempProjectWithHusky();
    const huskyHookPath = join(tmpDir, ".husky", "pre-commit");
    writeFileSync(huskyHookPath, "#!/bin/sh\nnpm test\n", { mode: 0o755 });

    installPreCommitHook(tmpDir);

    const content = readFileSync(huskyHookPath, "utf-8");
    expect(content).toContain("# codescope-enforcement-start");
    expect(content).toContain("# codescope-enforcement-end");
  });

  // Test 6: with husky is idempotent (doesn't add marker block twice)
  it("with husky is idempotent -- does not add marker block twice", () => {
    tmpDir = createTempProjectWithHusky();
    const huskyHookPath = join(tmpDir, ".husky", "pre-commit");
    writeFileSync(huskyHookPath, "#!/bin/sh\nnpm test\n", { mode: 0o755 });

    installPreCommitHook(tmpDir);
    const result2 = installPreCommitHook(tmpDir);

    expect(result2.installed).toBe(true);

    const content = readFileSync(huskyHookPath, "utf-8");
    const startCount = (content.match(/# codescope-enforcement-start/g) || []).length;
    expect(startCount).toBe(1);
  });

  // Test 7: sets file permissions to 0o755
  it("sets file permissions to 0o755", () => {
    tmpDir = createTempProject();

    installPreCommitHook(tmpDir);

    const hookPath = join(tmpDir, ".git", "hooks", "pre-commit");
    const mode = statSync(hookPath).mode & 0o777;
    expect(mode).toBe(0o755);
  });

  // Additional: husky without existing pre-commit creates one with shebang
  it("creates husky pre-commit with shebang when none exists", () => {
    tmpDir = createTempProjectWithHusky();
    // No .husky/pre-commit exists yet

    const result = installPreCommitHook(tmpDir);

    expect(result.installed).toBe(true);
    expect(result.method).toBe("husky");

    const huskyHookPath = join(tmpDir, ".husky", "pre-commit");
    const content = readFileSync(huskyHookPath, "utf-8");
    expect(content).toMatch(/^#!/);
    expect(content).toContain("# codescope-enforcement-start");
  });

  // Test: running install twice on git-hooks path does not create fork bomb
  it("is idempotent on git-hooks path -- does not backup own wrapper (fork bomb prevention)", () => {
    tmpDir = createTempProject();

    // First install
    const result1 = installPreCommitHook(tmpDir);
    expect(result1.installed).toBe(true);
    expect(result1.method).toBe("git-hooks");

    // Second install -- should detect own wrapper and skip
    const result2 = installPreCommitHook(tmpDir);
    expect(result2.installed).toBe(true);
    expect(result2.backedUp).toBe(false);
    expect(result2.message).toContain("already installed");

    // Verify no backup was created (or if it was, it's not the CodeScope wrapper)
    const backupPath = join(tmpDir, ".git", "hooks", "pre-commit.codescope-backup");
    if (existsSync(backupPath)) {
      const backupContent = readFileSync(backupPath, "utf-8");
      expect(backupContent).not.toContain("CodeScope convention enforcement pre-commit hook");
    }
  });

  // Additional: creates .git/hooks/ directory if it doesn't exist
  it("creates .git/hooks/ directory if it does not exist", () => {
    tmpDir = mkdtempSync(join(tmpdir(), "codescope-install-hooks-"));
    mkdirSync(join(tmpDir, ".git"), { recursive: true });
    // No hooks/ subdirectory

    const result = installPreCommitHook(tmpDir);

    expect(result.installed).toBe(true);
    expect(result.method).toBe("git-hooks");

    const hookPath = join(tmpDir, ".git", "hooks", "pre-commit");
    expect(existsSync(hookPath)).toBe(true);
  });
});
