# Phase 15: Distribution - Research

**Researched:** 2026-03-29
**Domain:** CLI tooling, npm package distribution, cross-platform native addon packaging, Claude Code plugin auto-setup
**Confidence:** HIGH

## Summary

Phase 15 wraps CodeScope into a distributable npm package with a CLI entry point (`npx codescope init` and subcommands) and automatic Claude Code plugin wiring. The research covers four domains: (1) CLI framework selection and terminal UX libraries, (2) npm package structure with `bin` entry for ESM, (3) cross-platform distribution of better-sqlite3 native binaries via the `optionalDependencies` pattern, and (4) Claude Code plugin auto-setup mechanics.

The core implementation is largely thin wrappers over existing code. `detectProject()`, `writeConfig()`, `runBootstrap()`, `startDashboard()`, `runPreCommitCheck()`, and the readiness/status tool logic all exist. The CLI layer is glue code with progress UX. The cross-platform packaging (DIST-04) is the technically deepest task, requiring creation and publishing of scoped platform-specific packages containing better-sqlite3 `.node` binaries, following the esbuild/swc `optionalDependencies` + `os`/`cpu` field pattern.

**Primary recommendation:** Use commander@14 for CLI parsing (CJS but fully importable from ESM, 35M weekly downloads, minimal API), ora@9 for spinners (pure ESM, Node >=20), and chalk@5 for colors (pure ESM). Build the CLI entry as a new tsdown entry point (`src/cli/index.ts`) that compiles to `dist/cli.mjs` with a hashbang. The `optionalDependencies` pattern requires creating stub packages `@codescope/better-sqlite3-darwin-arm64`, `-darwin-x64`, `-linux-x64`, `-win32-x64` that each contain only the prebuilt `.node` binary for their platform, with `os` and `cpu` fields for npm filtering.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Auto-detect everything (project type, language, monorepo, frameworks) using existing `src/onboard/detect.ts` logic, show what was found, single confirmation ("Look right? [Y/n]"), then run bootstrap and show summary. No multi-step wizard.
- **D-02:** Output uses colored step indicators (checkmarks, spinners) showing progress through each phase: detect -> config -> bootstrap -> plugin wiring -> summary.
- **D-03:** Support `--json` flag for CI/scripted usage -- machine-readable output, no colors, no interactive prompts.
- **D-04:** Subcommands are thin wrappers over existing code, not reimplementations. Commands: `init`, `bootstrap`, `viz`, `review`, `install-hooks`, `status`.
- **D-05:** `codescope status` is the health check diagnostic -- shows readiness score, last bootstrap time, staleness, hooks installed, dashboard running, plugin config status.
- **D-06:** Help text is minimal: one line per subcommand in main help, `--help` per subcommand for details.
- **D-07:** If `.claude-plugin/` doesn't exist, generate it fully wired (plugin.json, skills, hooks, .mcp.json). If it already exists, warn and skip: "Plugin already configured. Run `codescope init --force` to regenerate." Never silently overwrite.
- **D-08:** Use `optionalDependencies` pattern (like esbuild/swc) for platform-specific better-sqlite3 packages (`@codescope/better-sqlite3-darwin-arm64`, etc.). npm/pnpm downloads only the right binary.
- **D-09:** WASM grammars are cross-platform -- bundle in the npm package `files` array. No postinstall scripts.
- **D-10:** Publish as unscoped `codescope` on npm. Platform-specific sqlite packages are scoped (`@codescope/better-sqlite3-*`).
- **D-11:** Fail fast on Node <22 with clear error message at CLI entry point. Check Claude Code availability when auto-setup is attempted.
- **D-12:** If better-sqlite3 prebuilds fail, give specific guidance ("No prebuilt binary for your platform -- run `npm install` with a C compiler available") rather than cryptic native addon errors.
- **D-13:** Ship concise README with npm package: what it does (2 sentences + dashboard screenshot via VIZ-08 export), quickstart (`npx codescope init`), subcommand reference table.

### Claude's Discretion
- CLI framework choice (commander, yargs, or minimal process.argv parsing) -- pick whatever fits best
- Exact spinner/progress library -- pick what works well with Node 22+ ESM
- Internal code organization for CLI entry point

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| DIST-01 | `npx codescope init` detects project, creates config, runs bootstrap, shows "what you got" summary | Existing `detectProject()`, `writeConfig()`, `runBootstrap()` functions provide full pipeline. CLI wraps these with ora spinners and chalk-colored output. Commander handles arg parsing. |
| DIST-02 | CLI entry point with subcommands: init, bootstrap, viz, review, install-hooks, status | Commander@14 provides subcommand support. Each subcommand is a thin wrapper calling existing functions from `src/bootstrap/`, `src/dashboard/`, `src/enforcement/`, and graph/readiness modules. |
| DIST-03 | Plugin auto-setup configures `.claude-plugin/plugin.json` and `.mcp.json` if Claude Code detected | Research documents the full plugin manifest schema from official docs. Auto-setup generates plugin.json, copies skills/, hooks/, .mcp.json with `${CLAUDE_PLUGIN_ROOT}` paths. Claude Code detected via `claude --version` check. |
| DIST-04 | npm package published with bin entry, platform-appropriate better-sqlite3 prebuilds bundled | optionalDependencies pattern with `os`/`cpu` fields in platform-specific packages. WASM grammars bundled in `files` array. Hashbang ESM bin entry via tsdown. |
</phase_requirements>

## Standard Stack

### Core (New Dependencies for CLI)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| commander | ^14.0.3 | CLI framework, subcommand parsing | 35M weekly downloads, minimal API, excellent TypeScript support, Node >=20 required. CJS module but fully importable from ESM (`import { Command } from 'commander'`). v14 is latest stable. v15 (ESM-only) planned May 2026 but not yet released. |
| ora | ^9.3.0 | Terminal spinner/progress indicators | Pure ESM (`"type": "module"`), Node >=20, elegant spinner with text updates, TTY detection (disables in non-TTY/CI). The standard spinner library. |
| chalk | ^5.6.2 | Terminal colors | Pure ESM, Node >=20. Already the standard for ANSI colors. Zero dependencies. |

### Existing (Already in package.json)
| Library | Version | Purpose | Relevance |
|---------|---------|---------|-----------|
| better-sqlite3 | ^12.8.0 | SQLite native addon | Core dependency -- requires platform-specific binary packaging for distribution |
| web-tree-sitter | 0.25.10 | WASM parser | Cross-platform -- WASM grammars bundled in `files` array |
| tsdown | ^0.21.4 | TypeScript bundler | Builds CLI entry point alongside existing server/hooks entries |
| vitest | ^4.1.0 | Test framework | Tests for CLI commands |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| commander | yargs | Yargs is heavier (more features like auto-completion), commander is lighter and sufficient for 6 subcommands |
| commander | process.argv manual parsing | Too fragile for 6 subcommands with flags; commander adds ~45KB bundled but saves significant error handling code |
| ora | nanospinner | Nanospinner is smaller but less maintained and lacks ora's TTY detection and CI awareness |
| chalk | picocolors | Picocolors is 3x smaller but chalk is already well-known and the size difference is negligible for a CLI tool |

**Installation:**
```bash
npm install commander ora chalk
```

**Version verification:**
- commander: 14.0.3 (verified via npm view, 2026-03-29)
- ora: 9.3.0 (verified via npm view, 2026-03-29)
- chalk: 5.6.2 (verified via npm view, 2026-03-29)

## Architecture Patterns

### Recommended Project Structure
```
src/
├── cli/
│   ├── index.ts           # Main entry: hashbang, Node version check, commander setup
│   ├── commands/
│   │   ├── init.ts        # detect -> config -> bootstrap -> plugin-wiring -> summary
│   │   ├── bootstrap.ts   # Thin wrapper over runBootstrap()
│   │   ├── viz.ts         # Thin wrapper over startDashboard() + open()
│   │   ├── review.ts      # Thin wrapper over review tool logic
│   │   ├── install-hooks.ts  # Thin wrapper over enforcement install
│   │   └── status.ts      # Health check diagnostic
│   ├── ui/
│   │   ├── spinner.ts     # ora wrapper with --json mode support
│   │   └── format.ts      # chalk formatting, summary tables, --json output
│   └── setup/
│       └── plugin-wiring.ts  # Generate .claude-plugin/, skills/, hooks/, .mcp.json
├── server.ts              # (existing) MCP server
├── bootstrap/             # (existing) Bootstrap pipeline
├── dashboard/             # (existing) Dashboard server
├── onboard/               # (existing) detect.ts, filesystem.ts
├── config/                # (existing) loader.ts, writer.ts, schema.ts
└── enforcement/           # (existing) pre-commit-check.ts
```

### Pattern 1: CLI Entry Point with Hashbang
**What:** Single TypeScript file that tsdown compiles to ESM with `#!/usr/bin/env node` prepended
**When to use:** npm `bin` entry for `codescope` command

```typescript
// src/cli/index.ts
#!/usr/bin/env node

// D-11: Fail fast on Node <22
const [major] = process.versions.node.split('.').map(Number);
if (major < 22) {
  console.error('CodeScope requires Node.js >= 22. Current: ' + process.version);
  process.exit(1);
}

import { Command } from 'commander';
const program = new Command();

program
  .name('codescope')
  .version('0.1.0')
  .description('AI-powered codebase analysis for Claude Code');

// Register subcommands
program.command('init').description('Detect project, create config, bootstrap, wire plugin').action(initAction);
program.command('bootstrap').description('Run or re-run codebase analysis').action(bootstrapAction);
program.command('viz').description('Launch visualization dashboard').action(vizAction);
program.command('review').description('Review changes against codebase conventions').action(reviewAction);
program.command('install-hooks').description('Install pre-commit convention enforcement').action(installHooksAction);
program.command('status').description('Show CodeScope health and readiness').action(statusAction);

program.parse();
```

### Pattern 2: Spinner with JSON Mode
**What:** Conditional output that uses ora spinners for interactive terminals and JSON for CI
**When to use:** All CLI commands that D-03 requires to support `--json`

```typescript
// src/cli/ui/spinner.ts
import ora from 'ora';

export function createSpinner(text: string, jsonMode: boolean) {
  if (jsonMode) {
    return {
      start: () => ({ succeed: () => {}, fail: () => {}, text: '' }),
      succeed: (msg?: string) => {},
      fail: (msg?: string) => {},
      set text(t: string) {},
    };
  }
  return ora({ text, color: 'cyan' });
}
```

### Pattern 3: Thin Wrapper Subcommands
**What:** Each subcommand imports existing logic and wraps with CLI UX
**When to use:** All 6 subcommands per D-04

```typescript
// src/cli/commands/bootstrap.ts
import { runBootstrap } from '../../bootstrap/orchestrator.js';
import ora from 'ora';

export async function bootstrapAction(options: { force?: boolean; json?: boolean }) {
  const projectRoot = process.cwd();
  const spinner = options.json ? null : ora('Running bootstrap...').start();

  try {
    const result = await runBootstrap({
      projectRoot,
      force: options.force ?? false,
      onProgress: (msg) => {
        if (spinner) spinner.text = msg;
      },
      onConfirm: async () => true,
    });

    if (spinner) spinner.succeed('Bootstrap complete');
    if (options.json) {
      console.log(JSON.stringify(result));
    } else {
      // Format human-readable summary
    }
  } catch (err) {
    if (spinner) spinner.fail('Bootstrap failed');
    process.exit(1);
  }
}
```

### Pattern 4: Plugin Auto-Wiring (D-07)
**What:** Generate `.claude-plugin/plugin.json`, copy skills, hooks, `.mcp.json` into project root
**When to use:** During `codescope init` when plugin doesn't exist yet

```typescript
// src/cli/setup/plugin-wiring.ts
import * as fs from 'node:fs';
import * as path from 'node:path';

export function wirePlugin(projectRoot: string, force: boolean): { created: boolean; message: string } {
  const pluginDir = path.join(projectRoot, '.claude-plugin');

  if (fs.existsSync(pluginDir) && !force) {
    return {
      created: false,
      message: 'Plugin already configured. Run `codescope init --force` to regenerate.',
    };
  }

  // Generate plugin.json from template
  // Copy skills/ directory
  // Copy hooks/ directory with hooks.json
  // Generate .mcp.json with ${CLAUDE_PLUGIN_ROOT} paths
  // ...
}
```

### Pattern 5: optionalDependencies Platform Packages (D-08)
**What:** Create scoped packages per platform containing only the better-sqlite3 `.node` binary
**When to use:** npm package publishing for cross-platform support

```json
// @codescope/better-sqlite3-darwin-arm64/package.json
{
  "name": "@codescope/better-sqlite3-darwin-arm64",
  "version": "12.8.0",
  "os": ["darwin"],
  "cpu": ["arm64"],
  "main": "better_sqlite3.node",
  "files": ["better_sqlite3.node"]
}
```

```json
// codescope/package.json (main package)
{
  "optionalDependencies": {
    "@codescope/better-sqlite3-darwin-arm64": "12.8.0",
    "@codescope/better-sqlite3-darwin-x64": "12.8.0",
    "@codescope/better-sqlite3-linux-x64": "12.8.0",
    "@codescope/better-sqlite3-win32-x64": "12.8.0"
  }
}
```

### Anti-Patterns to Avoid
- **Reimplementing logic in CLI commands:** D-04 explicitly says thin wrappers. Import from existing modules, do not copy code.
- **postinstall scripts for native binaries:** D-09 says no postinstall. The optionalDependencies pattern eliminates postinstall entirely.
- **Using readline for interactive prompts:** Use a simple stdin read for the Y/n confirmation in init. Do not pull in inquirer/prompts -- too heavy for one confirmation.
- **Silently overwriting plugin config:** D-07 explicitly requires warn-and-skip behavior when `.claude-plugin/` exists.
- **Bundling better-sqlite3 into the JS bundle:** It MUST remain external in tsdown config. The native `.node` binary is loaded at runtime via require().

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| CLI argument parsing | Custom process.argv parser | commander@14 | 6 subcommands with flags, help text, error messages -- commander handles this in ~20 lines |
| Terminal spinners | Custom setInterval + cursor manipulation | ora@9 | TTY detection, CI awareness, graceful cleanup on SIGINT, Unicode spinner frames |
| ANSI color codes | Manual `\x1b[33m` strings | chalk@5 | Cross-platform terminal detection, nested styles, strip-ansi for `--json` mode |
| Platform-specific binary loading | Custom `process.platform` + `process.arch` switching | `optionalDependencies` + `os`/`cpu` fields | npm/pnpm handle this automatically; yarn 1 downloads all but yarn 2+ and pnpm are efficient |
| Plugin manifest generation | String templates with manual escaping | JSON.stringify + structured template objects | Prevents malformed JSON, easy to maintain and test |

**Key insight:** The CLI layer adds zero new business logic. Every subcommand delegates to an existing module. The value is in UX (spinners, colors, error messages) and packaging (bin entry, platform binaries, plugin wiring).

## Common Pitfalls

### Pitfall 1: Hashbang in ESM Bundle
**What goes wrong:** tsdown compiles to `.mjs` but doesn't add `#!/usr/bin/env node` automatically. npm's `bin` field needs an executable file.
**Why it happens:** Bundlers don't handle hashbangs by default.
**How to avoid:** Use tsdown's `banner` option to prepend the hashbang: `banner: { js: '#!/usr/bin/env node' }`. Or use a build script to prepend it post-build. Verify the output file starts with `#!/usr/bin/env node`.
**Warning signs:** `npx codescope` fails with "cannot execute" or shows raw JS.

### Pitfall 2: better-sqlite3 Binary Path Resolution
**What goes wrong:** After bundling, `require('better-sqlite3')` can't find the `.node` binary because the resolution path has changed.
**Why it happens:** tsdown marks `better-sqlite3` as external, but the resolved path at runtime depends on where node_modules is.
**How to avoid:** The CLI must have a startup-time loader that finds the platform-specific `.node` file from the optionalDependencies packages. Add a `src/cli/native-loader.ts` that probes `@codescope/better-sqlite3-darwin-arm64` etc. and sets the correct binding path before any module that imports better-sqlite3.
**Warning signs:** `Error: Could not locate the bindings file` at runtime.

### Pitfall 3: ora + Non-TTY (CI) Environments
**What goes wrong:** Spinner output garbles CI logs with cursor escape sequences.
**Why it happens:** ora detects non-TTY but still writes to stdout unless explicitly handled.
**How to avoid:** Use `--json` flag detection (D-03) to completely bypass ora in CI mode. Check `process.stdout.isTTY` as a fallback.
**Warning signs:** Garbled spinner characters in GitHub Actions / Jenkins logs.

### Pitfall 4: Plugin Template File Paths
**What goes wrong:** Generated `.mcp.json` uses absolute paths instead of `${CLAUDE_PLUGIN_ROOT}`.
**Why it happens:** Developer hardcodes paths during testing.
**How to avoid:** All generated plugin files MUST use `${CLAUDE_PLUGIN_ROOT}` for path references. This variable is resolved by Claude Code at runtime. Never generate absolute paths.
**Warning signs:** Plugin works locally but fails after `claude plugin install`.

### Pitfall 5: WASM Grammar Files Missing from Package
**What goes wrong:** `npx codescope init` fails because grammar `.wasm` files aren't in the published package.
**Why it happens:** npm publishes only files listed in `files` array (or not in `.npmignore`).
**How to avoid:** Explicitly list `"grammars/*.wasm"` in package.json `files` array. Verify with `npm pack --dry-run` that all 4 WASM files are included.
**Warning signs:** `Error: ENOENT: no such file or directory, open '.../grammars/tree-sitter-typescript.wasm'`

### Pitfall 6: Node Version Gate Runs After ESM Parse
**What goes wrong:** The Node <22 check (D-11) uses ESM syntax that Node 18/20 might choke on before reaching the version check.
**Why it happens:** ESM features like top-level await exist in the file, and older Node versions fail during parsing.
**How to avoid:** Keep the version check at the very top of the file using only syntax supported by Node 18+. Use `process.versions.node.split('.')` -- this works on all Node versions. The `import` statements should come AFTER the check (using dynamic `import()` if needed), OR the hashbang file can be a thin CJS wrapper that checks version then `import()`s the ESM CLI.
**Warning signs:** `SyntaxError: Cannot use import statement outside a module` on Node 18.

### Pitfall 7: optionalDependencies and Yarn Classic
**What goes wrong:** Yarn 1.x downloads ALL optionalDependencies regardless of platform, wasting bandwidth and disk.
**Why it happens:** Yarn 1.x doesn't support `os`/`cpu` field filtering on optionalDependencies.
**How to avoid:** Document that pnpm or npm is recommended. Yarn 1.x will still work (it just downloads more). Yarn berry (2+) handles this correctly.
**Warning signs:** Slow install on Yarn 1.x.

## Code Examples

### CLI Entry with Version Gate (D-11)
```typescript
// src/cli/index.ts
#!/usr/bin/env node

// Node version gate -- must use only syntax that works on Node 18+
// so the error message is shown instead of a parse error
const nodeVersion = parseInt(process.versions.node.split('.')[0], 10);
if (nodeVersion < 22) {
  process.stderr.write(
    `\nCodeScope requires Node.js >= 22.0.0\n` +
    `Current version: ${process.version}\n` +
    `Install the latest LTS: https://nodejs.org\n\n`
  );
  process.exit(1);
}

// Safe to use ESM features now
import { Command } from 'commander';
import { initCommand } from './commands/init.js';
import { bootstrapCommand } from './commands/bootstrap.js';
import { vizCommand } from './commands/viz.js';
import { reviewCommand } from './commands/review.js';
import { installHooksCommand } from './commands/install-hooks.js';
import { statusCommand } from './commands/status.js';

const program = new Command();
program
  .name('codescope')
  .version('0.1.0')
  .description('AI-powered codebase analysis for Claude Code');

initCommand(program);
bootstrapCommand(program);
vizCommand(program);
reviewCommand(program);
installHooksCommand(program);
statusCommand(program);

program.parse();
```

### Init Command Flow (D-01, D-02)
```typescript
// src/cli/commands/init.ts
import { Command } from 'commander';
import ora from 'ora';
import chalk from 'chalk';
import { detectProject } from '../../onboard/detect.js';
import { writeConfig } from '../../config/writer.js';
import { createDirectoryTree } from '../../onboard/filesystem.js';

export function initCommand(program: Command): void {
  program
    .command('init')
    .description('Detect project, create config, run bootstrap, wire plugin')
    .option('--force', 'Overwrite existing config and plugin setup')
    .option('--json', 'Machine-readable JSON output (no colors, no prompts)')
    .action(async (options) => {
      const projectRoot = process.cwd();
      const jsonMode = options.json ?? false;

      // Step 1: Detect
      const spinner = jsonMode ? null : ora('Detecting project...').start();
      const info = await detectProject(projectRoot);
      if (spinner) spinner.succeed(`Detected: ${info.projectName} (${info.type}, ${info.languages.join(', ')})`);

      // Step 2: Show detection results, single Y/n confirmation
      if (!jsonMode) {
        console.log(chalk.dim('  Languages: ') + info.languages.join(', '));
        console.log(chalk.dim('  Type: ') + info.type);
        if (info.services.length > 0) {
          console.log(chalk.dim('  Services: ') + info.services.map(s => s.name).join(', '));
        }
        // ... confirmation prompt
      }

      // Step 3: Create config
      // Step 4: Run bootstrap
      // Step 5: Wire plugin
      // Step 6: Show summary
    });
}
```

### package.json bin + files Configuration (D-04, D-09, D-10)
```json
{
  "name": "codescope",
  "version": "0.1.0",
  "type": "module",
  "bin": {
    "codescope": "./dist/cli.mjs"
  },
  "files": [
    "dist/",
    "grammars/*.wasm",
    "hooks/",
    "skills/",
    ".claude-plugin/",
    ".mcp.json",
    "README.md"
  ],
  "optionalDependencies": {
    "@codescope/better-sqlite3-darwin-arm64": "12.8.0",
    "@codescope/better-sqlite3-darwin-x64": "12.8.0",
    "@codescope/better-sqlite3-linux-x64": "12.8.0",
    "@codescope/better-sqlite3-win32-x64": "12.8.0"
  }
}
```

### Platform Package Structure (D-08)
```
@codescope/better-sqlite3-darwin-arm64/
├── package.json   # { "os": ["darwin"], "cpu": ["arm64"], "files": ["better_sqlite3.node"] }
├── better_sqlite3.node  # Prebuilt binary for darwin-arm64
└── README.md
```

### Status Command (D-05)
```typescript
// src/cli/commands/status.ts -- shows diagnostic health check
// Readiness score, last bootstrap time, staleness, hooks, dashboard, plugin config
import { loadConfig, configExists } from '../../config/loader.js';
import { readBootstrapMeta } from '../../bootstrap/meta.js';
import { computeReadiness } from '../../bootstrap/readiness.js';
```

### tsdown Config Addition
```typescript
// Add to tsdown.config.ts entry array
{
  entry: ["src/cli/index.ts"],
  format: "esm",
  outDir: "dist",
  external: ["better-sqlite3"],
  clean: false,  // Don't wipe other build outputs
  banner: { js: "#!/usr/bin/env node" },
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| postinstall scripts for native binaries | optionalDependencies + os/cpu fields | esbuild PR #1621, 2021 | No postinstall needed, works with --ignore-scripts, offline installs |
| commander CJS-only | commander@14 CJS importable from ESM, v15 ESM-only coming May 2026 | commander@14, 2025 | Use v14 now (CJS but ESM-importable), upgrade to v15 when available |
| ora CJS | ora@6+ pure ESM | August 2021 | Must use dynamic import or have "type": "module" in package.json |
| prebuild + prebuild-install (download on install) | prebuildify (ship inside package) or optionalDependencies (separate packages) | Ongoing migration | esbuild/swc pattern with separate packages is most robust for cross-platform |

**Deprecated/outdated:**
- commander@12 and below: use @14 (stable, Node >=20)
- ora@5 and below: CJS, unmaintained; use @9 (ESM, Node >=20)
- chalk@4: CJS; chalk@5 is ESM-only

## Project Constraints (from CLAUDE.md)

- **Tech stack:** TypeScript, better-sqlite3, web-tree-sitter WASM, vitest, tsdown
- **Performance:** Plugin startup <5K tokens
- **Build tool:** tsdown (not tsup -- tsup is no longer maintained)
- **better-sqlite3:** Must remain external in tsdown config (native addon)
- **web-tree-sitter:** Pin to ^0.25.10 (not 0.26.x)
- **Module system:** ESM-first (`"type": "module"` in package.json)
- **Testing:** vitest (not jest)
- **Build isolation:** Hooks/enforcement modules keep dependencies minimal (established pattern from Phases 10, 12)
- **MCP paths:** Use `${CLAUDE_PLUGIN_ROOT}` variable for all plugin-relative paths

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Runtime | Yes | v25.6.1 | -- |
| npm | Package management | Yes | 11.9.0 | -- |
| tsdown | Build | Yes | ^0.21.4 (devDep) | -- |
| vitest | Testing | Yes | ^4.1.0 (devDep) | -- |
| better-sqlite3 | SQLite storage | Yes | ^12.8.0 (dep) | -- |
| Claude Code CLI | Plugin detection (D-11) | To verify | -- | Skip plugin wiring with warning |

**Missing dependencies with no fallback:**
- None identified

**Missing dependencies with fallback:**
- Claude Code CLI availability: if `claude --version` fails, `codescope init` still works but skips plugin auto-wiring with a warning message

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest ^4.1.0 |
| Config file | `vitest.config.ts` |
| Quick run command | `npx vitest run tests/cli/` |
| Full suite command | `npx vitest run` |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| DIST-01 | Init detects project, creates config, runs bootstrap, shows summary | integration | `npx vitest run tests/cli/init.test.ts -x` | Wave 0 |
| DIST-02 | CLI subcommands parse correctly and dispatch | unit | `npx vitest run tests/cli/commands.test.ts -x` | Wave 0 |
| DIST-03 | Plugin auto-setup generates correct manifest, skills, hooks, .mcp.json | unit | `npx vitest run tests/cli/plugin-wiring.test.ts -x` | Wave 0 |
| DIST-04 | Package structure includes bin, files, optionalDependencies | unit | `npx vitest run tests/cli/packaging.test.ts -x` | Wave 0 |

### Sampling Rate
- **Per task commit:** `npx vitest run tests/cli/`
- **Per wave merge:** `npx vitest run`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `tests/cli/init.test.ts` -- covers DIST-01 (init flow end-to-end with mocked bootstrap)
- [ ] `tests/cli/commands.test.ts` -- covers DIST-02 (subcommand parsing, help text, error handling)
- [ ] `tests/cli/plugin-wiring.test.ts` -- covers DIST-03 (plugin manifest generation, skip-if-exists)
- [ ] `tests/cli/packaging.test.ts` -- covers DIST-04 (package.json structure validation, files array, bin entry)

## Open Questions

1. **How to build platform-specific better-sqlite3 packages?**
   - What we know: The esbuild/swc pattern uses scoped packages with `os` and `cpu` fields. Each package contains only the platform binary.
   - What's unclear: The build pipeline for extracting better-sqlite3 prebuilt `.node` files for each platform. better-sqlite3 uses `prebuild-install` which downloads from GitHub releases. We need a CI pipeline (GitHub Actions matrix) that installs better-sqlite3 on each platform, extracts the `.node` file, and publishes the scoped package.
   - Recommendation: Create a `scripts/build-platform-packages.sh` that automates extraction. For v0.1.0, could start with publishing platform packages from local machines or a CI matrix. Document the process for future releases.

2. **Native binary loader at runtime**
   - What we know: tsdown marks `better-sqlite3` as external. At runtime, `require('better-sqlite3')` needs to find the `.node` binary.
   - What's unclear: Whether the optionalDependencies packages will be in `node_modules/@codescope/better-sqlite3-*` and whether better-sqlite3 can be configured to use a custom binary path.
   - Recommendation: Create a small loader module that detects the current platform, requires the appropriate `@codescope/better-sqlite3-*` package to get the binary path, and patches the better-sqlite3 module resolution. This is a known-solvable pattern used by many native addon distributors.

3. **CLI output during `npx codescope init` -- first-run experience**
   - What we know: D-01 wants detect -> config -> bootstrap -> plugin wiring -> summary. D-02 wants colored step indicators.
   - What's unclear: Bootstrap can take several minutes for large codebases. How to show meaningful progress during bootstrap (which has its own progress callback).
   - Recommendation: Use ora's text update capability to relay bootstrap progress messages. The existing `onProgress` callback from `runBootstrap()` provides step-by-step messages.

## Sources

### Primary (HIGH confidence)
- npm registry (verified via `npm view`): commander@14.0.3, ora@9.3.0, chalk@5.6.2, better-sqlite3@12.8.0
- [Claude Code Plugins Reference](https://code.claude.com/docs/en/plugins-reference) -- full plugin manifest schema, `${CLAUDE_PLUGIN_ROOT}`, `${CLAUDE_PLUGIN_DATA}`, directory structure
- Existing codebase: `src/onboard/detect.ts`, `src/config/writer.ts`, `src/bootstrap/orchestrator.ts`, `src/dashboard/server.ts`, `src/enforcement/pre-commit-check.ts` -- verified reusable modules
- tsdown.config.ts -- existing multi-entry build configuration pattern
- package.json -- existing project structure, dependencies, scripts

### Secondary (MEDIUM confidence)
- [esbuild optionalDependencies PR #1621](https://github.com/evanw/esbuild/pull/1621) -- optionalDependencies pattern for platform-specific binaries
- [npm package.json docs](https://docs.npmjs.com/cli/v11/configuring-npm/package-json/) -- `os`, `cpu`, `files`, `bin` fields
- [commander.js GitHub](https://github.com/tj/commander.js/) -- v14 is CJS, v15 (ESM-only) planned May 2026
- [ora GitHub](https://github.com/sindresorhus/ora) -- ESM-only since v6, current v9.3.0
- [NAPI-RS distribution docs](https://napi.rs/docs/deep-dive/release) -- optionalDependencies + `os`/`cpu` pattern for native addons

### Tertiary (LOW confidence)
- better-sqlite3 platform binary availability for Node 22/24 across all target platforms -- needs validation during CI pipeline setup

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- commander, ora, chalk are battle-tested, versions verified against npm registry
- Architecture: HIGH -- all subcommands wrap existing, tested modules; plugin manifest schema verified from official docs
- CLI packaging (bin, files, ESM): HIGH -- well-documented npm features, ESM + hashbang pattern is standard
- Cross-platform binary distribution (optionalDependencies): MEDIUM -- pattern is proven (esbuild, swc, napi-rs) but the specific build pipeline for extracting better-sqlite3 binaries per platform needs implementation and testing
- Pitfalls: HIGH -- based on known issues with ESM bundling, native addons, and plugin path resolution

**Research date:** 2026-03-29
**Valid until:** 2026-04-28 (stable domain, 30 days)
