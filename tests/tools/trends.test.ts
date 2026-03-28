import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as os from "node:os";
import * as path from "node:path";
import * as fs from "node:fs";
import * as crypto from "node:crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { openDatabase, closeDatabase } from "../../src/graph/database.js";
import {
  handleTrends,
  registerTrendsTool,
  trendDirection,
} from "../../src/tools/trends-tool.js";

function tmpDbPath(): string {
  return path.join(os.tmpdir(), `codescope-trends-test-${crypto.randomUUID()}.db`);
}

/** Insert a readiness_history row with known values */
function insertSnapshot(
  db: ReturnType<typeof openDatabase>,
  timestamp: string,
  overallGrade: string,
  overallPercent: number,
  cc: number,
  ts: number,
  tcp: number,
  igh: number,
): void {
  db.prepare(
    `INSERT INTO readiness_history
      (timestamp, overall_grade, overall_percent, convention_coverage, type_safety, test_coverage_proxy, import_graph_health)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(timestamp, overallGrade, overallPercent, cc, ts, tcp, igh);
}

describe("trendDirection", () => {
  it("returns 'improving' when current > previous by more than 1", () => {
    expect(trendDirection(85, 80)).toBe("improving");
    expect(trendDirection(100, 50)).toBe("improving");
  });

  it("returns 'declining' when current < previous by more than 1", () => {
    expect(trendDirection(80, 85)).toBe("declining");
    expect(trendDirection(50, 100)).toBe("declining");
  });

  it("returns 'stable' when delta is within 1 point", () => {
    expect(trendDirection(80, 80)).toBe("stable");
    expect(trendDirection(81, 80)).toBe("stable");
    expect(trendDirection(79, 80)).toBe("stable");
  });
});

describe("handleTrends", () => {
  let tmpDir: string;
  let codescopePath: string;
  let dbPath: string;
  let db: ReturnType<typeof openDatabase>;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "codescope-trends-test-"));
    codescopePath = path.join(tmpDir, ".claude", "codescope");
    fs.mkdirSync(codescopePath, { recursive: true });
    dbPath = path.join(codescopePath, "graph.db");
    db = openDatabase(dbPath);
    // Write bootstrap meta so isBootstrapped and buildMetadata work
    fs.writeFileSync(
      path.join(codescopePath, "bootstrap-meta.json"),
      JSON.stringify({
        last_bootstrap: new Date().toISOString(),
        duration_ms: 5000,
        mode: "full",
        version: "0.1.0",
      }),
    );
  });

  afterEach(() => {
    try {
      if (db) closeDatabase(db);
    } catch {
      // already closed
    }
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("returns current snapshot and previous comparison with deltas and trend direction", async () => {
    insertSnapshot(db, "2026-03-20T00:00:00.000Z", "B", 83, 80, 75, 85, 92);
    insertSnapshot(db, "2026-03-25T00:00:00.000Z", "B+", 87, 92, 85, 78, 93);

    const result = await handleTrends(tmpDir);
    const parsed = JSON.parse(result.content[0].text);

    expect(parsed.status).toBe("ok");
    expect(parsed.data.current).toBeDefined();
    expect(parsed.data.current.overall_grade).toBe("B+");
    expect(parsed.data.current.overall_percent).toBe(87);
    expect(parsed.data.comparisons).toHaveLength(3);

    // vs_previous comparison
    const vsPrev = parsed.data.comparisons.find(
      (c: any) => c.label === "vs_previous",
    );
    expect(vsPrev).toBeDefined();
    expect(vsPrev.deltas).toBeDefined();
    expect(vsPrev.deltas.overall_percent).toBe(87 - 83);
    expect(vsPrev.trend).toBe("improving");
  });

  it("returns week-ago comparison with correct deltas when snapshots span 7+ days", async () => {
    // Insert a snapshot more than 7 days before "now"
    const now = new Date();
    const eightDaysAgo = new Date(now.getTime() - 8 * 24 * 60 * 60 * 1000);
    const current = new Date(now.getTime() - 1000); // just before now

    insertSnapshot(db, eightDaysAgo.toISOString(), "C+", 77, 70, 65, 85, 88);
    insertSnapshot(db, current.toISOString(), "B+", 87, 92, 85, 78, 93);

    const result = await handleTrends(tmpDir);
    const parsed = JSON.parse(result.content[0].text);

    const vsWeek = parsed.data.comparisons.find(
      (c: any) => c.label === "vs_7_days_ago",
    );
    expect(vsWeek).toBeDefined();
    expect(vsWeek.snapshot).not.toBeNull();
    expect(vsWeek.deltas).not.toBeNull();
    expect(vsWeek.deltas.overall_percent).toBe(87 - 77);
    expect(vsWeek.trend).toBe("improving");
  });

  it("returns month-ago comparison with correct deltas when snapshots span 30+ days", async () => {
    const now = new Date();
    const thirtyFiveDaysAgo = new Date(now.getTime() - 35 * 24 * 60 * 60 * 1000);
    const current = new Date(now.getTime() - 1000);

    insertSnapshot(db, thirtyFiveDaysAgo.toISOString(), "D+", 67, 60, 55, 75, 78);
    insertSnapshot(db, current.toISOString(), "A-", 91, 95, 90, 82, 97);

    const result = await handleTrends(tmpDir);
    const parsed = JSON.parse(result.content[0].text);

    const vsMonth = parsed.data.comparisons.find(
      (c: any) => c.label === "vs_30_days_ago",
    );
    expect(vsMonth).toBeDefined();
    expect(vsMonth.snapshot).not.toBeNull();
    expect(vsMonth.deltas).not.toBeNull();
    expect(vsMonth.deltas.overall_percent).toBe(91 - 67);
    expect(vsMonth.trend).toBe("improving");
  });

  it("returns current data and null comparisons with single snapshot", async () => {
    insertSnapshot(db, "2026-03-25T00:00:00.000Z", "B+", 87, 92, 85, 78, 93);

    const result = await handleTrends(tmpDir);
    const parsed = JSON.parse(result.content[0].text);

    expect(parsed.status).toBe("ok");
    expect(parsed.data.current.overall_grade).toBe("B+");

    // All comparisons should have null deltas/trend
    for (const comparison of parsed.data.comparisons) {
      expect(comparison.deltas).toBeNull();
      expect(comparison.trend).toBeNull();
    }
  });

  it("returns NO_HISTORY error when no snapshots exist", async () => {
    // Database exists but no rows in readiness_history
    const result = await handleTrends(tmpDir);
    const parsed = JSON.parse(result.content[0].text);

    expect(parsed.status).toBe("error");
    expect(parsed.error.code).toBe("NO_HISTORY");
  });

  it("returns NOT_BOOTSTRAPPED error when not bootstrapped", async () => {
    const emptyDir = fs.mkdtempSync(path.join(os.tmpdir(), "codescope-noboot-"));

    try {
      const result = await handleTrends(emptyDir);
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed.status).toBe("error");
      expect(parsed.error.code).toBe("NOT_BOOTSTRAPPED");
    } finally {
      fs.rmSync(emptyDir, { recursive: true, force: true });
    }
  });
});

describe("registerTrendsTool", () => {
  it("registers a tool named codescope_trends on the server", () => {
    const server = new McpServer({ name: "codescope", version: "0.1.0" });
    const toolSpy = vi.spyOn(server, "tool");

    registerTrendsTool(server, process.cwd());

    const registeredNames = toolSpy.mock.calls.map((call) => call[0] as string);
    expect(registeredNames).toContain("codescope_trends");

    toolSpy.mockRestore();
  });
});
