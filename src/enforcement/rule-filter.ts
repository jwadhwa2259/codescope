// ---------------------------------------------------------------------------
// VERIFIED Convention Rule Filter
// ---------------------------------------------------------------------------
// Filters learnings.md entries to extract only VERIFIED pattern conventions,
// then maps them to ast-grep rule IDs for enforcement.
//
// This module is intentionally isolated from src/conventions/runner.ts and
// src/learning/parser.ts to keep the enforcement module lightweight with no
// transitive dependencies on execFileSync or heavy modules.
//
// rule-metadata.ts is a pure data module with zero transitive dependencies,
// so importing from it is safe and does not break build isolation.
// ---------------------------------------------------------------------------

import {
  RULE_NAME_TO_ID,
  RULE_ID_TO_NAME,
} from "../conventions/rule-metadata.js";

// Re-export for consumers that import from this module (e.g., pre-commit-check.ts)
export { RULE_NAME_TO_ID, RULE_ID_TO_NAME } from "../conventions/rule-metadata.js";

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Build bidirectional lookup maps from RULE_METADATA.
 *
 * @returns Object with nameToId and idToName Maps
 */
export function buildRuleIdLookup(): {
  nameToId: Map<string, string>;
  idToName: Map<string, string>;
} {
  return {
    nameToId: new Map(RULE_NAME_TO_ID),
    idToName: new Map(RULE_ID_TO_NAME),
  };
}

/**
 * Extract ast-grep rule IDs for VERIFIED pattern conventions from learnings.md content.
 *
 * Parses learnings.md inline (no dependency on src/learning/parser.ts) to keep
 * the enforcement module lightweight. Only extracts ### title, Status, and Type fields.
 *
 * @param learningsContent - Raw markdown content of learnings.md
 * @returns Array of matched ast-grep rule IDs (e.g., ["prefer-named-exports"])
 */
export function getVerifiedRuleIds(learningsContent: string): string[] {
  if (!learningsContent.trim()) {
    return [];
  }

  const ruleIds: string[] = [];

  // Split by ### headings to extract individual entries
  const sections = learningsContent.split(/^### /gm);

  for (const section of sections) {
    if (!section.trim()) continue;

    // Extract title (first line of the section)
    const titleMatch = section.match(/^(.+?)$/m);
    if (!titleMatch) continue;
    const title = titleMatch[1].trim();

    // Extract Status field
    const statusMatch = section.match(/- \*\*Status:\*\* (\w+)/);
    if (!statusMatch) continue;
    const status = statusMatch[1];

    // Extract Type field
    const typeMatch = section.match(/- \*\*Type:\*\* (\w+)/);
    if (!typeMatch) continue;
    const type = typeMatch[1];

    // Only include VERIFIED + pattern entries
    if (status !== "VERIFIED" || type !== "pattern") continue;

    // Map title to rule ID
    const ruleId = RULE_NAME_TO_ID.get(title);
    if (ruleId) {
      ruleIds.push(ruleId);
    }
  }

  return ruleIds;
}
