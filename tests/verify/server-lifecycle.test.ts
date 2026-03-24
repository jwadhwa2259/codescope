import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { ChildProcess } from "node:child_process";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

// Mock node:child_process
vi.mock("node:child_process", () => ({
  spawn: vi.fn(),
  execSync: vi.fn(),
}));

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

import { spawn, execSync } from "node:child_process";
import { startServer, stopServer, type ServerHandle } from "../../src/verify/server-lifecycle.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createMockProcess(pid: number): {
  process: ChildProcess;
  stdoutListeners: Map<string, Function>;
} {
  const stdoutListeners = new Map<string, Function>();
  const stderrListeners = new Map<string, Function>();
  const processListeners = new Map<string, Function>();

  const mockStdout = {
    on: vi.fn((event: string, cb: Function) => {
      stdoutListeners.set(event, cb);
    }),
  };
  const mockStderr = {
    on: vi.fn((event: string, cb: Function) => {
      stderrListeners.set(event, cb);
    }),
  };

  const proc = {
    pid,
    stdout: mockStdout,
    stderr: mockStderr,
    on: vi.fn((event: string, cb: Function) => {
      processListeners.set(event, cb);
    }),
    unref: vi.fn(),
  } as unknown as ChildProcess;

  return { process: proc, stdoutListeners };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("server-lifecycle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("startServer", () => {
    it("Test 1: spawns process with detached: true for process group killing", async () => {
      const { process: mockProc } = createMockProcess(12345);
      vi.mocked(spawn).mockReturnValue(mockProc);

      // Use fixed delay (no health_check or ready_signal)
      const promise = startServer("npm start", { timeoutSeconds: 10 });

      // Advance past the 5s fixed delay
      await vi.advanceTimersByTimeAsync(5100);

      const handle = await promise;

      expect(spawn).toHaveBeenCalledWith(
        "sh",
        ["-c", "npm start"],
        expect.objectContaining({
          detached: true,
          stdio: ["ignore", "pipe", "pipe"],
        }),
      );
      expect(handle.pid).toBe(12345);
    });

    it("Test 2: with health_check polls URL every 1s until ok response", async () => {
      const { process: mockProc } = createMockProcess(12345);
      vi.mocked(spawn).mockReturnValue(mockProc);

      // First two polls fail, third succeeds
      mockFetch
        .mockRejectedValueOnce(new Error("ECONNREFUSED"))
        .mockRejectedValueOnce(new Error("ECONNREFUSED"))
        .mockResolvedValueOnce({ ok: true });

      const promise = startServer("npm start", {
        healthCheck: "http://localhost:3000/health",
        timeoutSeconds: 30,
      });

      // Advance past three 1s polling intervals
      await vi.advanceTimersByTimeAsync(1000);
      await vi.advanceTimersByTimeAsync(1000);
      await vi.advanceTimersByTimeAsync(1000);

      const handle = await promise;

      expect(handle.port).toBe(3000);
      expect(mockFetch).toHaveBeenCalledWith("http://localhost:3000/health");
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });

    it("Test 3: with ready_signal watches stdout for signal string", async () => {
      const { process: mockProc, stdoutListeners } = createMockProcess(12345);
      vi.mocked(spawn).mockReturnValue(mockProc);

      const promise = startServer("npm start", {
        readySignal: "Server listening",
        timeoutSeconds: 30,
      });

      // Simulate stdout emitting the ready signal
      await vi.advanceTimersByTimeAsync(100);
      const dataHandler = stdoutListeners.get("data");
      expect(dataHandler).toBeDefined();
      dataHandler!(Buffer.from("Server listening on port 3000"));

      const handle = await promise;
      expect(handle.pid).toBe(12345);
    });

    it("Test 4: with neither health_check nor ready_signal waits 5s fixed delay", async () => {
      const { process: mockProc } = createMockProcess(12345);
      vi.mocked(spawn).mockReturnValue(mockProc);

      const promise = startServer("npm start", { timeoutSeconds: 30 });

      // Should not resolve before 5s
      await vi.advanceTimersByTimeAsync(4900);

      let resolved = false;
      promise.then(() => {
        resolved = true;
      });
      await vi.advanceTimersByTimeAsync(0);
      expect(resolved).toBe(false);

      // Advance past 5s
      await vi.advanceTimersByTimeAsync(200);
      const handle = await promise;
      expect(handle.pid).toBe(12345);
    });

    it("Test 5: throws on timeout (timeout_seconds exceeded)", async () => {
      const { process: mockProc } = createMockProcess(12345);
      vi.mocked(spawn).mockReturnValue(mockProc);

      // Health check always fails
      mockFetch.mockRejectedValue(new Error("ECONNREFUSED"));

      const promise = startServer("npm start", {
        healthCheck: "http://localhost:3000/health",
        timeoutSeconds: 3,
      });

      // Advance past timeout
      await vi.advanceTimersByTimeAsync(4000);

      await expect(promise).rejects.toThrow(/timeout/i);
    });
  });

  describe("stopServer", () => {
    it("Test 6: sends SIGTERM to process group via negative PID", async () => {
      const killSpy = vi.spyOn(process, "kill").mockImplementation(() => true);

      // Port is free immediately
      vi.mocked(execSync).mockImplementation(() => {
        throw new Error("no process");
      });

      const handle: ServerHandle = {
        process: {} as ChildProcess,
        port: 3000,
        pid: 12345,
      };

      await stopServer(handle);

      expect(killSpy).toHaveBeenCalledWith(-12345, "SIGTERM");
      killSpy.mockRestore();
    });

    it("Test 7: force-kills via lsof if port still in use after 3s", async () => {
      const killSpy = vi.spyOn(process, "kill").mockImplementation(() => true);

      // First calls: port is still in use (lsof returns PID)
      // Then after force kill: port is free
      let callCount = 0;
      vi.mocked(execSync).mockImplementation((cmd: string) => {
        const cmdStr = String(cmd);
        if (cmdStr.includes("lsof")) {
          callCount++;
          if (callCount <= 7) {
            // Port in use for all polling calls and the force-kill query
            return Buffer.from("99999");
          }
          throw new Error("no process"); // Port finally free
        }
        return Buffer.from("");
      });

      const handle: ServerHandle = {
        process: {} as ChildProcess,
        port: 3000,
        pid: 12345,
      };

      const promise = stopServer(handle);

      // Advance through the 500ms port checks up to 3s, then force kill
      for (let i = 0; i < 10; i++) {
        await vi.advanceTimersByTimeAsync(500);
      }

      await promise;

      // Should have attempted SIGTERM on process group first
      expect(killSpy).toHaveBeenCalledWith(-12345, "SIGTERM");
      // Should have force-killed the process occupying the port
      expect(killSpy).toHaveBeenCalledWith(99999, "SIGKILL");
      killSpy.mockRestore();
    });
  });
});
