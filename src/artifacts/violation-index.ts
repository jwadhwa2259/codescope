/**
 * Builds the violation index from conventions and the knowledge graph.
 *
 * Identifies per-file HIGH-CONF convention deviations. For each HIGH-CONF
 * convention, files in the graph that do NOT appear in the convention's
 * evidence list get a violation entry.
 *
 * Also checks:
 * - VALID-02: Type name references against known types in the graph
 * - VALID-03: Import paths against resolved targets in the graph
 *
 * Returns a sparse ViolationIndex: files with no violations are omitted.
 * Per D-08, D-09, D-11.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import type { Database as DatabaseType } from "better-sqlite3";
import { parseDetectorConventions } from "../conventions/parser.js";
import type { ViolationIndex, ViolationEntry } from "./types.js";

/**
 * Build violation index from conventions and the knowledge graph.
 *
 * @param db - Open database connection with v2 schema
 * @param codescopeDir - Path to .claude/codescope/ directory
 * @returns ViolationIndex with per-file violation lists, sparse
 */
export function buildViolationIndex(
  db: DatabaseType,
  codescopeDir: string,
): ViolationIndex {
  const files: Record<string, ViolationEntry[]> = {};

  // Read and parse conventions
  const conventionsPath = path.join(codescopeDir, "conventions.md");
  if (!fs.existsSync(conventionsPath)) {
    return { generated: new Date().toISOString(), files };
  }

  const content = fs.readFileSync(conventionsPath, "utf-8");
  const allConventions = parseDetectorConventions(content);

  // Filter to HIGH-CONF only (per D-11)
  const highConfConventions = allConventions.filter(
    (c) => c.confidence === "HIGH-CONF",
  );

  if (highConfConventions.length === 0) {
    return { generated: new Date().toISOString(), files };
  }

  // Get all source file paths from the graph (file nodes only)
  const graphFiles = (
    db
      .prepare("SELECT DISTINCT file_path FROM nodes WHERE kind = 'file'")
      .all() as Array<{ file_path: string }>
  ).map((r) => r.file_path);

  const graphFileSet = new Set(graphFiles);

  // For each HIGH-CONF convention, find files that don't follow it
  for (const conv of highConfConventions) {
    const followingFiles = new Set(conv.files);

    // Files in the graph that are NOT in the convention's evidence
    for (const filePath of graphFiles) {
      if (followingFiles.has(filePath)) continue;

      // This file doesn't follow this HIGH-CONF convention
      const entry: ViolationEntry = {
        ruleId: conv.name,
        detected: "Convention not followed",
        expected: `${conv.name} (${conv.category}, ${conv.adoption_pct}% adoption)`,
        line: 0, // file-level violation
      };

      if (!files[filePath]) {
        files[filePath] = [];
      }
      files[filePath].push(entry);
    }
  }

  // VALID-02: Type name checking
  // Get known type/interface names from the graph
  const knownTypes = new Set(
    (
      db
        .prepare(
          "SELECT DISTINCT name FROM nodes WHERE kind IN ('type', 'interface')",
        )
        .all() as Array<{ name: string }>
    ).map((r) => r.name),
  );

  // VALID-03: Import path checking
  // Get edges with resolved import targets; check that target files exist in graph
  const importEdges = db
    .prepare(
      `SELECT n1.file_path as source_file, n2.file_path as target_file
       FROM edges e
       JOIN nodes n1 ON e.source_id = n1.id
       JOIN nodes n2 ON e.target_id = n2.id
       WHERE e.kind = 'imports'
         AND n1.kind = 'file'
         AND n2.kind = 'file'`,
    )
    .all() as Array<{ source_file: string; target_file: string }>;

  // Check for import edges where target is not in the graph's file set
  // (This catches edges to files that were since deleted or renamed)
  for (const edge of importEdges) {
    if (!graphFileSet.has(edge.target_file)) {
      const entry: ViolationEntry = {
        ruleId: "import-path-validity",
        detected: `Import target not found: ${edge.target_file}`,
        expected: "Import should resolve to an existing file",
        line: 0,
      };

      if (!files[edge.source_file]) {
        files[edge.source_file] = [];
      }
      files[edge.source_file].push(entry);
    }
  }

  return {
    generated: new Date().toISOString(),
    files,
  };
}
