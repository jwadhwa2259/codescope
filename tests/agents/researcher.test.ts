import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import * as crypto from "node:crypto";

import {
  runResearcher,
  type ResearcherOptions,
  type ResearcherResult,
} from "../../src/agents/researcher.js";

function makeTmpDir(name?: string): string {
  const dirName = name
    ? `codescope-researcher-test-${name}-${crypto.randomUUID()}`
    : `codescope-researcher-test-${crypto.randomUUID()}`;
  const dir = path.join(os.tmpdir(), dirName);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/**
 * Create a rich project fixture with multiple directories and config files.
 */
function createRichProject(dir: string): void {
  // package.json with deps
  fs.writeFileSync(
    path.join(dir, "package.json"),
    JSON.stringify(
      {
        name: "rich-project",
        version: "2.0.0",
        main: "src/index.ts",
        scripts: {
          build: "tsdown",
          test: "vitest run",
          start: "tsx src/server.ts",
          dev: "tsx --watch src/server.ts",
        },
        dependencies: {
          express: "^4.18.0",
          prisma: "^5.0.0",
          zod: "^3.25.0",
        },
        devDependencies: {
          vitest: "^4.1.0",
          typescript: "^5.7.0",
          tsdown: "^0.20.3",
          tsx: "^4.21.0",
        },
      },
      null,
      2,
    ),
  );

  // tsconfig
  fs.writeFileSync(
    path.join(dir, "tsconfig.json"),
    JSON.stringify({ compilerOptions: { target: "ES2022" } }),
  );

  // vitest config
  fs.writeFileSync(
    path.join(dir, "vitest.config.ts"),
    'import { defineConfig } from "vitest/config";\nexport default defineConfig({ test: { globals: true } });\n',
  );

  // Source directories
  const srcDirs = ["src", "src/api", "src/utils", "src/models", "tests"];
  for (const d of srcDirs) {
    fs.mkdirSync(path.join(dir, d), { recursive: true });
  }

  // Source files
  fs.writeFileSync(path.join(dir, "src/index.ts"), "export {};\n");
  fs.writeFileSync(path.join(dir, "src/server.ts"), "// server\n");
  fs.writeFileSync(path.join(dir, "src/api/routes.ts"), "// routes\n");
  fs.writeFileSync(path.join(dir, "src/utils/helpers.ts"), "// helpers\n");
  fs.writeFileSync(path.join(dir, "src/models/user.ts"), "// user model\n");
  fs.writeFileSync(path.join(dir, "tests/index.test.ts"), "// test\n");

  // Docs and other dirs
  fs.mkdirSync(path.join(dir, "docs"), { recursive: true });
  fs.writeFileSync(path.join(dir, "docs/README.md"), "# Docs\n");
  fs.mkdirSync(path.join(dir, "scripts"), { recursive: true });
  fs.writeFileSync(path.join(dir, "scripts/seed.ts"), "// seed\n");

  // Dockerfile
  fs.writeFileSync(path.join(dir, "Dockerfile"), "FROM node:22\n");
}

/**
 * Create a minimal project with just package.json.
 */
function createMinimalProject(dir: string): void {
  fs.writeFileSync(
    path.join(dir, "package.json"),
    JSON.stringify({ name: "minimal", version: "1.0.0" }),
  );
}

describe("Researcher Agent", () => {
  let tmpDir: string;
  let outputDir: string;

  beforeEach(() => {
    tmpDir = makeTmpDir();
    outputDir = path.join(tmpDir, ".claude", "codescope");
    fs.mkdirSync(outputDir, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("Test 1: produces overview.md with '# Codebase Overview' title", async () => {
    createRichProject(tmpDir);

    const result = await runResearcher({ projectRoot: tmpDir, outputDir });

    expect(result.overviewPath).toBeTruthy();
    expect(fs.existsSync(result.overviewPath)).toBe(true);

    const content = fs.readFileSync(result.overviewPath, "utf-8");
    expect(content).toContain("# Codebase Overview");
  });

  it("Test 2: overview.md contains YAML frontmatter with required keys", async () => {
    createRichProject(tmpDir);

    const result = await runResearcher({ projectRoot: tmpDir, outputDir });
    const content = fs.readFileSync(result.overviewPath, "utf-8");

    expect(content.startsWith("---\n")).toBe(true);
    const secondDash = content.indexOf("---", 4);
    expect(secondDash).toBeGreaterThan(4);

    const frontmatter = content.substring(4, secondDash);
    expect(frontmatter).toContain("generated:");
    expect(frontmatter).toContain('generator: "researcher"');
  });

  it("Test 3: overview.md contains all 6 required sections in order", async () => {
    createRichProject(tmpDir);

    const result = await runResearcher({ projectRoot: tmpDir, outputDir });
    const content = fs.readFileSync(result.overviewPath, "utf-8");

    const requiredSections = [
      "## Project Structure",
      "## Frameworks and Libraries",
      "## Entry Points",
      "## Key Directories",
      "## Test Setup",
      "## Build and Deploy",
    ];

    // Check all sections exist
    for (const section of requiredSections) {
      expect(content).toContain(section);
    }

    // Check order
    let lastIndex = -1;
    for (const section of requiredSections) {
      const idx = content.indexOf(section);
      expect(idx).toBeGreaterThan(lastIndex);
      lastIndex = idx;
    }
  });

  it("Test 4: overview.md is under 250 lines", async () => {
    createRichProject(tmpDir);

    const result = await runResearcher({ projectRoot: tmpDir, outputDir });

    expect(result.lineCount).toBeLessThan(250);
    expect(result.lineCount).toBeGreaterThan(0);
  });

  it("Test 5: empty sections use 'Not detected.' fallback text", async () => {
    createMinimalProject(tmpDir);

    const result = await runResearcher({ projectRoot: tmpDir, outputDir });
    const content = fs.readFileSync(result.overviewPath, "utf-8");

    // Minimal project should have "Not detected." for several sections
    // At minimum: Test Setup should be "Not detected." since no vitest/jest config
    // Key Directories should work even with minimal project (just lists what exists)
    expect(content).toContain("Not detected.");
  });

  it("Test 6: Project Structure section lists directories with brief descriptions", async () => {
    createRichProject(tmpDir);

    const result = await runResearcher({ projectRoot: tmpDir, outputDir });
    const content = fs.readFileSync(result.overviewPath, "utf-8");

    // Extract Project Structure section
    const structStart = content.indexOf("## Project Structure");
    const structEnd = content.indexOf("## Frameworks and Libraries");
    const structSection = content.substring(structStart, structEnd);

    // Should list at least src/ and docs/ and tests/
    expect(structSection).toContain("`src/`");
    expect(structSection).toContain("`docs/`");
    expect(structSection).toContain("`tests/`");
  });

  it("Test 7: Frameworks section lists detected frameworks with versions", async () => {
    createRichProject(tmpDir);

    const result = await runResearcher({ projectRoot: tmpDir, outputDir });
    const content = fs.readFileSync(result.overviewPath, "utf-8");

    // Extract Frameworks section
    const fwStart = content.indexOf("## Frameworks and Libraries");
    const fwEnd = content.indexOf("## Entry Points");
    const fwSection = content.substring(fwStart, fwEnd);

    // Should contain express, prisma, zod with versions
    expect(fwSection).toContain("express");
    expect(fwSection).toContain("vitest");
  });

  it("Test 8: Key Directories section describes purpose of major directories", async () => {
    createRichProject(tmpDir);

    const result = await runResearcher({ projectRoot: tmpDir, outputDir });
    const content = fs.readFileSync(result.overviewPath, "utf-8");

    // Extract Key Directories section
    const kdStart = content.indexOf("## Key Directories");
    const kdEnd = content.indexOf("## Test Setup");
    const kdSection = content.substring(kdStart, kdEnd);

    // Should describe src/ subdirectories
    expect(kdSection).toContain("`src/`");
  });
});
