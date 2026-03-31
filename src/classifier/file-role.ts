// ---------------------------------------------------------------------------
// File Role Classifier
// ---------------------------------------------------------------------------
// Classifies file paths into semantic roles using a 3-tier signal chain:
//   Tier 1 (filename, confidence 0.95) - highest priority
//   Tier 2 (path, confidence 0.80-0.85)
//   Tier 3 (fallback, confidence 0.50) - general
//
// Per D-19: first matching tier wins.
// ---------------------------------------------------------------------------

import * as path from "node:path";
import type { FileRole, FileRoleResult } from "./types.js";

/**
 * Classify a file path into a semantic role.
 *
 * @param filePath - Relative or absolute file path
 * @returns FileRoleResult with role and confidence
 */
export function classifyFileRole(filePath: string): FileRoleResult {
  const basename = path.basename(filePath);
  const dirname = path.dirname(filePath);
  const normalizedPath = filePath.replace(/\\/g, "/");

  // -----------------------------------------------------------------------
  // Tier 1: Filename-based (confidence 0.95)
  // -----------------------------------------------------------------------

  // Test files by extension pattern
  if (/\.(test|spec)\.(ts|tsx|js|jsx)$/.test(basename)) {
    return { role: "test", confidence: 0.95 };
  }

  // Config files by extension pattern
  if (/\.(config|rc)\.(ts|tsx|js|jsx|json|yml|yaml)$/.test(basename)) {
    return { role: "config", confidence: 0.95 };
  }

  // Well-known config files by name
  if (/^(tsconfig|jest\.config|vitest\.config|\.eslintrc|\.prettierrc)/.test(basename)) {
    return { role: "config", confidence: 0.95 };
  }

  // Deprecated/legacy/obsolete files
  if (/deprecated|legacy|obsolete/i.test(basename)) {
    return { role: "deprecated", confidence: 0.90 };
  }

  // Generated files (treated as config for exclusion purposes)
  if (/\.generated\.|\.gen\.|\.pb\./.test(basename)) {
    return { role: "config", confidence: 0.95 };
  }

  // -----------------------------------------------------------------------
  // Tier 2: Path-based (confidence 0.80-0.85)
  // -----------------------------------------------------------------------

  // Test directories
  if (/__tests__|\/tests?\/|\/test\//.test(normalizedPath)) {
    return { role: "test", confidence: 0.85 };
  }

  // Route handler directories
  if (/\/routes?\/|\/api\/|\/handlers?\/|\/controllers?\//.test(normalizedPath)) {
    return { role: "route-handler", confidence: 0.80 };
  }

  // Utility directories
  if (/\/utils?\/|\/helpers?\/|\/lib\/|\/shared\//.test(normalizedPath)) {
    return { role: "utility", confidence: 0.80 };
  }

  // -----------------------------------------------------------------------
  // Tier 3: Fallback (confidence 0.50)
  // -----------------------------------------------------------------------

  return { role: "general", confidence: 0.50 };
}
