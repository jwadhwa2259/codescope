import type { Command } from "commander";

export function registerBootstrapCommand(program: Command): void {
  program
    .command("bootstrap")
    .description("Run or re-run codebase analysis")
    .option("--force", "Force full re-analysis (ignores incremental)")
    .option("--json", "Machine-readable JSON output")
    .action(async (_options) => {
      // Implemented in Task 3
      console.log("bootstrap: not yet implemented");
    });
}
