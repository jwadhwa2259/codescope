import { execSync } from "node:child_process";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface IncrementalAnalysis {
  mode: "full" | "incremental";
  reason: string;
  changedFiles: string[];
  changedPercentage: number;
  affectedServices: string[];
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

/**
 * Analyzes changes since the last bootstrap to determine if incremental
 * or full bootstrap is needed.
 *
 * Decision logic per D-09:
 * - No previous timestamp: full bootstrap (first run)
 * - <50% files changed: incremental (only re-analyze affected services)
 * - >=50% files changed: full bootstrap (too many changes)
 * - Git diff failure: full bootstrap (safe fallback)
 *
 * @param projectRoot Absolute path to project root
 * @param lastBootstrapTimestamp ISO 8601 timestamp of last bootstrap, or null for first run
 * @param totalFileCount Total number of source files in the project
 * @param servicePaths Optional array of service name/path pairs for affected service detection
 */
export function analyzeChanges(
  projectRoot: string,
  lastBootstrapTimestamp: string | null,
  totalFileCount: number,
  servicePaths?: Array<{ name: string; path: string }>,
): IncrementalAnalysis {
  // First bootstrap: no previous timestamp
  if (lastBootstrapTimestamp === null) {
    return {
      mode: "full",
      reason: "First bootstrap",
      changedFiles: [],
      changedPercentage: 100,
      affectedServices: [],
    };
  }

  try {
    // Run git diff to detect changes since last bootstrap
    const diff = execSync(
      `git diff --name-only --diff-filter=ACMRD "${lastBootstrapTimestamp}" HEAD`,
      {
        cwd: projectRoot,
        encoding: "utf-8",
        maxBuffer: 10 * 1024 * 1024,
      },
    ).trim();

    const changedFiles = diff ? diff.split("\n") : [];
    const changedPercentage =
      totalFileCount > 0
        ? Math.round((changedFiles.length / totalFileCount) * 100)
        : 100;

    // Threshold check: >=50% triggers full re-bootstrap
    if (changedPercentage >= 50) {
      return {
        mode: "full",
        reason: `>${changedPercentage}% files changed (exceeds 50% threshold)`,
        changedFiles,
        changedPercentage,
        affectedServices: determineAffectedServices(
          changedFiles,
          servicePaths,
        ),
      };
    }

    return {
      mode: "incremental",
      reason: `${changedFiles.length} files changed`,
      changedFiles,
      changedPercentage,
      affectedServices: determineAffectedServices(changedFiles, servicePaths),
    };
  } catch {
    // Git diff failure: safe fallback to full
    return {
      mode: "full",
      reason: "Git diff failed",
      changedFiles: [],
      changedPercentage: 100,
      affectedServices: [],
    };
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Maps changed file paths to affected service names.
 * A service is affected if any changed file's path starts with the service's path.
 */
function determineAffectedServices(
  changedFiles: string[],
  servicePaths?: Array<{ name: string; path: string }>,
): string[] {
  if (!servicePaths || servicePaths.length === 0) return [];

  const affected = new Set<string>();
  for (const file of changedFiles) {
    for (const service of servicePaths) {
      // Normalize: ensure service path ends without trailing slash for prefix match
      const normalizedServicePath = service.path.replace(/\/$/, "");
      if (
        file.startsWith(normalizedServicePath + "/") ||
        file === normalizedServicePath
      ) {
        affected.add(service.name);
      }
    }
  }

  return Array.from(affected);
}
