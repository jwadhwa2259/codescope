import { Hono } from "hono";
import * as fs from "node:fs";
import * as path from "node:path";
import { getCodescopePath } from "../../utils/paths.js";
import type { ConventionIndex, ConventionFileEntry } from "../../artifacts/types.js";

export const conventionsRouter = new Hono();

/**
 * Compute per-file compliance percentage and color bucket.
 * Average of adoption_pct across all conventions for a file.
 * Color: >80 green, 50-80 yellow, <50 red.
 */
function enrichFile(conventions: ConventionFileEntry[]): {
  conventions: ConventionFileEntry[];
  compliancePct: number;
  color: "green" | "yellow" | "red";
} {
  if (conventions.length === 0) {
    return { conventions, compliancePct: 0, color: "red" };
  }
  const sum = conventions.reduce((acc, c) => acc + c.adoption_pct, 0);
  const compliancePct = Math.round(sum / conventions.length);
  const color =
    compliancePct > 80 ? "green" : compliancePct >= 50 ? "yellow" : "red";
  return { conventions, compliancePct, color };
}

/**
 * GET /conventions
 *
 * Returns per-file convention compliance data with color buckets.
 * Reads from the pre-computed convention index JSON.
 */
conventionsRouter.get("/", (c) => {
  const projectRoot = c.get("projectRoot") as string;
  const indexPath = path.join(
    getCodescopePath(projectRoot),
    "injection",
    "convention-index.json",
  );

  if (!fs.existsSync(indexPath)) {
    return c.json(
      {
        status: "error",
        code: "NO_CONVENTIONS",
        message: "No convention data found",
      },
      404,
    );
  }

  const raw = fs.readFileSync(indexPath, "utf-8");
  const index: ConventionIndex = JSON.parse(raw);

  const enrichedFiles: Record<
    string,
    ReturnType<typeof enrichFile>
  > = {};
  for (const [filePath, conventions] of Object.entries(index.files)) {
    enrichedFiles[filePath] = enrichFile(conventions);
  }

  return c.json({
    status: "ok",
    data: {
      generated: index.generated,
      files: enrichedFiles,
    },
  });
});
