import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import * as crypto from "node:crypto";

// We import detectTestSetup (will be exported) and runResearcher for e2e check
import {
  detectTestSetup,
  runResearcher,
} from "../../src/agents/researcher.js";

function makeTmpDir(label: string): string {
  const dir = path.join(
    os.tmpdir(),
    `codescope-wrapper-detect-${label}-${crypto.randomUUID()}`,
  );
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/**
 * Write a minimal package.json with vitest in devDeps.
 */
function writePackageJson(
  dir: string,
  opts: { devDeps?: Record<string, string>; scripts?: Record<string, string> } = {},
): void {
  const pkg = {
    name: "test-project",
    version: "1.0.0",
    scripts: opts.scripts ?? { test: "vitest run" },
    devDependencies: opts.devDeps ?? { vitest: "^4.1.0" },
  };
  fs.writeFileSync(path.join(dir, "package.json"), JSON.stringify(pkg, null, 2));
}

/**
 * Create a test file with given import statement content.
 */
function createTestFile(dir: string, filename: string, content: string): void {
  const filePath = path.join(dir, filename);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, "utf-8");
}

describe("Wrapper test framework detection", () => {
  let tmpDir: string;

  afterEach(() => {
    if (tmpDir && fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("Test 1: detects @effect/vitest wrapper from test file imports", () => {
    tmpDir = makeTmpDir("effect-vitest");
    writePackageJson(tmpDir);
    fs.mkdirSync(path.join(tmpDir, "vitest.config.ts").replace(/vitest\.config\.ts$/, ""), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, "vitest.config.ts"), 'export default {};\n');

    // Create test files importing @effect/vitest
    createTestFile(
      tmpDir,
      "tests/math.test.ts",
      `import { it, describe } from "@effect/vitest";\nimport { Effect } from "effect";\n\ndescribe("math", () => {\n  it.effect("adds", () => Effect.succeed(1));\n});\n`,
    );
    createTestFile(
      tmpDir,
      "tests/pipe.test.ts",
      `import { it } from "@effect/vitest";\nimport { pipe } from "effect";\n\nit.effect("pipes", () => Effect.succeed(true));\n`,
    );

    const pkgJsonPath = path.join(tmpDir, "package.json");
    const result = detectTestSetup(tmpDir, pkgJsonPath);

    expect(result.framework).toBe("@effect/vitest");
  });

  it("Test 2: detects @testing-library/react wrapper from test file imports", () => {
    tmpDir = makeTmpDir("testing-library");
    writePackageJson(tmpDir, {
      devDeps: { jest: "^29.0.0", "@testing-library/react": "^14.0.0" },
      scripts: { test: "jest" },
    });
    fs.writeFileSync(
      path.join(tmpDir, "jest.config.js"),
      "module.exports = {};\n",
    );

    createTestFile(
      tmpDir,
      "tests/button.test.tsx",
      `import { render, screen } from "@testing-library/react";\nimport { Button } from "../src/Button";\n\ntest("renders", () => {\n  render(<Button />);\n  screen.getByText("Click");\n});\n`,
    );

    const pkgJsonPath = path.join(tmpDir, "package.json");
    const result = detectTestSetup(tmpDir, pkgJsonPath);

    expect(result.framework).toBe("react-testing-library");
  });

  it("Test 3: returns plain 'vitest' when test files import only vitest directly", () => {
    tmpDir = makeTmpDir("plain-vitest");
    writePackageJson(tmpDir);
    fs.writeFileSync(path.join(tmpDir, "vitest.config.ts"), 'export default {};\n');

    createTestFile(
      tmpDir,
      "tests/utils.test.ts",
      `import { describe, it, expect } from "vitest";\n\ndescribe("utils", () => {\n  it("works", () => {\n    expect(1 + 1).toBe(2);\n  });\n});\n`,
    );

    const pkgJsonPath = path.join(tmpDir, "package.json");
    const result = detectTestSetup(tmpDir, pkgJsonPath);

    // Should remain "vitest", not be changed by wrapper detection
    expect(result.framework).toBe("vitest");
  });

  it("Test 4: returns framework from config/devDeps when no test files exist", () => {
    tmpDir = makeTmpDir("no-test-files");
    writePackageJson(tmpDir);
    // vitest.config.ts present, but no test directory or test files
    fs.writeFileSync(path.join(tmpDir, "vitest.config.ts"), 'export default {};\n');

    const pkgJsonPath = path.join(tmpDir, "package.json");
    const result = detectTestSetup(tmpDir, pkgJsonPath);

    // Should fall back to config file detection -> "vitest"
    expect(result.framework).toBe("vitest");
  });

  it("Test 5: handles non-existent test directory gracefully", () => {
    tmpDir = makeTmpDir("no-test-dir");
    writePackageJson(tmpDir);
    // No vitest.config.ts, no test dirs, just devDeps with vitest

    const pkgJsonPath = path.join(tmpDir, "package.json");
    const result = detectTestSetup(tmpDir, pkgJsonPath);

    // Should return "vitest" from devDeps, not crash
    expect(result.framework).toBe("vitest");
    expect(result.testDir).toBeNull();
  });

  it("Test 6: @effect/vitest appears in overview.md output", async () => {
    tmpDir = makeTmpDir("e2e-effect");
    writePackageJson(tmpDir);
    fs.writeFileSync(path.join(tmpDir, "vitest.config.ts"), 'export default {};\n');

    createTestFile(
      tmpDir,
      "tests/service.test.ts",
      `import { it } from "@effect/vitest";\nimport { Effect } from "effect";\n\nit.effect("runs", () => Effect.succeed(42));\n`,
    );

    const outputDir = path.join(tmpDir, ".claude", "codescope");
    fs.mkdirSync(outputDir, { recursive: true });

    const result = await runResearcher({ projectRoot: tmpDir, outputDir });
    const content = fs.readFileSync(result.overviewPath, "utf-8");

    // The Test Setup section should show @effect/vitest, not just "vitest"
    const testSetupStart = content.indexOf("## Test Setup");
    const testSetupEnd = content.indexOf("## Build and Deploy");
    const testSection = content.substring(testSetupStart, testSetupEnd);

    expect(testSection).toContain("@effect/vitest");
  });
});
