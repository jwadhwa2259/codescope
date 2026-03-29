import { Hono } from "hono";
import { handlePredictImpact } from "../../tools/impact-prediction.js";

export const impactRouter = new Hono();

/**
 * POST /impact
 *
 * Wraps the handlePredictImpact tool handler for the dashboard.
 * Accepts file_paths and optional max_hops, returns impact prediction results.
 */
impactRouter.post("/", async (c) => {
  const projectRoot = c.get("projectRoot") as string;

  try {
    const body = await c.req.json();
    const { file_paths, max_hops } = body as {
      file_paths?: string[];
      max_hops?: number;
    };

    const result = await handlePredictImpact(
      {
        file_paths: file_paths ?? [],
        max_hops: max_hops ?? 4,
      },
      projectRoot,
    );

    return c.json({ status: "ok", data: result });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return c.json(
      { status: "error", code: "IMPACT_FAILED", message },
      500,
    );
  }
});
