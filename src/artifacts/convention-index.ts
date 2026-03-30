/**
 * Builds the convention index from conventions.md file(s).
 *
 * Reads and parses conventions.md to extract convention patterns and their
 * associated files. Returns a ConventionIndex keyed by relative file path
 * for O(1) hook lookups.
 *
 * Checks both the top-level conventions.md and service-specific conventions.md
 * files for monorepo support.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import type { ConventionIndex, ConventionFileEntry } from "./types.js";
import { parseDetectorConventions, type ParsedConvention } from "../conventions/parser.js";

/**
 * Build convention index from conventions.md file(s) in the codescope directory.
 *
 * @param codescopeDir - Path to .claude/codescope/ directory
 * @returns ConventionIndex with per-file convention lists keyed by relative path
 */
export function buildConventionIndex(codescopeDir: string): ConventionIndex {
  const files: Record<string, ConventionFileEntry[]> = {};
  const allConventions: ParsedConvention[] = [];

  // Check top-level conventions.md
  const topLevelPath = path.join(codescopeDir, "conventions.md");
  if (fs.existsSync(topLevelPath)) {
    const content = fs.readFileSync(topLevelPath, "utf-8");
    allConventions.push(...parseDetectorConventions(content));
  }

  // Check service-specific conventions.md files
  const servicesDir = path.join(codescopeDir, "services");
  if (fs.existsSync(servicesDir)) {
    try {
      const serviceDirs = fs.readdirSync(servicesDir, { withFileTypes: true });
      for (const entry of serviceDirs) {
        if (entry.isDirectory()) {
          const serviceConvPath = path.join(servicesDir, entry.name, "conventions.md");
          if (fs.existsSync(serviceConvPath)) {
            const content = fs.readFileSync(serviceConvPath, "utf-8");
            allConventions.push(...parseDetectorConventions(content));
          }
        }
      }
    } catch {
      // Services directory read failure is non-fatal
    }
  }

  // Map conventions to file paths
  for (const conv of allConventions) {
    const entry: ConventionFileEntry = {
      name: conv.name,
      adoption_pct: conv.adoption_pct,
      confidence: conv.confidence,
      category: conv.category,
    };

    for (const filePath of conv.files) {
      if (!files[filePath]) {
        files[filePath] = [];
      }
      files[filePath].push(entry);
    }
  }

  return {
    generated: new Date().toISOString(),
    files,
  };
}
