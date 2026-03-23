import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import * as crypto from "node:crypto";

import { detectProject, type ProjectInfo } from "../../src/onboard/detect.js";

function makeTmpDir(name?: string): string {
  const dirName = name
    ? `codescope-test-${name}-${crypto.randomUUID()}`
    : `codescope-test-${crypto.randomUUID()}`;
  const dir = path.join(os.tmpdir(), dirName);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

describe("detectProject", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTmpDir();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("detects TypeScript project from tsconfig.json", async () => {
    fs.writeFileSync(
      path.join(tmpDir, "package.json"),
      JSON.stringify({ name: "ts-project", scripts: {} }),
    );
    fs.writeFileSync(path.join(tmpDir, "tsconfig.json"), "{}");

    const info = await detectProject(tmpDir);
    expect(info.languages).toContain("typescript");
  });

  it("detects build and test commands from package.json scripts", async () => {
    fs.writeFileSync(
      path.join(tmpDir, "package.json"),
      JSON.stringify({
        name: "my-app",
        scripts: { build: "tsc", test: "vitest run" },
      }),
    );

    const info = await detectProject(tmpDir);
    expect(info.buildCommand).toBe("npm run build");
    expect(info.testCommand).toBe("npm test");
  });

  it("detects monorepo from workspaces", async () => {
    fs.writeFileSync(
      path.join(tmpDir, "package.json"),
      JSON.stringify({
        name: "mono",
        workspaces: ["packages/*"],
      }),
    );
    // Create workspace directories
    fs.mkdirSync(path.join(tmpDir, "packages", "auth"), { recursive: true });
    fs.mkdirSync(path.join(tmpDir, "packages", "api"), { recursive: true });

    const info = await detectProject(tmpDir);
    expect(info.type).toBe("monorepo");
    expect(info.services.length).toBe(2);
    expect(info.services.map((s) => s.name).sort()).toEqual(["api", "auth"]);
  });

  it("detects Python from pyproject.toml", async () => {
    fs.writeFileSync(path.join(tmpDir, "pyproject.toml"), "[project]\nname = 'myapp'\n");

    const info = await detectProject(tmpDir);
    expect(info.languages).toContain("python");
  });

  it("detects Python from requirements.txt", async () => {
    fs.writeFileSync(path.join(tmpDir, "requirements.txt"), "flask==2.0\n");

    const info = await detectProject(tmpDir);
    expect(info.languages).toContain("python");
  });

  it("detects mixed languages", async () => {
    fs.writeFileSync(
      path.join(tmpDir, "package.json"),
      JSON.stringify({ name: "mixed" }),
    );
    fs.writeFileSync(path.join(tmpDir, "tsconfig.json"), "{}");
    fs.writeFileSync(path.join(tmpDir, "pyproject.toml"), "[project]\n");

    const info = await detectProject(tmpDir);
    expect(info.languages).toContain("typescript");
    expect(info.languages).toContain("python");
  });

  it("detects Playwright E2E", async () => {
    fs.writeFileSync(path.join(tmpDir, "playwright.config.ts"), "export default {};\n");

    const info = await detectProject(tmpDir);
    expect(info.e2eTool).toBe("playwright");
    expect(info.e2eCommand).toBe("npx playwright test");
  });

  it("detects services from docker-compose.yml", async () => {
    const dockerCompose = `
services:
  auth:
    build: ./auth
  api:
    build: ./api
`;
    fs.writeFileSync(path.join(tmpDir, "docker-compose.yml"), dockerCompose);

    const info = await detectProject(tmpDir);
    expect(info.services.length).toBeGreaterThanOrEqual(2);
    const names = info.services.map((s) => s.name);
    expect(names).toContain("auth");
    expect(names).toContain("api");
  });

  it("returns defaults for empty directory", async () => {
    const info = await detectProject(tmpDir);
    expect(info.type).toBe("single");
    expect(info.languages).toEqual([]);
    expect(info.buildCommand).toBeNull();
    expect(info.testCommand).toBeNull();
    expect(info.e2eTool).toBeNull();
    expect(info.e2eCommand).toBeNull();
  });

  it("uses directory name as fallback project name", async () => {
    const namedDir = makeTmpDir("my-project");
    try {
      const info = await detectProject(namedDir);
      expect(info.projectName).toBe(path.basename(namedDir));
    } finally {
      fs.rmSync(namedDir, { recursive: true, force: true });
    }
  });

  it("uses package.json name field for project name", async () => {
    fs.writeFileSync(
      path.join(tmpDir, "package.json"),
      JSON.stringify({ name: "awesome-app" }),
    );

    const info = await detectProject(tmpDir);
    expect(info.projectName).toBe("awesome-app");
  });

  it("detects JavaScript when package.json exists but no tsconfig", async () => {
    fs.writeFileSync(
      path.join(tmpDir, "package.json"),
      JSON.stringify({ name: "js-app" }),
    );

    const info = await detectProject(tmpDir);
    expect(info.languages).toContain("javascript");
    expect(info.languages).not.toContain("typescript");
  });

  it("detects monorepo from docker-compose when no workspaces", async () => {
    const dockerCompose = `
services:
  frontend:
    build: ./frontend
  backend:
    build: ./backend
  db:
    image: postgres
`;
    fs.writeFileSync(path.join(tmpDir, "docker-compose.yml"), dockerCompose);

    const info = await detectProject(tmpDir);
    expect(info.services.length).toBeGreaterThanOrEqual(2);
    expect(info.type).toBe("monorepo");
  });
});
