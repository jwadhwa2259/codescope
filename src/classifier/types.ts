// ---------------------------------------------------------------------------
// File Role Classification Types
// ---------------------------------------------------------------------------

/**
 * Possible roles a file can be classified into.
 */
export type FileRole = "test" | "config" | "route-handler" | "utility" | "deprecated" | "general";

/**
 * Result of classifying a file's role.
 */
export interface FileRoleResult {
  role: FileRole;
  confidence: number;
}

/**
 * Maps rule IDs to the file roles they apply to.
 * Rules not listed here apply to ALL roles (permissive default per D-23).
 * Framework rules apply only to route-handler + utility + general per D-22.
 */
export const RULE_ROLE_APPLICABILITY: Record<string, FileRole[]> = {
  // Generic rules apply broadly
  "prefer-named-exports": ["utility", "route-handler", "general"],
  "detect-default-export": ["utility", "route-handler", "general"],
  "detect-async-await": ["utility", "route-handler", "general"],
  "detect-promise-then": ["utility", "route-handler", "general"],
  "custom-error-class": ["utility", "route-handler", "general"],
  "throw-string-literal": ["utility", "route-handler", "general"],
  "named-imports": ["utility", "route-handler", "general"],
  "barrel-imports": ["utility", "route-handler", "general"],
  "functional-component": ["utility", "route-handler", "general"],
  "class-component": ["utility", "route-handler", "general"],
  "arrow-function-export": ["utility", "route-handler", "general"],
  "function-declaration-export": ["utility", "route-handler", "general"],
  "interface-over-type": ["utility", "route-handler", "general"],
  "type-over-interface": ["utility", "route-handler", "general"],
  "explicit-return-type": ["utility", "route-handler", "general"],
  "python-type-hints": ["utility", "route-handler", "general"],
  "python-docstrings": ["utility", "route-handler", "general"],
  "python-class-inheritance": ["utility", "route-handler", "general"],
  // Framework rules: route-handler + general only (per D-22)
  "fastify-plugin-signature": ["route-handler", "general"],
  "fastify-route-handler": ["route-handler", "general"],
  "fastify-hook": ["route-handler", "general"],
  "fastify-decorator": ["route-handler", "utility", "general"],
  "express-middleware": ["route-handler", "general"],
  "express-route-handler": ["route-handler", "general"],
  "express-error-handler": ["route-handler", "general"],
  "h3-event-handler": ["route-handler", "general"],
  "h3-utility-functions": ["route-handler", "utility", "general"],
};

/**
 * Check if a rule applies to a given file role.
 * Rules NOT in RULE_ROLE_APPLICABILITY apply to all roles (permissive default per D-23).
 */
export function isRuleApplicableToRole(ruleId: string, role: FileRole): boolean {
  const applicableRoles = RULE_ROLE_APPLICABILITY[ruleId];
  if (!applicableRoles) return true; // Permissive default
  return applicableRoles.includes(role);
}
