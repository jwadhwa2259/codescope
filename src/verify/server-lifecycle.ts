// ---------------------------------------------------------------------------
// Server Lifecycle Management
// ---------------------------------------------------------------------------
// Handles starting a development server, waiting for readiness, and clean
// shutdown with process group killing and port verification.
// Per D-15: Three readiness strategies (health check polling, stdout signal, fixed delay)
// Per D-16: Server cleanup (SIGTERM process group, port verification, force kill via lsof)
// ---------------------------------------------------------------------------

import { spawn, execSync } from "node:child_process";
import type { ChildProcess } from "node:child_process";

// ---- Types ----

export interface ServerHandle {
  process: ChildProcess;
  port: number;
  pid: number;
}

export interface StartServerOptions {
  healthCheck?: string;
  readySignal?: string;
  timeoutSeconds: number;
}

// ---- Helpers ----

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Extract port from a URL string or command.
 * Tries URL parsing first, then regex, defaults to 3000.
 */
function extractPort(urlOrCommand: string): number {
  try {
    const url = new URL(urlOrCommand);
    if (url.port) return parseInt(url.port, 10);
    // Default ports by protocol
    if (url.protocol === "https:") return 443;
    if (url.protocol === "http:") return 80;
  } catch {
    // Not a valid URL, try regex
  }

  const match = urlOrCommand.match(/:(\d{4,5})/);
  if (match) return parseInt(match[1], 10);

  return 3000;
}

/**
 * Check if a port is currently in use via lsof.
 */
function isPortInUse(port: number): boolean {
  try {
    const result = execSync("lsof -ti :" + port, { encoding: "utf-8" }).trim();
    return result.length > 0;
  } catch {
    return false;
  }
}

// ---- Main Functions ----

/**
 * Start a server process and wait for readiness.
 *
 * Readiness strategies (per D-15):
 * 1. healthCheck: poll URL every 1s until ok response
 * 2. readySignal: watch stdout for signal string
 * 3. Neither: wait 5s fixed delay
 */
export async function startServer(
  command: string,
  options: StartServerOptions,
): Promise<ServerHandle> {
  const child = spawn("sh", ["-c", command], {
    detached: true,
    stdio: ["ignore", "pipe", "pipe"],
  });

  const port = options.healthCheck
    ? extractPort(options.healthCheck)
    : 3000;

  const pid = child.pid!;
  const deadline = Date.now() + options.timeoutSeconds * 1000;

  if (options.healthCheck) {
    // Strategy 1: Health check polling every 1s
    const url = options.healthCheck;
    while (Date.now() < deadline) {
      try {
        const res = await fetch(url);
        if (res.ok) {
          return { process: child, port, pid };
        }
      } catch {
        // Server not ready yet, retry
      }
      await sleep(1000);
    }
    throw new Error(
      `Server readiness timeout: health check at ${url} did not return ok within ${options.timeoutSeconds}s`,
    );
  } else if (options.readySignal) {
    // Strategy 2: Watch stdout for ready signal
    const signal = options.readySignal;
    return new Promise<ServerHandle>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(
          new Error(
            `Server readiness timeout: ready signal "${signal}" not seen within ${options.timeoutSeconds}s`,
          ),
        );
      }, options.timeoutSeconds * 1000);

      child.stdout!.on("data", (data: Buffer) => {
        if (data.toString().includes(signal)) {
          clearTimeout(timer);
          resolve({ process: child, port, pid });
        }
      });
    });
  } else {
    // Strategy 3: Fixed 5s delay
    await sleep(5000);
    return { process: child, port, pid };
  }
}

/**
 * Stop a server process and ensure its port is freed.
 *
 * Per D-16:
 * 1. Kill process group via negative PID (SIGTERM)
 * 2. Wait up to 3s for port to free (check every 500ms)
 * 3. If still in use, force kill via lsof PID lookup (SIGKILL)
 */
export async function stopServer(handle: ServerHandle): Promise<void> {
  // Step 1: Kill process group
  try {
    process.kill(-handle.pid, "SIGTERM");
  } catch {
    // Already dead
  }

  // Step 2: Wait up to 3s for port to free
  const maxWait = 3000;
  const pollInterval = 500;
  let waited = 0;

  while (waited < maxWait) {
    await sleep(pollInterval);
    waited += pollInterval;
    if (!isPortInUse(handle.port)) {
      return;
    }
  }

  // Step 3: Force kill if port still in use
  try {
    const pidStr = execSync("lsof -ti :" + handle.port, {
      encoding: "utf-8",
    }).trim();
    if (pidStr) {
      const pids = pidStr.split("\n");
      for (const p of pids) {
        const numPid = parseInt(p.trim(), 10);
        if (!isNaN(numPid)) {
          try {
            process.kill(numPid, "SIGKILL");
          } catch {
            // Already dead
          }
        }
      }
    }
  } catch {
    // No process found on port, port is free
  }
}
