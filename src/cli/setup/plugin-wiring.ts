import * as fs from "node:fs";
import * as path from "node:path";
import { execFileSync } from "node:child_process";

export interface WireResult {
  created: boolean;
  skipped: boolean;
  message: string;
  files: string[];
}

const PLUGIN_JSON = {
  name: "codescope",
  version: "0.1.0",
  description:
    "Deep codebase analysis for AI-powered code changes that respect existing conventions and stay within safe blast radius",
  skills: [
    { name: "onboard", path: "skills/onboard/SKILL.md" },
    { name: "bootstrap", path: "skills/bootstrap/SKILL.md" },
    { name: "orient", path: "skills/orient/SKILL.md" },
    { name: "settings", path: "skills/settings/SKILL.md" },
    { name: "review-learnings", path: "skills/review-learnings/SKILL.md" },
    { name: "review", path: "skills/review/SKILL.md" },
    { name: "pause", path: "skills/pause/SKILL.md" },
    { name: "resume", path: "skills/resume/SKILL.md" },
    { name: "viz", path: "skills/viz/SKILL.md" },
  ],
  hooks: "./hooks/hooks.json",
};

const MCP_JSON = {
  mcpServers: {
    codescope: {
      command: "node",
      args: ["${CLAUDE_PLUGIN_ROOT}/dist/server.js"],
      env: {
        CODESCOPE_GRAMMAR_DIR: "${CLAUDE_PLUGIN_ROOT}/grammars",
      },
    },
  },
};

const HOOKS_JSON = {
  description: "CodeScope: codebase context injection and session continuity",
  hooks: {
    PreToolUse: [
      {
        matcher: "Edit|Write",
        hooks: [
          {
            type: "command",
            command:
              'node "${CLAUDE_PLUGIN_ROOT}/dist/hooks/pre-tool-use.mjs"',
            timeout: 5,
          },
        ],
      },
    ],
    PostToolUse: [
      {
        matcher: "Edit|Write",
        hooks: [
          {
            type: "command",
            command:
              'node "${CLAUDE_PLUGIN_ROOT}/dist/hooks/post-tool-use.mjs"',
            timeout: 10,
          },
        ],
      },
    ],
    PreCompact: [
      {
        matcher: "manual|auto",
        hooks: [
          {
            type: "command",
            command:
              'node "${CLAUDE_PLUGIN_ROOT}/dist/hooks/pre-compact.mjs"',
            timeout: 10,
          },
        ],
      },
    ],
    SessionStart: [
      {
        matcher: "resume|compact",
        hooks: [
          {
            type: "command",
            command:
              'node "${CLAUDE_PLUGIN_ROOT}/dist/hooks/session-start.mjs"',
            timeout: 5,
          },
        ],
      },
    ],
  },
};

/**
 * Generate Claude Code plugin configuration files for the target project.
 *
 * Creates .claude-plugin/plugin.json, .mcp.json, and hooks/hooks.json.
 * Skips if .claude-plugin/ already exists (unless force=true).
 * Skips if Claude Code CLI is not detected.
 */
export function wirePlugin(projectRoot: string, force: boolean): WireResult {
  const pluginDir = path.join(projectRoot, ".claude-plugin");

  // Skip if already configured and not forcing
  if (fs.existsSync(pluginDir) && !force) {
    return {
      created: false,
      skipped: true,
      message:
        "Plugin already configured. Run `codescope init --force` to regenerate.",
      files: [],
    };
  }

  // Check if Claude Code is available
  try {
    execFileSync("claude", ["--version"], {
      timeout: 5000,
      stdio: "pipe",
    });
  } catch {
    return {
      created: false,
      skipped: true,
      message:
        "Claude Code not detected. Plugin setup skipped. Install Claude Code and re-run `codescope init`.",
      files: [],
    };
  }

  // Create .claude-plugin/ directory
  fs.mkdirSync(pluginDir, { recursive: true });

  // Write .claude-plugin/plugin.json
  const pluginJsonPath = path.join(pluginDir, "plugin.json");
  fs.writeFileSync(
    pluginJsonPath,
    JSON.stringify(PLUGIN_JSON, null, 2) + "\n",
    "utf-8",
  );

  // Write .mcp.json at project root
  const mcpJsonPath = path.join(projectRoot, ".mcp.json");
  fs.writeFileSync(
    mcpJsonPath,
    JSON.stringify(MCP_JSON, null, 2) + "\n",
    "utf-8",
  );

  // Create hooks/ directory and write hooks.json
  const hooksDir = path.join(projectRoot, "hooks");
  fs.mkdirSync(hooksDir, { recursive: true });
  const hooksJsonPath = path.join(hooksDir, "hooks.json");
  fs.writeFileSync(
    hooksJsonPath,
    JSON.stringify(HOOKS_JSON, null, 2) + "\n",
    "utf-8",
  );

  return {
    created: true,
    skipped: false,
    message: "Plugin configured successfully",
    files: [".claude-plugin/plugin.json", ".mcp.json", "hooks/hooks.json"],
  };
}
