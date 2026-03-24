import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

describe("detectAgentTeams", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns { available: true, reason: 'env_var_set' } when env var is '1'", async () => {
    vi.stubEnv("CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS", "1");
    // Dynamic import to pick up the stubbed env
    const { detectAgentTeams } = await import(
      "../../src/execution/teams-detector.js"
    );
    const result = detectAgentTeams();
    expect(result).toEqual({ available: true, reason: "env_var_set" });
  });

  it("returns { available: true, reason: 'env_var_set' } when env var is 'true'", async () => {
    vi.stubEnv("CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS", "true");
    const { detectAgentTeams } = await import(
      "../../src/execution/teams-detector.js"
    );
    const result = detectAgentTeams();
    expect(result).toEqual({ available: true, reason: "env_var_set" });
  });

  it("returns { available: false, reason: 'env_var_missing' } when env var not set", async () => {
    vi.stubEnv("CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS", "");
    const { detectAgentTeams } = await import(
      "../../src/execution/teams-detector.js"
    );
    const result = detectAgentTeams();
    expect(result).toEqual({ available: false, reason: "env_var_missing" });
  });
});

describe("isAgentTeamsEnabled", () => {
  let tmpHome: string;
  const originalHome = os.homedir();

  beforeEach(() => {
    vi.unstubAllEnvs();
    tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), "teams-test-"));
    // Stub HOME so os.homedir() returns our tmp dir
    vi.stubEnv("HOME", tmpHome);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    fs.rmSync(tmpHome, { recursive: true, force: true });
  });

  it("returns true when env var is set to '1'", async () => {
    vi.stubEnv("CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS", "1");
    const { isAgentTeamsEnabled } = await import(
      "../../src/execution/teams-detector.js"
    );
    expect(isAgentTeamsEnabled()).toBe(true);
  });

  it("returns true when settings.json has the flag", async () => {
    vi.stubEnv("CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS", "");
    const claudeDir = path.join(tmpHome, ".claude");
    fs.mkdirSync(claudeDir, { recursive: true });
    fs.writeFileSync(
      path.join(claudeDir, "settings.json"),
      JSON.stringify({
        env: { CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS: "1" },
      }),
    );
    const { isAgentTeamsEnabled } = await import(
      "../../src/execution/teams-detector.js"
    );
    expect(isAgentTeamsEnabled()).toBe(true);
  });

  it("returns false when neither env var nor settings.json has the flag", async () => {
    vi.stubEnv("CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS", "");
    const { isAgentTeamsEnabled } = await import(
      "../../src/execution/teams-detector.js"
    );
    expect(isAgentTeamsEnabled()).toBe(false);
  });

  it("returns false when settings.json does not exist", async () => {
    vi.stubEnv("CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS", "");
    const { isAgentTeamsEnabled } = await import(
      "../../src/execution/teams-detector.js"
    );
    expect(isAgentTeamsEnabled()).toBe(false);
  });

  it("returns false when settings.json is malformed", async () => {
    vi.stubEnv("CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS", "");
    const claudeDir = path.join(tmpHome, ".claude");
    fs.mkdirSync(claudeDir, { recursive: true });
    fs.writeFileSync(
      path.join(claudeDir, "settings.json"),
      "not-valid-json{{{",
    );
    const { isAgentTeamsEnabled } = await import(
      "../../src/execution/teams-detector.js"
    );
    expect(isAgentTeamsEnabled()).toBe(false);
  });
});

describe("enableAgentTeams", () => {
  let tmpHome: string;

  beforeEach(() => {
    vi.unstubAllEnvs();
    tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), "teams-enable-test-"));
    vi.stubEnv("HOME", tmpHome);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    fs.rmSync(tmpHome, { recursive: true, force: true });
  });

  it("creates settings.json with agent teams flag when file does not exist", async () => {
    const { enableAgentTeams } = await import(
      "../../src/execution/teams-detector.js"
    );
    const result = enableAgentTeams();
    expect(result.success).toBe(true);

    const settingsPath = path.join(tmpHome, ".claude", "settings.json");
    const settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
    expect(settings.env.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS).toBe("1");
  });

  it("preserves existing settings when adding agent teams flag", async () => {
    const claudeDir = path.join(tmpHome, ".claude");
    fs.mkdirSync(claudeDir, { recursive: true });
    fs.writeFileSync(
      path.join(claudeDir, "settings.json"),
      JSON.stringify({ theme: "dark", env: { OTHER_VAR: "value" } }),
    );

    const { enableAgentTeams } = await import(
      "../../src/execution/teams-detector.js"
    );
    const result = enableAgentTeams();
    expect(result.success).toBe(true);

    const settingsPath = path.join(claudeDir, "settings.json");
    const settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
    expect(settings.theme).toBe("dark");
    expect(settings.env.OTHER_VAR).toBe("value");
    expect(settings.env.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS).toBe("1");
  });
});
