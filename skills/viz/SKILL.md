---
name: viz
description: Launch the CodeScope visualization dashboard in your browser.
allowed-tools:
  - Bash
  - Read
---

# /codescope:viz

Launch the interactive CodeScope visualization dashboard. The dashboard provides five panels: dependency graph (sigma.js), convention heatmap, readiness trends, blast radius explorer, and command center. All data is read from the local `.claude/codescope/` analysis artifacts.

**Arguments:** $ARGUMENTS

## Steps

### Step 1: Check if server is already running

```bash
curl -s http://localhost:7463/api/status
```

If the response is valid JSON (server already running), skip to **Step 4**.

### Step 2: Check if build exists

```bash
ls dist/dashboard/server.mjs 2>/dev/null
```

If the file does not exist, build first:

```bash
npm run build
```

### Step 3: Launch dashboard server

Start the server in the background:

```bash
node dist/dashboard/server.mjs &
```

Wait for the server to be ready (poll up to 10 seconds):

```bash
for i in $(seq 1 10); do
  if curl -s http://localhost:7463/api/status > /dev/null 2>&1; then
    break
  fi
  sleep 1
done
```

### Step 4: Open browser

On macOS:

```bash
open http://localhost:7463
```

On Linux:

```bash
xdg-open http://localhost:7463
```

### Step 5: Report to user

Tell the user:

- Dashboard running at **http://localhost:7463**
- Use keyboard shortcuts **1-5** to switch between panels:
  1. Graph (dependency visualization)
  2. Heatmap (convention compliance)
  3. Trends (readiness history)
  4. Blast Radius (impact explorer)
  5. Command Center (actions)

## Screenshot Mode

If `$ARGUMENTS` contains `--screenshot`:

1. Extract the output path from arguments (default: `codescope-dashboard.png`).
2. Run the screenshot capture script:

```bash
npx tsx src/dashboard/screenshot.ts {output_path}
```

3. Report the saved file path to the user.
