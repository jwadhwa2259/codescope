import type { Command } from "commander";

export function registerInitCommand(program: Command): void {
  program
    .command("init")
    .description("Detect project, create config, run bootstrap, wire plugin")
    .option("--force", "Overwrite existing config and plugin setup")
    .option("--json", "Machine-readable JSON output (no colors, no prompts)")
    .action(async (_options) => {
      // Implemented in Task 2
      console.log("init: not yet implemented");
    });
}
