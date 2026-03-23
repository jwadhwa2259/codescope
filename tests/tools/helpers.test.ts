import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as os from "node:os";
import * as path from "node:path";
import * as fs from "node:fs";
import {
  okResponse,
  errorResponse,
  partialResponse,
  computeStaleness,
  isBootstrapped,
  getBootstrapMeta,
  buildMetadata,
  type Staleness,
  type ToolMetadata,
} from "../../src/tools/helpers.js";
import {
  readBootstrapMeta,
  writeBootstrapMeta,
  type BootstrapMeta,
} from "../../src/bootstrap/meta.js";

describe("Bootstrap Meta (src/bootstrap/meta.ts)", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "codescope-meta-test-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("Test 6: writeBootstrapMeta writes JSON to .claude/codescope/bootstrap-meta.json", () => {
    const codescopePath = path.join(tmpDir, ".claude", "codescope");
    fs.mkdirSync(codescopePath, { recursive: true });

    const meta: BootstrapMeta = {
      last_bootstrap: "2026-03-23T10:00:00Z",
      duration_ms: 120000,
      mode: "full",
      version: "0.1.0",
    };

    writeBootstrapMeta(tmpDir, meta);

    const filePath = path.join(codescopePath, "bootstrap-meta.json");
    expect(fs.existsSync(filePath)).toBe(true);

    const content = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    expect(content.last_bootstrap).toBe("2026-03-23T10:00:00Z");
    expect(content.duration_ms).toBe(120000);
    expect(content.mode).toBe("full");
    expect(content.version).toBe("0.1.0");
  });

  it("Test 7: readBootstrapMeta returns null when file does not exist", () => {
    const result = readBootstrapMeta(tmpDir);
    expect(result).toBeNull();
  });

  it("Test 8: readBootstrapMeta returns parsed BootstrapMeta when file exists", () => {
    const codescopePath = path.join(tmpDir, ".claude", "codescope");
    fs.mkdirSync(codescopePath, { recursive: true });

    const meta: BootstrapMeta = {
      last_bootstrap: "2026-03-23T10:00:00Z",
      duration_ms: 60000,
      mode: "incremental",
      version: "0.1.0",
    };

    fs.writeFileSync(
      path.join(codescopePath, "bootstrap-meta.json"),
      JSON.stringify(meta),
    );

    const result = readBootstrapMeta(tmpDir);
    expect(result).not.toBeNull();
    expect(result!.last_bootstrap).toBe("2026-03-23T10:00:00Z");
    expect(result!.duration_ms).toBe(60000);
    expect(result!.mode).toBe("incremental");
  });
});

describe("Response Helpers (src/tools/helpers.ts)", () => {
  it("Test 9: okResponse wraps data in { status: 'ok', data, metadata } with text content type", () => {
    const metadata: ToolMetadata = {
      last_bootstrap: "2026-03-23T10:00:00Z",
      staleness: "fresh",
      query_ms: 42,
    };

    const result = okResponse({ key: "value" }, metadata);

    expect(result.content).toHaveLength(1);
    expect(result.content[0].type).toBe("text");

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.status).toBe("ok");
    expect(parsed.data).toEqual({ key: "value" });
    expect(parsed.metadata.staleness).toBe("fresh");
    expect(parsed.metadata.query_ms).toBe(42);
  });

  it("Test 10: errorResponse wraps code/message/recovery in { status: 'error', error: {...} }", () => {
    const result = errorResponse(
      "NOT_BOOTSTRAPPED",
      "No bootstrap data found.",
      "Run /codescope:bootstrap to analyze your codebase.",
    );

    expect(result.content).toHaveLength(1);
    expect(result.content[0].type).toBe("text");

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.status).toBe("error");
    expect(parsed.error.code).toBe("NOT_BOOTSTRAPPED");
    expect(parsed.error.message).toBe("No bootstrap data found.");
    expect(parsed.error.recovery).toBe(
      "Run /codescope:bootstrap to analyze your codebase.",
    );
  });

  it("Test 11: partialResponse wraps data + warnings in { status: 'partial', data, warnings, metadata }", () => {
    const metadata: ToolMetadata = {
      last_bootstrap: "2026-03-23T10:00:00Z",
      staleness: "stale",
      query_ms: 15,
    };

    const result = partialResponse(
      { results: [1, 2, 3] },
      ["Some data was skipped"],
      metadata,
    );

    expect(result.content).toHaveLength(1);

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.status).toBe("partial");
    expect(parsed.data).toEqual({ results: [1, 2, 3] });
    expect(parsed.warnings).toEqual(["Some data was skipped"]);
    expect(parsed.metadata.staleness).toBe("stale");
  });

  it('Test 12: computeStaleness returns "fresh" for timestamp <7 days ago', () => {
    const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
    expect(computeStaleness(twoDaysAgo)).toBe("fresh");
  });

  it('Test 13: computeStaleness returns "stale" for timestamp 7-30 days ago', () => {
    const fifteenDaysAgo = new Date(Date.now() - 15 * 24 * 60 * 60 * 1000);
    expect(computeStaleness(fifteenDaysAgo)).toBe("stale");
  });

  it('Test 14: computeStaleness returns "very_stale" for timestamp >30 days ago', () => {
    const sixtyDaysAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);
    expect(computeStaleness(sixtyDaysAgo)).toBe("very_stale");
  });

  it('Test 15: computeStaleness returns "very_stale" for null timestamp', () => {
    expect(computeStaleness(null)).toBe("very_stale");
  });

  it("Test 16: isBootstrapped returns true when graph.db exists, false otherwise", () => {
    const tmpDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "codescope-helpers-test-"),
    );

    try {
      // No graph.db -> false
      expect(isBootstrapped(tmpDir)).toBe(false);

      // Create graph.db -> true
      const codescopePath = path.join(tmpDir, ".claude", "codescope");
      fs.mkdirSync(codescopePath, { recursive: true });
      fs.writeFileSync(path.join(codescopePath, "graph.db"), "");
      expect(isBootstrapped(tmpDir)).toBe(true);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});

describe("buildMetadata", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "codescope-buildmeta-test-"),
    );
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("constructs metadata with staleness, query_ms, and optional capabilities", () => {
    const startMs = Date.now() - 50;
    const metadata = buildMetadata(tmpDir, startMs, {
      capabilities: ["convention_compliance"],
      upcoming: ["blast_radius_diff"],
    });

    expect(metadata.staleness).toBe("very_stale"); // no bootstrap-meta.json
    expect(metadata.last_bootstrap).toBeNull();
    expect(metadata.query_ms).toBeGreaterThanOrEqual(0);
    expect(metadata.capabilities).toEqual(["convention_compliance"]);
    expect(metadata.upcoming).toEqual(["blast_radius_diff"]);
  });
});
