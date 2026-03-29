import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

// Mock child_process before importing wirePlugin
vi.mock("node:child_process", () => ({
  execFileSync: vi.fn(),
}));

import { wirePlugin } from "../../src/cli/setup/plugin-wiring.js";
import { execFileSync } from "node:child_process";

const mockedExecFileSync = vi.mocked(execFileSync);

describe("wirePlugin", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "codescope-wire-"));
    vi.clearAllMocks();
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("skips when .claude-plugin exists and force=false", () => {
    fs.mkdirSync(path.join(tempDir, ".claude-plugin"), { recursive: true });

    const result = wirePlugin(tempDir, false);

    expect(result.skipped).toBe(true);
    expect(result.created).toBe(false);
    expect(result.message).toContain("already configured");
  });

  it("creates plugin.json with correct structure when .claude-plugin absent", () => {
    mockedExecFileSync.mockReturnValue(Buffer.from("1.0.0"));

    const result = wirePlugin(tempDir, false);

    expect(result.created).toBe(true);
    expect(result.skipped).toBe(false);

    const pluginJsonPath = path.join(tempDir, ".claude-plugin", "plugin.json");
    expect(fs.existsSync(pluginJsonPath)).toBe(true);

    const pluginJson = JSON.parse(fs.readFileSync(pluginJsonPath, "utf-8"));
    expect(pluginJson.name).toBe("codescope");
    expect(pluginJson.skills).toHaveLength(9);
    expect(pluginJson.hooks).toBe("./hooks/hooks.json");
  });

  it("generates .mcp.json with CLAUDE_PLUGIN_ROOT variable", () => {
    mockedExecFileSync.mockReturnValue(Buffer.from("1.0.0"));

    wirePlugin(tempDir, false);

    const mcpJsonPath = path.join(tempDir, ".mcp.json");
    expect(fs.existsSync(mcpJsonPath)).toBe(true);

    const content = fs.readFileSync(mcpJsonPath, "utf-8");
    expect(content).toContain("${CLAUDE_PLUGIN_ROOT}");

    const mcpJson = JSON.parse(content);
    expect(mcpJson.mcpServers.codescope.command).toBe("node");
    expect(mcpJson.mcpServers.codescope.args[0]).toContain(
      "${CLAUDE_PLUGIN_ROOT}",
    );
  });

  it("with force=true overwrites existing .claude-plugin", () => {
    const pluginDir = path.join(tempDir, ".claude-plugin");
    fs.mkdirSync(pluginDir, { recursive: true });
    fs.writeFileSync(
      path.join(pluginDir, "plugin.json"),
      JSON.stringify({ old: true }),
      "utf-8",
    );

    mockedExecFileSync.mockReturnValue(Buffer.from("1.0.0"));

    const result = wirePlugin(tempDir, true);

    expect(result.created).toBe(true);
    expect(result.skipped).toBe(false);

    const pluginJson = JSON.parse(
      fs.readFileSync(path.join(pluginDir, "plugin.json"), "utf-8"),
    );
    expect(pluginJson.name).toBe("codescope");
    expect(pluginJson).not.toHaveProperty("old");
  });

  it("returns skipped when claude CLI not found", () => {
    mockedExecFileSync.mockImplementation(() => {
      throw new Error("ENOENT");
    });

    const result = wirePlugin(tempDir, false);

    expect(result.skipped).toBe(true);
    expect(result.created).toBe(false);
    expect(result.message).toContain("Claude Code not detected");
  });

  it("generates hooks/hooks.json with correct hook structure", () => {
    mockedExecFileSync.mockReturnValue(Buffer.from("1.0.0"));

    wirePlugin(tempDir, false);

    const hooksJsonPath = path.join(tempDir, "hooks", "hooks.json");
    expect(fs.existsSync(hooksJsonPath)).toBe(true);

    const hooksJson = JSON.parse(fs.readFileSync(hooksJsonPath, "utf-8"));
    expect(hooksJson.hooks.PreToolUse).toBeDefined();
    expect(hooksJson.hooks.PostToolUse).toBeDefined();
    expect(hooksJson.hooks.PreCompact).toBeDefined();
    expect(hooksJson.hooks.SessionStart).toBeDefined();
  });
});
