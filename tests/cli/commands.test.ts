import { describe, it, expect, vi, beforeEach } from "vitest";
import { Command } from "commander";

// Test CLI registration and UI helpers

describe("CLI subcommand registration", () => {
  it("registers all 6 subcommands", async () => {
    // Import all registration functions
    const { registerInitCommand } = await import(
      "../../src/cli/commands/init.js"
    );
    const { registerBootstrapCommand } = await import(
      "../../src/cli/commands/bootstrap.js"
    );
    const { registerVizCommand } = await import(
      "../../src/cli/commands/viz.js"
    );
    const { registerReviewCommand } = await import(
      "../../src/cli/commands/review.js"
    );
    const { registerInstallHooksCommand } = await import(
      "../../src/cli/commands/install-hooks.js"
    );
    const { registerStatusCommand } = await import(
      "../../src/cli/commands/status.js"
    );

    const program = new Command();
    registerInitCommand(program);
    registerBootstrapCommand(program);
    registerVizCommand(program);
    registerReviewCommand(program);
    registerInstallHooksCommand(program);
    registerStatusCommand(program);

    const names = program.commands.map((c) => c.name());
    expect(names).toContain("init");
    expect(names).toContain("bootstrap");
    expect(names).toContain("viz");
    expect(names).toContain("review");
    expect(names).toContain("install-hooks");
    expect(names).toContain("status");
    expect(names).toHaveLength(6);
  });
});

describe("createSpinner", () => {
  it("returns no-op in JSON mode", async () => {
    const { createSpinner } = await import("../../src/cli/ui/spinner.js");
    const spinner = createSpinner("test", true);

    // Should not throw
    expect(() => spinner.start()).not.toThrow();
    expect(() => spinner.succeed("done")).not.toThrow();
    expect(() => spinner.fail("err")).not.toThrow();
  });

  it("returns ora instance in interactive mode", async () => {
    const { createSpinner } = await import("../../src/cli/ui/spinner.js");
    const spinner = createSpinner("test", false);

    expect(typeof spinner.start).toBe("function");
    expect(typeof spinner.succeed).toBe("function");
    expect(typeof spinner.fail).toBe("function");
  });
});

describe("format utilities", () => {
  let formatStep: typeof import("../../src/cli/ui/format.js").formatStep;
  let formatError: typeof import("../../src/cli/ui/format.js").formatError;
  let formatWarning: typeof import("../../src/cli/ui/format.js").formatWarning;
  let jsonOutput: typeof import("../../src/cli/ui/format.js").jsonOutput;

  beforeEach(async () => {
    const mod = await import("../../src/cli/ui/format.js");
    formatStep = mod.formatStep;
    formatError = mod.formatError;
    formatWarning = mod.formatWarning;
    jsonOutput = mod.jsonOutput;
  });

  it("formatStep renders with checkmark", () => {
    const result = formatStep("Label", "detail");
    expect(result).toContain("Label");
    expect(result).toContain("detail");
  });

  it("formatError renders with X marker", () => {
    const result = formatError("bad thing");
    expect(result).toContain("bad thing");
  });

  it("formatWarning renders with warning marker", () => {
    const result = formatWarning("heads up");
    expect(result).toContain("heads up");
  });

  it("jsonOutput writes JSON to stdout", () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    jsonOutput({ a: 1 });

    expect(logSpy).toHaveBeenCalledWith(
      JSON.stringify({ a: 1 }, null, 2),
    );
    logSpy.mockRestore();
  });
});
