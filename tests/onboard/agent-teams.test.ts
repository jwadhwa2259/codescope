import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

// Module under test
import {
  detectAgentTeamsOnboard,
  enableAgentTeams,
  isAgentTeamsEnabled,
  getAgentTeamsOnboardMessage,
} from "../../src/onboard/agent-teams.js";

describe("detectAgentTeamsOnboard", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "agent-teams-test-"));
    vi.stubEnv("CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS", "");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("returns 'already_enabled' with source 'env_var' when env var is '1'", () => {
    vi.stubEnv("CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS", "1");
    const result = detectAgentTeamsOnboard(tmpDir);
    expect(result.status).toBe("already_enabled");
    expect(result.source).toBe("env_var");
  });

  it("returns 'already_enabled' with source 'env_var' when env var is 'true'", () => {
    vi.stubEnv("CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS", "true");
    const result = detectAgentTeamsOnboard(tmpDir);
    expect(result.status).toBe("already_enabled");
    expect(result.source).toBe("env_var");
  });

  it("returns 'already_enabled' with source 'settings_json' when settings.json has the env var", () => {
    vi.stubEnv("CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS", "");
    const claudeDir = path.join(tmpDir, ".claude");
    fs.mkdirSync(claudeDir, { recursive: true });
    fs.writeFileSync(
      path.join(claudeDir, "settings.json"),
      JSON.stringify({
        env: { CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS: "1" },
      }),
    );
    const result = detectAgentTeamsOnboard(tmpDir);
    expect(result.status).toBe("already_enabled");
    expect(result.source).toBe("settings_json");
  });

  it("returns 'not_enabled' when neither env var nor settings.json has it", () => {
    vi.stubEnv("CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS", "");
    const result = detectAgentTeamsOnboard(tmpDir);
    expect(result.status).toBe("not_enabled");
    expect(result.source).toBeUndefined();
  });

  it("returns 'not_enabled' when settings.json exists but has no env key", () => {
    vi.stubEnv("CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS", "");
    const claudeDir = path.join(tmpDir, ".claude");
    fs.mkdirSync(claudeDir, { recursive: true });
    fs.writeFileSync(
      path.join(claudeDir, "settings.json"),
      JSON.stringify({ someOtherKey: true }),
    );
    const result = detectAgentTeamsOnboard(tmpDir);
    expect(result.status).toBe("not_enabled");
  });

  it("returns 'not_enabled' when settings.json is malformed", () => {
    vi.stubEnv("CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS", "");
    const claudeDir = path.join(tmpDir, ".claude");
    fs.mkdirSync(claudeDir, { recursive: true });
    fs.writeFileSync(path.join(claudeDir, "settings.json"), "not valid json{{{");
    const result = detectAgentTeamsOnboard(tmpDir);
    expect(result.status).toBe("not_enabled");
  });
});

describe("enableAgentTeams", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "agent-teams-enable-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("writes CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS to settings.json env object", () => {
    const result = enableAgentTeams(tmpDir);
    expect(result.success).toBe(true);
    expect(result.message).toContain("Agent teams enabled");

    const settingsPath = path.join(tmpDir, ".claude", "settings.json");
    const settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
    expect(settings.env.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS).toBe("1");
  });

  it("preserves existing settings.json keys when adding the env var", () => {
    const claudeDir = path.join(tmpDir, ".claude");
    fs.mkdirSync(claudeDir, { recursive: true });
    fs.writeFileSync(
      path.join(claudeDir, "settings.json"),
      JSON.stringify({ existingKey: "value", env: { OTHER_VAR: "hello" } }),
    );

    const result = enableAgentTeams(tmpDir);
    expect(result.success).toBe(true);

    const settingsPath = path.join(claudeDir, "settings.json");
    const settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
    expect(settings.existingKey).toBe("value");
    expect(settings.env.OTHER_VAR).toBe("hello");
    expect(settings.env.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS).toBe("1");
  });

  it("creates ~/.claude/ directory if it doesn't exist", () => {
    const claudeDir = path.join(tmpDir, ".claude");
    expect(fs.existsSync(claudeDir)).toBe(false);

    const result = enableAgentTeams(tmpDir);
    expect(result.success).toBe(true);
    expect(fs.existsSync(claudeDir)).toBe(true);
  });

  it("handles malformed settings.json gracefully (returns error)", () => {
    const claudeDir = path.join(tmpDir, ".claude");
    fs.mkdirSync(claudeDir, { recursive: true });
    fs.writeFileSync(path.join(claudeDir, "settings.json"), "not valid json{{{");

    const result = enableAgentTeams(tmpDir);
    expect(result.success).toBe(false);
    expect(result.message).toContain("Failed to parse");
  });

  it("creates settings.json from scratch when file does not exist", () => {
    const result = enableAgentTeams(tmpDir);
    expect(result.success).toBe(true);

    const settingsPath = path.join(tmpDir, ".claude", "settings.json");
    expect(fs.existsSync(settingsPath)).toBe(true);
    const settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
    expect(settings.env.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS).toBe("1");
  });
});

describe("isAgentTeamsEnabled", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "agent-teams-check-"));
    vi.stubEnv("CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS", "");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("returns true when env var is '1'", () => {
    vi.stubEnv("CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS", "1");
    expect(isAgentTeamsEnabled(tmpDir)).toBe(true);
  });

  it("returns true when env var is 'true'", () => {
    vi.stubEnv("CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS", "true");
    expect(isAgentTeamsEnabled(tmpDir)).toBe(true);
  });

  it("returns true when settings.json has it set to '1'", () => {
    vi.stubEnv("CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS", "");
    const claudeDir = path.join(tmpDir, ".claude");
    fs.mkdirSync(claudeDir, { recursive: true });
    fs.writeFileSync(
      path.join(claudeDir, "settings.json"),
      JSON.stringify({ env: { CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS: "1" } }),
    );
    expect(isAgentTeamsEnabled(tmpDir)).toBe(true);
  });

  it("returns false when neither env var nor settings.json has it", () => {
    vi.stubEnv("CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS", "");
    expect(isAgentTeamsEnabled(tmpDir)).toBe(false);
  });
});

describe("getAgentTeamsOnboardMessage", () => {
  it("returns correct message for 'already_enabled'", () => {
    const msg = getAgentTeamsOnboardMessage("already_enabled");
    expect(msg).toContain("already enabled");
    expect(msg).toContain("parallel execution");
  });

  it("returns correct message for 'not_enabled'", () => {
    const msg = getAgentTeamsOnboardMessage("not_enabled");
    expect(msg).toContain("Enable now?");
  });

  it("returns correct message for 'enabled'", () => {
    const msg = getAgentTeamsOnboardMessage("enabled");
    expect(msg).toContain("enabled");
    expect(msg).toContain("settings.json");
  });

  it("returns correct message for 'declined'", () => {
    const msg = getAgentTeamsOnboardMessage("declined");
    expect(msg).toContain("not enabled");
    expect(msg).toContain("sequentially");
  });
});
