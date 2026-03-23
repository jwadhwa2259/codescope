import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as child_process from "node:child_process";
import {
  analyzeChanges,
  type IncrementalAnalysis,
} from "../../src/bootstrap/incremental.js";

// Mock execSync to avoid actual git calls in tests
vi.mock("node:child_process", () => ({
  execSync: vi.fn(),
}));

const mockedExecSync = vi.mocked(child_process.execSync);

describe("incremental", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns mode: full on first bootstrap (no previous timestamp)", () => {
    const result = analyzeChanges("/project", null, 100);
    expect(result.mode).toBe("full");
    expect(result.reason).toContain("First bootstrap");
    // Should not call git at all
    expect(mockedExecSync).not.toHaveBeenCalled();
  });

  it("returns mode: incremental when <50% files changed", () => {
    // 10 files changed out of 100 = 10%
    mockedExecSync.mockReturnValue(
      "src/a.ts\nsrc/b.ts\nsrc/c.ts\nsrc/d.ts\nsrc/e.ts\nsrc/f.ts\nsrc/g.ts\nsrc/h.ts\nsrc/i.ts\nsrc/j.ts" as unknown as Buffer,
    );

    const result = analyzeChanges(
      "/project",
      "2026-01-01T00:00:00Z",
      100,
    );
    expect(result.mode).toBe("incremental");
    expect(result.changedFiles).toHaveLength(10);
    expect(result.changedPercentage).toBe(10);
  });

  it("returns mode: full when >=50% files changed", () => {
    // Generate 60 file paths for 60% change
    const files = Array.from({ length: 60 }, (_, i) => `src/file${i}.ts`).join(
      "\n",
    );
    mockedExecSync.mockReturnValue(files as unknown as Buffer);

    const result = analyzeChanges(
      "/project",
      "2026-01-01T00:00:00Z",
      100,
    );
    expect(result.mode).toBe("full");
    expect(result.changedPercentage).toBe(60);
    expect(result.reason).toContain("50%");
  });

  it("returns mode: full when git diff fails", () => {
    mockedExecSync.mockImplementation(() => {
      throw new Error("git diff failed");
    });

    const result = analyzeChanges(
      "/project",
      "2026-01-01T00:00:00Z",
      100,
    );
    expect(result.mode).toBe("full");
    expect(result.reason).toContain("Git diff failed");
  });

  it("lists affectedServices based on changed file paths", () => {
    mockedExecSync.mockReturnValue(
      "services/api/src/handler.ts\nservices/web/src/page.ts\nservices/api/src/util.ts" as unknown as Buffer,
    );

    const result = analyzeChanges(
      "/project",
      "2026-01-01T00:00:00Z",
      100,
      [
        { name: "api", path: "services/api" },
        { name: "web", path: "services/web" },
        { name: "shared", path: "services/shared" },
      ],
    );

    expect(result.mode).toBe("incremental");
    expect(result.affectedServices).toContain("api");
    expect(result.affectedServices).toContain("web");
    expect(result.affectedServices).not.toContain("shared");
  });

  it("calculates changedPercentage correctly", () => {
    // 25 files changed out of 200 = 12.5% -> rounds to 13%
    const files = Array.from({ length: 25 }, (_, i) => `src/file${i}.ts`).join(
      "\n",
    );
    mockedExecSync.mockReturnValue(files as unknown as Buffer);

    const result = analyzeChanges(
      "/project",
      "2026-01-01T00:00:00Z",
      200,
    );
    expect(result.changedPercentage).toBe(13); // Math.round(12.5) = 13
    expect(result.changedFiles).toHaveLength(25);
  });
});
