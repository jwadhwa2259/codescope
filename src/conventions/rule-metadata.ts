// ---------------------------------------------------------------------------
// Shared Rule Metadata -- Single Source of Truth
// ---------------------------------------------------------------------------
// This is a PURE DATA MODULE with zero imports from runner.ts,
// node:child_process, or any module with side effects.
// Safe to import from both runner.ts and enforcement/rule-filter.ts
// without breaking build isolation (per D-24, Pitfall 6).
// ---------------------------------------------------------------------------

/**
 * Shape of a single rule metadata entry.
 */
export interface RuleMetadataEntry {
  name: string;
  category: string;
}

/**
 * Maps ruleId to human-readable name and category.
 * Contains all 18 existing rules (15 TypeScript + 3 Python).
 */
export const RULE_METADATA: Record<string, RuleMetadataEntry> = {
  "prefer-named-exports": {
    name: "Prefer Named Exports",
    category: "exports",
  },
  "detect-default-export": { name: "Default Export", category: "exports" },
  "detect-async-await": { name: "Async/Await Functions", category: "async" },
  "detect-promise-then": {
    name: "Promise .then() Chains",
    category: "async",
  },
  "custom-error-class": {
    name: "Custom Error Classes",
    category: "error-handling",
  },
  "throw-string-literal": {
    name: "Throw String Literals",
    category: "error-handling",
  },
  "named-imports": { name: "Named Imports", category: "imports" },
  "barrel-imports": { name: "Barrel/Namespace Imports", category: "imports" },
  "functional-component": {
    name: "Functional React Components",
    category: "components",
  },
  "class-component": {
    name: "Class React Components",
    category: "components",
  },
  "arrow-function-export": {
    name: "Arrow Function Exports",
    category: "exports",
  },
  "function-declaration-export": {
    name: "Function Declaration Exports",
    category: "exports",
  },
  "interface-over-type": {
    name: "Interface Declarations",
    category: "types",
  },
  "type-over-interface": {
    name: "Type Alias Declarations",
    category: "types",
  },
  "explicit-return-type": {
    name: "Explicit Return Types",
    category: "types",
  },
  "python-type-hints": { name: "Python Type Hints", category: "types" },
  "python-docstrings": { name: "Python Docstrings", category: "documentation" },
  "python-class-inheritance": {
    name: "Python Class Inheritance",
    category: "class-patterns",
  },
};

/**
 * Map from convention display name to ast-grep rule ID.
 * Example: "Prefer Named Exports" -> "prefer-named-exports"
 */
export const RULE_NAME_TO_ID: Map<string, string> = new Map(
  Object.entries(RULE_METADATA).map(([id, meta]) => [meta.name, id]),
);

/**
 * Map from ast-grep rule ID to convention display name.
 * Example: "prefer-named-exports" -> "Prefer Named Exports"
 */
export const RULE_ID_TO_NAME: Map<string, string> = new Map(
  Object.entries(RULE_METADATA).map(([id, meta]) => [id, meta.name]),
);
