/**
 * Shared per-file graph-building function.
 *
 * Extracts the node/edge creation logic that was duplicated between
 * builder.ts and incremental.ts into a single function. Both callers
 * import processFileForGraph to add file, function, class, variable
 * nodes and CONTAINS/IMPORTS edges to the batch writer.
 *
 * Key fix: tsResolver is typed as Resolver (not Resolver | null),
 * enforcing non-null at the type level. A fallback resolver is always
 * created when tsconfig is missing or resolver creation throws.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import type { BatchWriter } from "./batch-writer.js";
import type { ParseResult } from "../parser/extract.js";
import type { SupportedLanguage } from "../parser/languages.js";
import { resolveTypeScriptImport } from "../resolver/typescript.js";
import { resolvePythonImport } from "../resolver/python.js";

// Use the enhanced-resolve Resolver type
import enhancedResolve from "enhanced-resolve";
type Resolver = ReturnType<typeof enhancedResolve.ResolverFactory.createResolver>;

export interface ProcessFileResult {
  errors: string[];
  totalImports: number;
}

/**
 * Process a single parsed file and write its nodes/edges to the batch writer.
 *
 * Creates:
 * - 1 file node
 * - N function nodes + CONTAINS edges
 * - N class nodes + CONTAINS edges
 * - N exported variable nodes + CONTAINS edges
 * - N IMPORTS edges (resolved via tsResolver for TS/JS, resolvePythonImport for Python)
 *
 * @param writer - BatchWriter for JSONL output
 * @param parseResult - Tree-sitter parse output (imports, exports, classes, functions, variables)
 * @param relativePath - File path relative to project root
 * @param absolutePath - Absolute file path on disk
 * @param tsResolver - enhanced-resolve resolver instance (never null -- fallback created by caller)
 * @param realProjectRoot - Resolved (symlink-safe) project root path
 * @param projectRoot - Original project root path (used for Python resolution)
 * @param language - Detected language or null
 * @param lineCount - Number of lines in the file
 * @param isTest - Whether the file is a test file
 */
export function processFileForGraph(
  writer: BatchWriter,
  parseResult: ParseResult,
  relativePath: string,
  absolutePath: string,
  tsResolver: Resolver,
  realProjectRoot: string,
  projectRoot: string,
  language: SupportedLanguage | null,
  lineCount: number,
  isTest: boolean,
): ProcessFileResult {
  const errors: string[] = [];
  const basename = path.basename(absolutePath);

  // Add file node
  writer.addNode({
    name: basename,
    kind: "file",
    file_path: relativePath,
    language: language ?? undefined,
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
      file_path: relativePath,
      start_line: func.startLine,
      end_line: func.endLine,
      is_exported: func.isExported,
      signature: `${func.name}(${func.params.join(", ")})`,
      language: language ?? undefined,
    });

    writer.addEdge({
      source_name: basename,
      source_file_path: relativePath,
      target_name: func.name,
      target_file_path: relativePath,
      kind: "CONTAINS",
    });
  }

  // Add class nodes + CONTAINS edges
  for (const cls of parseResult.classes) {
    writer.addNode({
      name: cls.name,
      kind: "class",
      file_path: relativePath,
      start_line: cls.startLine,
      end_line: cls.endLine,
      is_exported: cls.isExported,
      language: language ?? undefined,
    });

    writer.addEdge({
      source_name: basename,
      source_file_path: relativePath,
      target_name: cls.name,
      target_file_path: relativePath,
      kind: "CONTAINS",
    });
  }

  // Add exported variable nodes + CONTAINS edges
  for (const variable of parseResult.variables) {
    if (variable.isExported) {
      writer.addNode({
        name: variable.name,
        kind: "variable",
        file_path: relativePath,
        start_line: variable.line,
        end_line: variable.line,
        is_exported: true,
        language: language ?? undefined,
      });

      writer.addEdge({
        source_name: basename,
        source_file_path: relativePath,
        target_name: variable.name,
        target_file_path: relativePath,
        kind: "CONTAINS",
      });
    }
  }

  // Resolve imports and add IMPORTS edges
  for (const imp of parseResult.imports) {
    try {
      let resolvedPath: string | null = null;

      if (language === "python") {
        const result = resolvePythonImport(
          imp.source,
          absolutePath,
          projectRoot,
          imp.source.startsWith("."),
        );
        if (result.modulePath && !result.isExternal) {
          resolvedPath = result.modulePath;
        }
      } else {
        // TypeScript / JavaScript -- tsResolver is always defined (no null check)
        resolvedPath = resolveTypeScriptImport(
          imp.source,
          absolutePath,
          tsResolver,
        );
      }

      if (resolvedPath) {
        // Normalize resolved path for symlink-safe comparison
        let normalizedResolved: string;
        try {
          normalizedResolved = fs.realpathSync(resolvedPath);
        } catch {
          normalizedResolved = resolvedPath;
        }

        // Ensure resolved path is within the project
        const resolvedRelative = path.relative(
          realProjectRoot,
          normalizedResolved,
        );
        if (
          !resolvedRelative.startsWith("..") &&
          !path.isAbsolute(resolvedRelative)
        ) {
          const resolvedBasename = path.basename(resolvedPath);
          writer.addEdge({
            source_name: basename,
            source_file_path: relativePath,
            target_name: resolvedBasename,
            target_file_path: resolvedRelative,
            kind: "IMPORTS",
          });
        }
      }
    } catch (err) {
      errors.push(
        `Import resolution failed for "${imp.source}" in ${relativePath}: ${String(err)}`,
      );
    }
  }

  return { errors, totalImports: parseResult.imports.length };
}
