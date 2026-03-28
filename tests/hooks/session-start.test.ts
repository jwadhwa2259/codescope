/**
 * Tests for SessionStart hook.
 *
 * Covers:
 * - processSessionStart bare output when no sessions directory
 * - processSessionStart bare output when sessions directory is empty
 * - processSessionStart injects handoff summary as additionalContext
 * - processSessionStart reads most recently modified handoff file
 * - processSessionStart additionalContext contains task_slug and pipeline_phase
 * - processSessionStart additionalContext contains resume command
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  utimesSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { rmSync } from "node:fs";
import type { SessionStartInput } from "../../src/hooks/lib/types.js";
import { processSessionStart } from "../../src/hooks/session-start.js";

describe("SessionStart hook", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "sessionstart-test-"));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  function makeInput(overrides?: Partial<SessionStartInput>): SessionStartInput {
    return {
      session_id: "test-session",
      transcript_path: "/tmp/transcript",
      cwd: tempDir,
      hook_event_name: "SessionStart",
      matcher_value: "resume",
      ...overrides,
    };
  }

  function writeHandoffFile(
    sessionsDir: string,
    taskSlug: string,
    phase: string = "execution",
  ): void {
    mkdirSync(sessionsDir, { recursive: true });
    const content = [
      "---",
      `task_slug: ${taskSlug}`,
      `pipeline_phase: ${phase}`,
      "wave_position: 2/3",
      `timestamp: ${new Date().toISOString()}`,
      `orient_dir: /tmp/execution/${taskSlug}`,
      "config_path: /tmp/config.yml",
      "---",
      "",
      "## Completed Work",
      "",
      "- [x] Clarification (clarification.json)",
      "- [x] Scope Contract (scope-contract.md)",
      "- [x] Execution started (coordination.md)",
      "",
      "## Remaining Tasks",
      "",
      "- [ ] Verification",
      "- [ ] Evaluation",
      "",
      "## Key Decisions",
      "",
      "(No decisions captured)",
      "",
      "## Active Findings",
      "",
      "(Captured at compaction)",
      "",
      "## Resume Command",
      "",
      `/codescope:resume ${taskSlug}`,
      "",
    ].join("\n");
    writeFileSync(join(sessionsDir, `${taskSlug}-handoff.md`), content);
  }

  // Test 1: processSessionStart returns bare output when no sessions directory exists
  it("returns bare output when no sessions directory exists", () => {
    const result = processSessionStart(makeInput(), tempDir);
    expect(result.hookSpecificOutput.hookEventName).toBe("SessionStart");
    expect(result.hookSpecificOutput.additionalContext).toBeUndefined();
  });

  // Test 2: processSessionStart returns bare output when sessions directory is empty
  it("returns bare output when sessions directory is empty", () => {
    const sessionsDir = join(tempDir, ".claude", "codescope", "sessions");
    mkdirSync(sessionsDir, { recursive: true });

    const result = processSessionStart(makeInput(), tempDir);
    expect(result.hookSpecificOutput.additionalContext).toBeUndefined();
  });

  // Test 3: processSessionStart injects handoff summary as additionalContext
  it("injects handoff summary as additionalContext when handoff file exists", () => {
    const sessionsDir = join(tempDir, ".claude", "codescope", "sessions");
    writeHandoffFile(sessionsDir, "add-auth-module");

    const result = processSessionStart(makeInput(), tempDir);
    expect(result.hookSpecificOutput.additionalContext).toBeDefined();
    expect(result.hookSpecificOutput.additionalContext).toContain(
      "[SESSION RESUME]",
    );
  });

  // Test 4: processSessionStart reads the most recently modified handoff file
  it("reads the most recently modified handoff file", () => {
    const sessionsDir = join(tempDir, ".claude", "codescope", "sessions");

    // Write old handoff
    writeHandoffFile(sessionsDir, "old-task", "research");
    const oldPath = join(sessionsDir, "old-task-handoff.md");
    const oldTime = new Date(Date.now() - 120000);
    utimesSync(oldPath, oldTime, oldTime);

    // Write new handoff
    writeHandoffFile(sessionsDir, "new-task", "execution");

    const result = processSessionStart(makeInput(), tempDir);
    expect(result.hookSpecificOutput.additionalContext).toContain("new-task");
  });

  // Test 5: processSessionStart additionalContext contains task_slug and pipeline_phase
  it("additionalContext contains task_slug and pipeline_phase from handoff", () => {
    const sessionsDir = join(tempDir, ".claude", "codescope", "sessions");
    writeHandoffFile(sessionsDir, "deploy-feature", "analysis-and-planning");

    const result = processSessionStart(makeInput(), tempDir);
    const ctx = result.hookSpecificOutput.additionalContext!;
    expect(ctx).toContain("deploy-feature");
    expect(ctx).toContain("analysis-and-planning");
  });

  // Test 6: processSessionStart additionalContext contains resume command
  it("additionalContext contains resume command", () => {
    const sessionsDir = join(tempDir, ".claude", "codescope", "sessions");
    writeHandoffFile(sessionsDir, "fix-login-bug");

    const result = processSessionStart(makeInput(), tempDir);
    const ctx = result.hookSpecificOutput.additionalContext!;
    expect(ctx).toContain("/codescope:resume fix-login-bug");
  });
});
