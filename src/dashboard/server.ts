import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { createNodeWebSocket } from "@hono/node-ws";
import { compress } from "hono/compress";
import * as fs from "node:fs";
import * as path from "node:path";
import type { WSContext } from "hono/ws";
import { getCodescopePath } from "../utils/paths.js";
import { graphRouter } from "./api/graph.js";
import { conventionsRouter } from "./api/conventions.js";
import { readinessRouter } from "./api/readiness.js";
import { blastRadiusRouter } from "./api/blast-radius.js";
import { statusRouter } from "./api/status.js";
import { reviewRouter } from "./api/review.js";
import { impactRouter } from "./api/impact.js";

// ---- App Setup ----

const app = new Hono();
const { injectWebSocket, upgradeWebSocket } = createNodeWebSocket({ app });

// ---- Middleware ----

app.use("*", compress());

// Set projectRoot in context for all routes
app.use("*", async (c, next) => {
  c.set("projectRoot", process.cwd());
  await next();
});

// ---- API Routes ----

const apiRouter = new Hono();
apiRouter.route("/graph", graphRouter);
apiRouter.route("/conventions", conventionsRouter);
apiRouter.route("/readiness", readinessRouter);
apiRouter.route("/blast-radius", blastRadiusRouter);
apiRouter.route("/status", statusRouter);
apiRouter.route("/review", reviewRouter);
apiRouter.route("/impact", impactRouter);

app.route("/api", apiRouter);

// ---- WebSocket ----

const clients = new Set<WSContext>();

/**
 * Broadcast data to all connected WebSocket clients.
 * Used by event log tailing and live update notifications.
 */
export function broadcast(data: unknown): void {
  const json = JSON.stringify(data);
  for (const ws of clients) {
    try {
      ws.send(json);
    } catch {
      // Client may have disconnected -- remove on next check
      clients.delete(ws);
    }
  }
}

app.get(
  "/ws",
  upgradeWebSocket(() => ({
    onOpen(_event: Event, ws: WSContext) {
      clients.add(ws);
    },
    onClose(_event: Event, ws: WSContext) {
      clients.delete(ws);
    },
    onMessage(event: MessageEvent, _ws: WSContext) {
      // Client messages are currently unused; placeholder for future commands
      void event;
    },
  })),
);

// ---- Event Log Tailing ----

/**
 * Watches the events.log file for new lines and broadcasts them via WebSocket.
 * Handles missing file gracefully -- watches parent directory for file creation.
 */
function startEventTail(eventsLogPath: string): void {
  let lastSize = 0;

  function readNewLines(): void {
    try {
      const stats = fs.statSync(eventsLogPath);
      if (stats.size > lastSize) {
        const fd = fs.openSync(eventsLogPath, "r");
        const buffer = Buffer.alloc(stats.size - lastSize);
        fs.readSync(fd, buffer, 0, buffer.length, lastSize);
        fs.closeSync(fd);
        lastSize = stats.size;

        const lines = buffer.toString("utf-8").split("\n").filter(Boolean);
        for (const line of lines) {
          broadcast({ type: "event", data: line });
        }
      }
    } catch {
      // File may not exist yet or be temporarily unavailable
    }
  }

  if (fs.existsSync(eventsLogPath)) {
    // Start from current size (don't replay history)
    try {
      lastSize = fs.statSync(eventsLogPath).size;
    } catch {
      lastSize = 0;
    }

    fs.watch(eventsLogPath, () => {
      readNewLines();
    });
  } else {
    // Watch parent directory for file creation
    const parentDir = path.dirname(eventsLogPath);
    if (fs.existsSync(parentDir)) {
      const watcher = fs.watch(parentDir, (eventType, filename) => {
        if (filename === path.basename(eventsLogPath)) {
          watcher.close();
          // File was created -- start watching it
          lastSize = 0;
          readNewLines();
          try {
            fs.watch(eventsLogPath, () => {
              readNewLines();
            });
          } catch {
            // File may have been removed again
          }
        }
      });
    }
  }
}

// ---- Static Files ----

// Serve the bundled client JS at /dashboard.js
app.use(
  "/dashboard.js",
  serveStatic({ path: "./dist/dashboard/app.mjs" }),
);

// ---- SPA Fallback ----

// Read the HTML template
let indexHtml = "";
try {
  // Try src/ first (development), then dist/ (production)
  const devPath = path.join(
    import.meta.dirname ?? process.cwd(),
    "client",
    "index.html",
  );
  const prodPath = path.join(process.cwd(), "src", "dashboard", "client", "index.html");

  if (fs.existsSync(devPath)) {
    indexHtml = fs.readFileSync(devPath, "utf-8");
  } else if (fs.existsSync(prodPath)) {
    indexHtml = fs.readFileSync(prodPath, "utf-8");
  }
} catch {
  // Will serve empty page -- acceptable for initial load before build
}

app.get("*", (c) => c.html(indexHtml));

// ---- Server Start ----

/**
 * Starts the dashboard HTTP server with WebSocket support.
 *
 * @param port - Port number (default 7463)
 * @returns The HTTP server instance
 */
export function startDashboard(port?: number) {
  const serverPort = port ?? 7463;
  const projectRoot = process.cwd();

  const server = serve({
    fetch: app.fetch,
    port: serverPort,
  });

  injectWebSocket(server);

  // Start event log tailing
  const eventsLogPath = path.join(
    getCodescopePath(projectRoot),
    "events.log",
  );
  startEventTail(eventsLogPath);

  console.log(`CodeScope Dashboard running at http://localhost:${serverPort}`);
  return server;
}

// Auto-start when run directly
if (process.argv[1]?.endsWith("server")) {
  startDashboard();
}

export { app };
