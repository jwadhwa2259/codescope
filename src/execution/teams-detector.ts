// ---------------------------------------------------------------------------
// Agent teams availability detection
// Per D-42, D-43: check env var and settings.json for agent teams flag.
// ---------------------------------------------------------------------------

import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import type { TeamsAvailability } from "./types.js";

/**
 * Detect whether the Claude Code agent teams feature is available.
 * Checks `process.env.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS`.
 *
 * @returns TeamsAvailability with available flag and reason
 */
export function detectAgentTeams(): TeamsAvailability {
  const envVar = process.env.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS;
  if (envVar === "1" || envVar === "true") {
    return { available: true, reason: "env_var_set" };
  }
  return { available: false, reason: "env_var_missing" };
}

/**
 * Check if agent teams is enabled from any source (env var or settings.json).
 * Env var takes precedence (runtime override).
 *
 * @returns true if agent teams is enabled from any source
 */
export function isAgentTeamsEnabled(): boolean {
  // Check env var first (runtime override)
  const envVar = process.env.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS;
  if (envVar === "1" || envVar === "true") {
    return true;
  }

  // Check ~/.claude/settings.json
  try {
    const settingsPath = path.join(os.homedir(), ".claude", "settings.json");
    if (fs.existsSync(settingsPath)) {
      const settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
      const env = settings.env as Record<string, string> | undefined;
      return env?.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS === "1";
    }
  } catch {
    // Parse error or file access error -- gracefully return false
    return false;
  }

  return false;
}

/**
 * Enable agent teams by writing the flag to ~/.claude/settings.json.
 * Creates the directory and file if they don't exist.
 * Preserves existing settings.
 *
 * @returns Object with success flag and human-readable message
 */
export function enableAgentTeams(): { success: boolean; message: string } {
  const settingsPath = path.join(os.homedir(), ".claude", "settings.json");
  let settings: Record<string, unknown> = {};

  if (fs.existsSync(settingsPath)) {
    try {
      settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
    } catch {
      return {
        success: false,
        message: "Failed to parse ~/.claude/settings.json",
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
  } catch (err) {
    return {
      success: false,
      message: `Failed to write settings: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  return {
    success: true,
    message: "Agent teams enabled in ~/.claude/settings.json",
  };
}
