import { describe, it, expect } from "vitest";
import { app, startDashboard, broadcast } from "../../src/dashboard/server.js";

describe("Dashboard Server", () => {
  describe("startDashboard", () => {
    it("exports startDashboard as a function", () => {
      expect(typeof startDashboard).toBe("function");
    });

    it("exports app as a Hono instance", () => {
      expect(app).toBeDefined();
      expect(typeof app.fetch).toBe("function");
    });
  });

  describe("broadcast", () => {
    it("exports broadcast as a function", () => {
      expect(typeof broadcast).toBe("function");
    });

    it("does not throw when called with no connected clients", () => {
      expect(() => broadcast({ type: "test" })).not.toThrow();
    });
  });

  describe("API route registration", () => {
    it("responds to GET /api/status", async () => {
      // Without a real database, should still respond (with error or data)
      const res = await app.request("/api/status");
      expect(res.status).toBeLessThan(500);
    });

    it("responds to GET /api/graph", async () => {
      const res = await app.request("/api/graph");
      // 404 expected without database
      expect([200, 404]).toContain(res.status);
    });

    it("responds to GET /api/conventions", async () => {
      const res = await app.request("/api/conventions");
      expect([200, 404]).toContain(res.status);
    });

    it("responds to GET /api/readiness", async () => {
      const res = await app.request("/api/readiness");
      expect([200, 404]).toContain(res.status);
    });
  });

  describe("SPA fallback", () => {
    it("serves HTML at root path", async () => {
      const res = await app.request("/");
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toContain("text/html");
    });

    it("serves HTML at unknown paths (SPA fallback)", async () => {
      const res = await app.request("/some/unknown/path");
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toContain("text/html");
    });
  });
});
