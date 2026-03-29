import type { Command } from "commander";

export function registerVizCommand(program: Command): void {
  program
    .command("viz")
    .description("Launch visualization dashboard")
    .option("-p, --port <number>", "Port number", "7463")
    .option("--no-open", "Do not open browser automatically")
    .action(async (_options) => {
      // Implemented in Task 3
      console.log("viz: not yet implemented");
    });
}
