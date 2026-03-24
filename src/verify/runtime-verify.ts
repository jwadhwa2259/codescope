// ---------------------------------------------------------------------------
// Runtime Verify Agent Module
// ---------------------------------------------------------------------------
// Follows the Options + Result + async function pattern (D-20).
// Runs second in the verification pipeline (per D-17).
// Build failure short-circuits all subsequent checks (per D-18).
// Test output is tail-biased truncated to 500 lines (per D-27).
// LLM extraction for universal test output parsing (per D-26).
// E2E auto-detection from project files (per D-11).
// Auto-smoke detects new endpoints and generates reachability tests (per D-12).
// Temp smoke files are cleaned up after running (per Pitfall 6).
// ---------------------------------------------------------------------------

import { execSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import type {
  RuntimeVerifyOptions,
  RuntimeVerifyResult,
  TestResult,
  SmokeResult,
  CheckStatus,
  VerifyCallbacks,
} from "./types.js";
import { startServer, stopServer } from "./server-lifecycle.js";
import { detectNewEndpoints, buildSmokePrompt } from "./smoke-generator.js";

// ---- Helpers ----

/**
 * Run a shell command and capture exit code, stdout, stderr, and timing.
 */
export function runCommand(
  command: string,
  cwd: string,
): { exitCode: number; stdout: string; stderr: string; duration_ms: number } {
  const start = Date.now();
  try {
    const stdout = execSync(command, {
      cwd,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
      maxBuffer: 10 * 1024 * 1024, // 10MB
    });
    return {
      exitCode: 0,
      stdout: typeof stdout === "string" ? stdout : String(stdout),
      stderr: "",
      duration_ms: Date.now() - start,
    };
  } catch (error: any) {
    return {
      exitCode: error.status ?? 1,
      stdout: error.stdout
        ? typeof error.stdout === "string"
          ? error.stdout
          : String(error.stdout)
        : "",
      stderr: error.stderr
        ? typeof error.stderr === "string"
          ? error.stderr
          : String(error.stderr)
        : "",
      duration_ms: Date.now() - start,
    };
  }
}

/**
 * Tail-biased truncation: keep last maxLines lines of output.
 * Per D-27: prefix with truncation notice.
 */
function truncateOutput(output: string, maxLines: number = 500): string {
  const lines = output.split("\n");
  if (lines.length <= maxLines) return output;
  const truncated = lines.slice(-maxLines);
  return `Output truncated -- showing last ${maxLines} of ${lines.length} lines.\n${truncated.join("\n")}`;
}

/**
 * Build an LLM prompt for extracting test results from raw output.
 * Per D-26: LLM extraction is universal across all test frameworks.
 */
function buildTestExtractionPrompt(rawOutput: string, testType: string): string {
  const truncated = truncateOutput(rawOutput);
  return `Extract test results from this ${testType} output.

Return JSON: { "passed": number, "failed": number, "total": number, "failures": [{ "testName": string, "file": string, "line": number, "error": string }] }

Raw output:
\`\`\`
${truncated}
\`\`\`

If the output doesn't look like test output, return { "passed": 0, "failed": 0, "total": 0, "failures": [] }`;
}

/**
 * Auto-detect E2E tool from project files.
 * Per D-11: check in order.
 */
export function detectE2ETool(projectRoot: string): string | null {
  // 1. Playwright
  if (
    fs.existsSync(path.join(projectRoot, "playwright.config.ts")) ||
    fs.existsSync(path.join(projectRoot, "playwright.config.js"))
  ) {
    return "playwright";
  }

  // 2. Xcode (Podfile or *.xcodeproj)
  if (fs.existsSync(path.join(projectRoot, "Podfile"))) {
    return "xcode";
  }
  try {
    const entries = fs.readdirSync(projectRoot);
    if (entries.some((e: string) => e.endsWith(".xcodeproj"))) {
      return "xcode";
    }
  } catch {
    // Ignore
  }

  // 3. Gradle
  if (
    fs.existsSync(path.join(projectRoot, "build.gradle")) ||
    fs.existsSync(path.join(projectRoot, "build.gradle.kts"))
  ) {
    return "gradle";
  }

  // 4. pytest
  if (fs.existsSync(path.join(projectRoot, "conftest.py"))) {
    return "pytest";
  }

  return null;
}

/**
 * Create a skipped TestResult.
 */
function skippedTestResult(): TestResult {
  return {
    status: "skipped",
    passed: 0,
    failed: 0,
    total: 0,
    duration_ms: 0,
    failures: [],
  };
}

/**
 * Parse test results from LLM extraction response.
 */
function parseTestResults(
  llmResponse: string,
  commandResult: { exitCode: number; stdout: string; stderr: string; duration_ms: number },
): TestResult {
  try {
    // Try to extract JSON from the response
    const jsonMatch = llmResponse.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return {
        status: commandResult.exitCode === 0 ? "pass" : "fail",
        passed: 0,
        failed: 0,
        total: 0,
        duration_ms: commandResult.duration_ms,
        failures: [],
        rawOutputTail: truncateOutput(commandResult.stdout + commandResult.stderr),
      };
    }

    const parsed = JSON.parse(jsonMatch[0]);
    const status: CheckStatus =
      parsed.failed > 0 ? "fail" : commandResult.exitCode === 0 ? "pass" : "fail";

    return {
      status,
      passed: parsed.passed ?? 0,
      failed: parsed.failed ?? 0,
      total: parsed.total ?? 0,
      duration_ms: commandResult.duration_ms,
      failures: parsed.failures ?? [],
      rawOutputTail:
        status === "fail"
          ? truncateOutput(commandResult.stdout + commandResult.stderr)
          : undefined,
    };
  } catch {
    return {
      status: commandResult.exitCode === 0 ? "pass" : "fail",
      passed: 0,
      failed: 0,
      total: 0,
      duration_ms: commandResult.duration_ms,
      failures: [],
      rawOutputTail: truncateOutput(commandResult.stdout + commandResult.stderr),
    };
  }
}

/**
 * Run tests (unit or integration) with LLM extraction.
 */
async function runTests(
  command: string | undefined,
  testType: string,
  projectRoot: string,
  buildFailed: boolean,
  callbacks: VerifyCallbacks,
): Promise<TestResult> {
  if (buildFailed) return skippedTestResult();
  if (!command) return skippedTestResult();

  callbacks.onProgress(`Running ${testType} tests: ${command}`);
  const result = runCommand(command, projectRoot);

  // LLM extraction of test results (per D-26)
  const prompt = buildTestExtractionPrompt(
    result.stdout + "\n" + result.stderr,
    testType,
  );
  const llmResponse = await callbacks.dispatchSmokeAgent(prompt);
  return parseTestResults(llmResponse, result);
}

/**
 * Extract code from LLM response (remove markdown code block markers).
 */
function extractCodeFromResponse(response: string): string {
  const codeBlockMatch = response.match(/```(?:\w+)?\n([\s\S]*?)```/);
  if (codeBlockMatch) return codeBlockMatch[1];
  return response;
}

// ---- Main Function ----

/**
 * Runtime verify agent: validates that changes build, tests pass, and E2E works.
 *
 * Pipeline:
 * 1. Build (short-circuits on failure per D-18)
 * 2. Unit tests
 * 3. Integration tests
 * 4. E2E (with server lifecycle)
 * 5. Auto-smoke (new endpoint detection + temp test generation)
 */
export async function runRuntimeVerify(
  options: RuntimeVerifyOptions,
  callbacks: VerifyCallbacks,
): Promise<RuntimeVerifyResult> {
  const { projectRoot, config, changedFiles } = options;
  const timing: Record<string, number> = {};

  // ---- Step 1: Build ----
  let buildStatus: RuntimeVerifyResult["build"];
  let buildFailed = false;

  if (!config.build_command) {
    buildStatus = { status: "skipped", duration_ms: 0 };
  } else {
    callbacks.onProgress(`Running build: ${config.build_command}`);
    const buildResult = runCommand(config.build_command, projectRoot);
    timing.build_ms = buildResult.duration_ms;

    if (buildResult.exitCode !== 0) {
      buildStatus = {
        status: "fail",
        command: config.build_command,
        output: truncateOutput(buildResult.stdout + "\n" + buildResult.stderr),
        exitCode: buildResult.exitCode,
        duration_ms: buildResult.duration_ms,
      };
      buildFailed = true;
    } else {
      buildStatus = {
        status: "pass",
        command: config.build_command,
        exitCode: 0,
        duration_ms: buildResult.duration_ms,
      };
    }
  }

  // ---- Step 2: Unit tests (skipped if build failed per D-18) ----
  const unitTests = await runTests(
    config.tests.unit,
    "unit",
    projectRoot,
    buildFailed,
    callbacks,
  );
  timing.unitTests_ms = unitTests.duration_ms;

  // ---- Step 3: Integration tests (skipped if build failed per D-18) ----
  const integrationTests = await runTests(
    config.tests.integration,
    "integration",
    projectRoot,
    buildFailed,
    callbacks,
  );
  timing.integrationTests_ms = integrationTests.duration_ms;

  // ---- Step 4: E2E (skipped if build failed per D-18) ----
  let e2e: TestResult;

  if (buildFailed) {
    e2e = skippedTestResult();
  } else {
    // Determine E2E tool
    const e2eConfig = config.tests.e2e;
    const tool = e2eConfig?.tool ?? detectE2ETool(projectRoot);

    if (!tool || tool === "none") {
      e2e = skippedTestResult();
    } else {
      callbacks.onProgress(`Running E2E tests with ${tool}`);
      const e2eCommand =
        e2eConfig?.command ?? getDefaultE2ECommand(tool);

      let serverHandle: Awaited<ReturnType<typeof startServer>> | null = null;

      try {
        // Start server if configured
        if (config.start_command) {
          callbacks.onProgress(
            `Starting server: ${config.start_command}`,
          );
          serverHandle = await startServer(config.start_command, {
            healthCheck: config.health_check,
            readySignal: config.ready_signal,
            timeoutSeconds: config.timeout_seconds,
          });
        }

        // Run E2E command
        const e2eResult = runCommand(e2eCommand, projectRoot);
        const prompt = buildTestExtractionPrompt(
          e2eResult.stdout + "\n" + e2eResult.stderr,
          "e2e",
        );
        const llmResponse = await callbacks.dispatchSmokeAgent(prompt);
        e2e = parseTestResults(llmResponse, e2eResult);
        timing.e2e_ms = e2eResult.duration_ms;
      } finally {
        // Stop server if started
        if (serverHandle) {
          callbacks.onProgress("Stopping server");
          await stopServer(serverHandle);
        }
      }
    }
  }

  // ---- Step 5: Auto-smoke (skipped if build failed or !config.auto_smoke) ----
  let autoSmoke: SmokeResult[] = [];

  if (!buildFailed && config.auto_smoke) {
    callbacks.onProgress("Detecting new endpoints for auto-smoke");

    // Detect new endpoints via web-tree-sitter AST (per D-14)
    const endpoints = await detectNewEndpoints(projectRoot, changedFiles);

    if (endpoints.length > 0) {
      callbacks.onProgress(
        `Found ${endpoints.length} new endpoint(s), generating smoke tests`,
      );

      // Build smoke prompt and dispatch to LLM
      const prompt = buildSmokePrompt(endpoints, "vitest");
      const smokeResponse = await callbacks.dispatchSmokeAgent(prompt);
      const testCode = extractCodeFromResponse(smokeResponse);

      // Write temp file and run (per D-12, Pitfall 6)
      const tempPath = path.join(
        os.tmpdir(),
        `codescope-smoke-${Date.now()}.test.ts`,
      );

      try {
        fs.writeFileSync(tempPath, testCode, "utf-8");
        callbacks.onProgress(`Running smoke tests: ${tempPath}`);

        try {
          const smokeResult = runCommand(
            `npx vitest run ${tempPath} --bail 1`,
            projectRoot,
          );
          // Parse smoke results -- basic pass/fail per endpoint
          for (const ep of endpoints) {
            autoSmoke.push({
              endpoint: ep.route,
              method: ep.method,
              expectedStatus: 200,
              actualStatus: smokeResult.exitCode === 0 ? 200 : null,
              passed: smokeResult.exitCode === 0,
              severity: smokeResult.exitCode === 0 ? "INFO" : "WARN",
            });
          }
        } catch {
          // Smoke test execution failed, still report endpoints as attempted
          for (const ep of endpoints) {
            autoSmoke.push({
              endpoint: ep.route,
              method: ep.method,
              expectedStatus: 200,
              actualStatus: null,
              passed: false,
              severity: "WARN",
            });
          }
        }
      } finally {
        // Always clean up temp file (per Pitfall 6)
        try {
          fs.unlinkSync(tempPath);
        } catch {
          // File may not exist if writeFileSync failed
        }
      }
    }
  }

  return {
    build: buildStatus,
    unitTests,
    integrationTests,
    e2e,
    autoSmoke,
    timing,
  };
}

/**
 * Get default E2E command for a detected tool.
 */
function getDefaultE2ECommand(tool: string): string {
  switch (tool) {
    case "playwright":
      return "npx playwright test";
    case "xcode":
      return "xcodebuild test";
    case "gradle":
      return "./gradlew connectedAndroidTest";
    case "pytest":
      return "pytest -x";
    default:
      return `npx ${tool} test`;
  }
}
