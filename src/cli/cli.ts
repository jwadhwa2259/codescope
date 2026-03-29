// Node version gate -- CodeScope requires Node.js >= 22
const nodeMajor = parseInt(process.versions.node.split(".")[0], 10);
if (nodeMajor < 22) {
  process.stderr.write(
    `\nCodeScope requires Node.js >= 22.0.0\nCurrent version: ${process.version}\nInstall the latest LTS: https://nodejs.org\n\n`,
  );
  process.exit(1);
}

import { ensureNativeBindings } from "./native-loader.js";

ensureNativeBindings();

import { Command } from "commander";
import { registerInitCommand } from "./commands/init.js";
import { registerBootstrapCommand } from "./commands/bootstrap.js";
import { registerVizCommand } from "./commands/viz.js";
import { registerReviewCommand } from "./commands/review.js";
import { registerInstallHooksCommand } from "./commands/install-hooks.js";
import { registerStatusCommand } from "./commands/status.js";

const program = new Command();

program
  .name("codescope")
  .version("0.1.0")
  .description("AI-powered codebase analysis for Claude Code");

registerInitCommand(program);
registerBootstrapCommand(program);
registerVizCommand(program);
registerReviewCommand(program);
registerInstallHooksCommand(program);
registerStatusCommand(program);

program.parse();
