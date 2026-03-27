// ---------------------------------------------------------------------------
// Learning Decay Engine: confidence decay and expiry detection
// ---------------------------------------------------------------------------
// Per D-05 schema and learning config: gotchas decay at 90 days,
// decisions/patterns at 180 days. IGNORE and TODO entries have no decay.
// VERIFIED entries persist indefinitely.
// ---------------------------------------------------------------------------

import type { LearningEntry, LearningType, DecayConfig } from "./types.js";

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Compute the expiry date for a learning type.
 *
 * - gotcha: decayConfig.gotchas days (default 90)
 * - decision/pattern: decayConfig.decisions days (default 180)
 * - ignore/todo: no expiry (returns "")
 *
 * Uses Date arithmetic for correct month/year rollover.
 *
 * @param type - Learning type
 * @param discoveredDate - Date the learning was discovered
 * @param decayConfig - Decay configuration with days per type
 * @returns ISO date string YYYY-MM-DD, or "" for no expiry
 */
export function computeExpiry(
  type: LearningType,
  discoveredDate: Date,
  decayConfig: DecayConfig,
): string {
  let days: number;

  switch (type) {
    case "gotcha":
      days = decayConfig.gotchas;
      break;
    case "decision":
    case "pattern":
      days = decayConfig.decisions;
      break;
    case "ignore":
    case "todo":
      return "";
    default:
      days = decayConfig.decisions;
      break;
  }

  // Use UTC date arithmetic for correct month/year rollover (Research Pitfall 3)
  // Avoid local timezone offsets by working entirely in UTC
  const expiry = new Date(
    Date.UTC(
      discoveredDate.getUTCFullYear(),
      discoveredDate.getUTCMonth(),
      discoveredDate.getUTCDate() + days,
    ),
  );

  return formatDateISO(expiry);
}

/**
 * Check if a learning entry has expired.
 *
 * Compares entry.expires against now at day granularity (truncated to midnight).
 * Returns false if expires is empty (no expiry set).
 *
 * @param entry - Learning entry to check
 * @param now - Current date for comparison
 * @returns true if the entry has expired
 */
export function isExpired(entry: LearningEntry, now: Date): boolean {
  if (!entry.expires) return false;

  // Compare at day granularity (truncate both to midnight UTC)
  const expiresDate = truncateToDay(new Date(entry.expires));
  const nowDate = truncateToDay(now);

  return expiresDate.getTime() <= nowDate.getTime();
}

/**
 * Run decay across all entries, marking expired ones.
 *
 * - UNVERIFIED entries past expiry -> EXPIRED
 * - CONTRADICTED entries past expiry -> EXPIRED
 * - IGNORE entries: never expire (no decay per D-09)
 * - TODO entries: never expire (no decay per D-10)
 * - VERIFIED entries: persist indefinitely (user-confirmed)
 * - Already EXPIRED entries: unchanged
 *
 * Returns a new array (does not mutate input).
 *
 * @param entries - Current learning entries
 * @param _decayConfig - Decay configuration (unused in decay check, used by computeExpiry)
 * @param now - Current date for expiry comparison
 * @returns New array with expired entries marked
 */
export function runDecay(
  entries: LearningEntry[],
  _decayConfig: DecayConfig,
  now: Date,
): LearningEntry[] {
  return entries.map((entry) => {
    // Skip entries that don't decay
    if (
      entry.status === "IGNORE" ||
      entry.status === "TODO" ||
      entry.status === "VERIFIED" ||
      entry.status === "EXPIRED"
    ) {
      return { ...entry };
    }

    // Check expiry for UNVERIFIED and CONTRADICTED entries
    if (isExpired(entry, now)) {
      return { ...entry, status: "EXPIRED" as const };
    }

    return { ...entry };
  });
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function formatDateISO(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function truncateToDay(date: Date): Date {
  return new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
}
