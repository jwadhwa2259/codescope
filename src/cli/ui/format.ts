import chalk from "chalk";

/**
 * Format a completed step with a green checkmark.
 */
export function formatStep(label: string, detail: string): string {
  return `${chalk.green("\u2713")} ${chalk.bold(label)}  ${chalk.dim(detail)}`;
}

/**
 * Format an error message with a red X marker.
 */
export function formatError(msg: string): string {
  return `${chalk.red("\u2717")} ${msg}`;
}

/**
 * Format a warning message with a yellow marker.
 */
export function formatWarning(msg: string): string {
  return `${chalk.yellow("\u26A0")} ${msg}`;
}

/**
 * Render a key-value summary table.
 */
export function formatSummary(
  data: Record<string, string | number>,
): string {
  const maxKeyLen = Math.max(...Object.keys(data).map((k) => k.length));
  return Object.entries(data)
    .map(
      ([key, value]) =>
        `  ${chalk.dim(key.padEnd(maxKeyLen + 2))}${chalk.white(String(value))}`,
    )
    .join("\n");
}

/**
 * Write JSON to stdout (used when --json flag is set).
 */
export function jsonOutput(data: unknown): void {
  console.log(JSON.stringify(data, null, 2));
}

/**
 * Format the main help one-liner per subcommand.
 */
export function formatSubcommandHelp(
  commands: Array<{ name: string; desc: string }>,
): string {
  const maxNameLen = Math.max(...commands.map((c) => c.name.length));
  return commands
    .map(
      (c) =>
        `  ${chalk.cyan(c.name.padEnd(maxNameLen + 2))}${chalk.dim(c.desc)}`,
    )
    .join("\n");
}
