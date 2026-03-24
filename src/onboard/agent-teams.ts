import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

export interface AgentTeamsDetectionResult {
  status: "already_enabled" | "not_enabled";
  source?: "env_var" | "settings_json";
}

export interface AgentTeamsEnableResult {
  success: boolean;
  message: string;
}

/**
 * Detect whether agent teams are enabled for parallel execution.
 *
 * Checks env var first (runtime override), then ~/.claude/settings.json.
 * Uses homeDir parameter for testability (defaults to os.homedir()).
 */
export function detectAgentTeamsOnboard(
  homeDir: string = os.homedir(),
): AgentTeamsDetectionResult {
  // Check env var first (runtime)
  const envVal = process.env.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS;
  if (envVal === "1" || envVal === "true") {
    return { status: "already_enabled", source: "env_var" };
  }

  // Check settings.json
  const settingsPath = path.join(homeDir, ".claude", "settings.json");
  if (fs.existsSync(settingsPath)) {
    try {
      const settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
      const env = settings?.env as Record<string, string> | undefined;
      if (env?.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS === "1") {
        return { status: "already_enabled", source: "settings_json" };
      }
    } catch {
      // Malformed JSON -- treat as not enabled
    }
  }

  return { status: "not_enabled" };
}

/**
 * Enable agent teams by writing CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS to settings.json.
 *
 * Creates ~/.claude/ directory and settings.json if they don't exist.
 * Preserves existing settings.json keys when adding the env var.
 * Uses homeDir parameter for testability (defaults to os.homedir()).
 */
export function enableAgentTeams(
  homeDir: string = os.homedir(),
): AgentTeamsEnableResult {
  const settingsPath = path.join(homeDir, ".claude", "settings.json");
  let settings: Record<string, unknown> = {};

  if (fs.existsSync(settingsPath)) {
    try {
      settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
    } catch {
      return {
        success: false,
        message: `Failed to parse ${settingsPath}`,
      };
    }
  }

  // Ensure env object exists
  const env = (settings.env as Record<string, string>) ?? {};
  env.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS = "1";
  settings.env = env;

  // Ensure directory exists
  const dir = path.dirname(settingsPath);
  try {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), "utf-8");
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : String(err);
    return {
      success: false,
      message: `Failed to write ${settingsPath}: ${message}`,
    };
  }

  return {
    success: true,
    message:
      "Agent teams enabled in `~/.claude/settings.json`. Orient will use parallel execution when the planner identifies independent tasks.",
  };
}

/**
 * Convenience check: are agent teams currently enabled?
 *
 * Returns true if the env var is '1'/'true' OR settings.json has it set to '1'.
 * Uses homeDir parameter for testability (defaults to os.homedir()).
 */
export function isAgentTeamsEnabled(
  homeDir: string = os.homedir(),
): boolean {
  const result = detectAgentTeamsOnboard(homeDir);
  return result.status === "already_enabled";
}

/**
 * Get the user-facing onboarding message for a given agent teams state.
 *
 * Messages match the UI-SPEC copy exactly (ONBD-06).
 */
export function getAgentTeamsOnboardMessage(
  status: "already_enabled" | "not_enabled" | "enabled" | "declined",
): string {
  switch (status) {
    case "already_enabled":
      return "Agent teams already enabled. Orient will use parallel execution when the planner identifies independent tasks.";
    case "not_enabled":
      return "Agent teams enable parallel execution during orient. Enable now? [Y/n]";
    case "enabled":
      return "Agent teams enabled in `~/.claude/settings.json`. Orient will use parallel execution when the planner identifies independent tasks.";
    case "declined":
      return "Agent teams not enabled. Orient will run sequentially. You can enable later via `/codescope:settings`.";
  }
}
