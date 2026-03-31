---
name: bootstrap
description: Analyze your codebase to build the knowledge graph, detect conventions, and identify danger zones. Produces AI readiness score and cross-service dependency map for monorepos.
---

## /codescope:bootstrap

Analyzes your codebase to build the knowledge graph, detect conventions, identify danger zones, and compute an AI readiness score.

### Prerequisites
- Run /codescope:onboard first to create config.yml
- Check status: call codescope_status tool to verify config exists

### Steps

1. **Check prerequisites**
   Call the codescope_status MCP tool. Verify config_exists is true. If false, tell the user to run /codescope:onboard first.

2. **Determine bootstrap mode**
   Check if the user passed --force flag. If not, the orchestrator will auto-detect incremental vs full mode.

3. **Handle --force confirmation (per D-30)**
   If --force is specified, before running the bootstrap pipeline, display a confirmation prompt showing what will be rebuilt and what will be preserved:

   **Will be rebuilt (deleted and regenerated):**
   - graph.db (knowledge graph)
   - service analysis artifacts (overview.md, conventions.md per service)
   - readiness.md (AI readiness score)
   - service-manifest.md, cross-service-map.md
   - danger-zones.md

   **Will be preserved:**
   - config.yml (user configuration)
   - conventions-enforced.md (user-confirmed conventions)
   - learnings.md (accumulated learnings)
   - orient/, plans/, execution/, reports/ (user workflow data)

   Ask the user to confirm ("Proceed with full re-bootstrap?" y/n). If the user cancels, abort without running the pipeline. If confirmed, proceed to step 4.

4. **Run the bootstrap pipeline**
   IMPORTANT: The user's current working directory is the project to analyze, NOT the plugin directory. Before running, capture the user's project root, then use absolute paths:
   ```
   PROJECT_ROOT=$(pwd)
   PLUGIN_DIR=$(dirname "$(dirname "$(readlink -f "$0" 2>/dev/null || echo "$HOME/.claude/plugins/marketplaces/codescope")")")
   ```
   Then run with explicit --project-root:
   ```
   cd <plugin-directory> && node --import tsx/esm src/bootstrap/run-bootstrap.ts --project-root <user-project-root> [--force]
   ```
   Always pass --project-root with the user's actual project directory. Never rely on process.cwd() — it will be the plugin directory after cd'ing to find tsx.
   This runs the full pipeline:
   - Service discovery (Scout)
   - Per-service analysis squads (Researcher, Convention Detector, Risk Analyzer, Learning Synthesizer)
   - Cross-service synthesis (for monorepos)
   - AI readiness scoring

5. **Read and display results**
   Read the bootstrap output from `.claude/codescope/readiness.md` and display the completion summary following this format:

   ## Bootstrap Complete

   **AI Readiness: {grade} ({percent}%)**

   | Dimension | Score | Delta |
   |-----------|-------|-------|
   | Convention Coverage | {pct}% | {+/-N%} |
   | Type Safety | {pct}% | {+/-N%} |
   | Test Coverage Proxy | {pct}% | {+/-N%} |
   | Import Graph Health | {pct}% | {+/-N%} |

   ### Artifacts
   - List all generated artifacts with paths

   ### Stats
   - Nodes, edges, communities counts
   - Conventions detected (N high-confidence)
   - Services analyzed
   - Duration

   ### Top 3 Improvements
   - From readiness.md

   **Next:** `/codescope:orient [task]`

### Flags
- `--force` -- Full re-bootstrap. Shows confirmation before wiping (per D-30): lists what will be rebuilt and what's preserved. User confirms or cancels. Rebuilds all analysis artifacts. Preserves config.yml, conventions-enforced.md, learnings.md.

### Error handling
- If bootstrap fails, display the error and suggest checking codescope_status for dependency issues.
- If bootstrap exceeds 5 minutes, it will complete but report a timing warning.
