import type { Command } from "commander";
import { execSync } from "node:child_process";
import { jsonOutput, formatStep, formatWarning } from "../ui/format.js";

/**
 * Register the `codescope review` subcommand.
 *
 * The full review analysis is available as an MCP tool (codescope_review)
 * that runs within Claude Code context. This CLI command shows what would
 * be reviewed and directs users to the Claude Code skill.
 */
export function registerReviewCommand(program: Command): void {
  program
    .command("review")
    .description("Review changes against codebase conventions")
    .argument(
      "[target]",
      "Branch name, PR number, or omit for working tree diff",
    )
    .option("--json", "Machine-readable JSON output")
    .action(async (target, options) => {
      const jsonMode = options.json === true;

      let changedFiles: string[] = [];
      try {
        const diffCmd = target
          ? `git diff --name-only ${target}`
          : "git diff --name-only";
        const output = execSync(diffCmd, {
          encoding: "utf-8",
          timeout: 10000,
        }).trim();
        changedFiles = output ? output.split("\n") : [];
      } catch {
        changedFiles = [];
      }

      if (jsonMode) {
        jsonOutput({
          target: target ?? "working tree",
          changedFiles,
          hint: `Run: claude "/codescope:review ${target ?? ""}"`,
        });
        return;
      }

      if (changedFiles.length > 0) {
        console.log(
          formatStep(
            "Changed files",
            `${changedFiles.length} file(s) to review`,
          ),
        );
        for (const f of changedFiles.slice(0, 20)) {
          console.log(`  ${f}`);
        }
        if (changedFiles.length > 20) {
          console.log(`  ... and ${changedFiles.length - 20} more`);
        }
        console.log("");
      } else {
        console.log(formatWarning("No changes detected"));
        console.log("");
      }

      console.log(
        "  Review is available as a Claude Code skill. Run:",
      );
      console.log(
        `    claude "/codescope:review ${target ?? ""}"`,
      );
      console.log("");
    });
}
