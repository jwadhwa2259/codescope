import { Hono } from "hono";
import * as fs from "node:fs";
import { openDatabase, closeDatabase } from "../../graph/database.js";
import { getLatestSnapshot } from "../../graph/readiness-history.js";
import { getGraphDbPath } from "../../utils/paths.js";
import type { ReadinessSnapshot } from "../../graph/readiness-history.js";

export const readinessRouter = new Hono();

/**
 * Convert a numeric score (0-100) to a letter grade.
 * A (>=90), B (>=75), C (>=60), D (>=45), F (<45).
 */
function toLetterGrade(score: number): string {
  if (score >= 90) return "A";
  if (score >= 75) return "B";
  if (score >= 60) return "C";
  if (score >= 45) return "D";
  return "F";
}

interface ReadinessWithGrades extends ReadinessSnapshot {
  grades: {
    convention_coverage: string;
    type_safety: string;
    test_coverage_proxy: string;
    import_graph_health: string;
  };
}

/**
 * GET /readiness
 *
 * Returns the current readiness snapshot with letter grades for each
 * dimension plus the full history array for trend visualization.
 */
readinessRouter.get("/", (c) => {
  const projectRoot = c.get("projectRoot") as string;
  const dbPath = getGraphDbPath(projectRoot);

  if (!fs.existsSync(dbPath)) {
    return c.json(
      {
        status: "error",
        code: "NOT_BOOTSTRAPPED",
        message: "No codebase data yet",
      },
      404,
    );
  }

  const db = openDatabase(dbPath);
  try {
    const latest = getLatestSnapshot(db);
    const history = db
      .prepare(
        "SELECT * FROM readiness_history ORDER BY timestamp ASC",
      )
      .all() as ReadinessSnapshot[];

    if (!latest) {
      return c.json(
        {
          status: "error",
          code: "NO_READINESS_DATA",
          message: "No readiness snapshots found",
        },
        404,
      );
    }

    const current: ReadinessWithGrades = {
      ...latest,
      grades: {
        convention_coverage: toLetterGrade(latest.convention_coverage),
        type_safety: toLetterGrade(latest.type_safety),
        test_coverage_proxy: toLetterGrade(latest.test_coverage_proxy),
        import_graph_health: toLetterGrade(latest.import_graph_health),
      },
    };

    return c.json({
      status: "ok",
      data: { current, history },
    });
  } finally {
    closeDatabase(db);
  }
});
