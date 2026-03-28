import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { processPreToolUse } from "../../src/hooks/pre-tool-use.js";
import type { HookInput } from "../../src/hooks/lib/types.js";

/**
 * Helper to create a temp project directory with codescope structure
 * and optional artifact files + graph.db marker.
 */
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
    hook_event_name: "PreToolUse",
    tool_name: "Edit",
    tool_input: {
      file_path: "src/foo.ts",
    },
    tool_use_id: "tu-123",
    ...overrides,
  };
}

describe("PreToolUse hook", () => {
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
    // No graph.db in codescopeDir
    const input = makeInput({ cwd: projectDir });
    const result = processPreToolUse(input, projectDir);
    expect(result.hookSpecificOutput.hookEventName).toBe("PreToolUse");
    expect(result.hookSpecificOutput.additionalContext).toBeUndefined();
  });

  it("returns bare hookSpecificOutput when file has centrality <= 0.3 and no conventions (INJECT-04)", () => {
    // Create graph.db marker
    fs.writeFileSync(path.join(codescopeDir, "graph.db"), "");

    // Create danger zones with low centrality
    fs.writeFileSync(
      path.join(injectionDir, "danger-zones.json"),
      JSON.stringify({
        generated: new Date().toISOString(),
        files: {
          "src/foo.ts": {
            centrality: 0.1,
            riskScore: 0.05,
            communitiesTouched: 1,
            reasons: [],
          },
        },
      })
    );

    // No conventions for this file
    fs.writeFileSync(
      path.join(injectionDir, "conventions.json"),
      JSON.stringify({
        generated: new Date().toISOString(),
        files: {},
      })
    );

    const input = makeInput({ cwd: projectDir });
    const result = processPreToolUse(input, projectDir);
    expect(result.hookSpecificOutput.hookEventName).toBe("PreToolUse");
    expect(result.hookSpecificOutput.additionalContext).toBeUndefined();
  });

  it("returns additionalContext with danger zone warning for high-centrality file", () => {
    fs.writeFileSync(path.join(codescopeDir, "graph.db"), "");
    fs.writeFileSync(
      path.join(injectionDir, "danger-zones.json"),
      JSON.stringify({
        generated: new Date().toISOString(),
        files: {
          "src/foo.ts": {
            centrality: 0.5,
            riskScore: 0.7,
            communitiesTouched: 3,
            reasons: ["High in-degree centrality", "Touches 3 communities"],
          },
        },
      })
    );

    const input = makeInput({ cwd: projectDir });
    const result = processPreToolUse(input, projectDir);
    expect(result.hookSpecificOutput.additionalContext).toBeDefined();
    expect(result.hookSpecificOutput.additionalContext).toContain(
      "[DANGER ZONE]"
    );
    expect(result.hookSpecificOutput.additionalContext).toContain("src/foo.ts");
    expect(result.hookSpecificOutput.additionalContext).toContain("0.70");
  });

  it("returns additionalContext with conventions for file with detected conventions", () => {
    fs.writeFileSync(path.join(codescopeDir, "graph.db"), "");
    // Low centrality but HAS conventions -> should trigger
    fs.writeFileSync(
      path.join(injectionDir, "danger-zones.json"),
      JSON.stringify({
        generated: new Date().toISOString(),
        files: {
          "src/foo.ts": {
            centrality: 0.1,
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
    const result = processPreToolUse(input, projectDir);
    expect(result.hookSpecificOutput.additionalContext).toBeDefined();
    expect(result.hookSpecificOutput.additionalContext).toContain(
      "[CONVENTIONS]"
    );
    expect(result.hookSpecificOutput.additionalContext).toContain(
      "Use async/await"
    );
  });

  it("includes blast radius summary when file has dependents", () => {
    fs.writeFileSync(path.join(codescopeDir, "graph.db"), "");
    fs.writeFileSync(
      path.join(injectionDir, "danger-zones.json"),
      JSON.stringify({
        generated: new Date().toISOString(),
        files: {
          "src/foo.ts": {
            centrality: 0.5,
            riskScore: 0.3,
            communitiesTouched: 2,
            reasons: ["High in-degree"],
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
            totalAffected: 10,
            byRisk: { red: 1, orange: 2, yellow: 3, green: 4 },
            topAffected: ["src/bar.ts", "src/baz.ts", "src/qux.ts"],
          },
        },
      })
    );

    const input = makeInput({ cwd: projectDir });
    const result = processPreToolUse(input, projectDir);
    expect(result.hookSpecificOutput.additionalContext).toContain(
      "[BLAST RADIUS]"
    );
    expect(result.hookSpecificOutput.additionalContext).toContain(
      "10 files affected"
    );
  });

  it("includes both danger zone and conventions, with danger zone first", () => {
    fs.writeFileSync(path.join(codescopeDir, "graph.db"), "");
    fs.writeFileSync(
      path.join(injectionDir, "danger-zones.json"),
      JSON.stringify({
        generated: new Date().toISOString(),
        files: {
          "src/foo.ts": {
            centrality: 0.6,
            riskScore: 0.8,
            communitiesTouched: 4,
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
              name: "Error handling pattern",
              adoption_pct: 90,
              confidence: "HIGH-CONF",
              category: "error-handling",
            },
          ],
        },
      })
    );

    const input = makeInput({ cwd: projectDir });
    const result = processPreToolUse(input, projectDir);
    const ctx = result.hookSpecificOutput.additionalContext!;
    const dzIdx = ctx.indexOf("[DANGER ZONE]");
    const convIdx = ctx.indexOf("[CONVENTIONS]");
    expect(dzIdx).toBeGreaterThanOrEqual(0);
    expect(convIdx).toBeGreaterThan(dzIdx);
  });

  it("message fits within 500-token budget (INJECT-03)", () => {
    fs.writeFileSync(path.join(codescopeDir, "graph.db"), "");
    // Create a file with lots of data
    const manyReasons = Array.from(
      { length: 20 },
      (_, i) => `Reason ${i}: some explanation text here`
    );
    const manyConventions = Array.from({ length: 15 }, (_, i) => ({
      name: `Convention ${i}: some long name here to fill space`,
      adoption_pct: 80 + i,
      confidence: "HIGH-CONF",
      category: "general",
    }));

    fs.writeFileSync(
      path.join(injectionDir, "danger-zones.json"),
      JSON.stringify({
        generated: new Date().toISOString(),
        files: {
          "src/foo.ts": {
            centrality: 0.9,
            riskScore: 0.95,
            communitiesTouched: 5,
            reasons: manyReasons,
          },
        },
      })
    );
    fs.writeFileSync(
      path.join(injectionDir, "conventions.json"),
      JSON.stringify({
        generated: new Date().toISOString(),
        files: { "src/foo.ts": manyConventions },
      })
    );
    fs.writeFileSync(
      path.join(injectionDir, "blast-radius.json"),
      JSON.stringify({
        generated: new Date().toISOString(),
        files: {
          "src/foo.ts": {
            totalAffected: 50,
            byRisk: { red: 5, orange: 10, yellow: 15, green: 20 },
            topAffected: Array.from(
              { length: 10 },
              (_, i) => `src/dep${i}.ts`
            ),
          },
        },
      })
    );

    const input = makeInput({ cwd: projectDir });
    const result = processPreToolUse(input, projectDir);
    const ctx = result.hookSpecificOutput.additionalContext;
    if (ctx) {
      const tokenEstimate = Math.ceil(ctx.length / 4);
      expect(tokenEstimate).toBeLessThanOrEqual(500);
    }
  });

  it("normalizes absolute file paths to project-relative (Pitfall 5)", () => {
    fs.writeFileSync(path.join(codescopeDir, "graph.db"), "");
    fs.writeFileSync(
      path.join(injectionDir, "conventions.json"),
      JSON.stringify({
        generated: new Date().toISOString(),
        files: {
          "src/foo.ts": [
            {
              name: "Naming pattern",
              adoption_pct: 85,
              confidence: "HIGH-CONF",
              category: "naming",
            },
          ],
        },
      })
    );

    // Provide absolute path
    const input = makeInput({
      cwd: projectDir,
      tool_input: { file_path: path.join(projectDir, "src/foo.ts") },
    });
    const result = processPreToolUse(input, projectDir);
    expect(result.hookSpecificOutput.additionalContext).toContain(
      "[CONVENTIONS]"
    );
  });

  it("normalizes relative file paths to project-relative (Pitfall 5)", () => {
    fs.writeFileSync(path.join(codescopeDir, "graph.db"), "");
    fs.writeFileSync(
      path.join(injectionDir, "conventions.json"),
      JSON.stringify({
        generated: new Date().toISOString(),
        files: {
          "src/foo.ts": [
            {
              name: "Import ordering",
              adoption_pct: 90,
              confidence: "MEDIUM-CONF",
              category: "imports",
            },
          ],
        },
      })
    );

    // Provide relative path
    const input = makeInput({
      cwd: projectDir,
      tool_input: { file_path: "src/foo.ts" },
    });
    const result = processPreToolUse(input, projectDir);
    expect(result.hookSpecificOutput.additionalContext).toContain(
      "[CONVENTIONS]"
    );
  });

  it("handles missing artifact files gracefully (D-15)", () => {
    fs.writeFileSync(path.join(codescopeDir, "graph.db"), "");
    // Only write danger-zones.json, skip conventions and blast radius
    fs.writeFileSync(
      path.join(injectionDir, "danger-zones.json"),
      JSON.stringify({
        generated: new Date().toISOString(),
        files: {
          "src/foo.ts": {
            centrality: 0.7,
            riskScore: 0.5,
            communitiesTouched: 2,
            reasons: ["High centrality"],
          },
        },
      })
    );

    const input = makeInput({ cwd: projectDir });
    const result = processPreToolUse(input, projectDir);
    expect(result.hookSpecificOutput.additionalContext).toContain(
      "[DANGER ZONE]"
    );
    // Should NOT crash despite missing conventions.json and blast-radius.json
  });
});
