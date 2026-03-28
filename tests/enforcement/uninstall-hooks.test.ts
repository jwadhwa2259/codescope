import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { installPreCommitHook } from "../../src/enforcement/install-hooks.js";
import { uninstallPreCommitHook } from "../../src/enforcement/uninstall-hooks.js";
import type { UninstallResult } from "../../src/enforcement/uninstall-hooks.js";

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function createTempProject(): string {
  const dir = mkdtempSync(join(tmpdir(), "codescope-uninstall-hooks-"));
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

describe("uninstallPreCommitHook", () => {
  let tmpDir: string;

  afterEach(() => {
    if (tmpDir && existsSync(tmpDir)) {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  // Test 1: restores backup when it exists (.codescope-backup -> pre-commit)
  it("restores backup when .codescope-backup exists", () => {
    tmpDir = createTempProject();

    // Install with existing hook (creates backup)
    const hookPath = join(tmpDir, ".git", "hooks", "pre-commit");
    writeFileSync(hookPath, "#!/bin/sh\necho 'original hook'\n", { mode: 0o755 });
    installPreCommitHook(tmpDir);

    // Verify backup was created
    const backupPath = join(tmpDir, ".git", "hooks", "pre-commit.codescope-backup");
    expect(existsSync(backupPath)).toBe(true);

    // Uninstall
    const result: UninstallResult = uninstallPreCommitHook(tmpDir);

    expect(result.uninstalled).toBe(true);
    expect(result.method).toBe("git-hooks");
    expect(result.restoredBackup).toBe(true);

    // Original hook should be restored
    const content = readFileSync(hookPath, "utf-8");
    expect(content).toContain("original hook");
    expect(existsSync(backupPath)).toBe(false);
  });

  // Test 2: removes CodeScope marker block from husky pre-commit
  it("removes CodeScope marker block from husky pre-commit", () => {
    tmpDir = createTempProjectWithHusky();
    const huskyHookPath = join(tmpDir, ".husky", "pre-commit");
    writeFileSync(huskyHookPath, "#!/bin/sh\nnpm test\n", { mode: 0o755 });

    // Install into husky
    installPreCommitHook(tmpDir);

    // Verify marker was added
    let content = readFileSync(huskyHookPath, "utf-8");
    expect(content).toContain("# codescope-enforcement-start");

    // Uninstall
    const result = uninstallPreCommitHook(tmpDir);

    expect(result.uninstalled).toBe(true);
    expect(result.method).toBe("husky");
    expect(result.restoredBackup).toBe(false);

    // Original content should remain, marker block should be gone
    content = readFileSync(huskyHookPath, "utf-8");
    expect(content).toContain("npm test");
    expect(content).not.toContain("# codescope-enforcement-start");
    expect(content).not.toContain("# codescope-enforcement-end");
    expect(content).not.toContain("pre-commit-check.mjs");
  });

  // Test 3: removes .git/hooks/pre-commit entirely when no backup exists
  it("removes .git/hooks/pre-commit entirely when CodeScope was only hook", () => {
    tmpDir = createTempProject();

    // Install fresh (no existing hook, so no backup)
    installPreCommitHook(tmpDir);

    const hookPath = join(tmpDir, ".git", "hooks", "pre-commit");
    expect(existsSync(hookPath)).toBe(true);

    // Uninstall
    const result = uninstallPreCommitHook(tmpDir);

    expect(result.uninstalled).toBe(true);
    expect(result.method).toBe("git-hooks");
    expect(result.restoredBackup).toBe(false);

    // Hook should be removed entirely
    expect(existsSync(hookPath)).toBe(false);
  });

  // Test 4: idempotent -- no error when already uninstalled
  it("is idempotent -- no error when already uninstalled", () => {
    tmpDir = createTempProject();

    // No hooks installed at all
    const result = uninstallPreCommitHook(tmpDir);

    expect(result.uninstalled).toBe(false);
    expect(result.method).toBe("none");
    expect(result.restoredBackup).toBe(false);
    expect(result.message).toContain("No CodeScope hooks found");
  });
});
