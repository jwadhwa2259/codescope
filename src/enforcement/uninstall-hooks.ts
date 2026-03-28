// ---------------------------------------------------------------------------
// Hook Uninstallation CLI
// ---------------------------------------------------------------------------
// Cleanly removes CodeScope convention enforcement from the git pre-commit
// hook. Restores backed-up hooks, removes husky marker blocks, and handles
// already-uninstalled state gracefully.
//
// Usage: npx codescope uninstall-hooks
// ---------------------------------------------------------------------------

import {
  existsSync,
  readFileSync,
  writeFileSync,
  renameSync,
  unlinkSync,
} from "node:fs";
import { join } from "node:path";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface UninstallResult {
  uninstalled: boolean;
  method: "husky" | "git-hooks" | "none";
  restoredBackup: boolean;
  message: string;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Uninstall CodeScope convention enforcement from the pre-commit hook.
 *
 * Detects husky (.husky/ directory) and removes marker block.
 * Otherwise restores backup or removes CodeScope-created hook.
 *
 * @param projectRoot - Absolute path to the project root
 * @returns UninstallResult describing what was done
 */
export function uninstallPreCommitHook(projectRoot: string): UninstallResult {
  const huskyDir = join(projectRoot, ".husky");

  if (existsSync(huskyDir)) {
    return uninstallHusky(huskyDir);
  }

  return uninstallGitHooks(projectRoot);
}

// ---------------------------------------------------------------------------
// Internal: Husky removal (D-03)
// ---------------------------------------------------------------------------

function uninstallHusky(huskyDir: string): UninstallResult {
  const huskyHookPath = join(huskyDir, "pre-commit");

  if (!existsSync(huskyHookPath)) {
    return {
      uninstalled: false,
      method: "none",
      restoredBackup: false,
      message: "No CodeScope hooks found.",
    };
  }

  const content = readFileSync(huskyHookPath, "utf-8");

  if (!content.includes("# codescope-enforcement-start")) {
    return {
      uninstalled: false,
      method: "none",
      restoredBackup: false,
      message: "No CodeScope hooks found.",
    };
  }

  // Remove content between start and end markers (inclusive)
  const cleaned = content.replace(
    /\n?# codescope-enforcement-start[\s\S]*?# codescope-enforcement-end\n?/,
    "\n",
  );

  writeFileSync(huskyHookPath, cleaned, { mode: 0o755 });

  return {
    uninstalled: true,
    method: "husky",
    restoredBackup: false,
    message: "CodeScope enforcement removed from husky pre-commit hook.",
  };
}

// ---------------------------------------------------------------------------
// Internal: .git/hooks/ removal
// ---------------------------------------------------------------------------

function uninstallGitHooks(projectRoot: string): UninstallResult {
  const hooksDir = join(projectRoot, ".git", "hooks");
  const hookPath = join(hooksDir, "pre-commit");
  const backupPath = join(hooksDir, "pre-commit.codescope-backup");

  // Case 1: Backup exists -- restore it
  if (existsSync(backupPath)) {
    if (existsSync(hookPath)) {
      unlinkSync(hookPath);
    }
    renameSync(backupPath, hookPath);
    return {
      uninstalled: true,
      method: "git-hooks",
      restoredBackup: true,
      message:
        "CodeScope enforcement hook removed. Original hook restored from backup.",
    };
  }

  // Case 2: No backup, check if hook exists and is CodeScope's
  if (existsSync(hookPath)) {
    const content = readFileSync(hookPath, "utf-8");
    if (content.includes("CodeScope") || content.includes("codescope")) {
      unlinkSync(hookPath);
      return {
        uninstalled: true,
        method: "git-hooks",
        restoredBackup: false,
        message: "CodeScope enforcement hook removed.",
      };
    }
  }

  // Case 3: No hook found
  return {
    uninstalled: false,
    method: "none",
    restoredBackup: false,
    message: "No CodeScope hooks found.",
  };
}

// ---------------------------------------------------------------------------
// CLI entry point (guarded for testability)
// ---------------------------------------------------------------------------

const isMainModule =
  typeof process !== "undefined" &&
  process.argv[1] &&
  import.meta.url &&
  (process.argv[1] === new URL(import.meta.url).pathname ||
    process.argv[1].endsWith("uninstall-hooks.js") ||
    process.argv[1].endsWith("uninstall-hooks.mjs"));

if (isMainModule) {
  const projectRoot = process.cwd();
  const result = uninstallPreCommitHook(projectRoot);
  console.log(result.message);
  process.exit(result.uninstalled ? 0 : 1);
}
