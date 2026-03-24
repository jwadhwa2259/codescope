import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import {
  initCoordinationFile,
  appendCoordinationEntry,
  readCoordinationEntries,
} from "../../src/execution/coordination.js";
import type { CoordinationEntry } from "../../src/execution/types.js";

describe("initCoordinationFile", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "coord-test-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("creates coordination.md with correct header", () => {
    const coordPath = initCoordinationFile(tmpDir, "add-auth", "sequential");

    expect(fs.existsSync(coordPath)).toBe(true);
    const content = fs.readFileSync(coordPath, "utf-8");
    expect(content).toContain("# Coordination Log: add-auth");
    expect(content).toContain("**Started:**");
    expect(content).toContain("**Mode:** sequential");
    expect(content).toContain("## Log");
    expect(content).toContain(
      "| Timestamp | Agent | Signal | Files | Detail |",
    );
    expect(content).toContain("|-----------|-------|--------|-------|--------|");
  });

  it("returns the coordination file path", () => {
    const coordPath = initCoordinationFile(tmpDir, "refactor-api", "parallel");
    expect(coordPath).toBe(path.join(tmpDir, "coordination.md"));
  });
});

describe("appendCoordinationEntry", () => {
  let tmpDir: string;
  let coordPath: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "coord-test-"));
    coordPath = initCoordinationFile(tmpDir, "test-task", "wave-based");
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("appends a properly formatted markdown table row", () => {
    const entry: CoordinationEntry = {
      timestamp: "2026-03-23T10:00:00Z",
      agent: "agent-a",
      signal: "started",
      files: [],
      detail: "Wave 1",
    };

    appendCoordinationEntry(coordPath, entry);

    const content = fs.readFileSync(coordPath, "utf-8");
    expect(content).toContain(
      "| 2026-03-23T10:00:00Z | agent-a | `started` |  | Wave 1 |",
    );
  });

  it("formats files as backtick-wrapped comma-separated list", () => {
    const entry: CoordinationEntry = {
      timestamp: "2026-03-23T10:01:00Z",
      agent: "agent-b",
      signal: "done",
      files: ["src/api.ts", "src/types.ts"],
      detail: "+50/-10 lines",
    };

    appendCoordinationEntry(coordPath, entry);

    const content = fs.readFileSync(coordPath, "utf-8");
    expect(content).toContain("`src/api.ts`, `src/types.ts`");
  });

  it("includes category in detail field for discovery signal", () => {
    const entry: CoordinationEntry = {
      timestamp: "2026-03-23T10:02:00Z",
      agent: "agent-a",
      signal: "discovery",
      files: ["src/util.ts"],
      detail: "new_utility: Found shared helper",
    };

    appendCoordinationEntry(coordPath, entry);

    const content = fs.readFileSync(coordPath, "utf-8");
    expect(content).toContain("new_utility: Found shared helper");
  });
});

describe("readCoordinationEntries", () => {
  let tmpDir: string;
  let coordPath: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "coord-test-"));
    coordPath = initCoordinationFile(tmpDir, "test-task", "sequential");
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("parses markdown table rows back into CoordinationEntry[] objects", () => {
    const entries: CoordinationEntry[] = [
      {
        timestamp: "2026-03-23T10:00:00Z",
        agent: "agent-a",
        signal: "started",
        files: [],
        detail: "Wave 1",
      },
      {
        timestamp: "2026-03-23T10:01:00Z",
        agent: "agent-b",
        signal: "done",
        files: ["src/api.ts", "src/types.ts"],
        detail: "+50/-10 lines",
      },
    ];

    for (const entry of entries) {
      appendCoordinationEntry(coordPath, entry);
    }

    const parsed = readCoordinationEntries(coordPath);
    expect(parsed).toHaveLength(2);

    expect(parsed[0].timestamp).toBe("2026-03-23T10:00:00Z");
    expect(parsed[0].agent).toBe("agent-a");
    expect(parsed[0].signal).toBe("started");
    expect(parsed[0].files).toEqual([]);
    expect(parsed[0].detail).toBe("Wave 1");

    expect(parsed[1].timestamp).toBe("2026-03-23T10:01:00Z");
    expect(parsed[1].agent).toBe("agent-b");
    expect(parsed[1].signal).toBe("done");
    expect(parsed[1].files).toEqual(["src/api.ts", "src/types.ts"]);
    expect(parsed[1].detail).toBe("+50/-10 lines");
  });

  it("handles empty coordination file (header only) returning empty array", () => {
    const parsed = readCoordinationEntries(coordPath);
    expect(parsed).toEqual([]);
  });

  it("handles discovery entries with category in detail", () => {
    const entry: CoordinationEntry = {
      timestamp: "2026-03-23T10:02:00Z",
      agent: "agent-a",
      signal: "discovery",
      files: ["src/util.ts"],
      detail: "pattern: Singleton used in services",
    };
    appendCoordinationEntry(coordPath, entry);

    const parsed = readCoordinationEntries(coordPath);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].signal).toBe("discovery");
    expect(parsed[0].detail).toBe("pattern: Singleton used in services");
    expect(parsed[0].files).toEqual(["src/util.ts"]);
  });
});
