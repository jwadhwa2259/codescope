import { describe, it, expect } from "vitest";
import { graphRouter } from "../../src/dashboard/api/graph.js";
import { conventionsRouter } from "../../src/dashboard/api/conventions.js";
import { readinessRouter } from "../../src/dashboard/api/readiness.js";
import { blastRadiusRouter } from "../../src/dashboard/api/blast-radius.js";
import { statusRouter } from "../../src/dashboard/api/status.js";
import { reviewRouter } from "../../src/dashboard/api/review.js";
import { impactRouter } from "../../src/dashboard/api/impact.js";

describe("Dashboard API Routes", () => {
  describe("Route exports", () => {
    it("graphRouter is a Hono instance", () => {
      expect(graphRouter).toBeDefined();
      expect(typeof graphRouter.fetch).toBe("function");
    });

    it("conventionsRouter is a Hono instance", () => {
      expect(conventionsRouter).toBeDefined();
      expect(typeof conventionsRouter.fetch).toBe("function");
    });

    it("readinessRouter is a Hono instance", () => {
      expect(readinessRouter).toBeDefined();
      expect(typeof readinessRouter.fetch).toBe("function");
    });

    it("blastRadiusRouter is a Hono instance", () => {
      expect(blastRadiusRouter).toBeDefined();
      expect(typeof blastRadiusRouter.fetch).toBe("function");
    });

    it("statusRouter is a Hono instance", () => {
      expect(statusRouter).toBeDefined();
      expect(typeof statusRouter.fetch).toBe("function");
    });

    it("reviewRouter is a Hono instance", () => {
      expect(reviewRouter).toBeDefined();
      expect(typeof reviewRouter.fetch).toBe("function");
    });

    it("impactRouter is a Hono instance", () => {
      expect(impactRouter).toBeDefined();
      expect(typeof impactRouter.fetch).toBe("function");
    });
  });

  describe("GET /api/status", () => {
    it("returns JSON with status field when database missing", async () => {
      const { app } = await import("../../src/dashboard/server.js");
      const res = await app.request("/api/status");
      const body = await res.json();
      expect(body.status).toBe("ok");
      // Without a real DB, isBootstrapped should be false
      expect(body.data.isBootstrapped).toBe(false);
    });
  });

  describe("GET /api/graph", () => {
    it("returns 404 with NOT_BOOTSTRAPPED when no database", async () => {
      const { app } = await import("../../src/dashboard/server.js");
      const res = await app.request("/api/graph");
      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.code).toBe("NOT_BOOTSTRAPPED");
    });
  });

  describe("GET /api/conventions", () => {
    it("returns 404 with NO_CONVENTIONS when no index file", async () => {
      const { app } = await import("../../src/dashboard/server.js");
      const res = await app.request("/api/conventions");
      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.code).toBe("NO_CONVENTIONS");
    });
  });

  describe("GET /api/readiness", () => {
    it("returns 404 when no database exists", async () => {
      const { app } = await import("../../src/dashboard/server.js");
      const res = await app.request("/api/readiness");
      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.code).toBe("NOT_BOOTSTRAPPED");
    });
  });

  describe("GET /api/blast-radius/:file", () => {
    it("returns 404 when no database exists", async () => {
      const { app } = await import("../../src/dashboard/server.js");
      const res = await app.request(
        `/api/blast-radius/${encodeURIComponent("src/test.ts")}`,
      );
      expect(res.status).toBe(404);
    });
  });

  describe("POST /api/review", () => {
    it("reviewRouter is importable and a Hono router", () => {
      expect(typeof reviewRouter.fetch).toBe("function");
    });
  });

  describe("POST /api/impact", () => {
    it("impactRouter is importable and a Hono router", () => {
      expect(typeof impactRouter.fetch).toBe("function");
    });
  });
});
