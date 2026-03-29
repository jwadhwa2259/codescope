import type { Command } from "commander";

/**
 * Register the `codescope viz` subcommand.
 *
 * Launches the visualization dashboard and optionally opens the browser.
 */
export function registerVizCommand(program: Command): void {
  program
    .command("viz")
    .description("Launch visualization dashboard")
    .option("-p, --port <number>", "Port number", "7463")
    .option("--no-open", "Do not open browser automatically")
    .action(async (options) => {
      const port = parseInt(options.port, 10);

      const { startDashboard } = await import(
        "../../dashboard/server.js"
      );
      startDashboard(port);

      if (options.open !== false) {
        const open = (await import("open")).default;
        await open(`http://localhost:${port}`);
      }

      console.log(`Dashboard running at http://localhost:${port}`);
    });
}
