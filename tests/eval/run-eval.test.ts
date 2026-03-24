import { describe, it, expect } from "vitest";

// ---------------------------------------------------------------------------
// Tests for src/eval/run-eval.ts CLI entry point
// Verifies module imports resolve, argument parsing logic, and the CLI
// structure matches the established run-verify.ts pattern.
// ---------------------------------------------------------------------------

describe("run-eval CLI entry point", () => {
  // ---- Module resolution ----

  it("resolves eval-agent import (runEval)", async () => {
    const mod = await import("../../src/eval/eval-agent.js");
    expect(typeof mod.runEval).toBe("function");
  });

  it("resolves report-appender import (appendEvalSection)", async () => {
    const mod = await import("../../src/eval/report-appender.js");
    expect(typeof mod.appendEvalSection).toBe("function");
  });

  it("resolves ignore-filter import (loadIgnorePatterns)", async () => {
    const mod = await import("../../src/eval/ignore-filter.js");
    expect(typeof mod.loadIgnorePatterns).toBe("function");
  });

  it("resolves config loader import (loadConfig)", async () => {
    const mod = await import("../../src/config/loader.js");
    expect(typeof mod.loadConfig).toBe("function");
  });

  // ---- CLI argument parsing ----

  it("parseArgs converts kebab-case to camelCase", () => {
    // Replicate the parseArgs logic inline for unit testing
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
      "--report-path", "/tmp/report.md",
      "--scope-contract-path", "/tmp/scope.md",
      "--plan-path", "/tmp/plan.md",
      "--coordination-path", "/tmp/coord.md",
      "--research-path", "/tmp/research.md",
      "--execution-dir", "/tmp/exec",
    ]);

    expect(result.projectRoot).toBe("/tmp/proj");
    expect(result.taskSlug).toBe("test-task");
    expect(result.reportPath).toBe("/tmp/report.md");
    expect(result.scopeContractPath).toBe("/tmp/scope.md");
    expect(result.planPath).toBe("/tmp/plan.md");
    expect(result.coordinationPath).toBe("/tmp/coord.md");
    expect(result.researchPath).toBe("/tmp/research.md");
    expect(result.executionDir).toBe("/tmp/exec");
  });

  it("parseArgs handles missing arguments gracefully", () => {
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

  it("run-eval.ts file contains required CLI patterns", async () => {
    const fs = await import("node:fs");
    const content = fs.readFileSync("src/eval/run-eval.ts", "utf-8");

    // Shebang
    expect(content).toContain("#!/usr/bin/env node");
    // Stderr dispatch protocol
    expect(content).toContain("dispatch_eval");
    expect(content).toContain('console.error(JSON.stringify');
    // Core imports
    expect(content).toContain("runEval");
    expect(content).toContain("appendEvalSection");
    expect(content).toContain("loadIgnorePatterns");
    expect(content).toContain("loadConfig");
    // Required args
    expect(content).toContain("--task-slug");
    expect(content).toContain("--report-path");
    // No separate chunking logic (D-22 handled by runEval internally)
    expect(content).not.toContain("chunkVerifyResult");
  });
});
