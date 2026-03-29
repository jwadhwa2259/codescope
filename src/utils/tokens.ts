// ---------------------------------------------------------------------------
// Shared Token Estimation Utility
// ---------------------------------------------------------------------------
// Extracted from src/eval/eval-agent.ts to provide a shared token estimation
// function importable by eval, orient, and execution modules.
// Per Phase 13 D-11: LIGHT (<20K), MODERATE (20-50K), HEAVY (>50K).
// ---------------------------------------------------------------------------

/**
 * Cost tier classification for token estimates.
 * Per D-11: LIGHT (<20K), MODERATE (20-50K), HEAVY (>50K).
 */
export type CostTier = "LIGHT" | "MODERATE" | "HEAVY";

/**
 * Rough token approximation: characters / 4.
 * Per RESEARCH.md Pitfall 1.
 *
 * @param text - Input text to estimate token count for
 * @returns Estimated token count (always >= 0)
 */
export function tokenEstimate(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Classify estimated token count into a cost tier.
 * Per D-11: LIGHT (<20K), MODERATE (20-50K), HEAVY (>50K).
 *
 * @param estimatedTokens - Token count to classify
 * @returns Cost tier classification
 */
export function classifyCostTier(estimatedTokens: number): CostTier {
  if (estimatedTokens > 50_000) return "HEAVY";
  if (estimatedTokens >= 20_000) return "MODERATE";
  return "LIGHT";
}
