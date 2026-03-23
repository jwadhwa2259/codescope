import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import * as crypto from "node:crypto";

import {
  readGlobalMemory,
  writeGlobalMemory,
  type GlobalPreferences,
} from "../../src/onboard/global-memory.js";

function makeTmpDir(): string {
  const dir = path.join(os.tmpdir(), `codescope-gmem-test-${crypto.randomUUID()}`);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

describe("readGlobalMemory", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTmpDir();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("returns null when file doesn't exist", () => {
    const result = readGlobalMemory(path.join(tmpDir, "nonexistent.md"));
    expect(result).toBeNull();
  });

  it("returns null for default template content", () => {
    const memPath = path.join(tmpDir, "global-memory.md");
    fs.writeFileSync(
      memPath,
      "# CodeScope Global Memory\n\nNo previous preferences found. Starting fresh.\n",
    );

    const result = readGlobalMemory(memPath);
    expect(result).toBeNull();
  });

  it("returns null for empty file", () => {
    const memPath = path.join(tmpDir, "global-memory.md");
    fs.writeFileSync(memPath, "");

    const result = readGlobalMemory(memPath);
    expect(result).toBeNull();
  });

  it("returns preferences from valid global memory", () => {
    const memPath = path.join(tmpDir, "global-memory.md");
    const content = `# CodeScope Global Memory

## Preferences

- orient_verbosity: detailed
- clarification: minimal
- eval_mode: auto-debug
- convention_strictness: warn

*Last updated: 2026-03-20*
`;
    fs.writeFileSync(memPath, content);

    const result = readGlobalMemory(memPath);
    expect(result).not.toBeNull();
    expect(result!.orientVerbosity).toBe("detailed");
    expect(result!.clarification).toBe("minimal");
    expect(result!.evalMode).toBe("auto-debug");
    expect(result!.conventionStrictness).toBe("warn");
  });
});

describe("writeGlobalMemory", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTmpDir();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("round-trips preferences through write then read", () => {
    const memPath = path.join(tmpDir, "global-memory.md");
    const prefs: GlobalPreferences = {
      orientVerbosity: "brief",
      clarification: "thorough",
      evalMode: "interactive",
      conventionStrictness: "suggest-only",
    };

    writeGlobalMemory(prefs, memPath);

    const result = readGlobalMemory(memPath);
    expect(result).not.toBeNull();
    expect(result!.orientVerbosity).toBe("brief");
    expect(result!.clarification).toBe("thorough");
    expect(result!.evalMode).toBe("interactive");
    expect(result!.conventionStrictness).toBe("suggest-only");
  });

  it("creates valid markdown file", () => {
    const memPath = path.join(tmpDir, "global-memory.md");
    writeGlobalMemory({ orientVerbosity: "detailed" }, memPath);

    const content = fs.readFileSync(memPath, "utf-8");
    expect(content).toContain("# CodeScope Global Memory");
    expect(content).toContain("## Preferences");
    expect(content).toContain("- orient_verbosity: detailed");
  });
});
