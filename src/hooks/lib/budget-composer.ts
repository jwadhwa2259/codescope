/**
 * Priority-budgeted token composition for hook context injection.
 *
 * Composes injection content within a 500-token budget using a priority queue.
 * Higher priority items (lower number) are included first. Items that would
 * exceed the remaining budget are skipped.
 *
 * Per D-04: Priority order is danger zones (1) > conventions (2) >
 * blast radius (3) > general context (4).
 */

/** Maximum token budget for injection content. */
export const MAX_TOKENS = 500;

/**
 * Estimate token count using character-based approximation.
 *
 * Uses the standard ~4 characters per token approximation.
 * Exact BPE tokenization would add 2MB+ to the hook bundle
 * and is unnecessary for a 500-token budget.
 */
export function estimateTokens(text: string): number {
  if (text.length === 0) return 0;
  return Math.ceil(text.length / 4);
}

/** An item to potentially include in the injection message. */
export interface InjectionItem {
  /** Priority: 1=danger zone (highest), 2=conventions, 3=blast radius, 4=general. */
  priority: number;
  /** The formatted content for this item. */
  content: string;
}

/**
 * Compose a budgeted message from prioritized injection items.
 *
 * Sorts items by priority (ascending = highest priority first), then
 * greedily includes items until the token budget is exhausted.
 * Items that exceed remaining budget are skipped.
 *
 * @param items - Items to compose, each with a priority and content
 * @param maxTokens - Maximum token budget (default: 500)
 * @returns Composed message with items joined by double newline, or empty string
 */
export function composeBudgetedMessage(
  items: InjectionItem[],
  maxTokens: number = MAX_TOKENS,
): string {
  if (items.length === 0) return "";

  // Sort by priority ascending (1 = highest priority, included first)
  const sorted = [...items].sort((a, b) => a.priority - b.priority);

  const parts: string[] = [];
  let tokensUsed = 0;

  for (const item of sorted) {
    const itemTokens = estimateTokens(item.content);
    if (tokensUsed + itemTokens <= maxTokens) {
      parts.push(item.content);
      tokensUsed += itemTokens;
    }
    // Skip items that would exceed budget -- lower priority items get truncated
  }

  return parts.join("\n\n");
}
