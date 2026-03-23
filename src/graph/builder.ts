import * as fs from "node:fs";
import * as path from "node:path";
import { ParserPool } from "../parser/index.js";
import { parseFile } from "../parser/index.js";
import { detectLanguage } from "../parser/languages.js";
import { BatchWriter, processBatchFiles } from "./batch-writer.js";
import { openDatabase, closeDatabase } from "./database.js";
import { createSchema } from "./schema.js";
import { createTypeScriptResolver, resolveTypeScriptImport } from "../resolver/typescript.js";
import { resolvePythonImport } from "../resolver/python.js";

/**
 * Directories to skip during file walking.
 * These are common build artifacts, dependency directories, and hidden directories.
 */
export const DEFAULT_IGNORE = new Set([
  "node_modules",
  "dist",
  "build",
  ".git",
  "vendor",
  ".next",
  ".nuxt",
  "__pycache__",
  ".venv",
  "venv",
  "coverage",
  ".cache",
  ".output",
]);

export interface BuildGraphOptions {
  projectRoot: string;
  dbPath: string;
  batchDir: string;
  ignorePatterns?: string[];
}

export interface BuildGraphResult {
  filesProcessed: number;
  nodesCreated: number;
  edgesCreated: number;
  errors: string[];
  durationMs: number;
}

/**
 * Synchronous recursive directory walk that returns absolute file paths
 * for all source files with supported languages.
 *
 * Skips directories in DEFAULT_IGNORE and any additional ignorePatterns.
 * Skips dotfiles/dotdirs (entries starting with '.').
 * Only includes files where detectLanguage returns non-null.
 */
export function walkSourceFiles(
  rootDir: string,
  ignorePatterns?: string[]
): string[] {
  const results: string[] = [];
  const extraIgnore = new Set(ignorePatterns ?? []);

  function walk(dir: string): void {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return; // Skip directories we can't read
    }

    for (const entry of entries) {
      const name = entry.name;

      // Skip dotfiles/dotdirs (except '.' itself)
      if (name.startsWith(".")) continue;

      // Skip ignored directories
      if (entry.isDirectory()) {
        if (DEFAULT_IGNORE.has(name) || extraIgnore.has(name)) continue;
        walk(path.join(dir, name));
        continue;
      }

      // Only include files with supported languages
      if (entry.isFile()) {
        const filePath = path.join(dir, name);
        if (detectLanguage(filePath) !== null) {
          results.push(filePath);
        }
      }
    }
  }

  walk(rootDir);
  return results;
}

/**
 * Builds the knowledge graph from source files.
 *
 * Pipeline:
 * 1. Walk source files
 * 2. Parse each file with tree-sitter
 * 3. Create nodes (file, function, class, variable) and edges (IMPORTS, CONTAINS)
 * 4. Write to JSONL via BatchWriter
 * 5. Process JSONL into SQLite
 *
 * Returns counts of files processed, nodes/edges created, and any errors.
 */
export async function buildGraph(
  options: BuildGraphOptions
): Promise<BuildGraphResult> {
  const startTime = Date.now();
  const errors: string[] = [];

  // Resolve symlinks in project root (macOS /var -> /private/var)
  // so that paths from enhanced-resolve match our relative path calculations
  let realProjectRoot: string;
  try {
    realProjectRoot = fs.realpathSync(options.projectRoot);
  } catch {
    realProjectRoot = options.projectRoot;
  }

  // Step 1: Initialize parser pool
  const pool = new ParserPool();
  await pool.init();

  try {
    // Step 2: Walk source files
    const filePaths = walkSourceFiles(options.projectRoot, options.ignorePatterns);

    // Step 3: Create BatchWriter
    const writer = new BatchWriter(options.batchDir, "graph-builder");

    // Step 4: Create TS resolver once for reuse
    let tsResolver: ReturnType<typeof createTypeScriptResolver> | null = null;
    try {
      tsResolver = createTypeScriptResolver({
        projectRoot: options.projectRoot,
      });
    } catch {
      // If resolver creation fails (e.g., no tsconfig), we'll skip import resolution for TS
      errors.push("Failed to create TypeScript resolver; import edges may be incomplete");
    }

    // Track processed files to avoid duplicates (per Pitfall 4)
    const processedFiles = new Set<string>();
    let filesProcessed = 0;

    // Step 5: Process each file
    for (const filePath of filePaths) {
      const relativePath = path.relative(options.projectRoot, filePath);

      // Skip duplicates
      if (processedFiles.has(relativePath)) continue;
      processedFiles.add(relativePath);

      try {
        // Parse the file
        const parseResult = await parseFile(filePath, pool);
        if (!parseResult) continue; // Unsupported language

        filesProcessed++;

        // Read source for line counting
        let lineCount = 0;
        try {
          const source = fs.readFileSync(filePath, "utf-8");
          lineCount = source.split("\n").length;
        } catch {
          lineCount = 0;
        }

        const lang = detectLanguage(filePath);
        const basename = path.basename(filePath);
        const isTest =
          filePath.includes(".test.") ||
          filePath.includes(".spec.") ||
          filePath.includes("__tests__");

        // Add file node
        writer.addNode({
          name: basename,
          kind: "file",
          file_path: relativePath,
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
            file_path: relativePath,
            start_line: func.startLine,
            end_line: func.endLine,
            is_exported: func.isExported,
            signature: `${func.name}(${func.params.join(", ")})`,
            language: lang ?? undefined,
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
            language: lang ?? undefined,
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
              language: lang ?? undefined,
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

            if (lang === "python") {
              const result = resolvePythonImport(
                imp.source,
                filePath,
                options.projectRoot,
                imp.source.startsWith(".")
              );
              if (result.modulePath && !result.isExternal) {
                resolvedPath = result.modulePath;
              }
            } else if (tsResolver) {
              // TypeScript / JavaScript
              resolvedPath = resolveTypeScriptImport(
                imp.source,
                filePath,
                tsResolver
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
                normalizedResolved
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
              `Import resolution failed for "${imp.source}" in ${relativePath}: ${String(err)}`
            );
          }
        }
      } catch (err) {
        errors.push(`Failed to process ${relativePath}: ${String(err)}`);
      }
    }

    // Step 6: Flush batch writer
    writer.flush();

    // Step 7: Process into SQLite
    fs.mkdirSync(path.dirname(options.dbPath), { recursive: true });
    const db = openDatabase(options.dbPath);
    try {
      createSchema(db);
      const batchResult = processBatchFiles(db, options.batchDir);

      const durationMs = Date.now() - startTime;

      return {
        filesProcessed,
        nodesCreated: batchResult.nodesInserted,
        edgesCreated: batchResult.edgesInserted,
        errors: [...errors, ...batchResult.errors],
        durationMs,
      };
    } finally {
      closeDatabase(db);
    }
  } finally {
    pool.destroy();
  }
}
