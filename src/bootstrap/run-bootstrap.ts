#!/usr/bin/env node
// ---------------------------------------------------------------------------
// CLI entry point for the bootstrap pipeline.
// Called by the skill body via: node --import tsx/esm src/bootstrap/run-bootstrap.ts
//
// Runs the full bootstrap pipeline: service discovery, per-service analysis
// squads, cross-service synthesis, and AI readiness scoring. Outputs the
// BootstrapResult as JSON to stdout.
//
// NOTE: The --force flag triggers a full re-bootstrap. The skill body handles
// user confirmation before invoking this CLI, so onConfirm auto-confirms.
// ---------------------------------------------------------------------------

import { runBootstrap } from "./orchestrator.js";
import type { BootstrapResult, ForceConfirmation } from "./orchestrator.js";

// ---------------------------------------------------------------------------
// Argument parsing
// ---------------------------------------------------------------------------

function parseArgs(): Record<string, string | boolean> {
  const args: Record<string, string | boolean> = {};
  const argv = process.argv.slice(2);

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--force") {
      args.force = true;
    } else if (arg.startsWith("--") && i + 1 < argv.length) {
      const key = arg.slice(2).replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
      args[key] = argv[++i];
    }
  }

  return args;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const args = parseArgs();

  const projectRoot = (args.projectRoot as string) || process.cwd();
  const force = args.force === true;

  try {
    const result: BootstrapResult = await runBootstrap({
      projectRoot,
      force,
      onProgress: (message: string) => {
        // Write progress to stderr so JSON output on stdout stays clean
        process.stderr.write(`${message}\n`);
      },
      onConfirm: async (_confirmation: ForceConfirmation) => {
        // Auto-confirm: the skill body handles user confirmation before
        // invoking this CLI, so we always proceed here.
        return true;
      },
    });

    console.log(JSON.stringify(result));
    process.exit(0);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(JSON.stringify({ error: message }));
    process.exit(1);
  }
}

main();
