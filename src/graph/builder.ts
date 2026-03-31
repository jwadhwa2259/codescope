import * as fs from "node:fs";
import * as path from "node:path";
import enhancedResolve from "enhanced-resolve";
import { ParserPool } from "../parser/index.js";
import { parseFile } from "../parser/index.js";
import { detectLanguage } from "../parser/languages.js";
import { BatchWriter, processBatchFiles } from "./batch-writer.js";
import { openDatabase, closeDatabase } from "./database.js";
import { createSchema } from "./schema.js";
import { createTypeScriptResolver } from "../resolver/typescript.js";
import { processFileForGraph } from "./shared-builder.js";

const { ResolverFactory, CachedInputFileSystem } = enhancedResolve;

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
  workspaceAliases?: Record<string, string>;
}

export interface BuildGraphResult {
  filesProcessed: number;
  nodesCreated: number;
  edgesCreated: number;
  errors: string[];
  durationMs: number;
  totalImports: number;
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
    // Always assigned -- fallback resolver created when tsconfig is missing
    let tsResolver: ReturnType<typeof createTypeScriptResolver>;
    try {
      tsResolver = createTypeScriptResolver({
        projectRoot: options.projectRoot,
        workspaceAliases: options.workspaceAliases,
      });
    } catch (err) {
      errors.push(`TypeScript resolver creation failed: ${String(err)}. Using fallback resolver without path aliases.`);
      tsResolver = ResolverFactory.createResolver({
        fileSystem: new CachedInputFileSystem(fs, 4000),
        extensions: ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.json'],
        mainFields: ['types', 'typings', 'main', 'module'],
        mainFiles: ['index'],
        conditionNames: ['import', 'require', 'node', 'default'],
        modules: ['node_modules'],
        useSyncFileSystemCalls: true,
      });
    }

    // Track processed files to avoid duplicates (per Pitfall 4)
    const processedFiles = new Set<string>();
    let filesProcessed = 0;
    let totalImportsCount = 0;

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
        const isTest =
          filePath.includes(".test.") ||
          filePath.includes(".spec.") ||
          filePath.includes("__tests__");

        // Delegate node/edge creation to shared function
        const fileResult = processFileForGraph(
          writer,
          parseResult,
          relativePath,
          filePath,
          tsResolver,
          realProjectRoot,
          options.projectRoot,
          lang,
          lineCount,
          isTest,
        );

        // Collect errors from per-file processing
        errors.push(...fileResult.errors);
        totalImportsCount += fileResult.totalImports;
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
        totalImports: totalImportsCount,
      };
    } finally {
      closeDatabase(db);
    }
  } finally {
    pool.destroy();
  }
}
