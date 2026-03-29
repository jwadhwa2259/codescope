import { Hono } from "hono";
import * as fs from "node:fs";
import * as path from "node:path";
import { openDatabase, closeDatabase } from "../../graph/database.js";
import { getGraphDbPath, getCodescopePath } from "../../utils/paths.js";

export const statusRouter = new Hono();

/**
 * GET /status
 *
 * Returns bootstrap state and high-level counts (nodes, edges, communities).
 * Used by the status bar and header to show connection/data state.
 */
statusRouter.get("/", (c) => {
  const projectRoot = c.get("projectRoot") as string;
  const dbPath = getGraphDbPath(projectRoot);
  const metaPath = path.join(getCodescopePath(projectRoot), "meta.json");

  const isBootstrapped = fs.existsSync(dbPath);
  let nodeCount = 0;
  let edgeCount = 0;
  let communityCount = 0;

  if (isBootstrapped) {
    const db = openDatabase(dbPath);
    try {
      const nodeRow = db
        .prepare("SELECT COUNT(*) as count FROM nodes")
        .get() as { count: number };
      const edgeRow = db
        .prepare("SELECT COUNT(*) as count FROM edges")
        .get() as { count: number };
      const communityRow = db
        .prepare(
          "SELECT COUNT(DISTINCT community_id) as count FROM communities",
        )
        .get() as { count: number };

      nodeCount = nodeRow.count;
      edgeCount = edgeRow.count;
      communityCount = communityRow.count;
    } finally {
      closeDatabase(db);
    }
  }

  let bootstrapDate: string | null = null;
  if (fs.existsSync(metaPath)) {
    try {
      const meta = JSON.parse(fs.readFileSync(metaPath, "utf-8"));
      bootstrapDate = meta.timestamp ?? meta.date ?? null;
    } catch {
      // Malformed meta.json -- ignore
    }
  }

  return c.json({
    status: "ok",
    data: {
      nodeCount,
      edgeCount,
      communityCount,
      bootstrapDate,
      isBootstrapped,
    },
  });
});
