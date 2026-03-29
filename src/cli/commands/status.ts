import * as fs from "node:fs";
import * as path from "node:path";
import type { Command } from "commander";
import chalk from "chalk";
import { configExists, loadConfig } from "../../config/loader.js";
import { readBootstrapMeta } from "../../bootstrap/meta.js";
import { getGraphDbPath } from "../../utils/paths.js";
import { jsonOutput } from "../ui/format.js";

/**
 * Format a duration in milliseconds to a human-readable "X ago" string.
 */
function timeAgo(isoDate: string): string {
  const diff = Date.now() - new Date(isoDate).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

/**
 * Register the `codescope status` subcommand.
 *
 * Full health diagnostic: config, bootstrap, readiness, hooks, dashboard, plugin.
 */
export function registerStatusCommand(program: Command): void {
  program
    .command("status")
    .description("Show CodeScope health and readiness")
    .option("--json", "Machine-readable JSON output")
    .action(async (options) => {
      const projectRoot = process.cwd();
      const jsonMode = options.json === true;

      // Config check
      const hasConfig = configExists(projectRoot);
      let configName: string | undefined;
      if (hasConfig) {
        try {
          const cfg = loadConfig(projectRoot);
          configName = cfg?.project?.name;
        } catch {
          configName = undefined;
        }
      }

      // Bootstrap meta
      const meta = readBootstrapMeta(projectRoot);
      const bootstrapInfo = meta
        ? { lastRun: timeAgo(meta.last_bootstrap), mode: meta.mode }
        : null;

      // Readiness score
      let readinessGrade: string | null = null;
      let readinessPercent: number | null = null;
      try {
        const dbPath = getGraphDbPath(projectRoot);
        if (fs.existsSync(dbPath)) {
          const { openDatabase, closeDatabase } = await import(
            "../../graph/database.js"
          );
          const { getLatestSnapshot } = await import(
            "../../graph/readiness-history.js"
          );
          const db = openDatabase(dbPath);
          try {
            const snapshot = getLatestSnapshot(db);
            if (snapshot) {
              readinessGrade = snapshot.overall_grade;
              readinessPercent = snapshot.overall_percent;
            }
          } finally {
            closeDatabase(db);
          }
        }
      } catch {
        // Database not available -- readiness unknown
      }

      // Hooks check
      let hooksStatus = "Not installed";
      const huskyPreCommit = path.join(projectRoot, ".husky", "pre-commit");
      const gitPreCommit = path.join(projectRoot, ".git", "hooks", "pre-commit");
      try {
        if (fs.existsSync(huskyPreCommit)) {
          const content = fs.readFileSync(huskyPreCommit, "utf-8");
          if (content.includes("codescope")) {
            hooksStatus = "Installed (husky)";
          }
        } else if (fs.existsSync(gitPreCommit)) {
          const content = fs.readFileSync(gitPreCommit, "utf-8");
          if (content.includes("codescope")) {
            hooksStatus = "Installed (git-hooks)";
          }
        }
      } catch {
        // Cannot read hooks
      }

      // Dashboard check
      let dashboardStatus = "Not running";
      try {
        const response = await fetch("http://localhost:7463/api/status", {
          signal: AbortSignal.timeout(2000),
        });
        if (response.ok) {
          dashboardStatus = "Running on port 7463";
        }
      } catch {
        // Not running
      }

      // Plugin config check
      const pluginJsonPath = path.join(
        projectRoot,
        ".claude-plugin",
        "plugin.json",
      );
      const pluginConfigured = fs.existsSync(pluginJsonPath);

      // Output
      const statusData = {
        config: hasConfig
          ? { status: "loaded", name: configName }
          : { status: "not found" },
        bootstrap: bootstrapInfo
          ? {
              status: "completed",
              lastRun: bootstrapInfo.lastRun,
              mode: bootstrapInfo.mode,
            }
          : { status: "not bootstrapped" },
        readiness:
          readinessGrade !== null
            ? {
                grade: readinessGrade,
                percent: readinessPercent,
              }
            : { status: "unknown" },
        hooks: hooksStatus,
        dashboard: dashboardStatus,
        plugin: pluginConfigured ? "Configured" : "Not configured",
      };

      if (jsonMode) {
        jsonOutput(statusData);
        return;
      }

      const ok = chalk.green("\u2713");
      const no = chalk.red("\u2717");

      console.log("");
      console.log(chalk.bold("CodeScope Status"));
      console.log(chalk.dim("\u2500".repeat(40)));
      console.log(
        `  Config:     ${hasConfig ? `${ok} Loaded (.claude/codescope/config.yml)` : `${no} Not found`}`,
      );
      console.log(
        `  Bootstrap:  ${bootstrapInfo ? `${ok} Last run ${bootstrapInfo.lastRun} (${bootstrapInfo.mode})` : `${no} Not bootstrapped`}`,
      );
      console.log(
        `  Readiness:  ${readinessGrade !== null ? `${readinessGrade} (${readinessPercent}%)` : "Unknown"}`,
      );
      console.log(
        `  Hooks:      ${hooksStatus.startsWith("Installed") ? `${ok} ${hooksStatus}` : `${no} ${hooksStatus}`}`,
      );
      console.log(
        `  Dashboard:  ${dashboardStatus.startsWith("Running") ? `${ok} ${dashboardStatus}` : `${no} ${dashboardStatus}`}`,
      );
      console.log(
        `  Plugin:     ${pluginConfigured ? `${ok} Configured` : `${no} Not configured`}`,
      );
      console.log("");
    });
}
