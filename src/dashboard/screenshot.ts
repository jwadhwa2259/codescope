// ---------------------------------------------------------------------------
// Screenshot export: headless Playwright capture of the CodeScope dashboard.
// Per VIZ-08, D-40: CLI-runnable headless screenshot at 1920x1080.
// ---------------------------------------------------------------------------

import { startDashboard } from "./server.js";

const DEFAULT_PORT = 7463;
const VIEWPORT_WIDTH = 1920;
const VIEWPORT_HEIGHT = 1080;
const LAYOUT_SETTLE_MS = 2000;

/**
 * Check whether a port is already listening by attempting a fetch.
 */
async function isPortListening(port: number): Promise<boolean> {
  try {
    const res = await fetch(`http://localhost:${port}/api/status`);
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Capture a PNG screenshot of the CodeScope dashboard using headless Playwright.
 *
 * - Dynamically imports playwright (dev dependency) to avoid runtime failure
 *   if not installed.
 * - Starts the dashboard server if not already running.
 * - Launches a headless Chromium browser at 1920x1080 viewport.
 * - Waits for data load and ForceAtlas2 layout to settle before capture.
 *
 * @param outputPath - Filesystem path for the output PNG
 * @param port - Dashboard port (default 7463)
 */
export async function captureScreenshot(
  outputPath: string,
  port?: number,
): Promise<void> {
  const serverPort = port ?? DEFAULT_PORT;

  // 1. Start dashboard server if not already running
  const running = await isPortListening(serverPort);
  let serverStarted = false;
  if (!running) {
    startDashboard(serverPort);
    serverStarted = true;
    // Give server a moment to start
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  // 2. Dynamic import of playwright (dev dependency)
  let chromium: typeof import("playwright").chromium;
  try {
    const pw = await import("playwright");
    chromium = pw.chromium;
  } catch {
    throw new Error(
      "Playwright is not installed. Install it with: npm install -D playwright",
    );
  }

  // 3. Launch headless browser
  const browser = await chromium.launch({ headless: true });

  try {
    // 4. Create page with specified viewport
    const page = await browser.newPage({
      viewport: { width: VIEWPORT_WIDTH, height: VIEWPORT_HEIGHT },
    });

    // 5. Navigate to dashboard
    await page.goto(`http://localhost:${serverPort}`, {
      waitUntil: "networkidle",
    });

    // 6. Wait for data load -- status bar indicates dashboard has rendered
    await page.waitForSelector(".status-bar", {
      state: "visible",
      timeout: 10_000,
    }).catch(() => {
      // Status bar may not exist if no data -- continue anyway
    });

    // Additional delay for FA2 layout to settle
    await new Promise((resolve) => setTimeout(resolve, LAYOUT_SETTLE_MS));

    // 7. Capture screenshot
    await page.screenshot({ path: outputPath, fullPage: false });

    console.log(`Screenshot saved to ${outputPath}`);
  } finally {
    // 8. Cleanup
    await browser.close();
  }
}

// ---------------------------------------------------------------------------
// CLI entry point: npx tsx src/dashboard/screenshot.ts [output.png]
// ---------------------------------------------------------------------------

if (process.argv[1]?.endsWith("screenshot")) {
  const outputPath = process.argv[2] ?? "codescope-dashboard.png";
  captureScreenshot(outputPath)
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
