// ---------------------------------------------------------------------------
// VERIFIED Convention Rule Filter
// ---------------------------------------------------------------------------
// Filters learnings.md entries to extract only VERIFIED pattern conventions,
// then maps them to ast-grep rule IDs for enforcement.
//
// This module is intentionally isolated from src/conventions/runner.ts and
// src/learning/parser.ts to keep the enforcement module lightweight with no
// transitive dependencies on execFileSync or heavy modules.
// ---------------------------------------------------------------------------

/**
 * Duplicated from RULE_METADATA in src/conventions/runner.ts for build
 * isolation. The enforcement module must NOT import from runner.ts which
 * imports execFileSync/execSync and has side-effect-capable code.
 */
const RULE_METADATA: Record<string, string> = {
  "prefer-named-exports": "Prefer Named Exports",
  "detect-default-export": "Default Export",
  "detect-async-await": "Async/Await Functions",
  "detect-promise-then": "Promise .then() Chains",
  "custom-error-class": "Custom Error Classes",
  "throw-string-literal": "Throw String Literals",
  "named-imports": "Named Imports",
  "barrel-imports": "Barrel/Namespace Imports",
  "functional-component": "Functional React Components",
  "class-component": "Class React Components",
  "arrow-function-export": "Arrow Function Exports",
  "function-declaration-export": "Function Declaration Exports",
  "interface-over-type": "Interface Declarations",
  "type-over-interface": "Type Alias Declarations",
  "explicit-return-type": "Explicit Return Types",
  "python-type-hints": "Python Type Hints",
  "python-docstrings": "Python Docstrings",
  "python-class-inheritance": "Python Class Inheritance",
};

// ---------------------------------------------------------------------------
// Exported lookup maps
// ---------------------------------------------------------------------------

/**
 * Map from convention display name to ast-grep rule ID.
 * Example: "Prefer Named Exports" -> "prefer-named-exports"
 */
export const RULE_NAME_TO_ID: Map<string, string> = new Map(
  Object.entries(RULE_METADATA).map(([id, name]) => [name, id]),
);

/**
 * Map from ast-grep rule ID to convention display name.
 * Example: "prefer-named-exports" -> "Prefer Named Exports"
 */
export const RULE_ID_TO_NAME: Map<string, string> = new Map(
  Object.entries(RULE_METADATA),
);

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
