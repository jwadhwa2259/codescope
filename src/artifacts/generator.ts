/**
 * Main entry point for injection artifact generation.
 *
 * Generates pre-computed JSON index files for hook scripts to read.
 * Three index files (danger-zones.json, conventions.json, blast-radius.json)
 * are written to .claude/codescope/injection/ after every bootstrap and
 * every incremental rebuild.
 *
 * Per D-11, D-12: All heavy computation (graph traversal, centrality,
 * community detection) happens here in the MCP server process. Hook scripts
 * only read the resulting JSON.
 *
 * Per D-15: Each builder is wrapped in try/catch so one failing builder
 * does not prevent the others from writing.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import type { Database as DatabaseType } from "better-sqlite3";
import { getCodescopePath } from "../utils/paths.js";
import { buildDangerZoneIndex } from "./danger-zone-index.js";
import { buildConventionIndex } from "./convention-index.js";
import { buildBlastRadiusIndex } from "./blast-radius-index.js";

/** Subdirectory name under codescope dir for injection artifacts. */
export const INJECTION_DIR = "injection";

/**
 * Atomically write a JSON artifact file.
 *
 * Writes to a .tmp file first, then renames to the final path.
 * This prevents hook scripts from reading partially-written data.
 *
 * @param filePath - Final destination path for the artifact
 * @param data - Data to serialize as JSON
 */
export function writeArtifactAtomic(filePath: string, data: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmpPath = filePath + ".tmp";
  fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2), "utf-8");
  fs.renameSync(tmpPath, filePath);
}

/**
 * Generate all injection artifacts and write them to disk.
 *
 * Produces three JSON index files:
 * - danger-zones.json: Per-file danger zone data with centrality and risk scores
 * - conventions.json: Per-file convention lists parsed from conventions.md
 * - blast-radius.json: Per-file blast radius with risk breakdown
 *
 * Each builder runs independently in try/catch so one failure does not
 * prevent the others from completing.
 *
 * @param projectRoot - Project root directory
 * @param db - Open database connection with v2 schema
 */
export async function generateInjectionArtifacts(
  projectRoot: string,
  db: DatabaseType,
): Promise<void> {
  // Guard: skip if graph has no nodes (not bootstrapped or empty)
  const nodeCount = (
    db.prepare("SELECT COUNT(*) as c FROM nodes").get() as { c: number }
  ).c;
  if (nodeCount === 0) return;

  const codescopeDir = getCodescopePath(projectRoot);
  const injectionDir = path.join(codescopeDir, INJECTION_DIR);

  // Build and write danger zones index
  try {
    const dangerZoneIndex = buildDangerZoneIndex(db);
    writeArtifactAtomic(
      path.join(injectionDir, "danger-zones.json"),
      dangerZoneIndex,
    );
  } catch {
    // Danger zone builder failure is non-fatal
  }

  // Build and write conventions index
  try {
    const conventionIndex = buildConventionIndex(codescopeDir);
    writeArtifactAtomic(
      path.join(injectionDir, "conventions.json"),
      conventionIndex,
    );
  } catch {
    // Convention builder failure is non-fatal
  }

  // Build and write blast radius index
  try {
    const blastRadiusIndex = buildBlastRadiusIndex(db);
    writeArtifactAtomic(
      path.join(injectionDir, "blast-radius.json"),
      blastRadiusIndex,
    );
  } catch {
    // Blast radius builder failure is non-fatal
  }
}
