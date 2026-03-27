---
name: settings
description: View and modify CodeScope configuration interactively or via direct commands.
allowed-tools:
  - Bash
  - Read
  - Write
  - Edit
---

# /codescope:settings

You are the settings manager. Help the user view and modify CodeScope configuration.

**Arguments:** $ARGUMENTS

## Flag Detection

Check $ARGUMENTS for special flags:
- `--reset`: Reset config.yml to defaults (preserving project section)
- `--reset-global`: Reset global memory to empty template
- `--set key=value`: Direct config change (e.g., `--set eval.mode=auto-debug`)
- `--rollback-convention`: Convention rollback mode
- `--detect-teams`: Agent teams re-detection mode
- No flags: Interactive mode

Parse $ARGUMENTS to determine which mode to use. If no recognized flags are found, proceed to Interactive Mode.

## Reset Handlers

### --reset

Reset config.yml to defaults while preserving the project section. The project section contains project-specific data (name, type, languages, build_command, test_command, e2e_tool, e2e_command, services, root) that was gathered during onboarding and must not be lost.

1. Load the current config:
   ```
   node --import tsx/esm -e "import { loadConfig } from './src/config/loader.js'; const c = loadConfig(process.cwd()); console.log(JSON.stringify(c));"
   ```

2. If config is null (file missing), display: "No config found. Run /codescope:onboard first." and stop.

3. Extract the `project` section from the current config. Preserve all project fields: name, type, languages, root, services, build_command, test_command, e2e_tool, e2e_command.

4. Load DEFAULT_CONFIG:
   ```
   node --import tsx/esm -e "import { DEFAULT_CONFIG } from './src/config/defaults.js'; console.log(JSON.stringify(DEFAULT_CONFIG));"
   ```

5. Merge: take all sections from DEFAULT_CONFIG but replace the `project` section with the preserved project section from step 3. This resets agents, orient, execute, verify, eval, conventions, learning, bootstrap, and display to their default values.

6. Validate the merged config against ConfigSchema:
   ```
   node --import tsx/esm -e "import { ConfigSchema } from './src/config/schema.js'; const result = ConfigSchema.safeParse(JSON.parse(process.argv[2])); console.log(JSON.stringify({ valid: result.success, error: result.success ? null : result.error.message }));" '{mergedConfigJson}'
   ```

7. If validation fails, display the error and stop without writing. This should not happen if defaults are correct, but safety first.

8. If valid, write using writeConfig:
   ```
   node --import tsx/esm -e "import { writeConfig } from './src/config/writer.js'; writeConfig(process.cwd(), JSON.parse(process.argv[2]));" '{mergedConfigJson}'
   ```

9. Display: "Config reset to defaults. Project settings preserved: {project.name} ({project.type}, {languages joined by comma})."

### --reset-global

Reset global memory to an empty template. This removes all accumulated cross-project preferences, tech stack tendencies, and gotchas.

1. Get the global memory path:
   ```
   node --import tsx/esm -e "import { getGlobalMemoryPath } from './src/utils/paths.js'; console.log(getGlobalMemoryPath());"
   ```

2. Write the empty template to that path using the Write tool:
   ```markdown
   # CodeScope Global Memory

   ## Preferences

   (None yet.)

   ## Tech Stack Tendencies

   (None yet.)

   ## Ignore Patterns

   (None yet.)

   ## Cross-Project Gotchas

   (None yet.)

   *Last updated: {today's date in YYYY-MM-DD format}*
   ```

3. Display: "Global memory reset to empty template at {path}."

## --set key=value

Directly change a single config value without going through the interactive menu. Useful for scripting or quick changes.

1. Parse the key and value from $ARGUMENTS: extract the text after `--set `, split on the first `=` sign.
   - Key uses dot notation matching the config structure: `eval.mode`, `learning.auto_capture`, `agents.researcher.model`, `verify.timeout_seconds`, `conventions.detection_threshold`, etc.
   - Value is everything after the first `=`.

2. Load the current config:
   ```
   node --import tsx/esm -e "import { loadConfig } from './src/config/loader.js'; const c = loadConfig(process.cwd()); console.log(JSON.stringify(c));"
   ```

3. If config is null, display: "No config found. Run /codescope:onboard first." and stop.

4. Navigate the config object by the dot-separated path. Record the old value at that path.

5. Set the new value with type coercion:
   - `"true"` -> boolean `true`
   - `"false"` -> boolean `false`
   - Numeric strings (e.g., `"3"`, `"80"`, `"120"`) -> number
   - Everything else -> string

6. Validate the modified config against ConfigSchema:
   ```
   node --import tsx/esm -e "import { ConfigSchema } from './src/config/schema.js'; const result = ConfigSchema.safeParse(JSON.parse(process.argv[2])); console.log(JSON.stringify({ valid: result.success, error: result.success ? null : result.error.message }));" '{modifiedConfigJson}'
   ```

7. If validation fails: display "Invalid value: {error}. Config not changed." and stop.

8. If valid: write the config:
   ```
   node --import tsx/esm -e "import { writeConfig } from './src/config/writer.js'; writeConfig(process.cwd(), JSON.parse(process.argv[2]));" '{modifiedConfigJson}'
   ```

9. Display: "Updated {key}: {oldValue} -> {newValue}."

## --rollback-convention

Remove enforced conventions from the conventions-enforced.md file. This allows undoing convention enforcement that was auto-detected or manually confirmed.

1. Read the conventions-enforced.md file:
   ```
   cat .claude/codescope/conventions-enforced.md
   ```
   If the file does not exist, display: "No enforced conventions file found." and stop.

2. Parse the entries. Each enforced convention is an H3 heading (`###`) with an adoption percentage and evidence beneath it. Collect them into a numbered list.

3. If no convention entries are found (file is empty or has only headers), display: "No enforced conventions to rollback." and stop.

4. Present the numbered list of enforced conventions to the user:
   ```
   ## Enforced Conventions

   1. {convention 1 heading}
   2. {convention 2 heading}
   3. {convention 3 heading}
   ...
   ```

5. Ask the user: "Select convention(s) to remove (comma-separated numbers, or 'all'):"

6. Parse the user's selection:
   - Numbers (e.g., `1,3`): remove those specific conventions
   - `all`: remove all conventions

7. Rewrite conventions-enforced.md without the removed entries. Preserve the file header and any remaining entries.

8. Display: "Removed {N} convention(s) from enforcement."

## --detect-teams

Re-detect agent teams availability and offer to enable or disable.

1. Run the detection:
   ```
   node --import tsx/esm -e "import { detectAgentTeams } from './src/execution/teams-detector.js'; const r = detectAgentTeams(); console.log(JSON.stringify(r));"
   ```

2. Parse the result. The function returns `{ available: boolean, reason: string }`.

3. Display the current status:
   - If available: "Agent Teams: Available (environment variable is set)"
   - If not available: "Agent Teams: Not available ({reason})"

4. Based on availability, offer the appropriate action:

   - **If available (currently enabled):** Ask: "Disable agent teams? Orient will switch to sequential execution. (yes/no)"
     - If yes: Display instructions to remove `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS` from shell profile or `~/.claude/settings.json`.

   - **If not available (currently disabled):** Ask: "Enable agent teams? This enables parallel execution during orient. (yes/no)"
     - If yes: Run enablement:
       ```
       node --import tsx/esm -e "import { enableAgentTeams } from './src/execution/teams-detector.js'; console.log(JSON.stringify(enableAgentTeams()));"
       ```
       Parse the result. If success: "Agent teams enabled in ~/.claude/settings.json. Orient will use parallel execution when the planner identifies independent tasks."
       If failure: display the error message.

     - If no: "Agent teams remain disabled. Orient will continue using sequential execution."

## Interactive Mode

When no flags are provided, enter the interactive settings browser.

### Step 1: Load and Display Current Config

1. Load the current config:
   ```
   node --import tsx/esm -e "import { loadConfig } from './src/config/loader.js'; console.log(JSON.stringify(loadConfig(process.cwd()), null, 2));"
   ```

2. If config is null, display: "No config found. Run /codescope:onboard first." and stop.

3. Display the section menu:
   ```
   ## CodeScope Settings

   Current project: {project.name} ({project.type}, {languages})

   Select a section to modify:
   1. agents - Agent model assignments
   2. orient - Orient pipeline settings
   3. execute - Execution settings
   4. verify - Verification settings
   5. eval - Evaluation settings
   6. conventions - Convention detection settings
   7. learning - Learning system settings
   8. bootstrap - Bootstrap settings
   9. display - Display preferences
   10. [Convention rollback]
   11. [Agent teams detection]
   12. [Reset config to defaults]
   13. [Reset global memory]
   14. [Done]
   ```

4. Wait for the user to select an option (1-14).

5. If the user selects 10-13, execute the corresponding handler (--rollback-convention, --detect-teams, --reset, --reset-global) and return to the menu afterward.

6. If the user selects 14 (Done), display "Settings saved. Goodbye." and stop.

### Step 2: Section Editor

Based on the user's section selection (1-9), present the section's current values and offer editing.

For each field in the selected section:
- Display: `{field}: {currentValue}`
- Include type info and allowed values where applicable:
  - **Enum fields** (e.g., `eval.mode`, `orient.verbosity`, `conventions.strictness`, `display.agent_activity`): show allowed values from the Zod schema
  - **Boolean fields** (e.g., `verify.auto_smoke`, `learning.auto_capture`): show `true/false`
  - **Number fields** (e.g., `verify.timeout_seconds`, `conventions.detection_threshold`): show current value with any min/max constraints
  - **Nested objects** (e.g., `eval.criteria`, `agents.*`, `learning.confidence_decay`): display each sub-field

Example display for the `eval` section:
```
## eval - Evaluation settings

- mode: interactive (allowed: interactive, auto-debug, auto-skip-minor)
- auto_debug_max_cycles: 3 (number, 1-10)
- criteria:
  - scope_compliance: true (boolean)
  - convention_adherence: true (boolean)
  - completeness: true (boolean)
  - correctness: true (boolean)
```

Ask: "Enter field name to change (or 'back' to return to sections):"

When the user selects a field:
- **For enums:** Present allowed values as a numbered list. Ask "Select an option (1-N):"
- **For booleans:** Toggle the current value (true -> false, false -> true). Confirm: "Toggle {field} to {newValue}? (yes/no)"
- **For numbers:** Ask "Enter new value for {field}:" and validate it is a valid number within schema constraints.
- **For strings:** Ask "Enter new value for {field}:"

### Step 3: Validate and Save

After each change:

1. Validate the full config against ConfigSchema using safeParse:
   ```
   node --import tsx/esm -e "import { ConfigSchema } from './src/config/schema.js'; const result = ConfigSchema.safeParse(JSON.parse(process.argv[2])); console.log(JSON.stringify({ valid: result.success, error: result.success ? null : result.error.message }));" '{updatedConfigJson}'
   ```

2. If valid: write the config using writeConfig:
   ```
   node --import tsx/esm -e "import { writeConfig } from './src/config/writer.js'; writeConfig(process.cwd(), JSON.parse(process.argv[2]));" '{updatedConfigJson}'
   ```
   Display: "Updated {section}.{field}: {oldValue} -> {newValue}."

3. If invalid: display the Zod error message and revert the change. Do not write invalid config to disk.

4. Return to the section editor. The user can make more changes or select 'back' to return to the main menu.

## Error Handling

- If config.yml is missing: "No config found. Run /codescope:onboard first."
- If ConfigSchema validation fails on any write: show the Zod error message, do not write the invalid config.
- If conventions-enforced.md is missing when rollback requested: "No enforced conventions file found."
- If global memory path is not writable: display the filesystem error.
- If loadConfig throws (malformed YAML): display the parse error and suggest running /codescope:onboard to regenerate.
