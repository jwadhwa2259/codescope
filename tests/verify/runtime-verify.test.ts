import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Hoisted Mocks
// ---------------------------------------------------------------------------

const { mockStartServer, mockStopServer, mockDetectNewEndpoints, mockBuildSmokePrompt } = vi.hoisted(() => {
  return {
    mockStartServer: vi.fn(),
    mockStopServer: vi.fn(),
    mockDetectNewEndpoints: vi.fn().mockResolvedValue([]),
    mockBuildSmokePrompt: vi.fn().mockReturnValue("mock smoke prompt"),
  };
});

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

// Mock node:child_process
vi.mock("node:child_process", () => ({
  execSync: vi.fn(),
}));

// Mock node:fs
vi.mock("node:fs", async () => {
  const actual = await vi.importActual<typeof import("node:fs")>("node:fs");
  return {
    ...actual,
    existsSync: vi.fn().mockReturnValue(false),
    writeFileSync: vi.fn(),
    unlinkSync: vi.fn(),
    readdirSync: vi.fn().mockReturnValue([]),
  };
});

// Mock node:os
vi.mock("node:os", () => ({
  tmpdir: vi.fn().mockReturnValue("/tmp"),
}));

// Mock server-lifecycle
vi.mock("../../src/verify/server-lifecycle.js", () => ({
  startServer: mockStartServer,
  stopServer: mockStopServer,
}));

// Mock smoke-generator
vi.mock("../../src/verify/smoke-generator.js", () => ({
  detectNewEndpoints: mockDetectNewEndpoints,
  buildSmokePrompt: mockBuildSmokePrompt,
}));

import { execSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import type { RuntimeVerifyOptions, RuntimeVerifyResult, VerifyCallbacks, TestResult } from "../../src/verify/types.js";
import { runRuntimeVerify, detectE2ETool, runCommand } from "../../src/verify/runtime-verify.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeOptions(overrides: Partial<RuntimeVerifyOptions> = {}): RuntimeVerifyOptions {
  return {
    projectRoot: "/project",
    taskSlug: "test-task",
    config: {
      build_command: "npm run build",
      timeout_seconds: 30,
      tests: {
        unit: "npm test",
        integration: "npm run test:integration",
      },
      auto_smoke: true,
      static_check: true,
      blast_radius_diff: true,
    },
    changedFiles: ["src/index.ts"],
    ...overrides,
  };
}

function makeCallbacks(): VerifyCallbacks {
  return {
    dispatchReviewAgent: vi.fn().mockResolvedValue("review result"),
    dispatchSmokeAgent: vi.fn().mockResolvedValue(
      JSON.stringify({ passed: 5, failed: 0, total: 5, failures: [] }),
    ),
    onProgress: vi.fn(),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("runtime-verify", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: build succeeds
    vi.mocked(execSync).mockReturnValue(Buffer.from("Build successful\n"));
    mockStartServer.mockResolvedValue({ process: {}, port: 3000, pid: 12345 });
    mockStopServer.mockResolvedValue(undefined);
  });

  describe("runRuntimeVerify", () => {
    it("Test 1: returns RuntimeVerifyResult with build, unitTests, integrationTests, e2e, autoSmoke, timing", async () => {
      const options = makeOptions();
      const callbacks = makeCallbacks();

      const result = await runRuntimeVerify(options, callbacks);

      expect(result).toHaveProperty("build");
      expect(result).toHaveProperty("unitTests");
      expect(result).toHaveProperty("integrationTests");
      expect(result).toHaveProperty("e2e");
      expect(result).toHaveProperty("autoSmoke");
      expect(result).toHaveProperty("timing");
      expect(result.build).toHaveProperty("status");
      expect(result.build).toHaveProperty("duration_ms");
    });

    it("Test 2: build runs config.build_command and captures pass/fail with exit code", async () => {
      vi.mocked(execSync).mockReturnValue(Buffer.from("Build successful\n"));

      const options = makeOptions();
      const callbacks = makeCallbacks();
      const result = await runRuntimeVerify(options, callbacks);

      expect(result.build.status).toBe("pass");
      expect(result.build.exitCode).toBe(0);
      expect(result.build.command).toBe("npm run build");
    });

    it("Test 3: build failure short-circuits all subsequent checks", async () => {
      // Build fails
      const buildError = new Error("Build failed");
      (buildError as any).status = 1;
      (buildError as any).stdout = Buffer.from("Error: compilation failed");
      (buildError as any).stderr = Buffer.from("src/index.ts: type error");
      vi.mocked(execSync).mockImplementation((cmd: string) => {
        const cmdStr = String(cmd);
        if (cmdStr.includes("build")) {
          throw buildError;
        }
        return Buffer.from("ok");
      });

      const options = makeOptions();
      const callbacks = makeCallbacks();
      const result = await runRuntimeVerify(options, callbacks);

      expect(result.build.status).toBe("fail");
      // Per D-18: all subsequent checks get "skipped"
      expect(result.unitTests.status).toBe("skipped");
      expect(result.integrationTests.status).toBe("skipped");
      expect(result.e2e.status).toBe("skipped");
      expect(result.autoSmoke).toEqual([]);
    });

    it("Test 4: when build_command is not configured, build status is skipped", async () => {
      const options = makeOptions({
        config: {
          timeout_seconds: 30,
          tests: {},
          auto_smoke: false,
          static_check: true,
          blast_radius_diff: true,
        },
      });
      const callbacks = makeCallbacks();
      const result = await runRuntimeVerify(options, callbacks);

      expect(result.build.status).toBe("skipped");
    });

    it("Test 5: unit tests run config.tests.unit command and extract pass/fail via callback", async () => {
      const options = makeOptions();
      const callbacks = makeCallbacks();

      // Mock the LLM extraction response for test results
      vi.mocked(callbacks.dispatchSmokeAgent).mockResolvedValue(
        JSON.stringify({ passed: 10, failed: 2, total: 12, failures: [{ testName: "should work", file: "test.ts", line: 5, error: "expected true" }] }),
      );

      const result = await runRuntimeVerify(options, callbacks);

      expect(result.unitTests.status).toBeDefined();
      expect(result.unitTests).toHaveProperty("passed");
      expect(result.unitTests).toHaveProperty("failed");
      expect(result.unitTests).toHaveProperty("total");
    });

    it("Test 6: integration tests run same pattern as unit tests", async () => {
      const options = makeOptions();
      const callbacks = makeCallbacks();

      const result = await runRuntimeVerify(options, callbacks);

      expect(result.integrationTests.status).toBeDefined();
      expect(result.integrationTests).toHaveProperty("passed");
    });

    it("Test 7: test output is tail-biased truncated to last 500 lines", async () => {
      // Create output with more than 500 lines
      const longOutput = Array.from({ length: 600 }, (_, i) => `test line ${i}`).join("\n");
      vi.mocked(execSync).mockReturnValue(Buffer.from(longOutput));

      const options = makeOptions();
      const callbacks = makeCallbacks();

      await runRuntimeVerify(options, callbacks);

      // The dispatchSmokeAgent should have been called with truncated output
      const callArgs = vi.mocked(callbacks.dispatchSmokeAgent).mock.calls;
      // At least one call should contain "truncated" text
      const hasLLMCall = callArgs.some(([prompt]) =>
        typeof prompt === "string" && prompt.includes("truncated"),
      );
      // This is true when output exceeds 500 lines
      expect(hasLLMCall).toBe(true);
    });

    it("Test 8: when test command is not configured, test status is skipped", async () => {
      const options = makeOptions({
        config: {
          build_command: "npm run build",
          timeout_seconds: 30,
          tests: {},
          auto_smoke: false,
          static_check: true,
          blast_radius_diff: true,
        },
      });
      const callbacks = makeCallbacks();
      const result = await runRuntimeVerify(options, callbacks);

      expect(result.unitTests.status).toBe("skipped");
      expect(result.integrationTests.status).toBe("skipped");
    });
  });

  describe("detectE2ETool", () => {
    it("Test 9: auto-detects playwright.config.ts -> playwright", () => {
      vi.mocked(fs.existsSync).mockImplementation((p: any) => {
        return String(p).includes("playwright.config.ts");
      });

      const tool = detectE2ETool("/project");
      expect(tool).toBe("playwright");
    });

    it("Test 9b: auto-detects Podfile -> xcode", () => {
      vi.mocked(fs.existsSync).mockImplementation((p: any) => {
        return String(p).includes("Podfile");
      });

      const tool = detectE2ETool("/project");
      expect(tool).toBe("xcode");
    });

    it("Test 9c: auto-detects build.gradle -> gradle", () => {
      vi.mocked(fs.existsSync).mockImplementation((p: any) => {
        return String(p).includes("build.gradle");
      });

      const tool = detectE2ETool("/project");
      expect(tool).toBe("gradle");
    });

    it("Test 9d: auto-detects conftest.py -> pytest", () => {
      vi.mocked(fs.existsSync).mockImplementation((p: any) => {
        return String(p).includes("conftest.py");
      });

      const tool = detectE2ETool("/project");
      expect(tool).toBe("pytest");
    });

    it("Test 9e: returns null when nothing detected", () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);
      vi.mocked(fs.readdirSync).mockReturnValue([]);

      const tool = detectE2ETool("/project");
      expect(tool).toBeNull();
    });
  });

  describe("E2E execution", () => {
    it("Test 10: when e2e.tool is none, E2E is skipped entirely", async () => {
      const options = makeOptions({
        config: {
          build_command: "npm run build",
          timeout_seconds: 30,
          tests: {
            e2e: { tool: "none" },
          },
          auto_smoke: false,
          static_check: true,
          blast_radius_diff: true,
        },
      });
      const callbacks = makeCallbacks();
      const result = await runRuntimeVerify(options, callbacks);

      expect(result.e2e.status).toBe("skipped");
    });

    it("Test 11: E2E with start_command starts server, runs E2E, stops server", async () => {
      const options = makeOptions({
        config: {
          build_command: "npm run build",
          start_command: "npm start",
          health_check: "http://localhost:3000/health",
          timeout_seconds: 30,
          tests: {
            e2e: { tool: "playwright", command: "npx playwright test" },
          },
          auto_smoke: false,
          static_check: true,
          blast_radius_diff: true,
        },
      });
      const callbacks = makeCallbacks();
      const result = await runRuntimeVerify(options, callbacks);

      // Server lifecycle should have been called
      expect(mockStartServer).toHaveBeenCalled();
      expect(mockStopServer).toHaveBeenCalled();
      expect(result.e2e.status).toBeDefined();
    });
  });

  describe("Auto-smoke", () => {
    it("Test 12: detects new endpoints, dispatches smoke agent, writes temp file", async () => {
      // Detect new endpoints
      mockDetectNewEndpoints.mockResolvedValue([
        { file: "src/routes/users.ts", method: "GET", route: "/api/users", code: "app.get('/api/users', ...)" },
      ]);

      // LLM returns test code
      const callbacks = makeCallbacks();
      vi.mocked(callbacks.dispatchSmokeAgent).mockResolvedValue(
        '```typescript\nimport { test } from "vitest";\ntest("smoke", () => { expect(true).toBe(true); });\n```',
      );

      // Build succeeds, skip other tests for this test
      const options = makeOptions({
        config: {
          build_command: "npm run build",
          timeout_seconds: 30,
          tests: {},
          auto_smoke: true,
          static_check: true,
          blast_radius_diff: true,
        },
      });

      await runRuntimeVerify(options, callbacks);

      // Should have called detectNewEndpoints
      expect(mockDetectNewEndpoints).toHaveBeenCalledWith("/project", ["src/index.ts"]);
      // Should have dispatched smoke agent
      expect(callbacks.dispatchSmokeAgent).toHaveBeenCalled();
    });

    it("Test 13: temp files cleaned up even on test failure (try/finally)", async () => {
      mockDetectNewEndpoints.mockResolvedValue([
        { file: "src/routes/users.ts", method: "GET", route: "/api/users", code: "app.get('/api/users', ...)" },
      ]);

      const callbacks = makeCallbacks();
      vi.mocked(callbacks.dispatchSmokeAgent).mockResolvedValue(
        '```typescript\ntest("smoke", () => {});\n```',
      );

      // Make the smoke test execution fail
      vi.mocked(execSync).mockImplementation((cmd: string) => {
        const cmdStr = String(cmd);
        if (cmdStr.includes("smoke")) {
          throw new Error("Test execution failed");
        }
        return Buffer.from("ok");
      });

      const options = makeOptions({
        config: {
          build_command: "npm run build",
          timeout_seconds: 30,
          tests: {},
          auto_smoke: true,
          static_check: true,
          blast_radius_diff: true,
        },
      });

      await runRuntimeVerify(options, callbacks);

      // Temp file should have been cleaned up via fs.unlinkSync
      expect(fs.unlinkSync).toHaveBeenCalled();
    });

    it("Test 14: when auto_smoke is false, smoke is skipped", async () => {
      const options = makeOptions({
        config: {
          build_command: "npm run build",
          timeout_seconds: 30,
          tests: {},
          auto_smoke: false,
          static_check: true,
          blast_radius_diff: true,
        },
      });
      const callbacks = makeCallbacks();
      const result = await runRuntimeVerify(options, callbacks);

      expect(result.autoSmoke).toEqual([]);
      expect(mockDetectNewEndpoints).not.toHaveBeenCalled();
    });
  });

  describe("runCommand", () => {
    it("captures exitCode 0 on success", () => {
      vi.mocked(execSync).mockReturnValue(Buffer.from("output text"));

      const result = runCommand("echo hello", "/project");

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("output text");
    });

    it("captures non-zero exitCode on failure", () => {
      const error = new Error("Command failed");
      (error as any).status = 1;
      (error as any).stdout = Buffer.from("stdout text");
      (error as any).stderr = Buffer.from("stderr text");
      vi.mocked(execSync).mockImplementation(() => {
        throw error;
      });

      const result = runCommand("failing cmd", "/project");

      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain("stderr text");
    });
  });
});
