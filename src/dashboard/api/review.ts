import { Hono } from "hono";
import { handleReview } from "../../tools/review/index.js";
import type { AppEnv } from "../server.js";

export const reviewRouter = new Hono<AppEnv>();

/**
 * POST /review
 *
 * Wraps the handleReview tool handler for the dashboard.
 * Accepts file_paths and optional branch, returns structured review results.
 */
reviewRouter.post("/", async (c) => {
  const projectRoot = c.get("projectRoot");

  try {
    const body = await c.req.json();
    const { file_paths, branch } = body as {
      file_paths?: string[];
      branch?: string;
    };

    const result = await handleReview(
      {
        diff_source: branch ?? "working_tree",
        file_paths: file_paths ?? [],
      },
      projectRoot,
    );

    return c.json({ status: "ok", data: result });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return c.json(
      { status: "error", code: "REVIEW_FAILED", message },
      500,
    );
  }
});
