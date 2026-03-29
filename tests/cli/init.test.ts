import { describe, it, expect, vi, beforeEach } from "vitest";
import { Command } from "commander";

// Mock all heavy dependencies to test init flow in isolation
vi.mock("../../src/onboard/detect.js", () => ({
  detectProject: vi.fn(),
}));

vi.mock("../../src/onboard/filesystem.js", () => ({
  createDirectoryTree: vi.fn(),
}));

vi.mock("../../src/config/writer.js", () => ({
  writeConfig: vi.fn(),
}));

vi.mock("../../src/bootstrap/orchestrator.js", () => ({
  runBootstrap: vi.fn(),
}));

vi.mock("../../src/cli/setup/plugin-wiring.js", () => ({
  wirePlugin: vi.fn(),
}));

// Mock spinner and format to avoid terminal side effects
vi.mock("../../src/cli/ui/spinner.js", () => ({
  createSpinner: vi.fn(() => ({
    start: vi.fn().mockReturnThis(),
    succeed: vi.fn().mockReturnThis(),
    fail: vi.fn().mockReturnThis(),
    warn: vi.fn().mockReturnThis(),
    text: "",
  })),
}));

vi.mock("../../src/cli/ui/format.js", () => ({
  formatStep: vi.fn(
    (label: string, detail: string) => `[ok] ${label} ${detail}`,
  ),
  formatWarning: vi.fn((msg: string) => `[warn] ${msg}`),
  jsonOutput: vi.fn(),
}));

import { registerInitCommand } from "../../src/cli/commands/init.js";
import { detectProject } from "../../src/onboard/detect.js";
import { writeConfig } from "../../src/config/writer.js";
import { runBootstrap } from "../../src/bootstrap/orchestrator.js";
import { wirePlugin } from "../../src/cli/setup/plugin-wiring.js";

const mockedDetectProject = vi.mocked(detectProject);
const mockedWriteConfig = vi.mocked(writeConfig);
const mockedRunBootstrap = vi.mocked(runBootstrap);
const mockedWirePlugin = vi.mocked(wirePlugin);

describe("registerInitCommand", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("registers init command on program with correct options", () => {
    const program = new Command();
    registerInitCommand(program);

    const initCmd = program.commands.find((c) => c.name() === "init");
    expect(initCmd).toBeDefined();
    expect(initCmd!.description()).toBe(
      "Detect project, create config, run bootstrap, wire plugin",
    );

    const optionNames = initCmd!.options.map((o) => o.long);
    expect(optionNames).toContain("--force");
    expect(optionNames).toContain("--json");
  });

  it("init flow calls detectProject, writeConfig, runBootstrap, wirePlugin in order", async () => {
    const callOrder: string[] = [];

    mockedDetectProject.mockImplementation(async () => {
      callOrder.push("detectProject");
      return {
        projectName: "test-project",
        type: "single" as const,
        languages: ["typescript"],
        buildCommand: "npm run build",
        testCommand: "npm test",
        e2eTool: null,
        e2eCommand: null,
        services: [],
      };
    });

    mockedWriteConfig.mockImplementation(() => {
      callOrder.push("writeConfig");
    });

    mockedRunBootstrap.mockImplementation(async () => {
      callOrder.push("runBootstrap");
      return {
        services: [{ name: "main", status: "full" as const, durationMs: 1000 }],
        readinessGrade: "B",
        readinessPercent: 72,
        totalNodes: 100,
        totalEdges: 200,
        totalCommunities: 5,
        conventionsDetected: 10,
        highConfidenceConventions: 8,
        durationMs: 5000,
        artifacts: [],
        timingBreakdown: {},
        warnings: [],
      };
    });

    mockedWirePlugin.mockImplementation(() => {
      callOrder.push("wirePlugin");
      return { created: true, skipped: false, message: "ok", files: [] };
    });

    // Intercept process.exit to prevent test runner from dying
    const exitSpy = vi
      .spyOn(process, "exit")
      .mockImplementation((() => {}) as never);

    const program = new Command();
    registerInitCommand(program);

    // Execute with --json to skip interactive prompts
    await program.parseAsync(["node", "codescope", "init", "--json"]);

    expect(callOrder).toEqual([
      "detectProject",
      "writeConfig",
      "runBootstrap",
      "wirePlugin",
    ]);

    exitSpy.mockRestore();
  });

  it("init with --json flag skips interactive confirmation", async () => {
    mockedDetectProject.mockResolvedValue({
      projectName: "test",
      type: "single",
      languages: ["typescript"],
      buildCommand: null,
      testCommand: null,
      e2eTool: null,
      e2eCommand: null,
      services: [],
    });

    mockedRunBootstrap.mockResolvedValue({
      services: [],
      readinessGrade: "C",
      readinessPercent: 50,
      totalNodes: 10,
      totalEdges: 5,
      totalCommunities: 1,
      conventionsDetected: 0,
      highConfidenceConventions: 0,
      durationMs: 100,
      artifacts: [],
      timingBreakdown: {},
      warnings: [],
    });

    mockedWirePlugin.mockReturnValue({
      created: true,
      skipped: false,
      message: "ok",
      files: [],
    });

    const exitSpy = vi
      .spyOn(process, "exit")
      .mockImplementation((() => {}) as never);

    const program = new Command();
    registerInitCommand(program);

    // Should complete without hanging on readline
    await program.parseAsync(["node", "codescope", "init", "--json"]);

    expect(mockedDetectProject).toHaveBeenCalled();
    expect(mockedRunBootstrap).toHaveBeenCalled();

    exitSpy.mockRestore();
  });

  it("init handles bootstrap failure gracefully", async () => {
    mockedDetectProject.mockResolvedValue({
      projectName: "test",
      type: "single",
      languages: ["typescript"],
      buildCommand: null,
      testCommand: null,
      e2eTool: null,
      e2eCommand: null,
      services: [],
    });

    mockedRunBootstrap.mockRejectedValue(new Error("Bootstrap exploded"));

    const exitSpy = vi
      .spyOn(process, "exit")
      .mockImplementation((() => {}) as never);
    const stderrSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});

    const program = new Command();
    registerInitCommand(program);

    await program.parseAsync(["node", "codescope", "init", "--json"]);

    // Should have called process.exit(1) due to bootstrap failure
    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(stderrSpy).toHaveBeenCalledWith("Bootstrap exploded");

    exitSpy.mockRestore();
    stderrSpy.mockRestore();
  });
});
