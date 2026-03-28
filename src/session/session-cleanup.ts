// ---------------------------------------------------------------------------
// Session Cleanup
// ---------------------------------------------------------------------------
// Removes handoff files older than 7 days from the sessions directory.
// Per D-14: automatic session file lifecycle management.
// ---------------------------------------------------------------------------

import * as fs from "node:fs";
import * as path from "node:path";

// ---------------------------------------------------------------------------
// cleanupOldSessions
// ---------------------------------------------------------------------------

/**
 * Remove session files older than `maxAgeDays` from the sessions directory.
 *
 * Per D-14: default retention is 7 days. Files with mtime older than
 * the threshold are deleted. Non-existent directories are handled gracefully.
 *
 * @returns Object with list of removed filenames and count of kept files.
 */
export function cleanupOldSessions(
  sessionsDir: string,
  maxAgeDays: number = 7,
): { removed: string[]; kept: number } {
  if (!fs.existsSync(sessionsDir)) {
    return { removed: [], kept: 0 };
  }

  let files: string[];
  try {
    files = fs.readdirSync(sessionsDir);
  } catch {
    return { removed: [], kept: 0 };
  }

  const maxAgeMs = maxAgeDays * 24 * 60 * 60 * 1000;
  const now = Date.now();
  const removed: string[] = [];
  let kept = 0;

  for (const file of files) {
    const filePath = path.join(sessionsDir, file);

    try {
      const stat = fs.statSync(filePath);

      // Only process files, not directories
      if (!stat.isFile()) {
        continue;
      }

      if (now - stat.mtime.getTime() > maxAgeMs) {
        fs.unlinkSync(filePath);
        removed.push(file);
      } else {
        kept++;
      }
    } catch {
      // Skip files we can't stat or delete
      continue;
    }
  }

  return { removed, kept };
}
