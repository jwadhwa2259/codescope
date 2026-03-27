// ---------------------------------------------------------------------------
// Contradiction Detector: detect conflicting learnings
// ---------------------------------------------------------------------------
// Per D-06/D-07/D-08: heuristic + optional LLM contradiction detection.
// Heuristic catches "use X" vs "avoid X" patterns without LLM.
// LLM callback provides semantic comparison for non-obvious cases.
// Code-first validation via ast-grep is done at synthesizer agent level.
// ---------------------------------------------------------------------------

import type { LearningEntry, ContradictionResult } from "./types.js";

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Build a strict LLM prompt for contradiction detection.
 * Requires DIRECT contradiction (adopting both is impossible).
 *
 * @param newLearning - The new learning to check
 * @param existingLearning - The existing learning to compare against
 * @returns Prompt string for LLM
 */
export function buildContradictionPrompt(
  newLearning: LearningEntry,
  existingLearning: LearningEntry,
): string {
  return [
    "Do these two learnings DIRECTLY contradict each other?",
    "A contradiction means adopting both is impossible.",
    "Being related or about the same topic is NOT a contradiction.",
    "",
    "Return JSON: {isContradiction: boolean, reason: string}",
    "",
    `Learning A: ${newLearning.title} - ${newLearning.evidence}`,
    `Learning B: ${existingLearning.title} - ${existingLearning.evidence}`,
  ].join("\n");
}

/**
 * Check a new learning entry for contradictions against existing entries.
 *
 * First runs heuristic checks (antonym patterns: "use X" vs "avoid X",
 * "prefer X" vs "do not use X"). For non-obvious cases and when an
 * LLM callback is provided, delegates to semantic comparison.
 *
 * @param newEntry - New learning to check
 * @param existingEntries - Existing learnings to compare against
 * @param llmCallback - Optional LLM function for semantic comparison
 * @returns Array of ContradictionResult (one per contradiction found)
 */
export async function checkContradictions(
  newEntry: LearningEntry,
  existingEntries: LearningEntry[],
  llmCallback?: (prompt: string) => Promise<string>,
): Promise<ContradictionResult[]> {
  if (existingEntries.length === 0) return [];

  const results: ContradictionResult[] = [];

  for (const existing of existingEntries) {
    // Skip checking against expired or already-contradicted entries
    if (existing.status === "EXPIRED" || existing.status === "CONTRADICTED") {
      continue;
    }

    // Heuristic check first
    const heuristicResult = heuristicCheck(newEntry, existing);
    if (heuristicResult) {
      results.push(heuristicResult);
      continue;
    }

    // LLM check for non-obvious cases (when callback provided)
    if (llmCallback) {
      const prompt = buildContradictionPrompt(newEntry, existing);
      try {
        const response = await llmCallback(prompt);
        const parsed = JSON.parse(response);
        if (parsed.isContradiction) {
          results.push({
            isContradiction: true,
            contradicts: existing.title,
            evidence: parsed.reason || "LLM detected direct contradiction",
          });
        }
      } catch {
        // If LLM response is unparseable, skip (fail open)
        continue;
      }
    }
  }

  return results;
}

// ---------------------------------------------------------------------------
// Internal: Heuristic contradiction detection
// ---------------------------------------------------------------------------

/**
 * Antonym pattern pairs for heuristic contradiction detection.
 * Each pair represents opposing action words that signal conflict.
 */
const ANTONYM_PAIRS: Array<[string, string]> = [
  ["use", "avoid"],
  ["prefer", "avoid"],
  ["always", "never"],
  ["enable", "disable"],
  ["require", "skip"],
  ["include", "exclude"],
  ["allow", "block"],
  ["sync", "async"],
];

/**
 * Check for heuristic contradictions using antonym pattern matching.
 * Detects "use X" vs "avoid X" style conflicts in titles.
 */
function heuristicCheck(
  newEntry: LearningEntry,
  existing: LearningEntry,
): ContradictionResult | null {
  const newTitle = newEntry.title.toLowerCase();
  const existingTitle = existing.title.toLowerCase();

  // Extract the action and subject from each title
  for (const [wordA, wordB] of ANTONYM_PAIRS) {
    // Check both directions: new has wordA + existing has wordB, or vice versa
    const newHasA = titleStartsWithAction(newTitle, wordA);
    const newHasB = titleStartsWithAction(newTitle, wordB);
    const existHasA = titleStartsWithAction(existingTitle, wordA);
    const existHasB = titleStartsWithAction(existingTitle, wordB);

    if ((newHasA && existHasB) || (newHasB && existHasA)) {
      // Check if they share a common subject (at least 2 overlapping words)
      if (hasSharedSubject(newTitle, existingTitle)) {
        return {
          isContradiction: true,
          contradicts: existing.title,
          evidence: `Heuristic: "${newEntry.title}" conflicts with "${existing.title}" (antonym pattern: ${wordA}/${wordB})`,
        };
      }
    }
  }

  return null;
}

/**
 * Check if a title starts with (or contains as action word) a given action.
 */
function titleStartsWithAction(title: string, action: string): boolean {
  // Match action word at start or after common prefixes
  const pattern = new RegExp(
    `(?:^|\\b)(?:do not |don't |not )?${action}\\b`,
    "i",
  );
  return pattern.test(title);
}

/**
 * Check if two titles share a meaningful subject (at least 2 non-trivial words).
 */
function hasSharedSubject(titleA: string, titleB: string): boolean {
  const stopWords = new Set([
    "a", "an", "the", "in", "on", "at", "to", "for", "of", "with", "by",
    "is", "are", "was", "were", "be", "been", "being",
    "do", "does", "did", "not", "don't", "doesn't",
    "use", "avoid", "prefer", "always", "never", "enable", "disable",
    "require", "skip", "include", "exclude", "allow", "block",
    "sync", "async", "all", "every", "everywhere", "everything",
  ]);

  const wordsA = new Set(
    titleA.split(/\W+/).filter((w) => w.length > 1 && !stopWords.has(w)),
  );
  const wordsB = new Set(
    titleB.split(/\W+/).filter((w) => w.length > 1 && !stopWords.has(w)),
  );

  let overlap = 0;
  for (const word of wordsA) {
    if (wordsB.has(word)) overlap++;
  }

  return overlap >= 1;
}
