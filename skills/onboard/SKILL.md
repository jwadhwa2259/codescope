---
name: onboard
description: Configure CodeScope for this project. Detects project type, languages, and build commands, then walks through agent model selection and workflow preferences. Run this before /codescope:bootstrap.
---

# CodeScope Onboarding

You are running the CodeScope onboarding wizard. Follow these steps exactly in sequence.

## Step 0: Prerequisites Check

1. Check Node.js version by reading the output of `node --version`. If the major version is less than 22, tell the user:
   "CodeScope requires Node.js 22 or later. Current version: {version}. Upgrade at https://nodejs.org"
   Stop here -- do not continue onboarding until Node.js is upgraded.

2. If Node.js is sufficient, confirm: "Node.js {version} detected. Requirements met."

3. Check if `.claude/codescope/config.yml` already exists in the project root.
   - If it exists, ask the user:
     "CodeScope is already configured. Would you like to: (1) Update existing config, or (2) Start fresh?"
     - If "Start fresh": warn "This will replace your existing CodeScope configuration. All current settings will be lost. Proceed?" then continue from Step 1.
     - If "Update existing config": read the existing config and use its values as defaults in the steps below.

## Step 1: Project Detection

Read the following files to detect project configuration:
- `package.json` -- project name, type (check for `workspaces` field = monorepo), build/test scripts
- `tsconfig.json` / `jsconfig.json` -- TypeScript/JavaScript
- `pyproject.toml` / `setup.py` / `requirements.txt` -- Python
- `docker-compose.yml` / `compose.yml` -- services (monorepo indicator)
- `playwright.config.ts` / `cypress.config.ts` -- E2E tool
- `.github/workflows/*.yml` -- CI/CD (informational)

Present your findings to the user for confirmation:
"Detected: {type} project with {languages}. Build: {buildCommand}. Test: {testCommand}. Confirm or correct?"

If detection found nothing:
"Could not detect project configuration automatically. Let's set it up manually."
Then ask the user for:
- Project type: single / monorepo / polyrepo
- Primary languages (select from: typescript, javascript, python)
- Build command (or "none")
- Test command (or "none")
- E2E tool (playwright / cypress / none)

### Step 1b: Returning User Check

Check if `~/.codescope/global-memory.md` exists and has saved preferences.
If it does, show the user:
"Found your preferences from a previous project. Use same setup or customize?"
- "Use same setup": Apply saved preferences as defaults for Steps 2 and 3, skip to Step 4.
- "Customize": Continue to Steps 2 and 3 with saved preferences as suggested defaults.

## Step 2: Agent Model Selection

Show the user the 6 agent model assignments with recommended defaults:
"Agent model assignments (recommended defaults shown). Accept all or select specific agents to override:"

| Agent | Default | Purpose |
|-------|---------|---------|
| researcher | inherited | Maps structure, frameworks, entry points |
| convention_detector | inherited | Detects code patterns and conventions |
| risk_analyzer | inherited | Builds knowledge graph, identifies danger zones |
| learning_synthesizer | inherited | Captures project learnings |
| eval_judge | inherited | Scores changes on 4 criteria |
| debug | inherited | Fixes issues through targeted re-execution |

Options: haiku, sonnet, opus, inherited (uses your current session model)

Offer: "Accept all defaults" or let the user override specific agents.

## Step 3: Workflow Preferences

"Workflow preferences (recommended defaults shown):"

1. **Orient verbosity**: brief (concise ~50 lines) or detailed (~200 lines)? Default: brief
2. **Clarification style**: thorough (asks detailed questions) / minimal (fewer questions) / auto (decides based on task specificity)? Default: thorough
3. **Eval gate mode**: interactive (you review findings) / auto-debug (sends all to debug) / auto-skip-minor (only MEDIUM+ to debug)? Default: interactive
4. **Convention strictness**: suggest-only (suggestions) / warn (warnings) / block (errors)? Default: suggest-only

## Step 4: Agent Teams Detection

Check if agent teams are available for parallel execution during orient (D-41):

1. Run the detection check:
   ```
   node --import tsx/esm -e "import { detectAgentTeamsOnboard } from './src/onboard/agent-teams.js'; console.log(JSON.stringify(detectAgentTeamsOnboard()));"
   ```

2. Parse the JSON result and act based on the `status` field:

   - **If status is `already_enabled`**: Display to the user:
     "Agent teams already enabled. Orient will use parallel execution when the planner identifies independent tasks."
     Proceed to Step 5.

   - **If status is `not_enabled`**: Ask the user:
     "Agent teams enable parallel execution during orient. Enable now? [Y/n]"

     - **If yes (or Enter)**: Run the enablement:
       ```
       node --import tsx/esm -e "import { enableAgentTeams } from './src/onboard/agent-teams.js'; console.log(JSON.stringify(enableAgentTeams()));"
       ```
       Parse the result. If `success` is true, display:
       "Agent teams enabled in `~/.claude/settings.json`. Orient will use parallel execution when the planner identifies independent tasks."
       If `success` is false, display the error message and continue.

     - **If no**: Display:
       "Agent teams not enabled. Orient will run sequentially. You can enable later via `/codescope:settings`."

## Step 5: Write Config & Create Structure

1. Create the `.claude/codescope/` directory tree with all subdirectories:
   - .claude/codescope/
   - .claude/codescope/services/
   - .claude/codescope/orient/
   - .claude/codescope/plans/
   - .claude/codescope/execution/
   - .claude/codescope/reports/
   - .claude/codescope/reports/screenshots/

2. Write `.claude/codescope/.gitignore` with selective rules:
   - Ignore: graph.db, graph.db-wal, graph.db-shm, execution/, reports/screenshots/, usage.md
   - Track: config.yml, conventions-enforced.md

3. Create `~/.codescope/` directory and `~/.codescope/global-memory.md` if they don't exist.

4. Write `.claude/codescope/config.yml` with all the user's choices merged with defaults:
   ```yaml
   schema_version: 1
   project:
     name: {detected or entered project name}
     type: {single|monorepo|polyrepo}
     languages: [{detected languages}]
     services: [{if monorepo, list services with paths}]
     build_command: {detected or entered}
     test_command: {detected or entered}
     e2e_tool: {detected or entered or null}
     e2e_command: {if e2e tool, the command}
   agents:
     researcher: { model: {chosen} }
     convention_detector: { model: {chosen} }
     risk_analyzer: { model: {chosen} }
     learning_synthesizer: { model: {chosen} }
     eval_judge: { model: {chosen} }
     debug: { model: {chosen} }
   orient:
     verbosity: {chosen, default: brief}
     clarification: {chosen, default: thorough}
     research_sources: [context7, web_search]
     max_research_time: 60
   execute:
     max_agents_concurrent: 3
   verify:
     build_command: {same as project.build_command}
     timeout_seconds: 120
     tests:
       unit: {same as project.test_command}
       e2e:
         tool: {e2e_tool or none}
         command: {e2e_command}
     auto_smoke: true
     static_check: true
     blast_radius_diff: true
   eval:
     mode: {chosen, default: interactive}
     auto_debug_max_cycles: 3
     criteria:
       scope_compliance: true
       convention_adherence: true
       completeness: true
       correctness: true
   conventions:
     detection_threshold: 80
     min_files: 10
     strictness: {chosen, default: suggest-only}
     auto_confirm_high_confidence: false
   learning:
     project_memory: true
     global_memory: true
     global_memory_path: "~/.codescope/global-memory.md"
     max_active_learnings: 50
     confidence_decay:
       gotchas: 90
       decisions: 180
     auto_capture: true
     capture_ignores: true
   bootstrap:
     scaling: auto
     squad_threshold_loc: 100000
     max_squads: 10
   display:
     progress_reports: true
     agent_activity: minimal
     eval_detail: full
   ```

5. Show the user a brief summary:
   "Configuration saved to .claude/codescope/config.yml. Run /codescope:bootstrap to analyze your codebase."
