/**
 * Read and parse pre-computed artifact files for hook scripts.
 *
 * Provides safe JSON reading that returns null for missing or invalid files
 * (per D-15: hooks skip missing artifact categories).
 *
 * ONLY imports from node:fs, node:path, and local ./types.js.
 */

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import type {
  DangerZoneIndex,
  ConventionIndex,
  BlastRadiusIndex,
  ReferenceIndex,
  ViolationIndex,
} from "./types.js";

/** All artifact data that hooks may consume. */
export interface ArtifactData {
  dangerZones: DangerZoneIndex | null;
  conventions: ConventionIndex | null;
  blastRadius: BlastRadiusIndex | null;
  references: ReferenceIndex | null;
  violations: ViolationIndex | null;
}

/**
 * Safely read and parse a JSON file.
 *
 * Returns null if the file does not exist or contains invalid JSON.
 * Never throws -- callers can safely skip missing artifacts.
 */
export function readJsonSafe<T>(filePath: string): T | null {
  if (!existsSync(filePath)) return null;
  try {
    return JSON.parse(readFileSync(filePath, "utf-8")) as T;
  } catch {
    return null;
  }
}

/**
 * Read all five artifact index files from the injection directory.
 *
 * Any or all may be null if the corresponding file is missing or invalid.
 * This supports partial bootstrap scenarios (D-15).
 */
export function readAllArtifacts(injectionDir: string): ArtifactData {
  const dangerZones = readJsonSafe<DangerZoneIndex>(
    join(injectionDir, "danger-zones.json"),
  );
  const conventions = readJsonSafe<ConventionIndex>(
    join(injectionDir, "conventions.json"),
  );
  const blastRadius = readJsonSafe<BlastRadiusIndex>(
    join(injectionDir, "blast-radius.json"),
  );

  const references = readJsonSafe<ReferenceIndex>(
    join(injectionDir, "references-index.json"),
  );
  const violations = readJsonSafe<ViolationIndex>(
    join(injectionDir, "convention-violations.json"),
  );

  return { dangerZones, conventions, blastRadius, references, violations };
}
