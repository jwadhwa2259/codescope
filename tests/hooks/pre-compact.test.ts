/**
 * Tests for PreCompact hook and handoff builder.
 *
 * Covers:
 * - processPreCompact silent no-op when no active pipeline
 * - processPreCompact handoff generation when active task found
 * - processPreCompact handoff file written to correct path
 * - findActiveTaskSlug returns null for empty execution dir
 * - findActiveTaskSlug returns most recently modified task slug
 * - buildHandoffContent produces markdown with YAML frontmatter and 5 sections
 * - processPreCompact returns additionalContext with confirmation
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  existsSync,
  readFileSync,
  utimesSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { rmSync } from "node:fs";
import type { PreCompactInput } from "../../src/hooks/lib/types.js";
import { processPreCompact } from "../../src/hooks/pre-compact.js";
import {
  findActiveTaskSlug,
  buildHandoffContent,
} from "../../src/hooks/lib/handoff-builder.js";

describe("PreCompact hook", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "precompact-test-"));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  function makeInput(overrides?: Partial<PreCompactInput>): PreCompactInput {
    return {
      session_id: "test-session",
      transcript_path: "/tmp/transcript",
      cwd: tempDir,
      hook_event_name: "PreCompact",
      matcher_value: "auto",
      ...overrides,
    };
  }

  // Test 1: processPreCompact returns empty output when no execution directory exists
  it("returns bare output when no execution directory exists", () => {
    const result = processPreCompact(makeInput(), tempDir);
    expect(result.hookSpecificOutput.hookEventName).toBe("PreCompact");
    expect(result.hookSpecificOutput.additionalContext).toBeUndefined();
  });

  // Test 2: processPreCompact generates handoff file when active task slug found
  it("generates handoff file when active task slug found", () => {
    // Set up execution dir with task artifacts
    const executionDir = join(tempDir, ".claude", "codescope", "execution");
    const taskDir = join(executionDir, "add-auth-module");
    mkdirSync(taskDir, { recursive: true });
    writeFileSync(join(taskDir, "clarification.json"), '{"q":"test"}');
    writeFileSync(join(taskDir, "scope-contract.md"), "# Scope\n");
    writeFileSync(join(taskDir, "coordination.md"), "| ts | agent | wave_1_complete |");

    const result = processPreCompact(makeInput(), tempDir);
    expect(result.hookSpecificOutput.additionalContext).toBeDefined();
    expect(result.hookSpecificOutput.additionalContext).toContain("Session state saved");
  });

  // Test 3: processPreCompact writes handoff to correct path
  it("writes handoff to .claude/codescope/sessions/{taskSlug}-handoff.md", () => {
    const executionDir = join(tempDir, ".claude", "codescope", "execution");
    const taskDir = join(executionDir, "fix-login-bug");
    mkdirSync(taskDir, { recursive: true });
    writeFileSync(join(taskDir, "coordination.md"), "active");

    processPreCompact(makeInput(), tempDir);

    const handoffPath = join(
      tempDir,
      ".claude",
      "codescope",
      "sessions",
      "fix-login-bug-handoff.md",
    );
    expect(existsSync(handoffPath)).toBe(true);
    const content = readFileSync(handoffPath, "utf-8");
    expect(content).toContain("task_slug: fix-login-bug");
  });

  // Test 4: findActiveTaskSlug returns null when execution dir is empty
  it("findActiveTaskSlug returns null for empty execution dir", () => {
    const executionDir = join(tempDir, "execution");
    mkdirSync(executionDir, { recursive: true });

    const result = findActiveTaskSlug(executionDir);
    expect(result).toBeNull();
  });

  // Test 5: findActiveTaskSlug returns most recently modified task slug directory
  it("findActiveTaskSlug returns most recently modified task slug", () => {
    const executionDir = join(tempDir, "execution");
    const oldTask = join(executionDir, "old-task");
    const newTask = join(executionDir, "new-task");
    mkdirSync(oldTask, { recursive: true });
    mkdirSync(newTask, { recursive: true });

    // Both have coordination.md, but new-task is more recent
    writeFileSync(join(oldTask, "coordination.md"), "old");
    const oldTime = new Date(Date.now() - 60000);
    utimesSync(join(oldTask, "coordination.md"), oldTime, oldTime);

    writeFileSync(join(newTask, "coordination.md"), "new");

    const result = findActiveTaskSlug(executionDir);
    expect(result).toBe("new-task");
  });

  // Test 6: buildHandoffContent produces markdown with YAML frontmatter and 5 sections
  it("buildHandoffContent produces markdown with YAML frontmatter and 5 sections", () => {
    const executionDir = join(tempDir, ".claude", "codescope", "execution", "my-task");
    mkdirSync(executionDir, { recursive: true });
    writeFileSync(join(executionDir, "clarification.json"), "{}");
    writeFileSync(join(executionDir, "scope-contract.md"), "# Scope");
    writeFileSync(join(executionDir, "research.md"), "# Research");

    const content = buildHandoffContent(tempDir, "my-task", executionDir);

    // YAML frontmatter
    expect(content).toMatch(/^---\n/);
    expect(content).toContain("task_slug: my-task");
    expect(content).toContain("pipeline_phase:");
    expect(content).toContain("timestamp:");

    // 5 sections
    expect(content).toContain("## Completed Work");
    expect(content).toContain("## Remaining Tasks");
    expect(content).toContain("## Key Decisions");
    expect(content).toContain("## Active Findings");
    expect(content).toContain("## Resume Command");
    expect(content).toContain("/codescope:resume my-task");
  });

  // Test 7: processPreCompact returns additionalContext with "Session state saved" confirmation
  it("returns additionalContext with session state saved confirmation", () => {
    const executionDir = join(tempDir, ".claude", "codescope", "execution");
    const taskDir = join(executionDir, "deploy-feature");
    mkdirSync(taskDir, { recursive: true });
    writeFileSync(join(taskDir, "coordination.md"), "active");

    const result = processPreCompact(makeInput(), tempDir);
    expect(result.hookSpecificOutput.additionalContext).toContain(
      "Session state saved",
    );
    expect(result.hookSpecificOutput.additionalContext).toContain(
      "/codescope:resume deploy-feature",
    );
  });
});
