import * as fs from "node:fs";
import * as path from "node:path";
import { detectProject, type ProjectInfo } from "../onboard/detect.js";
import { loadConfig } from "../config/loader.js";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface ResearcherOptions {
  projectRoot: string;
  outputDir: string; // where to write overview.md
  serviceManifestPath?: string; // optional: read scout output for additional context
}

export interface ResearcherResult {
  overviewPath: string; // path to written overview.md
  lineCount: number; // lines written
  durationMs: number;
}

// ---------------------------------------------------------------------------
// Directory purpose mapping
// ---------------------------------------------------------------------------

const DIR_PURPOSES: Record<string, string> = {
  src: "Source code",
  lib: "Library code",
  test: "Tests",
  tests: "Tests",
  __tests__: "Tests",
  spec: "Test specifications",
  docs: "Documentation",
  scripts: "Build/utility scripts",
  config: "Configuration files",
  public: "Static assets",
  assets: "Assets and resources",
  dist: "Build output",
  build: "Build output",
  types: "TypeScript type definitions",
  "@types": "TypeScript type definitions",
  migrations: "Database migrations",
  prisma: "Prisma ORM schema and migrations",
  styles: "CSS/styling",
  components: "UI components",
  pages: "Page components/routes",
  api: "API routes/handlers",
  utils: "Utility functions",
  helpers: "Helper functions",
  hooks: "React hooks",
  middleware: "Middleware",
  services: "Service modules or microservices",
  packages: "Monorepo packages",
  apps: "Monorepo applications",
  models: "Data models",
  schemas: "Schema definitions",
  routes: "Route handlers",
  controllers: "Controllers",
  views: "View templates",
  grammars: "Grammar files",
};

// ---------------------------------------------------------------------------
// Dependency categorization
// ---------------------------------------------------------------------------

const CATEGORY_PATTERNS: Array<{ pattern: RegExp; category: string }> = [
  { pattern: /^(react|vue|svelte|angular|@angular|solid|preact|lit)/, category: "UI Framework" },
  { pattern: /^(next|nuxt|remix|gatsby|astro|sveltekit)/, category: "Meta-framework" },
  { pattern: /^(express|fastify|koa|hono|@nestjs|nestjs)/, category: "Server Framework" },
  { pattern: /^(prisma|@prisma|drizzle|typeorm|sequelize|knex|mongoose|better-sqlite3)/, category: "Database" },
  { pattern: /^(vitest|jest|mocha|chai|@testing-library|playwright|cypress)/, category: "Testing" },
  { pattern: /^(typescript|tsdown|tsup|esbuild|rollup|vite|webpack|rolldown|tsx)/, category: "Build Tools" },
  { pattern: /^(zod|yup|joi|superstruct|io-ts|ajv)/, category: "Validation" },
  { pattern: /^(tailwindcss|@tailwindcss|sass|less|postcss|styled-components)/, category: "Styling" },
  { pattern: /^(@modelcontextprotocol)/, category: "MCP" },
  { pattern: /^(graphology)/, category: "Graph" },
  { pattern: /^(web-tree-sitter|tree-sitter|@ast-grep)/, category: "Parsing" },
  { pattern: /^(enhanced-resolve|tsconfig-paths)/, category: "Resolution" },
];

// ---------------------------------------------------------------------------
// Test config file patterns
// ---------------------------------------------------------------------------

const TEST_CONFIG_FILES = [
  { file: "vitest.config.ts", framework: "vitest" },
  { file: "vitest.config.js", framework: "vitest" },
  { file: "vitest.config.mts", framework: "vitest" },
  { file: "jest.config.ts", framework: "jest" },
  { file: "jest.config.js", framework: "jest" },
  { file: "jest.config.mjs", framework: "jest" },
  { file: "pytest.ini", framework: "pytest" },
  { file: "pyproject.toml", framework: "pytest" },
  { file: "setup.cfg", framework: "pytest" },
  { file: ".mocharc.yml", framework: "mocha" },
  { file: ".mocharc.json", framework: "mocha" },
];

// ---------------------------------------------------------------------------
// Directories to skip when listing
// ---------------------------------------------------------------------------

const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  ".next",
  ".nuxt",
  ".cache",
  "coverage",
  ".turbo",
  ".claude",
]);

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Categorize a dependency name.
 */
function categorizeDependency(name: string): string {
  for (const { pattern, category } of CATEGORY_PATTERNS) {
    if (pattern.test(name)) return category;
  }
  return "Library";
}

/**
 * List top-level directory entries (depth 1) with counts.
 */
function listTopLevelDirs(
  rootDir: string,
): Array<{ name: string; purpose: string; itemCount: number }> {
  const results: Array<{ name: string; purpose: string; itemCount: number }> =
    [];

  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(rootDir, { withFileTypes: true });
  } catch {
    return results;
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (entry.name.startsWith(".") && SKIP_DIRS.has(entry.name)) continue;
    if (SKIP_DIRS.has(entry.name)) continue;

    const purpose = DIR_PURPOSES[entry.name] ?? "Project directory";
    let itemCount = 0;
    try {
      itemCount = fs.readdirSync(path.join(rootDir, entry.name)).length;
    } catch {
      // Skip unreadable
    }

    results.push({ name: entry.name, purpose, itemCount });
  }

  return results.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Read package.json dependencies with versions, skip @types/ packages.
 */
function readDependencies(
  pkgJsonPath: string,
): Array<{ name: string; version: string; category: string; isDev: boolean }> {
  if (!fs.existsSync(pkgJsonPath)) return [];

  try {
    const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, "utf-8"));
    const results: Array<{
      name: string;
      version: string;
      category: string;
      isDev: boolean;
    }> = [];

    const deps = pkg.dependencies ?? {};
    for (const [name, version] of Object.entries(deps)) {
      if (name.startsWith("@types/")) continue;
      results.push({
        name,
        version: version as string,
        category: categorizeDependency(name),
        isDev: false,
      });
    }

    const devDeps = pkg.devDependencies ?? {};
    for (const [name, version] of Object.entries(devDeps)) {
      if (name.startsWith("@types/")) continue;
      results.push({
        name,
        version: version as string,
        category: categorizeDependency(name),
        isDev: true,
      });
    }

    return results;
  } catch {
    return [];
  }
}

/**
 * Detect entry points from package.json and common file patterns.
 */
function detectEntryPoints(
  rootDir: string,
  pkgJsonPath: string,
): Array<{ path: string; description: string }> {
  const results: Array<{ path: string; description: string }> = [];

  if (fs.existsSync(pkgJsonPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, "utf-8"));

      if (typeof pkg.main === "string" && pkg.main) {
        results.push({ path: pkg.main, description: "Main entry (package.json main)" });
      }
      if (typeof pkg.module === "string" && pkg.module) {
        results.push({
          path: pkg.module,
          description: "ES module entry (package.json module)",
        });
      }
      if (pkg.bin) {
        if (typeof pkg.bin === "string") {
          results.push({ path: pkg.bin, description: "CLI binary" });
        } else if (typeof pkg.bin === "object") {
          for (const [binName, binPath] of Object.entries(pkg.bin)) {
            results.push({
              path: binPath as string,
              description: `CLI binary: ${binName}`,
            });
          }
        }
      }
      if (pkg.scripts?.start) {
        results.push({
          path: pkg.scripts.start,
          description: "Start script (npm start)",
        });
      }
    } catch {
      // Skip malformed package.json
    }
  }

  // Check common entry files
  const commonEntries = [
    { file: "src/index.ts", desc: "TypeScript source entry" },
    { file: "src/index.tsx", desc: "React entry" },
    { file: "src/index.js", desc: "JavaScript source entry" },
    { file: "src/main.ts", desc: "TypeScript main entry" },
    { file: "src/app.ts", desc: "Application entry" },
    { file: "src/server.ts", desc: "Server entry" },
    { file: "app.py", desc: "Python application entry" },
    { file: "main.py", desc: "Python main entry" },
    { file: "manage.py", desc: "Django management entry" },
  ];

  for (const { file, desc } of commonEntries) {
    if (
      fs.existsSync(path.join(rootDir, file)) &&
      !results.some((r) => r.path === file)
    ) {
      results.push({ path: file, description: desc });
    }
  }

  return results;
}

/**
 * List src/ subdirectories with descriptions (depth 2).
 */
function listKeyDirectories(
  rootDir: string,
): Array<{ path: string; description: string; itemCount: number }> {
  const results: Array<{
    path: string;
    description: string;
    itemCount: number;
  }> = [];

  const srcDir = path.join(rootDir, "src");
  if (!fs.existsSync(srcDir)) {
    // Fall back to listing top-level
    return [];
  }

  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(srcDir, { withFileTypes: true });
  } catch {
    return results;
  }

  // Add src/ itself
  results.push({
    path: "src/",
    description: "Source code root",
    itemCount: entries.length,
  });

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (SKIP_DIRS.has(entry.name)) continue;

    const purpose = DIR_PURPOSES[entry.name] ?? "Source subdirectory";
    let itemCount = 0;
    try {
      itemCount = fs.readdirSync(path.join(srcDir, entry.name)).length;
    } catch {
      // Skip unreadable
    }

    results.push({
      path: `src/${entry.name}/`,
      description: purpose,
      itemCount,
    });
  }

  return results.sort((a, b) => a.path.localeCompare(b.path));
}

/**
 * Detect test framework and setup.
 */
function detectTestSetup(
  rootDir: string,
  pkgJsonPath: string,
): {
  framework: string | null;
  configFile: string | null;
  testDir: string | null;
  testCommand: string | null;
} {
  let framework: string | null = null;
  let configFile: string | null = null;
  let testDir: string | null = null;
  let testCommand: string | null = null;

  // Check config files
  for (const tc of TEST_CONFIG_FILES) {
    if (fs.existsSync(path.join(rootDir, tc.file))) {
      framework = tc.framework;
      configFile = tc.file;
      break;
    }
  }

  // Check devDependencies if no config found
  if (!framework && fs.existsSync(pkgJsonPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, "utf-8"));
      const devDeps = pkg.devDependencies ?? {};
      if ("vitest" in devDeps) framework = "vitest";
      else if ("jest" in devDeps) framework = "jest";
      else if ("mocha" in devDeps) framework = "mocha";

      if (pkg.scripts?.test) {
        testCommand = pkg.scripts.test;
      }
    } catch {
      // Skip
    }
  }

  // Detect test directory
  const testDirCandidates = ["tests", "test", "__tests__", "spec"];
  for (const dir of testDirCandidates) {
    if (fs.existsSync(path.join(rootDir, dir))) {
      testDir = dir;
      break;
    }
  }

  // Get test command from package.json scripts
  if (!testCommand && fs.existsSync(pkgJsonPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, "utf-8"));
      if (pkg.scripts?.test) testCommand = pkg.scripts.test;
    } catch {
      // Skip
    }
  }

  return { framework, configFile, testDir, testCommand };
}

/**
 * Detect build and deploy configuration.
 */
function detectBuildDeploy(
  rootDir: string,
  pkgJsonPath: string,
): {
  buildCommand: string | null;
  deployInfo: string | null;
  hasDocker: boolean;
  hasCi: boolean;
} {
  let buildCommand: string | null = null;
  let deployInfo: string | null = null;
  let hasDocker = false;
  let hasCi = false;

  // Build command from package.json
  if (fs.existsSync(pkgJsonPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, "utf-8"));
      if (pkg.scripts?.build) buildCommand = pkg.scripts.build;
    } catch {
      // Skip
    }
  }

  // Docker
  if (
    fs.existsSync(path.join(rootDir, "Dockerfile")) ||
    fs.existsSync(path.join(rootDir, "docker-compose.yml")) ||
    fs.existsSync(path.join(rootDir, "docker-compose.yaml")) ||
    fs.existsSync(path.join(rootDir, "compose.yml")) ||
    fs.existsSync(path.join(rootDir, "compose.yaml"))
  ) {
    hasDocker = true;
    deployInfo = "Docker containerization detected.";
  }

  // CI
  if (
    fs.existsSync(path.join(rootDir, ".github", "workflows")) ||
    fs.existsSync(path.join(rootDir, ".gitlab-ci.yml")) ||
    fs.existsSync(path.join(rootDir, "Jenkinsfile"))
  ) {
    hasCi = true;
    if (deployInfo) {
      deployInfo += " CI pipeline configured.";
    } else {
      deployInfo = "CI pipeline configured.";
    }
  }

  return { buildCommand, deployInfo, hasDocker, hasCi };
}

// ---------------------------------------------------------------------------
// Section generation (each capped at 40 lines per UI-SPEC)
// ---------------------------------------------------------------------------

function capSection(lines: string[], maxLines: number = 40): string[] {
  if (lines.length <= maxLines) return lines;
  return [...lines.slice(0, maxLines - 1), "- _(truncated)_"];
}

function generateProjectStructure(rootDir: string): string[] {
  const dirs = listTopLevelDirs(rootDir);
  if (dirs.length === 0) return ["Not detected."];

  const lines: string[] = [];
  for (const dir of dirs) {
    lines.push(`- \`${dir.name}/\` -- ${dir.purpose} (${dir.itemCount} items)`);
  }
  return capSection(lines);
}

function generateFrameworksSection(pkgJsonPath: string): string[] {
  const deps = readDependencies(pkgJsonPath);
  if (deps.length === 0) return ["Not detected."];

  // Limit to top 20
  const top = deps.slice(0, 20);

  const lines: string[] = [];
  lines.push("| Library | Version | Category |");
  lines.push("|---------|---------|----------|");
  for (const dep of top) {
    lines.push(`| ${dep.name} | ${dep.version} | ${dep.category} |`);
  }
  return capSection(lines);
}

function generateEntryPointsSection(
  rootDir: string,
  pkgJsonPath: string,
): string[] {
  const entryPoints = detectEntryPoints(rootDir, pkgJsonPath);
  if (entryPoints.length === 0) return ["Not detected."];

  const lines: string[] = [];
  for (const ep of entryPoints) {
    lines.push(`- \`${ep.path}\` -- ${ep.description}`);
  }
  return capSection(lines);
}

function generateKeyDirectoriesSection(rootDir: string): string[] {
  const dirs = listKeyDirectories(rootDir);
  if (dirs.length === 0) return ["Not detected."];

  const lines: string[] = [];
  for (const dir of dirs) {
    lines.push(`- \`${dir.path}\` -- ${dir.description} (${dir.itemCount} items)`);
  }
  return capSection(lines);
}

function generateTestSetupSection(
  rootDir: string,
  pkgJsonPath: string,
): string[] {
  const setup = detectTestSetup(rootDir, pkgJsonPath);
  if (!setup.framework && !setup.testDir && !setup.testCommand) {
    return ["Not detected."];
  }

  const lines: string[] = [];
  lines.push(`- **Framework:** ${setup.framework ?? "Not detected."}`);
  lines.push(`- **Config:** ${setup.configFile ? `\`${setup.configFile}\`` : "Not detected."}`);
  lines.push(`- **Directory:** ${setup.testDir ? `\`${setup.testDir}/\`` : "Not detected."}`);
  lines.push(`- **Command:** ${setup.testCommand ? `\`${setup.testCommand}\`` : "Not detected."}`);
  return lines;
}

function generateBuildDeploySection(
  rootDir: string,
  pkgJsonPath: string,
): string[] {
  const info = detectBuildDeploy(rootDir, pkgJsonPath);

  if (!info.buildCommand && !info.deployInfo) {
    return ["Not detected."];
  }

  const lines: string[] = [];
  lines.push(
    `- **Build command:** ${info.buildCommand ? `\`${info.buildCommand}\`` : "Not detected."}`,
  );
  lines.push(
    `- **Deploy:** ${info.deployInfo ?? "Not detected."}`,
  );
  if (info.hasDocker) {
    lines.push("- **Docker:** Dockerfile present");
  }
  return lines;
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

/**
 * Run the Researcher agent: analyze project and produce overview.md
 * with ~200 lines covering structure, frameworks, entry points,
 * key directories, test setup, and build/deploy.
 */
export async function runResearcher(
  options: ResearcherOptions,
): Promise<ResearcherResult> {
  const startTime = Date.now();
  const { projectRoot, outputDir } = options;

  const pkgJsonPath = path.join(projectRoot, "package.json");

  // Attempt to read project info for additional context (not strictly needed
  // for overview generation, but can enrich output in the future)
  try {
    const config = loadConfig(projectRoot);
    if (!config) {
      await detectProject(projectRoot);
    }
  } catch {
    // Config issues are non-fatal for the researcher
  }

  // Build all sections
  const now = new Date().toISOString();
  const allLines: string[] = [];

  // YAML frontmatter
  allLines.push("---");
  allLines.push(`generated: "${now}"`);
  allLines.push('generator: "researcher"');
  allLines.push("phase: 2");
  allLines.push("---");
  allLines.push("");
  allLines.push("# Codebase Overview");
  allLines.push("");

  // Section 1: Project Structure
  allLines.push("## Project Structure");
  allLines.push("");
  allLines.push(...generateProjectStructure(projectRoot));
  allLines.push("");

  // Section 2: Frameworks and Libraries
  allLines.push("## Frameworks and Libraries");
  allLines.push("");
  allLines.push(...generateFrameworksSection(pkgJsonPath));
  allLines.push("");

  // Section 3: Entry Points
  allLines.push("## Entry Points");
  allLines.push("");
  allLines.push(...generateEntryPointsSection(projectRoot, pkgJsonPath));
  allLines.push("");

  // Section 4: Key Directories
  allLines.push("## Key Directories");
  allLines.push("");
  allLines.push(...generateKeyDirectoriesSection(projectRoot));
  allLines.push("");

  // Section 5: Test Setup
  allLines.push("## Test Setup");
  allLines.push("");
  allLines.push(...generateTestSetupSection(projectRoot, pkgJsonPath));
  allLines.push("");

  // Section 6: Build and Deploy
  allLines.push("## Build and Deploy");
  allLines.push("");
  allLines.push(...generateBuildDeploySection(projectRoot, pkgJsonPath));
  allLines.push("");

  // Write output
  const content = allLines.join("\n");
  const lineCount = content.split("\n").length;

  fs.mkdirSync(outputDir, { recursive: true });
  const overviewPath = path.join(outputDir, "overview.md");
  fs.writeFileSync(overviewPath, content, "utf-8");

  const durationMs = Date.now() - startTime;

  return {
    overviewPath,
    lineCount,
    durationMs,
  };
}
