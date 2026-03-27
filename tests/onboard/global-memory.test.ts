import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import * as crypto from "node:crypto";

import {
  readGlobalMemory,
  writeGlobalMemory,
  addGlobalEnrichment,
  type GlobalPreferences,
  type GlobalMemory,
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

  it("returns GlobalMemory with preferences AND new sections", () => {
    const memPath = path.join(tmpDir, "global-memory.md");
    const content = `# CodeScope Global Memory

## Preferences

- orient_verbosity: detailed
- clarification: minimal
- eval_mode: auto-debug
- convention_strictness: warn

## Tech Stack Tendencies

- TypeScript
- React
- PostgreSQL

## Ignore Patterns

- convention_adherence:prefer-const
- scope_compliance:test-utils

## Cross-Project Gotchas

- web-tree-sitter 0.26.x breaks ABI

*Last updated: 2026-03-20*
`;
    fs.writeFileSync(memPath, content);

    const result = readGlobalMemory(memPath);
    expect(result).not.toBeNull();
    expect(result!.preferences.orientVerbosity).toBe("detailed");
    expect(result!.preferences.clarification).toBe("minimal");
    expect(result!.preferences.evalMode).toBe("auto-debug");
    expect(result!.preferences.conventionStrictness).toBe("warn");
    expect(result!.techStack).toEqual(["TypeScript", "React", "PostgreSQL"]);
    expect(result!.ignorePatterns).toEqual(["convention_adherence:prefer-const", "scope_compliance:test-utils"]);
    expect(result!.crossProjectGotchas).toEqual(["web-tree-sitter 0.26.x breaks ABI"]);
  });

  it("returns preferences with empty new sections for old-format file (backward compat)", () => {
    const memPath = path.join(tmpDir, "global-memory.md");
    const content = `# CodeScope Global Memory

## Preferences

- orient_verbosity: detailed
- clarification: minimal

*Last updated: 2026-03-20*
`;
    fs.writeFileSync(memPath, content);

    const result = readGlobalMemory(memPath);
    expect(result).not.toBeNull();
    expect(result!.preferences.orientVerbosity).toBe("detailed");
    expect(result!.preferences.clarification).toBe("minimal");
    expect(result!.techStack).toEqual([]);
    expect(result!.ignorePatterns).toEqual([]);
    expect(result!.crossProjectGotchas).toEqual([]);
  });

  it("parses bullet items from each new section", () => {
    const memPath = path.join(tmpDir, "global-memory.md");
    const content = `# CodeScope Global Memory

## Preferences

- orient_verbosity: brief

## Tech Stack Tendencies

- Python
- Django

## Ignore Patterns

(None yet.)

## Cross-Project Gotchas

- Always check ABI versions
- Node 24 has sqlite issues

*Last updated: 2026-03-20*
`;
    fs.writeFileSync(memPath, content);

    const result = readGlobalMemory(memPath);
    expect(result).not.toBeNull();
    expect(result!.techStack).toEqual(["Python", "Django"]);
    expect(result!.ignorePatterns).toEqual([]);
    expect(result!.crossProjectGotchas).toEqual(["Always check ABI versions", "Node 24 has sqlite issues"]);
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

  it("round-trips GlobalMemory through write then read", () => {
    const memPath = path.join(tmpDir, "global-memory.md");
    const memory: GlobalMemory = {
      preferences: {
        orientVerbosity: "brief",
        clarification: "thorough",
        evalMode: "interactive",
        conventionStrictness: "suggest-only",
      },
      techStack: ["TypeScript", "React"],
      ignorePatterns: ["convention_adherence:prefer-const"],
      crossProjectGotchas: ["web-tree-sitter 0.26.x breaks ABI"],
    };

    writeGlobalMemory(memory, memPath);

    const result = readGlobalMemory(memPath);
    expect(result).not.toBeNull();
    expect(result!.preferences.orientVerbosity).toBe("brief");
    expect(result!.preferences.clarification).toBe("thorough");
    expect(result!.preferences.evalMode).toBe("interactive");
    expect(result!.preferences.conventionStrictness).toBe("suggest-only");
    expect(result!.techStack).toEqual(["TypeScript", "React"]);
    expect(result!.ignorePatterns).toEqual(["convention_adherence:prefer-const"]);
    expect(result!.crossProjectGotchas).toEqual(["web-tree-sitter 0.26.x breaks ABI"]);
  });

  it("writes ## Tech Stack Tendencies section", () => {
    const memPath = path.join(tmpDir, "global-memory.md");
    writeGlobalMemory({
      preferences: { orientVerbosity: "brief" },
      techStack: ["Go"],
      ignorePatterns: [],
      crossProjectGotchas: [],
    }, memPath);

    const content = fs.readFileSync(memPath, "utf-8");
    expect(content).toContain("## Tech Stack Tendencies");
    expect(content).toContain("- Go");
  });

  it("writes ## Ignore Patterns section", () => {
    const memPath = path.join(tmpDir, "global-memory.md");
    writeGlobalMemory({
      preferences: {},
      techStack: [],
      ignorePatterns: ["scope:test-utils"],
      crossProjectGotchas: [],
    }, memPath);

    const content = fs.readFileSync(memPath, "utf-8");
    expect(content).toContain("## Ignore Patterns");
    expect(content).toContain("- scope:test-utils");
  });

  it("writes ## Cross-Project Gotchas section", () => {
    const memPath = path.join(tmpDir, "global-memory.md");
    writeGlobalMemory({
      preferences: {},
      techStack: [],
      ignorePatterns: [],
      crossProjectGotchas: ["ABI mismatch"],
    }, memPath);

    const content = fs.readFileSync(memPath, "utf-8");
    expect(content).toContain("## Cross-Project Gotchas");
    expect(content).toContain("- ABI mismatch");
  });

  it("preserves existing preferences when adding new sections", () => {
    const memPath = path.join(tmpDir, "global-memory.md");
    // Write with preferences and empty sections
    writeGlobalMemory({
      preferences: {
        orientVerbosity: "detailed",
        evalMode: "auto-debug",
      },
      techStack: [],
      ignorePatterns: [],
      crossProjectGotchas: [],
    }, memPath);

    // Read back and verify preferences are intact
    const result = readGlobalMemory(memPath);
    expect(result).not.toBeNull();
    expect(result!.preferences.orientVerbosity).toBe("detailed");
    expect(result!.preferences.evalMode).toBe("auto-debug");
  });

  it("writes (None yet.) placeholder for empty sections", () => {
    const memPath = path.join(tmpDir, "global-memory.md");
    writeGlobalMemory({
      preferences: { orientVerbosity: "brief" },
      techStack: [],
      ignorePatterns: [],
      crossProjectGotchas: [],
    }, memPath);

    const content = fs.readFileSync(memPath, "utf-8");
    expect(content).toContain("## Tech Stack Tendencies");
    expect(content).toContain("## Ignore Patterns");
    expect(content).toContain("## Cross-Project Gotchas");
    // All sections should have placeholder text
    expect(content).toContain("(None yet.)");
  });

  it("creates valid markdown file", () => {
    const memPath = path.join(tmpDir, "global-memory.md");
    writeGlobalMemory({
      preferences: { orientVerbosity: "detailed" },
      techStack: [],
      ignorePatterns: [],
      crossProjectGotchas: [],
    }, memPath);

    const content = fs.readFileSync(memPath, "utf-8");
    expect(content).toContain("# CodeScope Global Memory");
    expect(content).toContain("## Preferences");
    expect(content).toContain("- orient_verbosity: detailed");
  });
});

describe("addGlobalEnrichment", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTmpDir();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("adds enrichment entries to appropriate sections", () => {
    const memPath = path.join(tmpDir, "global-memory.md");
    // First write an initial file
    writeGlobalMemory({
      preferences: { orientVerbosity: "brief" },
      techStack: ["TypeScript"],
      ignorePatterns: [],
      crossProjectGotchas: [],
    }, memPath);

    addGlobalEnrichment([
      {
        type: "ignore_pattern",
        value: "convention_adherence:prefer-const",
        source: "auto-detected from 3 pipeline runs",
        recordedDate: "2026-03-27",
      },
      {
        type: "cross_project_gotcha",
        value: "web-tree-sitter 0.26.x breaks ABI",
        source: "project-alpha",
        recordedDate: "2026-03-27",
      },
      {
        type: "tech_stack",
        value: "React",
        source: "project-alpha",
        recordedDate: "2026-03-27",
      },
    ], memPath);

    const result = readGlobalMemory(memPath);
    expect(result).not.toBeNull();
    expect(result!.techStack).toContain("TypeScript");
    expect(result!.techStack).toContain("React");
    expect(result!.ignorePatterns).toContain("convention_adherence:prefer-const");
    expect(result!.crossProjectGotchas).toContain("web-tree-sitter 0.26.x breaks ABI");
  });

  it("deduplicates existing entries", () => {
    const memPath = path.join(tmpDir, "global-memory.md");
    writeGlobalMemory({
      preferences: {},
      techStack: ["TypeScript"],
      ignorePatterns: ["convention_adherence:prefer-const"],
      crossProjectGotchas: [],
    }, memPath);

    addGlobalEnrichment([
      {
        type: "tech_stack",
        value: "TypeScript",
        source: "project-beta",
        recordedDate: "2026-03-27",
      },
      {
        type: "ignore_pattern",
        value: "convention_adherence:prefer-const",
        source: "project-beta",
        recordedDate: "2026-03-27",
      },
    ], memPath);

    const result = readGlobalMemory(memPath);
    expect(result).not.toBeNull();
    // Should NOT have duplicates
    expect(result!.techStack.filter(v => v === "TypeScript")).toHaveLength(1);
    expect(result!.ignorePatterns.filter(v => v === "convention_adherence:prefer-const")).toHaveLength(1);
  });

  it("creates file if it does not exist", () => {
    const memPath = path.join(tmpDir, "new-memory.md");
    expect(fs.existsSync(memPath)).toBe(false);

    addGlobalEnrichment([
      {
        type: "tech_stack",
        value: "Python",
        source: "new-project",
        recordedDate: "2026-03-27",
      },
    ], memPath);

    expect(fs.existsSync(memPath)).toBe(true);
    const result = readGlobalMemory(memPath);
    expect(result).not.toBeNull();
    expect(result!.techStack).toContain("Python");
  });
});
