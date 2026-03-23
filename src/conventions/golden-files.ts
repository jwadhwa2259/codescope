import type { ConventionResult, GoldenFileEntry } from "./types.js";

/**
 * Rank files by convention density -- how many conventions each file follows
 * relative to how many are applicable.
 *
 * Per D-12: Golden files selected by highest convention density.
 * Returns top `maxFiles` entries (default 5).
 */
export function rankGoldenFiles(
  conventions: ConventionResult[],
  maxFiles: number = 5,
): GoldenFileEntry[] {
  if (conventions.length === 0) {
    return [];
  }

  // Collect all unique files mentioned in any convention's matchingFiles
  const fileConventionCount = new Map<string, number>();

  for (const conv of conventions) {
    for (const file of conv.matchingFiles) {
      const current = fileConventionCount.get(file) ?? 0;
      fileConventionCount.set(file, current + 1);
    }
  }

  // Total conventions applicable = total conventions for that file's language
  // Since all conventions in this scan are applicable to the file (they matched or could match),
  // conventionsApplicable = total number of conventions
  const totalConventions = conventions.length;

  // Build golden file entries
  const entries: GoldenFileEntry[] = [];

  for (const [filePath, conventionsFollowed] of fileConventionCount) {
    const density =
      totalConventions > 0 ? conventionsFollowed / totalConventions : 0;

    entries.push({
      filePath,
      conventionsFollowed,
      conventionsApplicable: totalConventions,
      density,
    });
  }

  // Sort by density descending, then by conventionsFollowed descending as tiebreaker
  entries.sort((a, b) => {
    if (b.density !== a.density) {
      return b.density - a.density;
    }
    return b.conventionsFollowed - a.conventionsFollowed;
  });

  // Return top maxFiles entries
  return entries.slice(0, maxFiles);
}
