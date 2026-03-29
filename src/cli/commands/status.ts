import type { Command } from "commander";

export function registerStatusCommand(program: Command): void {
  program
    .command("status")
    .description("Show CodeScope health and readiness")
    .option("--json", "Machine-readable JSON output")
    .action(async (_options) => {
      // Implemented in Task 3
      console.log("status: not yet implemented");
    });
}
