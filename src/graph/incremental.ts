/**
 * Per-file incremental reparse engine.
 *
 * Implements the delete-and-rebuild pattern (D-05) for updating individual
 * files in the knowledge graph without full re-bootstrap. Used by the
 * staleness-aware cache to transparently rebuild stale files before
 * returning query results.
 *
 * Key design decisions:
 * - ON DELETE CASCADE (from Plan 01 v2 schema) handles edge cleanup when nodes are deleted
 * - Targeted outgoing edge cleanup before node deletion preserves incoming edges from other files (Pitfall 4)
 * - File hash updated after successful rebuild for future staleness checks
 * - Cache invalidated after all rebuilds so next getGraph loads fresh data
 */

import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import type { Database as DatabaseType } from "better-sqlite3";
import { ParserPool, parseFile } from "../parser/index.js";
import { detectLanguage } from "../parser/languages.js";
import { computeFileHash, updateFileHash, removeFileHash } from "./file-hash.js";
import { invalidateCache } from "./cache.js";
import { BatchWriter, processBatchFiles } from "./batch-writer.js";
import { createTypeScriptResolver, resolveTypeScriptImport } from "../resolver/typescript.js";
import { resolvePythonImport } from "../resolver/python.js";

export interface RebuildResult {
  rebuilt: number;
  removed: number;
}

/**
 * Rebuild stale files in the knowledge graph using delete-and-rebuild.
 *
 * For each stale file:
 * 1. If file no longer exists on disk: remove all nodes (CASCADE removes edges) + remove hash
 * 2. If file exists: delete outgoing edges -> delete nodes -> re-parse -> insert fresh data -> update hash
 *
 * Per D-05: Delete-and-rebuild per file.
 * Per Pitfall 4: Targeted outgoing edge cleanup before node deletion.
 *
 * @param db - Open database connection with v2 schema
 * @param staleFiles - Relative file paths that need rebuilding
 * @param projectRoot - Project root directory
 * @returns Count of rebuilt and removed files
 */
export async function rebuildStaleFiles(
  db: DatabaseType,
  staleFiles: string[],
  projectRoot: string
): Promise<RebuildResult> {
  let rebuilt = 0;
  let removed = 0;

  // Resolve symlinks in project root (macOS /var -> /private/var)
  let realProjectRoot: string;
  try {
    realProjectRoot = fs.realpathSync(projectRoot);
  } catch {
    realProjectRoot = projectRoot;
  }

  // Create TypeScript resolver once for reuse (may fail if no tsconfig)
  let tsResolver: ReturnType<typeof createTypeScriptResolver> | null = null;
  try {
    tsResolver = createTypeScriptResolver({ projectRoot });
  } catch {
    // No tsconfig, skip TS import resolution
  }

  // Create parser pool
  const pool = new ParserPool();
  await pool.init();

  // Create temp batch dir
  const batchDir = fs.mkdtempSync(path.join(os.tmpdir(), "codescope-incr-batch-"));

  try {
    for (const relPath of staleFiles) {
      const absolutePath = path.join(projectRoot, relPath);

      if (!fs.existsSync(absolutePath)) {
        // File deleted from disk
        deleteFileData(db, relPath);
        removeFileHash(db, relPath);
        removed++;
        continue;
      }

      // --- Targeted edge cleanup (Pitfall 4 from research) ---
      // Delete only OUTGOING edges from this file's nodes before deleting nodes.
      // This preserves incoming edges from other files that import this file.
      // CASCADE will clean up remaining edges when target nodes are deleted.
      db.prepare(
        "DELETE FROM edges WHERE source_id IN (SELECT id FROM nodes WHERE file_path = ?)"
      ).run(relPath);

      // Delete all nodes for this file (CASCADE removes edges referencing deleted nodes)
      db.prepare("DELETE FROM nodes WHERE file_path = ?").run(relPath);

      // Clean up orphaned communities
      db.prepare(
        "DELETE FROM communities WHERE node_id NOT IN (SELECT id FROM nodes)"
      ).run();

      // Parse the file
      const parseResult = await parseFile(absolutePath, pool);
      if (!parseResult) {
        // Unsupported language or parse failure -- still update hash
        const newHash = computeFileHash(absolutePath);
        if (newHash) {
          updateFileHash(db, relPath, newHash);
        }
        rebuilt++;
        continue;
      }

      // Create BatchWriter and replicate the per-file node/edge creation from builder.ts
      const writer = new BatchWriter(batchDir, `incremental-${Date.now()}`);

      const basename = path.basename(absolutePath);
      const lang = detectLanguage(absolutePath);
      const isTest =
        absolutePath.includes(".test.") ||
        absolutePath.includes(".spec.") ||
        absolutePath.includes("__tests__");

      // Read source for line counting
      let lineCount = 0;
      try {
        const source = fs.readFileSync(absolutePath, "utf-8");
        lineCount = source.split("\n").length;
      } catch {
        lineCount = 0;
      }

      // Add file node
      writer.addNode({
        name: basename,
        kind: "file",
        file_path: relPath,
        language: lang ?? undefined,
        loc: lineCount,
        start_line: 1,
        end_line: lineCount,
        is_exported: false,
        is_test: isTest,
      });

      // Add function nodes + CONTAINS edges
      for (const func of parseResult.functions) {
        writer.addNode({
          name: func.name,
          kind: "function",
          file_path: relPath,
          start_line: func.startLine,
          end_line: func.endLine,
          is_exported: func.isExported,
          signature: `${func.name}(${func.params.join(", ")})`,
          language: lang ?? undefined,
        });

        writer.addEdge({
          source_name: basename,
          source_file_path: relPath,
          target_name: func.name,
          target_file_path: relPath,
          kind: "CONTAINS",
        });
      }

      // Add class nodes + CONTAINS edges
      for (const cls of parseResult.classes) {
        writer.addNode({
          name: cls.name,
          kind: "class",
          file_path: relPath,
          start_line: cls.startLine,
          end_line: cls.endLine,
          is_exported: cls.isExported,
          language: lang ?? undefined,
        });

        writer.addEdge({
          source_name: basename,
          source_file_path: relPath,
          target_name: cls.name,
          target_file_path: relPath,
          kind: "CONTAINS",
        });
      }

      // Add exported variable nodes + CONTAINS edges
      for (const variable of parseResult.variables) {
        if (variable.isExported) {
          writer.addNode({
            name: variable.name,
            kind: "variable",
            file_path: relPath,
            start_line: variable.line,
            end_line: variable.line,
            is_exported: true,
            language: lang ?? undefined,
          });

          writer.addEdge({
            source_name: basename,
            source_file_path: relPath,
            target_name: variable.name,
            target_file_path: relPath,
            kind: "CONTAINS",
          });
        }
      }

      // Resolve imports and add IMPORTS edges
      for (const imp of parseResult.imports) {
        try {
          let resolvedPath: string | null = null;

          if (lang === "python") {
            const result = resolvePythonImport(
              imp.source,
              absolutePath,
              projectRoot,
              imp.source.startsWith(".")
            );
            if (result.modulePath && !result.isExternal) {
              resolvedPath = result.modulePath;
            }
          } else if (tsResolver) {
            resolvedPath = resolveTypeScriptImport(
              imp.source,
              absolutePath,
              tsResolver
            );
          }

          if (resolvedPath) {
            let normalizedResolved: string;
            try {
              normalizedResolved = fs.realpathSync(resolvedPath);
            } catch {
              normalizedResolved = resolvedPath;
            }

            const resolvedRelative = path.relative(
              realProjectRoot,
              normalizedResolved
            );
            if (
              !resolvedRelative.startsWith("..") &&
              !path.isAbsolute(resolvedRelative)
            ) {
              const resolvedBasename = path.basename(resolvedPath);
              writer.addEdge({
                source_name: basename,
                source_file_path: relPath,
                target_name: resolvedBasename,
                target_file_path: resolvedRelative,
                kind: "IMPORTS",
              });
            }
          }
        } catch {
          // Import resolution failed -- skip this import edge
        }
      }

      // Flush and process into SQLite
      writer.flush();
      processBatchFiles(db, batchDir);

      // Update file hash
      const newHash = computeFileHash(absolutePath);
      if (newHash) {
        updateFileHash(db, relPath, newHash);
      }

      rebuilt++;
    }

    // Invalidate graphology cache after all rebuilds
    invalidateCache();
  } finally {
    pool.destroy();

    // Clean up temp batch dir
    try {
      fs.rmSync(batchDir, { recursive: true, force: true });
    } catch {
      // cleanup best-effort
    }
  }

  return { rebuilt, removed };
}

/**
 * Remove a deleted file from the knowledge graph.
 *
 * Deletes all nodes for the file (CASCADE handles edges) and removes
 * its hash from the file_hashes table. Also cleans up orphaned communities.
 *
 * @param db - Open database connection
 * @param filePath - Relative file path to remove
 */
export function removeDeletedFile(db: DatabaseType, filePath: string): void {
  deleteFileData(db, filePath);
  removeFileHash(db, filePath);
}

/**
 * Internal helper: delete all nodes, edges, and community assignments for a file.
 */
function deleteFileData(db: DatabaseType, filePath: string): void {
  // Delete nodes (CASCADE handles edges)
  db.prepare("DELETE FROM nodes WHERE file_path = ?").run(filePath);
  // Clean up orphaned communities
  db.prepare(
    "DELETE FROM communities WHERE node_id NOT IN (SELECT id FROM nodes)"
  ).run();
}
