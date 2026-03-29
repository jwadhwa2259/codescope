import type { Command } from "commander";

export function registerReviewCommand(program: Command): void {
  program
    .command("review")
    .description("Review changes against codebase conventions")
    .argument("[target]", "Branch name, PR number, or omit for working tree diff")
    .option("--json", "Machine-readable JSON output")
    .action(async (_target, _options) => {
      // Implemented in Task 3
      console.log("review: not yet implemented");
    });
}
