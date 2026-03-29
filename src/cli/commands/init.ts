import type { Command } from "commander";
import { detectProject } from "../../onboard/detect.js";
import { createDirectoryTree } from "../../onboard/filesystem.js";
import { writeConfig } from "../../config/writer.js";
import type { Config } from "../../config/schema.js";
import { runBootstrap } from "../../bootstrap/orchestrator.js";
import { wirePlugin } from "../setup/plugin-wiring.js";
import { createSpinner } from "../ui/spinner.js";
import {
  formatStep,
  formatWarning,
  jsonOutput,
} from "../ui/format.js";

/**
 * Register the `codescope init` subcommand.
 *
 * Flow: detect project -> confirm -> create config -> run bootstrap -> wire plugin -> summary
 */
export function registerInitCommand(program: Command): void {
  program
    .command("init")
    .description("Detect project, create config, run bootstrap, wire plugin")
    .option("--force", "Overwrite existing config and plugin setup")
    .option("--json", "Machine-readable JSON output (no colors, no prompts)")
    .action(async (options) => {
      const projectRoot = process.cwd();
      const jsonMode = options.json === true;
      const force = options.force === true;

      // Step 1 - Detect project
      const detectSpinner = createSpinner("Detecting project...", jsonMode);
      detectSpinner.start();

      let info;
      try {
        info = await detectProject(projectRoot);
      } catch (err) {
        detectSpinner.fail("Project detection failed");
        console.error(err instanceof Error ? err.message : String(err));
        process.exit(1);
        return;
      }
      detectSpinner.succeed(
        `Detected ${info.projectName} (${info.type}, ${info.languages.join(", ") || "unknown"})`,
      );

      // Step 2 - Show detection details and confirm
      if (!jsonMode) {
        console.log(`  Languages: ${info.languages.join(", ") || "none detected"}`);
        console.log(`  Type: ${info.type}`);
        if (info.services.length > 0) {
          console.log(
            `  Services: ${info.services.map((s) => s.name).join(", ")}`,
          );
        }

        const readline = await import("node:readline");
        const rl = readline.createInterface({
          input: process.stdin,
          output: process.stdout,
        });
        const answer = await new Promise<string>((resolve) =>
          rl.question("  Look right? [Y/n] ", resolve),
        );
        rl.close();
        if (answer.toLowerCase() === "n") {
          console.log("Aborted.");
          process.exit(0);
        }
      }

      // Step 3 - Create config
      const configSpinner = createSpinner("Creating config...", jsonMode);
      configSpinner.start();

      try {
        createDirectoryTree(projectRoot);

        const config: Config = {
          schema_version: 1,
          project: {
            name: info.projectName,
            type: info.type,
            languages:
              info.languages.length > 0 ? info.languages : ["typescript"],
            services:
              info.services.length > 0 ? info.services : undefined,
            build_command: info.buildCommand ?? undefined,
            test_command: info.testCommand ?? undefined,
            e2e_tool: info.e2eTool ?? undefined,
            e2e_command: info.e2eCommand ?? undefined,
          },
          agents: {
            researcher: { model: "sonnet" },
            convention_detector: { model: "haiku" },
            risk_analyzer: { model: "haiku" },
            learning_synthesizer: { model: "haiku" },
            eval_judge: { model: "sonnet" },
            debug: { model: "sonnet" },
          },
          orient: {
            verbosity: "brief",
            clarification: "auto",
            research_sources: ["web", "docs"],
            max_research_time: 120,
          },
          execute: {
            max_agents_concurrent: 3,
          },
          verify: {
            timeout_seconds: 300,
            tests: {
              unit: info.testCommand ?? undefined,
            },
            auto_smoke: true,
            static_check: true,
            blast_radius_diff: true,
          },
          eval: {
            mode: "auto-debug",
            auto_debug_max_cycles: 3,
            criteria: {
              scope_compliance: true,
              convention_adherence: true,
              completeness: true,
              correctness: true,
            },
          },
          conventions: {
            detection_threshold: 70,
            min_files: 3,
            strictness: "suggest-only",
            auto_confirm_high_confidence: false,
          },
          learning: {
            project_memory: true,
            global_memory: true,
            global_memory_path: "~/.codescope/global-memory.md",
            max_active_learnings: 50,
            confidence_decay: { gotchas: 90, decisions: 180 },
            auto_capture: true,
            capture_ignores: false,
          },
          bootstrap: {
            scaling: "auto",
            squad_threshold_loc: 50000,
            max_squads: 4,
          },
          display: {
            progress_reports: true,
            agent_activity: "minimal",
            eval_detail: "summary",
          },
        };

        writeConfig(projectRoot, config);
      } catch (err) {
        configSpinner.fail("Config creation failed");
        console.error(err instanceof Error ? err.message : String(err));
        process.exit(1);
        return;
      }
      configSpinner.succeed("Config created");

      // Step 4 - Run bootstrap
      const bootstrapSpinner = createSpinner("Running bootstrap...", jsonMode);
      bootstrapSpinner.start();

      let bootstrapResult;
      try {
        bootstrapResult = await runBootstrap({
          projectRoot,
          force: force,
          onProgress: (msg) => {
            bootstrapSpinner.text = msg;
          },
        });
      } catch (err) {
        bootstrapSpinner.fail("Bootstrap failed");
        console.error(err instanceof Error ? err.message : String(err));
        process.exit(1);
        return;
      }
      bootstrapSpinner.succeed(
        `Bootstrap complete -- Grade: ${bootstrapResult.readinessGrade} (${bootstrapResult.readinessPercent}%)`,
      );

      // Step 5 - Wire plugin
      const pluginSpinner = createSpinner(
        "Setting up Claude Code plugin...",
        jsonMode,
      );
      pluginSpinner.start();

      const wireResult = wirePlugin(projectRoot, force);

      if (wireResult.skipped) {
        if (pluginSpinner.warn) {
          pluginSpinner.warn(wireResult.message);
        } else {
          pluginSpinner.fail(wireResult.message);
          console.log(formatWarning(wireResult.message));
        }
      } else {
        pluginSpinner.succeed("Plugin configured");
      }

      // Step 6 - Show summary
      if (jsonMode) {
        jsonOutput({
          project: info,
          config: "created",
          bootstrap: {
            grade: bootstrapResult.readinessGrade,
            percent: bootstrapResult.readinessPercent,
          },
          plugin: wireResult,
        });
      } else {
        console.log("");
        console.log(
          formatStep(
            "Project detected",
            `${info.projectName} (${info.type}, ${info.languages.join(", ")})`,
          ),
        );
        console.log(
          formatStep("Config created", ".claude/codescope/config.yml"),
        );
        console.log(
          formatStep(
            "Bootstrap complete",
            `Grade: ${bootstrapResult.readinessGrade} (${bootstrapResult.readinessPercent}%)`,
          ),
        );
        console.log(
          formatStep(
            "Plugin configured",
            wireResult.files.join(", ") || wireResult.message,
          ),
        );
        console.log("");
        console.log("  CodeScope is ready! Try:");
        console.log(
          '    claude "Explain the architecture of this project"',
        );
        console.log("");
      }
    });
}
