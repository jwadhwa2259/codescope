import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { processPostToolUse } from "../../src/hooks/post-tool-use.js";
import type { HookInput } from "../../src/hooks/lib/types.js";

function createTempProject(): {
  projectDir: string;
  injectionDir: string;
  codescopeDir: string;
} {
  const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), "hook-test-"));
  const codescopeDir = path.join(projectDir, ".claude", "codescope");
  const injectionDir = path.join(codescopeDir, "injection");
  fs.mkdirSync(injectionDir, { recursive: true });
  return { projectDir, injectionDir, codescopeDir };
}

function makeInput(overrides: Partial<HookInput> = {}): HookInput {
  return {
    session_id: "test-session",
    transcript_path: "/tmp/transcript",
    cwd: "/tmp/project",
    permission_mode: "default",
    hook_event_name: "PostToolUse",
    tool_name: "Edit",
    tool_input: {
      file_path: "src/foo.ts",
    },
    tool_use_id: "tu-456",
    ...overrides,
  };
}

describe("PostToolUse hook", () => {
  let projectDir: string;
  let injectionDir: string;
  let codescopeDir: string;

  beforeEach(() => {
    const dirs = createTempProject();
    projectDir = dirs.projectDir;
    injectionDir = dirs.injectionDir;
    codescopeDir = dirs.codescopeDir;
  });

  afterEach(() => {
    fs.rmSync(projectDir, { recursive: true, force: true });
  });

  it("returns bare hookSpecificOutput when graph.db does not exist (INJECT-05)", () => {
    const input = makeInput({ cwd: projectDir });
    const result = processPostToolUse(input, projectDir);
    expect(result.hookSpecificOutput.hookEventName).toBe("PostToolUse");
    expect(result.hookSpecificOutput.additionalContext).toBeUndefined();
  });

  it("returns bare hookSpecificOutput when file has low centrality and no conventions (INJECT-04)", () => {
    fs.writeFileSync(path.join(codescopeDir, "graph.db"), "");
    fs.writeFileSync(
      path.join(injectionDir, "danger-zones.json"),
      JSON.stringify({
        generated: new Date().toISOString(),
        files: {
          "src/foo.ts": {
            centrality: 0.2,
            riskScore: 0.05,
            communitiesTouched: 1,
            reasons: [],
          },
        },
      })
    );
    fs.writeFileSync(
      path.join(injectionDir, "conventions.json"),
      JSON.stringify({
        generated: new Date().toISOString(),
        files: {},
      })
    );

    const input = makeInput({ cwd: projectDir });
    const result = processPostToolUse(input, projectDir);
    expect(result.hookSpecificOutput.additionalContext).toBeUndefined();
  });

  it("returns additionalContext with convention reminder for file with conventions", () => {
    fs.writeFileSync(path.join(codescopeDir, "graph.db"), "");
    fs.writeFileSync(
      path.join(injectionDir, "conventions.json"),
      JSON.stringify({
        generated: new Date().toISOString(),
        files: {
          "src/foo.ts": [
            {
              name: "Use async/await",
              adoption_pct: 95,
              confidence: "HIGH-CONF",
              category: "async",
            },
          ],
        },
      })
    );

    const input = makeInput({ cwd: projectDir });
    const result = processPostToolUse(input, projectDir);
    expect(result.hookSpecificOutput.additionalContext).toContain(
      "[CONVENTION REMINDER]"
    );
    expect(result.hookSpecificOutput.additionalContext).toContain(
      "Use async/await"
    );
  });

  it("returns additionalContext with blast radius warning when totalAffected > 3", () => {
    fs.writeFileSync(path.join(codescopeDir, "graph.db"), "");
    // Need centrality > 0.3 to trigger (since no conventions)
    fs.writeFileSync(
      path.join(injectionDir, "danger-zones.json"),
      JSON.stringify({
        generated: new Date().toISOString(),
        files: {
          "src/foo.ts": {
            centrality: 0.5,
            riskScore: 0.3,
            communitiesTouched: 2,
            reasons: [],
          },
        },
      })
    );
    fs.writeFileSync(
      path.join(injectionDir, "blast-radius.json"),
      JSON.stringify({
        generated: new Date().toISOString(),
        files: {
          "src/foo.ts": {
            totalAffected: 15,
            byRisk: { red: 2, orange: 3, yellow: 5, green: 5 },
            topAffected: ["src/a.ts", "src/b.ts", "src/c.ts"],
          },
        },
      })
    );

    const input = makeInput({ cwd: projectDir });
    const result = processPostToolUse(input, projectDir);
    expect(result.hookSpecificOutput.additionalContext).toContain(
      "[BLAST RADIUS WARNING]"
    );
    expect(result.hookSpecificOutput.additionalContext).toContain(
      "15 files"
    );
  });

  it("does NOT include blast radius warning when totalAffected <= 3", () => {
    fs.writeFileSync(path.join(codescopeDir, "graph.db"), "");
    // Trigger via conventions, not centrality
    fs.writeFileSync(
      path.join(injectionDir, "conventions.json"),
      JSON.stringify({
        generated: new Date().toISOString(),
        files: {
          "src/foo.ts": [
            {
              name: "Naming convention",
              adoption_pct: 90,
              confidence: "HIGH-CONF",
              category: "naming",
            },
          ],
        },
      })
    );
    fs.writeFileSync(
      path.join(injectionDir, "blast-radius.json"),
      JSON.stringify({
        generated: new Date().toISOString(),
        files: {
          "src/foo.ts": {
            totalAffected: 2,
            byRisk: { red: 0, orange: 0, yellow: 1, green: 1 },
            topAffected: ["src/a.ts"],
          },
        },
      })
    );

    const input = makeInput({ cwd: projectDir });
    const result = processPostToolUse(input, projectDir);
    // Should have convention reminder but NOT blast radius warning
    expect(result.hookSpecificOutput.additionalContext).toContain(
      "[CONVENTION REMINDER]"
    );
    expect(result.hookSpecificOutput.additionalContext).not.toContain(
      "[BLAST RADIUS WARNING]"
    );
  });

  it("output does NOT contain [DANGER ZONE] (danger zone is PreToolUse only)", () => {
    fs.writeFileSync(path.join(codescopeDir, "graph.db"), "");
    fs.writeFileSync(
      path.join(injectionDir, "danger-zones.json"),
      JSON.stringify({
        generated: new Date().toISOString(),
        files: {
          "src/foo.ts": {
            centrality: 0.9,
            riskScore: 0.95,
            communitiesTouched: 5,
            reasons: ["Very high centrality"],
          },
        },
      })
    );
    fs.writeFileSync(
      path.join(injectionDir, "conventions.json"),
      JSON.stringify({
        generated: new Date().toISOString(),
        files: {
          "src/foo.ts": [
            {
              name: "Some convention",
              adoption_pct: 85,
              confidence: "HIGH-CONF",
              category: "general",
            },
          ],
        },
      })
    );

    const input = makeInput({ cwd: projectDir });
    const result = processPostToolUse(input, projectDir);
    const ctx = result.hookSpecificOutput.additionalContext ?? "";
    expect(ctx).not.toContain("[DANGER ZONE]");
  });
});
