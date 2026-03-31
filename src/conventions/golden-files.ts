import * as path from "node:path";
import type { ConventionResult, GoldenFileEntry } from "./types.js";

/**
 * Noise file patterns to exclude from golden file rankings (per D-11).
 * These files should not appear as exemplars.
 */
const NOISE_PATTERNS = {
  test: [/\.test\./, /\.spec\./, /__tests__/, /__test__/, /\/tests\//, /\/test\//],
  config: [/\.config\.(ts|js|mjs|cjs)$/, /\.eslintrc/, /\.prettierrc/, /^tsconfig/, /^jest\.config/, /^vitest\.config/],
  generated: [/\.generated\./, /\.gen\./, /\.pb\./],
  deprecated: [/deprecated/i, /legacy/i, /obsolete/i],
};

/**
 * Determine whether a file path is a noise file that should be excluded
 * from golden file rankings.
 */
export function isNoiseFile(filePath: string): boolean {
  const basename = path.basename(filePath);
  return Object.values(NOISE_PATTERNS).some((patterns) =>
    patterns.some((p) => p.test(basename) || p.test(filePath)),
  );
}

/**
 * Determine file language from extension.
 * Per D-15: .ts/.tsx/.js/.jsx = TypeScript, .py = Python
 */
function getFileLanguage(filePath: string): "TypeScript" | "Python" {
  return filePath.endsWith(".py") ? "Python" : "TypeScript";
}

/**
 * Determine convention language from ruleId.
 * Per D-16: language inferred from ruleId via prefix.
 * python-* = Python, everything else = TypeScript (including framework rules).
 */
function getConventionLanguage(ruleId: string): "TypeScript" | "Python" {
  return ruleId.startsWith("python-") ? "Python" : "TypeScript";
}

/**
 * Rank files by convention density -- how many conventions each file follows
 * relative to how many are applicable for that file's language.
 *
 * Per D-12: Golden files selected by highest convention density.
 * Per D-11: Noise files (test, config, generated, deprecated) excluded.
 * Per D-13: Safety fallback -- if filtering removes ALL files, use unfiltered.
 * Per D-14: Density calculated per-language (TS file / TS conventions, Python file / Python conventions).
 *
 * Returns top `maxFiles` entries (default 5).
 */
export function rankGoldenFiles(
  conventions: ConventionResult[],
  maxFiles: number = 5,
): GoldenFileEntry[] {
  if (conventions.length === 0) {
    return [];
  }

  // Partition conventions by language (per D-14)
  const tsConventions = conventions.filter(
    (c) => getConventionLanguage(c.ruleId) === "TypeScript",
  );
  const pyConventions = conventions.filter(
    (c) => getConventionLanguage(c.ruleId) === "Python",
  );

  // Collect file convention counts
  const fileConventionCount = new Map<string, number>();
  for (const conv of conventions) {
    for (const file of conv.matchingFiles) {
      fileConventionCount.set(file, (fileConventionCount.get(file) ?? 0) + 1);
    }
  }

  // Filter noise files (per D-11, D-12)
  const allFiles = [...fileConventionCount.keys()];
  const cleanFiles = allFiles.filter((f) => !isNoiseFile(f));

  // Safety fallback (per D-13): if filtering removes ALL files, use unfiltered
  const filesToRank = cleanFiles.length > 0 ? cleanFiles : allFiles;

  // Build golden file entries with per-language density
  const entries: GoldenFileEntry[] = [];
  for (const filePath of filesToRank) {
    const conventionsFollowed = fileConventionCount.get(filePath) ?? 0;
    const fileLanguage = getFileLanguage(filePath);
    const applicableConventionCount =
      fileLanguage === "Python" ? pyConventions.length : tsConventions.length;

    const density =
      applicableConventionCount > 0
        ? conventionsFollowed / applicableConventionCount
        : 0;

    entries.push({
      filePath,
      conventionsFollowed,
      conventionsApplicable: applicableConventionCount,
      density,
    });
  }

  // Sort by density descending, conventionsFollowed as tiebreaker
  entries.sort((a, b) => {
    if (b.density !== a.density) {
      return b.density - a.density;
    }
    return b.conventionsFollowed - a.conventionsFollowed;
  });

  return entries.slice(0, maxFiles);
}
