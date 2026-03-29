import type { Command } from "commander";
import { createSpinner } from "../ui/spinner.js";
import { jsonOutput } from "../ui/format.js";

/**
 * Register the `codescope bootstrap` subcommand.
 *
 * Thin wrapper around the existing runBootstrap function.
 * Uses dynamic import to keep heavy deps out of the CLI bundle.
 */
export function registerBootstrapCommand(program: Command): void {
  program
    .command("bootstrap")
    .description("Run or re-run codebase analysis")
    .option("--force", "Force full re-analysis (ignores incremental)")
    .option("--json", "Machine-readable JSON output")
    .action(async (options) => {
      const projectRoot = process.cwd();
      const jsonMode = options.json === true;

      const spinner = createSpinner("Running bootstrap...", jsonMode);
      spinner.start();

      try {
        const { runBootstrap } = await import(
          "../../bootstrap/orchestrator.js"
        );
        const result = await runBootstrap({
          projectRoot,
          force: options.force ?? false,
          onProgress: (msg: string) => {
            spinner.text = msg;
          },
        });

        spinner.succeed(
          `Bootstrap complete -- Grade: ${result.readinessGrade} (${result.readinessPercent}%)`,
        );

        if (jsonMode) {
          jsonOutput(result);
        }
      } catch (err) {
        spinner.fail("Bootstrap failed");
        console.error(err instanceof Error ? err.message : String(err));
        process.exit(1);
      }
    });
}
