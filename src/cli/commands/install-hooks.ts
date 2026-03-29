import type { Command } from "commander";
import { formatStep, formatWarning } from "../ui/format.js";

/**
 * Register the `codescope install-hooks` subcommand.
 *
 * Uses dynamic import to avoid triggering the enforcement module's
 * auto-execution guard when bundled.
 */
export function registerInstallHooksCommand(program: Command): void {
  program
    .command("install-hooks")
    .description("Install pre-commit convention enforcement")
    .action(async () => {
      const projectRoot = process.cwd();

      try {
        const { installHooks } = await import(
          "../../enforcement/install-hooks.js"
        );
        const result = installHooks(projectRoot);

        if (result.installed) {
          console.log(
            formatStep(
              "Hooks installed",
              `Method: ${result.method}${result.backedUp ? " (existing hook backed up)" : ""}`,
            ),
          );
        } else {
          console.log(formatWarning(result.message));
        }
      } catch (err) {
        console.error(
          `Hook installation failed: ${err instanceof Error ? err.message : String(err)}`,
        );
        process.exit(1);
      }
    });
}
