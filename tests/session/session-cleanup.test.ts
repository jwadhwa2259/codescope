// ---------------------------------------------------------------------------
// Session Cleanup Tests
// ---------------------------------------------------------------------------
// Tests 7-day session file cleanup per D-14.
// ---------------------------------------------------------------------------

import { describe, it, expect, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

import { cleanupOldSessions } from "../../src/session/session-cleanup.js";

let tempDirs: string[] = [];

function createTempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "codescope-cleanup-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tempDirs) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  tempDirs = [];
});

describe("cleanupOldSessions", () => {
  it("removes files older than 7 days", () => {
    const sessionsDir = createTempDir();

    // Create a file that's 10 days old
    const oldFile = path.join(sessionsDir, "old-task-handoff.md");
    fs.writeFileSync(oldFile, "old handoff");
    const tenDaysAgo = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
    fs.utimesSync(oldFile, tenDaysAgo, tenDaysAgo);

    // Create a file that's 1 day old
    const newFile = path.join(sessionsDir, "new-task-handoff.md");
    fs.writeFileSync(newFile, "new handoff");
    const oneDayAgo = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000);
    fs.utimesSync(newFile, oneDayAgo, oneDayAgo);

    const result = cleanupOldSessions(sessionsDir);

    expect(result.removed).toContain("old-task-handoff.md");
    expect(result.removed).toHaveLength(1);
    expect(result.kept).toBe(1);
    expect(fs.existsSync(oldFile)).toBe(false);
    expect(fs.existsSync(newFile)).toBe(true);
  });

  it("preserves files newer than 7 days", () => {
    const sessionsDir = createTempDir();

    // Create files that are all recent
    const file1 = path.join(sessionsDir, "task-1-handoff.md");
    const file2 = path.join(sessionsDir, "task-2-handoff.md");
    fs.writeFileSync(file1, "handoff 1");
    fs.writeFileSync(file2, "handoff 2");

    const result = cleanupOldSessions(sessionsDir);

    expect(result.removed).toHaveLength(0);
    expect(result.kept).toBe(2);
    expect(fs.existsSync(file1)).toBe(true);
    expect(fs.existsSync(file2)).toBe(true);
  });

  it("handles non-existent sessions directory gracefully", () => {
    const result = cleanupOldSessions("/tmp/nonexistent-session-dir-99999");

    expect(result.removed).toHaveLength(0);
    expect(result.kept).toBe(0);
  });
});
