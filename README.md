# CodeScope

AI-powered codebase analysis that gives Claude Code deep understanding of your project's conventions, dependencies, and risk zones. Every AI-generated change respects existing patterns and stays within safe blast radius.

## Quickstart

```bash
npx codescope init
```

This detects your project, creates configuration, runs full codebase analysis, and wires up the Claude Code plugin -- all in one command.

## Commands

| Command | Description |
|---------|-------------|
| `codescope init` | Detect project, create config, run bootstrap, wire plugin |
| `codescope bootstrap` | Run or re-run codebase analysis |
| `codescope viz` | Launch interactive visualization dashboard |
| `codescope review` | Review changes against codebase conventions |
| `codescope install-hooks` | Install pre-commit convention enforcement |
| `codescope status` | Show CodeScope health and readiness |

All commands support `--help` for detailed usage.

## What You Get

- **Knowledge Graph** -- Full dependency map of your codebase with community detection and centrality analysis
- **Convention Detection** -- Automatically discovers coding patterns with adoption rates and confidence scores
- **Danger Zone Mapping** -- Identifies high-risk files by centrality and coupling
- **AI Readiness Score** -- Grades your codebase on convention coverage, type safety, test coverage, and import health
- **Interactive Dashboard** -- Explore the graph, conventions, readiness trends, and blast radius via `codescope viz`
- **Pre-commit Enforcement** -- Optional convention checking on staged files via `codescope install-hooks`
- **Session Continuity** -- Pause and resume analysis workflows across Claude Code sessions

## Requirements

- Node.js >= 22.0.0
- Claude Code (for plugin features)

## Configuration

Config lives at `.claude/codescope/config.yml`. Edit directly or run `codescope init` to regenerate.

## License

MIT
