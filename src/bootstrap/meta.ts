import * as fs from "node:fs";
import * as path from "node:path";
import { getCodescopePath } from "../utils/paths.js";

/**
 * Metadata about the last bootstrap run.
 * Persisted to .claude/codescope/bootstrap-meta.json.
 */
export interface BootstrapMeta {
  last_bootstrap: string; // ISO 8601 timestamp
  duration_ms: number;
  mode: "full" | "incremental";
  version: string;
}

const META_FILENAME = "bootstrap-meta.json";

/**
 * Reads bootstrap metadata from .claude/codescope/bootstrap-meta.json.
 * Returns null if the file does not exist or cannot be parsed.
 */
export function readBootstrapMeta(projectRoot: string): BootstrapMeta | null {
  const metaPath = path.join(getCodescopePath(projectRoot), META_FILENAME);
  try {
    if (!fs.existsSync(metaPath)) return null;
    const raw = fs.readFileSync(metaPath, "utf-8");
    const parsed = JSON.parse(raw) as BootstrapMeta;
    // Basic shape validation
    if (
      typeof parsed.last_bootstrap !== "string" ||
      typeof parsed.duration_ms !== "number" ||
      typeof parsed.mode !== "string" ||
      typeof parsed.version !== "string"
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Writes bootstrap metadata to .claude/codescope/bootstrap-meta.json.
 * Creates the directory if it does not exist.
 */
export function writeBootstrapMeta(
  projectRoot: string,
  meta: BootstrapMeta,
): void {
  const codescopePath = getCodescopePath(projectRoot);
  fs.mkdirSync(codescopePath, { recursive: true });
  const metaPath = path.join(codescopePath, META_FILENAME);
  fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2), "utf-8");
}
