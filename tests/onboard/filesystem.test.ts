import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import * as crypto from "node:crypto";

import {
  CODESCOPE_ROOT,
  CODESCOPE_DIRS,
  getCodescopePath,
  getGlobalMemoryPath,
} from "../../src/utils/paths.js";

import {
  createDirectoryTree,
  createGlobalMemoryDir,
  writeGitignore,
} from "../../src/onboard/filesystem.js";

function makeTmpDir(): string {
  const dir = path.join(os.tmpdir(), `codescope-test-${crypto.randomUUID()}`);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

describe("Path constants", () => {
  it("CODESCOPE_ROOT equals .claude/codescope", () => {
    expect(CODESCOPE_ROOT).toBe(".claude/codescope");
  });

  it("CODESCOPE_DIRS contains all expected entries", () => {
    expect(CODESCOPE_DIRS).toContain("");
    expect(CODESCOPE_DIRS).toContain("services");
    expect(CODESCOPE_DIRS).toContain("orient");
    expect(CODESCOPE_DIRS).toContain("plans");
    expect(CODESCOPE_DIRS).toContain("execution");
    expect(CODESCOPE_DIRS).toContain("reports");
    expect(CODESCOPE_DIRS).toContain("reports/screenshots");
  });

  it("getCodescopePath joins correctly", () => {
    expect(getCodescopePath("/foo")).toBe("/foo/.claude/codescope");
  });

  it("getGlobalMemoryPath returns correct path", () => {
    expect(getGlobalMemoryPath()).toBe(
      path.join(os.homedir(), ".codescope", "global-memory.md")
    );
  });
});

describe("createDirectoryTree", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTmpDir();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("creates all codescope directories", () => {
    createDirectoryTree(tmpDir);

    const base = path.join(tmpDir, ".claude", "codescope");
    expect(fs.existsSync(base)).toBe(true);
    expect(fs.existsSync(path.join(base, "services"))).toBe(true);
    expect(fs.existsSync(path.join(base, "orient"))).toBe(true);
    expect(fs.existsSync(path.join(base, "plans"))).toBe(true);
    expect(fs.existsSync(path.join(base, "execution"))).toBe(true);
    expect(fs.existsSync(path.join(base, "reports"))).toBe(true);
    expect(fs.existsSync(path.join(base, "reports", "screenshots"))).toBe(true);
  });

  it("writes .gitignore with correct rules", () => {
    createDirectoryTree(tmpDir);

    const gitignorePath = path.join(
      tmpDir,
      ".claude",
      "codescope",
      ".gitignore"
    );
    expect(fs.existsSync(gitignorePath)).toBe(true);

    const content = fs.readFileSync(gitignorePath, "utf-8");
    expect(content).toContain("graph.db");
    expect(content).toContain("execution/");
    expect(content).toContain("reports/screenshots/");
    // Verify config.yml and conventions-enforced.md are NOT gitignored
    // (they may appear in comments as tracked items, but not as ignore rules)
    const ignoreRules = content
      .split("\n")
      .filter((line) => line.trim() && !line.startsWith("#"));
    expect(ignoreRules).not.toContain("config.yml");
    expect(ignoreRules).not.toContain("conventions-enforced.md");
  });
});

describe("writeGitignore", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTmpDir();
    // Create the codescope directory so writeGitignore has a target
    fs.mkdirSync(path.join(tmpDir, ".claude", "codescope"), {
      recursive: true,
    });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("writes .gitignore at the codescope root", () => {
    writeGitignore(tmpDir);
    const gitignorePath = path.join(
      tmpDir,
      ".claude",
      "codescope",
      ".gitignore"
    );
    expect(fs.existsSync(gitignorePath)).toBe(true);
  });
});

describe("createGlobalMemoryDir", () => {
  let tmpGlobalDir: string;

  beforeEach(() => {
    tmpGlobalDir = path.join(
      os.tmpdir(),
      `codescope-global-test-${crypto.randomUUID()}`
    );
  });

  afterEach(() => {
    fs.rmSync(tmpGlobalDir, { recursive: true, force: true });
  });

  it("creates global memory directory and file", () => {
    createGlobalMemoryDir(tmpGlobalDir);

    expect(fs.existsSync(tmpGlobalDir)).toBe(true);
    const memoryPath = path.join(tmpGlobalDir, "global-memory.md");
    expect(fs.existsSync(memoryPath)).toBe(true);

    const content = fs.readFileSync(memoryPath, "utf-8");
    expect(content).toContain("CodeScope Global Memory");
  });

  it("is idempotent - calling twice does not overwrite existing content", () => {
    createGlobalMemoryDir(tmpGlobalDir);

    // Write custom content
    const memoryPath = path.join(tmpGlobalDir, "global-memory.md");
    const customContent = "# Custom Memory\n\nUser preferences here.\n";
    fs.writeFileSync(memoryPath, customContent, "utf-8");

    // Call again
    createGlobalMemoryDir(tmpGlobalDir);

    // Content should be unchanged
    const afterContent = fs.readFileSync(memoryPath, "utf-8");
    expect(afterContent).toBe(customContent);
  });
});
