// ---------------------------------------------------------------------------
// Handoff Parser Tests
// ---------------------------------------------------------------------------
// Tests handoff document parsing (roundtrip from generator output) and
// artifact validation on disk per D-17.
// ---------------------------------------------------------------------------

import { describe, it, expect, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

import {
  parseHandoff,
  findLatestHandoff,
  validateHandoffArtifacts,
} from "../../src/session/handoff-parser.js";

let tempDirs: string[] = [];

function createTempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "codescope-parser-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tempDirs) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  tempDirs = [];
});

// Sample valid handoff document (matches generator output format)
const VALID_HANDOFF = `---
task_slug: add-auth
pipeline_phase: research
wave_position: N/A
timestamp: 2026-03-28T10:00:00.000Z
orient_dir: /tmp/test/.claude/codescope/execution/add-auth
config_path: /tmp/test/.claude/codescope/config.yml
---

## Completed Work

- [x] Clarification (clarification.json)
- [x] Scope Contract (scope-contract.md)

## Remaining Tasks

- [ ] Research
- [ ] Analysis & Planning
- [ ] Execution
- [ ] Verification
- [ ] Evaluation
- [ ] Learning Capture

## Key Decisions

- Using JWT middleware for authentication
- Session tokens stored in HTTP-only cookies

## Active Findings

(No findings yet -- pre-verification)

## Resume Command

/codescope:resume add-auth
`;

describe("parseHandoff", () => {
  it("correctly extracts all frontmatter fields from valid handoff markdown", () => {
    const result = parseHandoff(VALID_HANDOFF);

    expect(result).not.toBeNull();
    expect(result!.frontmatter.task_slug).toBe("add-auth");
    expect(result!.frontmatter.pipeline_phase).toBe("research");
    expect(result!.frontmatter.wave_position).toBe("N/A");
    expect(result!.frontmatter.timestamp).toBe("2026-03-28T10:00:00.000Z");
    expect(result!.frontmatter.orient_dir).toBe(
      "/tmp/test/.claude/codescope/execution/add-auth",
    );
    expect(result!.frontmatter.config_path).toBe(
      "/tmp/test/.claude/codescope/config.yml",
    );
  });

  it("extracts completedWork array from Completed Work section", () => {
    const result = parseHandoff(VALID_HANDOFF);

    expect(result).not.toBeNull();
    expect(result!.completedWork).toHaveLength(2);
    expect(result!.completedWork[0]).toContain("[x] Clarification");
    expect(result!.completedWork[1]).toContain("[x] Scope Contract");
  });

  it("extracts remainingTasks array from Remaining Tasks section", () => {
    const result = parseHandoff(VALID_HANDOFF);

    expect(result).not.toBeNull();
    expect(result!.remainingTasks).toHaveLength(6);
    expect(result!.remainingTasks[0]).toContain("[ ] Research");
    expect(result!.remainingTasks[5]).toContain("[ ] Learning Capture");
  });

  it("extracts resumeCommand from Resume Command section", () => {
    const result = parseHandoff(VALID_HANDOFF);

    expect(result).not.toBeNull();
    expect(result!.resumeCommand).toBe("/codescope:resume add-auth");
  });

  it("returns null for empty or invalid input", () => {
    expect(parseHandoff("")).toBeNull();
    expect(parseHandoff("no frontmatter here")).toBeNull();
    expect(parseHandoff("---\n---\n")).toBeNull(); // empty frontmatter
  });
});

describe("findLatestHandoff", () => {
  it("returns the most recently modified handoff file in sessions dir", () => {
    const sessionsDir = createTempDir();

    // Create two handoff files with different mtimes
    const older = path.join(sessionsDir, "task-a-handoff.md");
    const newer = path.join(sessionsDir, "task-b-handoff.md");

    fs.writeFileSync(older, VALID_HANDOFF.replace("add-auth", "task-a"));

    // Set older file to 1 hour ago
    const oneHourAgo = new Date(Date.now() - 3600_000);
    fs.utimesSync(older, oneHourAgo, oneHourAgo);

    // Write newer file (gets current mtime)
    const newerContent = VALID_HANDOFF.replace(/add-auth/g, "task-b");
    fs.writeFileSync(newer, newerContent);

    const result = findLatestHandoff(sessionsDir);

    expect(result).not.toBeNull();
    expect(result!.path).toBe(newer);
    expect(result!.data.frontmatter.task_slug).toBe("task-b");
  });

  it("returns null when sessions dir is empty or does not exist", () => {
    expect(findLatestHandoff("/tmp/nonexistent-dir-9999")).toBeNull();

    const emptyDir = createTempDir();
    expect(findLatestHandoff(emptyDir)).toBeNull();
  });

  it("finds handoff by taskSlug when provided", () => {
    const sessionsDir = createTempDir();

    const handoffPath = path.join(sessionsDir, "my-task-handoff.md");
    const content = VALID_HANDOFF.replace(/add-auth/g, "my-task");
    fs.writeFileSync(handoffPath, content);

    const result = findLatestHandoff(sessionsDir, "my-task");

    expect(result).not.toBeNull();
    expect(result!.data.frontmatter.task_slug).toBe("my-task");
  });
});

describe("validateHandoffArtifacts", () => {
  it("returns missing list when referenced artifacts do not exist on disk (D-17)", () => {
    const tempDir = createTempDir();
    const executionDir = path.join(tempDir, "execution");
    fs.mkdirSync(executionDir, { recursive: true });

    // Create only clarification.json, omit scope-contract.md
    fs.writeFileSync(
      path.join(executionDir, "clarification.json"),
      "{}",
    );

    const handoffData = parseHandoff(
      VALID_HANDOFF.replace(
        /orient_dir: .+/,
        `orient_dir: ${executionDir}`,
      ),
    )!;

    const result = validateHandoffArtifacts(handoffData);

    expect(result.valid).toBe(false);
    expect(result.missing).toContain("scope-contract.md");
    expect(result.missing).not.toContain("clarification.json");
  });

  it("returns valid when all referenced artifacts exist", () => {
    const tempDir = createTempDir();
    const executionDir = path.join(tempDir, "execution");
    fs.mkdirSync(executionDir, { recursive: true });

    // Create both referenced artifacts
    fs.writeFileSync(
      path.join(executionDir, "clarification.json"),
      "{}",
    );
    fs.writeFileSync(
      path.join(executionDir, "scope-contract.md"),
      "# Scope",
    );

    const handoffData = parseHandoff(
      VALID_HANDOFF.replace(
        /orient_dir: .+/,
        `orient_dir: ${executionDir}`,
      ),
    )!;

    const result = validateHandoffArtifacts(handoffData);

    expect(result.valid).toBe(true);
    expect(result.missing).toHaveLength(0);
  });
});
