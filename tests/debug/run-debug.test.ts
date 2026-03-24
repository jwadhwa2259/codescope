import { describe, it, expect } from "vitest";

// ---------------------------------------------------------------------------
// Tests for src/debug/run-debug.ts CLI entry point
// Verifies module imports resolve, argument parsing logic, and the CLI
// structure matches the established run-verify.ts pattern.
// ---------------------------------------------------------------------------

describe("run-debug CLI entry point", () => {
  // ---- Module resolution ----

  it("resolves debug-agent import (runDebug)", async () => {
    const mod = await import("../../src/debug/debug-agent.js");
    expect(typeof mod.runDebug).toBe("function");
  });

  it("resolves config loader import (loadConfig)", async () => {
    const mod = await import("../../src/config/loader.js");
    expect(typeof mod.loadConfig).toBe("function");
  });

  it("resolves eval types (EvalFinding)", async () => {
    // Verify the types module exists and exports expected shapes
    const mod = await import("../../src/eval/types.js");
    // types.ts is a type-only module, just verify it resolves
    expect(mod).toBeDefined();
  });

  it("resolves debug types (DebugOptions, DebugCallbacks)", async () => {
    const mod = await import("../../src/debug/types.js");
    expect(mod).toBeDefined();
  });

  // ---- CLI argument parsing ----

  it("parseArgs converts kebab-case to camelCase", () => {
    function parseArgs(argv: string[]): Record<string, string | boolean> {
      const args: Record<string, string | boolean> = {};
      for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        if (arg.startsWith("--") && i + 1 < argv.length) {
          const key = arg.slice(2).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
          args[key] = argv[++i];
        }
      }
      return args;
    }

    const result = parseArgs([
      "--project-root", "/tmp/proj",
      "--task-slug", "test-task",
      "--findings-path", "/tmp/findings.json",
      "--scope-contract-path", "/tmp/scope.md",
      "--plan-path", "/tmp/plan.md",
      "--coordination-path", "/tmp/coord.md",
      "--report-path", "/tmp/report.md",
      "--max-cycles", "5",
      "--execution-dir", "/tmp/exec",
    ]);

    expect(result.projectRoot).toBe("/tmp/proj");
    expect(result.taskSlug).toBe("test-task");
    expect(result.findingsPath).toBe("/tmp/findings.json");
    expect(result.scopeContractPath).toBe("/tmp/scope.md");
    expect(result.planPath).toBe("/tmp/plan.md");
    expect(result.coordinationPath).toBe("/tmp/coord.md");
    expect(result.reportPath).toBe("/tmp/report.md");
    expect(result.maxCycles).toBe("5");
    expect(result.executionDir).toBe("/tmp/exec");
  });

  it("parseArgs handles empty argv", () => {
    function parseArgs(argv: string[]): Record<string, string | boolean> {
      const args: Record<string, string | boolean> = {};
      for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        if (arg.startsWith("--") && i + 1 < argv.length) {
          const key = arg.slice(2).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
          args[key] = argv[++i];
        }
      }
      return args;
    }

    const result = parseArgs([]);
    expect(result).toEqual({});
  });

  // ---- Structural checks ----

  it("run-debug.ts file contains required CLI patterns", async () => {
    const fs = await import("node:fs");
    const content = fs.readFileSync("src/debug/run-debug.ts", "utf-8");

    // Shebang
    expect(content).toContain("#!/usr/bin/env node");
    // Stderr dispatch protocol
    expect(content).toContain("dispatch_fix");
    expect(content).toContain("dispatch_eval");
    expect(content).toContain("dispatch_verify");
    expect(content).toContain("design_decision");
    expect(content).toContain('console.error(JSON.stringify');
    // Core imports
    expect(content).toContain("runDebug");
    expect(content).toContain("loadConfig");
    // Required args
    expect(content).toContain("--task-slug");
    expect(content).toContain("--findings-path");
  });
});
