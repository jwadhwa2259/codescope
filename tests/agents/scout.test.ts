import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import * as crypto from "node:crypto";

import {
  runScout,
  type ScoutOptions,
  type ScoutResult,
  type ServiceEntry,
} from "../../src/agents/scout.js";

function makeTmpDir(name?: string): string {
  const dirName = name
    ? `codescope-scout-test-${name}-${crypto.randomUUID()}`
    : `codescope-scout-test-${crypto.randomUUID()}`;
  const dir = path.join(os.tmpdir(), dirName);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/**
 * Create a fixture project with package.json, src/, and optional extras.
 */
function createSingleProject(dir: string, opts?: {
  deps?: Record<string, string>;
  devDeps?: Record<string, string>;
  scripts?: Record<string, string>;
  main?: string;
  sourceFiles?: Array<{ path: string; lines: number }>;
  cicd?: Array<{ type: string; path?: string }>;
}): void {
  const pkg: Record<string, unknown> = {
    name: "test-project",
    version: "1.0.0",
    scripts: opts?.scripts ?? { build: "tsc", test: "vitest run" },
  };
  if (opts?.deps) pkg.dependencies = opts.deps;
  if (opts?.devDeps) pkg.devDependencies = opts.devDeps;
  if (opts?.main) pkg.main = opts.main;

  fs.writeFileSync(path.join(dir, "package.json"), JSON.stringify(pkg, null, 2));
  fs.writeFileSync(path.join(dir, "tsconfig.json"), "{}");

  // Source files
  const sourceFiles = opts?.sourceFiles ?? [
    { path: "src/index.ts", lines: 50 },
    { path: "src/utils.ts", lines: 30 },
  ];
  for (const sf of sourceFiles) {
    const filePath = path.join(dir, sf.path);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, Array(sf.lines).fill("// line\n").join(""));
  }

  // CI/CD
  if (opts?.cicd) {
    for (const ci of opts.cicd) {
      if (ci.type === "github-actions") {
        const workflowDir = path.join(dir, ".github", "workflows");
        fs.mkdirSync(workflowDir, { recursive: true });
        fs.writeFileSync(path.join(workflowDir, "ci.yml"), "name: CI\non: push\n");
      } else if (ci.type === "gitlab-ci") {
        fs.writeFileSync(path.join(dir, ".gitlab-ci.yml"), "stages:\n  - test\n");
      } else if (ci.type === "docker") {
        fs.writeFileSync(path.join(dir, "Dockerfile"), "FROM node:22\n");
      }
    }
  }
}

function createMonorepoProject(dir: string): void {
  const pkg = {
    name: "mono-project",
    version: "1.0.0",
    private: true,
    workspaces: ["packages/*"],
    scripts: { build: "tsc -b", test: "vitest run" },
  };
  fs.writeFileSync(path.join(dir, "package.json"), JSON.stringify(pkg, null, 2));
  fs.writeFileSync(path.join(dir, "tsconfig.json"), "{}");

  // Service A -- React frontend
  const svcADir = path.join(dir, "packages", "frontend");
  fs.mkdirSync(svcADir, { recursive: true });
  fs.writeFileSync(
    path.join(svcADir, "package.json"),
    JSON.stringify({
      name: "frontend",
      dependencies: { react: "^18.0.0", "react-dom": "^18.0.0" },
      scripts: { build: "vite build", test: "vitest run" },
      main: "src/index.tsx",
    }, null, 2),
  );
  const svcASrc = path.join(svcADir, "src");
  fs.mkdirSync(svcASrc, { recursive: true });
  fs.writeFileSync(path.join(svcASrc, "index.tsx"), Array(100).fill("// line\n").join(""));
  fs.writeFileSync(path.join(svcASrc, "App.tsx"), Array(80).fill("// line\n").join(""));

  // Service B -- Express backend
  const svcBDir = path.join(dir, "packages", "backend");
  fs.mkdirSync(svcBDir, { recursive: true });
  fs.writeFileSync(
    path.join(svcBDir, "package.json"),
    JSON.stringify({
      name: "backend",
      dependencies: { express: "^4.18.0" },
      scripts: { build: "tsc", test: "vitest run" },
      main: "src/server.ts",
    }, null, 2),
  );
  const svcBSrc = path.join(svcBDir, "src");
  fs.mkdirSync(svcBSrc, { recursive: true });
  fs.writeFileSync(path.join(svcBSrc, "server.ts"), Array(200).fill("// line\n").join(""));

  // CI/CD
  const workflowDir = path.join(dir, ".github", "workflows");
  fs.mkdirSync(workflowDir, { recursive: true });
  fs.writeFileSync(path.join(workflowDir, "ci.yml"), "name: CI\non: push\n");
}

describe("Scout Agent", () => {
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

  it("Test 1: produces service-manifest.md with '# Service Manifest' title", async () => {
    createSingleProject(tmpDir, {
      deps: { express: "^4.18.0" },
      sourceFiles: [{ path: "src/index.ts", lines: 50 }],
    });

    const result = await runScout({ projectRoot: tmpDir, outputDir });

    expect(result.manifestPath).toBeTruthy();
    expect(fs.existsSync(result.manifestPath)).toBe(true);

    const content = fs.readFileSync(result.manifestPath, "utf-8");
    expect(content).toContain("# Service Manifest");
  });

  it("Test 2: service-manifest.md contains YAML frontmatter with required keys", async () => {
    createSingleProject(tmpDir, {
      deps: { express: "^4.18.0" },
      sourceFiles: [{ path: "src/index.ts", lines: 50 }],
    });

    const result = await runScout({ projectRoot: tmpDir, outputDir });
    const content = fs.readFileSync(result.manifestPath, "utf-8");

    // Check frontmatter delimiters
    expect(content.startsWith("---\n")).toBe(true);
    const secondDash = content.indexOf("---", 4);
    expect(secondDash).toBeGreaterThan(4);

    const frontmatter = content.substring(4, secondDash);
    expect(frontmatter).toContain("generated:");
    expect(frontmatter).toContain("scout_duration_ms:");
    expect(frontmatter).toContain("project_type:");
    expect(frontmatter).toContain('generator: "scout"');
  });

  it("Test 3: service-manifest.md contains a service table with required columns", async () => {
    createSingleProject(tmpDir, {
      deps: { express: "^4.18.0" },
      sourceFiles: [
        { path: "src/index.ts", lines: 50 },
        { path: "src/utils.ts", lines: 30 },
      ],
    });

    const result = await runScout({ projectRoot: tmpDir, outputDir });
    const content = fs.readFileSync(result.manifestPath, "utf-8");

    expect(content).toContain("## Services");
    expect(content).toContain("Service");
    expect(content).toContain("Path");
    expect(content).toContain("LOC (approx)");
    expect(content).toContain("Languages");
    expect(content).toContain("Frameworks");
    expect(content).toContain("Entry Points");
  });

  it("Test 4: Scout correctly counts LOC by summing lines of source files", async () => {
    // Create files with known content: each file has exactly N lines
    const srcDir = path.join(tmpDir, "src");
    fs.mkdirSync(srcDir, { recursive: true });
    // Write files with exact line counts (no trailing newline to avoid off-by-one)
    fs.writeFileSync(path.join(srcDir, "index.ts"), "line1\nline2\nline3");  // 3 lines
    fs.writeFileSync(path.join(srcDir, "utils.ts"), "a\nb\nc\nd\ne\nf\ng");  // 7 lines
    fs.writeFileSync(path.join(srcDir, "helpers.js"), "x\ny\nz\nw\nv");  // 5 lines
    // package.json needed for detection
    fs.writeFileSync(
      path.join(tmpDir, "package.json"),
      JSON.stringify({ name: "loc-test", version: "1.0.0" }),
    );

    const result = await runScout({ projectRoot: tmpDir, outputDir });

    expect(result.services.length).toBeGreaterThanOrEqual(1);
    const totalLoc = result.services.reduce((sum, svc) => sum + svc.loc, 0);
    // 3 + 7 + 5 = 15 lines
    expect(totalLoc).toBe(15);
  });

  it("Test 5: Scout detects frameworks from package.json dependencies", async () => {
    createSingleProject(tmpDir, {
      deps: { react: "^18.0.0", express: "^4.18.0" },
      devDeps: { tailwindcss: "^3.0.0" },
      sourceFiles: [{ path: "src/index.ts", lines: 10 }],
    });

    const result = await runScout({ projectRoot: tmpDir, outputDir });

    expect(result.services.length).toBeGreaterThanOrEqual(1);
    const frameworks = result.services[0].frameworks;
    expect(frameworks).toContain("React");
    expect(frameworks).toContain("Express");
    expect(frameworks).toContain("Tailwind CSS");
  });

  it("Test 6: Scout detects entry points (main field and common patterns)", async () => {
    createSingleProject(tmpDir, {
      main: "src/index.ts",
      sourceFiles: [
        { path: "src/index.ts", lines: 10 },
        { path: "src/app.ts", lines: 10 },
      ],
    });

    const result = await runScout({ projectRoot: tmpDir, outputDir });

    expect(result.services.length).toBeGreaterThanOrEqual(1);
    const entryPoints = result.services[0].entryPoints;
    expect(entryPoints).toContain("src/index.ts");
  });

  it("Test 7: Scout detects CI/CD config files", async () => {
    createSingleProject(tmpDir, {
      sourceFiles: [{ path: "src/index.ts", lines: 10 }],
      cicd: [{ type: "github-actions" }, { type: "docker" }],
    });

    const result = await runScout({ projectRoot: tmpDir, outputDir });

    expect(result.cicd.length).toBeGreaterThanOrEqual(2);
    const tools = result.cicd.map((c) => c.tool);
    expect(tools).toContain("github-actions");
    expect(tools).toContain("docker");
  });

  it("Test 8: monorepo with services shows each service as a row", async () => {
    createMonorepoProject(tmpDir);

    const result = await runScout({ projectRoot: tmpDir, outputDir });

    expect(result.projectType).toBe("monorepo");
    expect(result.services.length).toBeGreaterThanOrEqual(2);

    const serviceNames = result.services.map((s) => s.name);
    expect(serviceNames).toContain("frontend");
    expect(serviceNames).toContain("backend");

    // Check manifest has table rows
    const content = fs.readFileSync(result.manifestPath, "utf-8");
    expect(content).toContain("frontend");
    expect(content).toContain("backend");
  });

  it("Test 9: runScout completes in under 30 seconds", async () => {
    createSingleProject(tmpDir, {
      sourceFiles: [
        { path: "src/index.ts", lines: 100 },
        { path: "src/utils.ts", lines: 100 },
        { path: "src/helpers.ts", lines: 100 },
      ],
    });

    const start = Date.now();
    const result = await runScout({ projectRoot: tmpDir, outputDir });
    const elapsed = Date.now() - start;

    expect(elapsed).toBeLessThan(30000);
    expect(result.durationMs).toBeLessThan(30000);
  });

  it("Test 10: empty single project uses correct empty state text", async () => {
    // Minimal project with no services array, no CI/CD
    const pkg = { name: "minimal", version: "1.0.0" };
    fs.writeFileSync(path.join(tmpDir, "package.json"), JSON.stringify(pkg));

    const result = await runScout({ projectRoot: tmpDir, outputDir });
    const content = fs.readFileSync(result.manifestPath, "utf-8");

    expect(content).toContain("No CI/CD configuration detected.");
  });

  it("Test 11: config.yml with glob pattern in service path expands to per-package services", async () => {
    // Create a config.yml with a glob pattern
    const configDir = path.join(tmpDir, ".claude", "codescope");
    fs.mkdirSync(configDir, { recursive: true });

    const configYml = `schema_version: 1

project:
  name: mono-test
  type: monorepo
  languages: [TypeScript]
  services:
    - name: packages
      path: "packages/*"

agents:
  researcher: { model: inherited }
  convention_detector: { model: inherited }
  risk_analyzer: { model: inherited }
  learning_synthesizer: { model: inherited }
  eval_judge: { model: inherited }
  debug: { model: inherited }

orient:
  verbosity: brief
  clarification: auto
  research_sources: [codebase]
  max_research_time: 60

execute:
  max_agents_concurrent: 3

verify:
  timeout_seconds: 120
  tests: {}
  auto_smoke: false
  static_check: false
  blast_radius_diff: false

eval:
  mode: auto-debug
  auto_debug_max_cycles: 3
  criteria:
    scope_compliance: true
    convention_adherence: true
    completeness: true
    correctness: true

conventions:
  detection_threshold: 70
  min_files: 3
  strictness: suggest-only
  auto_confirm_high_confidence: false

learning:
  project_memory: true
  global_memory: false
  global_memory_path: "~/.codescope/global-memory.md"
  max_active_learnings: 50
  confidence_decay:
    gotchas: 90
    decisions: 180
  auto_capture: true
  capture_ignores: false

bootstrap:
  scaling: auto
  squad_threshold_loc: 5000
  max_squads: 10

display:
  progress_reports: true
  agent_activity: minimal
  eval_detail: summary
`;
    fs.writeFileSync(path.join(configDir, "config.yml"), configYml);

    // Create workspace packages
    // packages/core with package.json
    const coreDir = path.join(tmpDir, "packages", "core");
    fs.mkdirSync(path.join(coreDir, "src"), { recursive: true });
    fs.writeFileSync(
      path.join(coreDir, "package.json"),
      JSON.stringify({ name: "@tiptap/core", version: "1.0.0" }),
    );
    fs.writeFileSync(
      path.join(coreDir, "src", "index.ts"),
      Array(40).fill("// line\n").join(""),
    );

    // packages/react with package.json
    const reactDir = path.join(tmpDir, "packages", "react");
    fs.mkdirSync(path.join(reactDir, "src"), { recursive: true });
    fs.writeFileSync(
      path.join(reactDir, "package.json"),
      JSON.stringify({ name: "@tiptap/react", version: "1.0.0" }),
    );
    fs.writeFileSync(
      path.join(reactDir, "src", "index.ts"),
      Array(30).fill("// line\n").join(""),
    );

    // Root package.json
    fs.writeFileSync(
      path.join(tmpDir, "package.json"),
      JSON.stringify({ name: "mono-test", version: "1.0.0", private: true }),
    );

    const result = await runScout({ projectRoot: tmpDir, outputDir });

    // Should have expanded to 2 services, NOT 1 "packages" service
    expect(result.services.length).toBe(2);

    const serviceNames = result.services.map((s) => s.name);
    expect(serviceNames).toContain("@tiptap/core");
    expect(serviceNames).toContain("@tiptap/react");

    // Verify paths are concrete, not glob
    const servicePaths = result.services.map((s) => s.path);
    expect(servicePaths).toContain("packages/core");
    expect(servicePaths).toContain("packages/react");

    // Verify LOC is counted correctly
    const coreSvc = result.services.find((s) => s.name === "@tiptap/core")!;
    expect(coreSvc.loc).toBeGreaterThan(0);
    const reactSvc = result.services.find((s) => s.name === "@tiptap/react")!;
    expect(reactSvc.loc).toBeGreaterThan(0);
  });

  it("Test 12: config.yml with non-glob service path passes through unchanged", async () => {
    // Create a config.yml with a non-glob path
    const configDir = path.join(tmpDir, ".claude", "codescope");
    fs.mkdirSync(configDir, { recursive: true });

    const configYml = `schema_version: 1

project:
  name: simple-mono
  type: monorepo
  languages: [TypeScript]
  services:
    - name: demos
      path: demos

agents:
  researcher: { model: inherited }
  convention_detector: { model: inherited }
  risk_analyzer: { model: inherited }
  learning_synthesizer: { model: inherited }
  eval_judge: { model: inherited }
  debug: { model: inherited }

orient:
  verbosity: brief
  clarification: auto
  research_sources: [codebase]
  max_research_time: 60

execute:
  max_agents_concurrent: 3

verify:
  timeout_seconds: 120
  tests: {}
  auto_smoke: false
  static_check: false
  blast_radius_diff: false

eval:
  mode: auto-debug
  auto_debug_max_cycles: 3
  criteria:
    scope_compliance: true
    convention_adherence: true
    completeness: true
    correctness: true

conventions:
  detection_threshold: 70
  min_files: 3
  strictness: suggest-only
  auto_confirm_high_confidence: false

learning:
  project_memory: true
  global_memory: false
  global_memory_path: "~/.codescope/global-memory.md"
  max_active_learnings: 50
  confidence_decay:
    gotchas: 90
    decisions: 180
  auto_capture: true
  capture_ignores: false

bootstrap:
  scaling: auto
  squad_threshold_loc: 5000
  max_squads: 10

display:
  progress_reports: true
  agent_activity: minimal
  eval_detail: summary
`;
    fs.writeFileSync(path.join(configDir, "config.yml"), configYml);

    // Create the demos directory with source
    const demosDir = path.join(tmpDir, "demos");
    fs.mkdirSync(path.join(demosDir, "src"), { recursive: true });
    fs.writeFileSync(
      path.join(demosDir, "src", "index.ts"),
      Array(20).fill("// line\n").join(""),
    );

    // Root package.json
    fs.writeFileSync(
      path.join(tmpDir, "package.json"),
      JSON.stringify({ name: "simple-mono", version: "1.0.0" }),
    );

    const result = await runScout({ projectRoot: tmpDir, outputDir });

    // Should have exactly 1 service, unchanged
    expect(result.services.length).toBe(1);
    expect(result.services[0].name).toBe("demos");
    expect(result.services[0].path).toBe("demos");
    expect(result.services[0].loc).toBeGreaterThan(0);
  });
});
