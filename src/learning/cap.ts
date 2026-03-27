// ---------------------------------------------------------------------------
// Learning Cap Enforcement: 50-learning maximum with eviction
// ---------------------------------------------------------------------------
// Per D-12/D-13: max 50 active learnings. When at cap, evict oldest
// EXPIRED entry first. If no expired entries to evict, skip adding
// the new learning and note it in the pipeline summary.
// All entry types count toward the cap (D-13).
// ---------------------------------------------------------------------------

import type { LearningEntry, CapResult } from "./types.js";

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Count all active entries (all types count per D-13).
 *
 * @param entries - Current learning entries
 * @returns Total count
 */
export function countActiveEntries(entries: LearningEntry[]): number {
  return entries.length;
}

/**
 * Enforce the learning cap with eviction strategy.
 *
 * For each new entry to add:
 * 1. If under cap, simply add
 * 2. If at cap, find the EXPIRED entry with the earliest discovered date and evict it
 * 3. If no expired entries to evict, skip the new entry (add to skipped array)
 *
 * Returns a new CapResult (does not mutate input arrays).
 *
 * @param currentEntries - Existing learning entries
 * @param newEntries - New entries to add
 * @param maxActive - Maximum active entries (default 50)
 * @returns CapResult with final entries, evicted list, and skipped list
 */
export function enforceCapWithEviction(
  currentEntries: LearningEntry[],
  newEntries: LearningEntry[],
  maxActive: number = 50,
): CapResult {
  // Work with copies to avoid mutation
  const entries = [...currentEntries];
  const evicted: LearningEntry[] = [];
  const skipped: LearningEntry[] = [];

  for (const newEntry of newEntries) {
    if (entries.length < maxActive) {
      // Under cap, simply add
      entries.push(newEntry);
    } else {
      // At cap, try to evict oldest expired
      const evictIndex = findOldestExpiredIndex(entries);

      if (evictIndex !== -1) {
        // Evict the oldest expired entry and add new one
        const [evictedEntry] = entries.splice(evictIndex, 1);
        evicted.push(evictedEntry);
        entries.push(newEntry);
      } else {
        // No expired entries to evict, skip this new entry
        skipped.push(newEntry);
      }
    }
  }

  return { entries, evicted, skipped };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Find the index of the expired entry with the earliest discovered date.
 * Returns -1 if no expired entries exist.
 */
function findOldestExpiredIndex(entries: LearningEntry[]): number {
  let oldestIndex = -1;
  let oldestDate: Date | null = null;

  for (let i = 0; i < entries.length; i++) {
    if (entries[i].status !== "EXPIRED") continue;

    const discovered = new Date(entries[i].discovered);
    if (oldestDate === null || discovered < oldestDate) {
      oldestDate = discovered;
      oldestIndex = i;
    }
  }

  return oldestIndex;
}
