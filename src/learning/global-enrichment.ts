// ---------------------------------------------------------------------------
// Global Memory Enrichment: 3-strike auto-enrichment logic
// ---------------------------------------------------------------------------
// Per D-21: when the same ignore pattern appears 3+ times across different
// pipeline runs, auto-promote it to global memory so future projects
// benefit from the learned preference.
// ---------------------------------------------------------------------------

import type { LearningEntry, GlobalEnrichmentEntry } from "./types.js";

// ---------------------------------------------------------------------------
// Public types for repeated pattern tracking
// ---------------------------------------------------------------------------

export interface RepeatedPattern {
  key: string; // "criterion:pattern" composite key
  criterion: string;
  pattern: string;
  count: number;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Detect ignore patterns that have been repeated across multiple pipeline runs.
 *
 * Filters entries to type "ignore", groups by criterion+pattern composite key,
 * and counts unique contexts (representing different pipeline runs -- each
 * IGNORE entry has a different taskSlug in its Context field).
 *
 * @param entries - All learning entries
 * @param threshold - Minimum occurrences to be considered repeated (default 3)
 * @returns Array of patterns that meet or exceed the threshold
 */
export function detectRepeatedIgnores(
  entries: LearningEntry[],
  threshold: number = 3,
): RepeatedPattern[] {
  // Filter to IGNORE entries only
  const ignoreEntries = entries.filter((e) => e.type === "ignore");

  // Group by criterion+pattern composite key
  const groups = new Map<
    string,
    { criterion: string; pattern: string; contexts: Set<string> }
  >();

  for (const entry of ignoreEntries) {
    const criterion = entry.criterion || "";
    const pattern = entry.pattern || "";
    const key = `${criterion}:${pattern}`;
    const context = entry.context || entry.evidence || "";

    if (!groups.has(key)) {
      groups.set(key, { criterion, pattern, contexts: new Set() });
    }

    // Each unique context represents a different pipeline run
    groups.get(key)!.contexts.add(context);
  }

  // Return groups that meet the threshold
  const results: RepeatedPattern[] = [];
  for (const [key, group] of groups) {
    if (group.contexts.size >= threshold) {
      results.push({
        key,
        criterion: group.criterion,
        pattern: group.pattern,
        count: group.contexts.size,
      });
    }
  }

  return results;
}

/**
 * Build global enrichment updates for patterns that crossed the 3-strike threshold.
 *
 * Creates GlobalEnrichmentEntry records for each repeated pattern that is not
 * already present in the existing global ignore patterns.
 *
 * @param repeatedPatterns - Patterns that exceeded the threshold
 * @param existingGlobalIgnores - Already-registered global ignore patterns
 * @returns New GlobalEnrichmentEntry records to add to global memory
 */
export function buildEnrichmentUpdates(
  repeatedPatterns: RepeatedPattern[],
  existingGlobalIgnores: GlobalEnrichmentEntry[],
): GlobalEnrichmentEntry[] {
  // Build set of existing global pattern values for deduplication
  const existingValues = new Set(
    existingGlobalIgnores
      .filter((e) => e.type === "ignore_pattern")
      .map((e) => e.value),
  );

  const updates: GlobalEnrichmentEntry[] = [];

  for (const pattern of repeatedPatterns) {
    const value = `${pattern.criterion}:${pattern.pattern}`;

    // Skip if already in global ignores
    if (existingValues.has(value)) continue;

    updates.push({
      type: "ignore_pattern",
      value,
      source: `auto-detected from ${pattern.count} pipeline runs`,
      recordedDate: new Date().toISOString().split("T")[0],
    });
  }

  return updates;
}
