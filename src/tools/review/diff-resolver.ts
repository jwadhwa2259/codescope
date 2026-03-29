import { execFileSync } from "node:child_process";
import type { DiffResolution, DiffError } from "./types.js";

/**
 * Parse file paths from a git diff string.
 * Extracts paths from "diff --git a/path b/path" lines.
 */
function parseFilesFromDiff(diff: string): string[] {
  const files = new Set<string>();
  const lines = diff.split("\n");

  for (const line of lines) {
    const match = line.match(/^diff --git a\/(.+?) b\/(.+?)$/);
    if (match) {
      files.add(match[2]);
    }
  }

  return Array.from(files);
}

/**
 * Get changed files from git diff in the working directory.
 */
function getWorkingDirChanges(projectRoot: string): string[] {
  try {
    const output = execFileSync("git", ["diff", "--name-only", "HEAD"], {
      cwd: projectRoot,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    });
    return output
      .trim()
      .split("\n")
      .filter((line) => line.length > 0);
  } catch {
    return [];
  }
}

/**
 * Detect the default branch for the repository.
 * Tries symbolic-ref first, then falls back to common names.
 */
function detectDefaultBranch(projectRoot: string): string {
  try {
    const ref = execFileSync(
      "git",
      ["symbolic-ref", "refs/remotes/origin/HEAD", "--short"],
      {
        cwd: projectRoot,
        encoding: "utf-8",
        stdio: ["pipe", "pipe", "pipe"],
      },
    ).trim();
    // ref is like "origin/main" -- strip "origin/" prefix
    return ref.replace(/^origin\//, "");
  } catch {
    // Fallback: try common names
    try {
      execFileSync("git", ["rev-parse", "--verify", "main"], {
        cwd: projectRoot,
        encoding: "utf-8",
        stdio: ["pipe", "pipe", "pipe"],
      });
      return "main";
    } catch {
      return "master";
    }
  }
}

/**
 * Resolve diff input through the priority chain per D-03:
 * explicit diff > PR number > branch name > working tree
 */
export function resolveDiff(
  args: Record<string, unknown>,
  projectRoot: string,
): DiffResolution | DiffError {
  // 1. Explicit diff string provided
  if (args.diff && typeof args.diff === "string") {
    return {
      files: parseFilesFromDiff(args.diff),
      diffText: args.diff,
      source: "diff",
    };
  }

  // 2. PR number (via gh CLI)
  if (args.pr_number !== undefined && args.pr_number !== null) {
    const prNum = Number(args.pr_number);
    if (!Number.isInteger(prNum) || prNum <= 0) {
      return {
        error: true,
        code: "INVALID_PR_NUMBER",
        message: `Invalid PR number: ${args.pr_number}. Must be a positive integer.`,
        recovery: "Provide a valid PR number, branch name, or diff string.",
      };
    }

    try {
      const diff = execFileSync("gh", ["pr", "diff", String(prNum)], {
        cwd: projectRoot,
        encoding: "utf-8",
        maxBuffer: 50 * 1024 * 1024,
        stdio: ["pipe", "pipe", "pipe"],
      });
      return {
        files: parseFilesFromDiff(diff),
        diffText: diff,
        source: "pr",
      };
    } catch {
      return {
        error: true,
        code: "GH_CLI_UNAVAILABLE",
        message:
          "Failed to retrieve PR diff. The gh CLI may not be installed or authenticated.",
        recovery: "Use branch name or working tree diff instead.",
      };
    }
  }

  // 3. Branch name (via git diff)
  if (args.branch && typeof args.branch === "string") {
    const branch = args.branch;
    // Validate branch name to prevent injection
    if (!/^[a-zA-Z0-9._\/-]+$/.test(branch)) {
      return {
        error: true,
        code: "INVALID_BRANCH_NAME",
        message: `Invalid branch name: "${branch}". Branch names must match [a-zA-Z0-9._/-]+.`,
        recovery: "Provide a valid branch name.",
      };
    }

    const baseBranch = detectDefaultBranch(projectRoot);
    try {
      const diffText = execFileSync(
        "git",
        ["diff", `${baseBranch}...${branch}`],
        {
          cwd: projectRoot,
          encoding: "utf-8",
          maxBuffer: 50 * 1024 * 1024,
          stdio: ["pipe", "pipe", "pipe"],
        },
      );

      return {
        files: parseFilesFromDiff(diffText),
        diffText,
        source: "branch",
      };
    } catch {
      return {
        error: true,
        code: "BRANCH_DIFF_FAILED",
        message: `Failed to compute diff for branch "${branch}" against "${baseBranch}".`,
        recovery:
          "Check that the branch exists and try again, or provide a diff string directly.",
      };
    }
  }

  // 4. Working tree diff (default)
  return {
    files: getWorkingDirChanges(projectRoot),
    diffText: "",
    source: "working_tree",
  };
}
