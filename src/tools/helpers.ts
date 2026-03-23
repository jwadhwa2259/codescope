import * as fs from "node:fs";
import { getGraphDbPath } from "../utils/paths.js";
import {
  readBootstrapMeta,
  type BootstrapMeta,
} from "../bootstrap/meta.js";

// ---- Types ----

export type Staleness = "fresh" | "stale" | "very_stale";

/**
 * Metadata included in every MCP tool response per D-17/D-18.
 */
export interface ToolMetadata {
  last_bootstrap: string | null;
  staleness: Staleness;
  query_ms: number;
  capabilities?: string[];
  upcoming?: string[];
}

// ---- Staleness Computation ----

/** 7 days in milliseconds */
const STALE_THRESHOLD_MS = 7 * 24 * 60 * 60 * 1000;
/** 30 days in milliseconds */
const VERY_STALE_THRESHOLD_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Computes staleness level from the last bootstrap timestamp.
 *
 * Per D-18:
 * - null -> "very_stale"
 * - <7 days -> "fresh"
 * - 7-30 days -> "stale"
 * - >30 days -> "very_stale"
 */
export function computeStaleness(lastBootstrap: Date | null): Staleness {
  if (lastBootstrap === null) return "very_stale";

  const ageMs = Date.now() - lastBootstrap.getTime();

  if (ageMs < STALE_THRESHOLD_MS) return "fresh";
  if (ageMs < VERY_STALE_THRESHOLD_MS) return "stale";
  return "very_stale";
}

// ---- Response Builders ----

/**
 * Builds a successful MCP response in D-17 format.
 *
 * ```json
 * { "status": "ok", "data": {...}, "metadata": {...} }
 * ```
 */
export function okResponse(
  data: unknown,
  metadata: ToolMetadata,
): { content: Array<{ type: "text"; text: string }> } {
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify({ status: "ok", data, metadata }, null, 2),
      },
    ],
  };
}

/**
 * Builds an error MCP response in D-19 format.
 *
 * ```json
 * { "status": "error", "error": { "code": "...", "message": "...", "recovery": "..." } }
 * ```
 */
export function errorResponse(
  code: string,
  message: string,
  recovery: string,
): { content: Array<{ type: "text"; text: string }> } {
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(
          { status: "error", error: { code, message, recovery } },
          null,
          2,
        ),
      },
    ],
  };
}

/**
 * Builds a partial MCP response in D-19 format.
 *
 * ```json
 * { "status": "partial", "data": {...}, "warnings": [...], "metadata": {...} }
 * ```
 */
export function partialResponse(
  data: unknown,
  warnings: string[],
  metadata: ToolMetadata,
): { content: Array<{ type: "text"; text: string }> } {
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(
          { status: "partial", data, warnings, metadata },
          null,
          2,
        ),
      },
    ],
  };
}

// ---- Bootstrap State Helpers ----

/**
 * Checks whether the project has been bootstrapped by verifying graph.db exists.
 */
export function isBootstrapped(projectRoot: string): boolean {
  return fs.existsSync(getGraphDbPath(projectRoot));
}

/**
 * Reads bootstrap metadata from disk.
 * Re-exported convenience wrapper around readBootstrapMeta.
 */
export function getBootstrapMeta(projectRoot: string): BootstrapMeta | null {
  return readBootstrapMeta(projectRoot);
}

/**
 * Constructs a ToolMetadata object with staleness calculation and query timing.
 *
 * @param projectRoot - Project root for reading bootstrap metadata
 * @param startMs - Timestamp from Date.now() at handler start (for query_ms)
 * @param extras - Optional capabilities and upcoming arrays (D-38)
 */
export function buildMetadata(
  projectRoot: string,
  startMs: number,
  extras?: { capabilities?: string[]; upcoming?: string[] },
): ToolMetadata {
  const meta = readBootstrapMeta(projectRoot);
  const lastBootstrapDate = meta?.last_bootstrap
    ? new Date(meta.last_bootstrap)
    : null;

  const metadata: ToolMetadata = {
    last_bootstrap: meta?.last_bootstrap ?? null,
    staleness: computeStaleness(lastBootstrapDate),
    query_ms: Date.now() - startMs,
  };

  if (extras?.capabilities) {
    metadata.capabilities = extras.capabilities;
  }
  if (extras?.upcoming) {
    metadata.upcoming = extras.upcoming;
  }

  return metadata;
}
