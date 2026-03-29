import type { Command } from "commander";

export function registerInstallHooksCommand(program: Command): void {
  program
    .command("install-hooks")
    .description("Install pre-commit convention enforcement")
    .action(async () => {
      // Implemented in Task 3
      console.log("install-hooks: not yet implemented");
    });
}
