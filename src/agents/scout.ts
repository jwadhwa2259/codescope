import * as fs from "node:fs";
import * as path from "node:path";
import { detectProject, type ProjectInfo } from "../onboard/detect.js";
import { loadConfig } from "../config/loader.js";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface ScoutOptions {
  projectRoot: string;
  outputDir: string; // where to write service-manifest.md
}

export interface ServiceEntry {
  name: string;
  path: string;
  loc: number;
  languages: string[];
  frameworks: string[];
  entryPoints: string[];
}

export interface CiCdInfo {
  tool: string; // "github-actions", "gitlab-ci", "jenkins", "circleci", etc.
  configFile: string; // relative path to config
}

export interface ScoutResult {
  projectType: string;
  services: ServiceEntry[];
  cicd: CiCdInfo[];
  durationMs: number;
  manifestPath: string; // path to written service-manifest.md
}

// ---------------------------------------------------------------------------
// Framework detection patterns
// ---------------------------------------------------------------------------

const FRAMEWORK_PATTERNS: Record<string, string> = {
  react: "React",
  "react-dom": "React",
  next: "Next.js",
  vue: "Vue.js",
  nuxt: "Nuxt",
  angular: "Angular",
  "@angular/core": "Angular",
  express: "Express",
  fastify: "Fastify",
  koa: "Koa",
  nestjs: "NestJS",
  "@nestjs/core": "NestJS",
  hono: "Hono",
  django: "Django",
  flask: "Flask",
  fastapi: "FastAPI",
  svelte: "Svelte",
  tailwindcss: "Tailwind CSS",
  prisma: "Prisma",
  "@prisma/client": "Prisma",
};

// ---------------------------------------------------------------------------
// Source file extensions for LOC counting (broader than parser support)
// ---------------------------------------------------------------------------

const SOURCE_EXTENSIONS = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".py",
  ".java",
  ".go",
  ".rs",
  ".rb",
  ".php",
  ".cs",
  ".swift",
  ".kt",
  ".mjs",
  ".cjs",
]);

// ---------------------------------------------------------------------------
// Directories to skip when walking the file tree
// ---------------------------------------------------------------------------

const IGNORE_DIRS = new Set([
  "node_modules",
  "dist",
  "build",
  ".git",
  "vendor",
  "__pycache__",
  ".next",
  ".nuxt",
  ".cache",
  "coverage",
  ".turbo",
]);

// ---------------------------------------------------------------------------
// CI/CD config detection patterns
// ---------------------------------------------------------------------------

const CICD_DETECTORS: Array<{
  tool: string;
  check: (root: string) => string | null;
}> = [
  {
    tool: "github-actions",
    check: (root) => {
      const dir = path.join(root, ".github", "workflows");
      if (fs.existsSync(dir) && fs.statSync(dir).isDirectory()) {
        return ".github/workflows/";
      }
      return null;
    },
  },
  {
    tool: "gitlab-ci",
    check: (root) =>
      fs.existsSync(path.join(root, ".gitlab-ci.yml"))
        ? ".gitlab-ci.yml"
        : null,
  },
  {
    tool: "jenkins",
    check: (root) =>
      fs.existsSync(path.join(root, "Jenkinsfile")) ? "Jenkinsfile" : null,
  },
  {
    tool: "circleci",
    check: (root) =>
      fs.existsSync(path.join(root, ".circleci", "config.yml"))
        ? ".circleci/config.yml"
        : null,
  },
  {
    tool: "travis",
    check: (root) =>
      fs.existsSync(path.join(root, ".travis.yml")) ? ".travis.yml" : null,
  },
  {
    tool: "azure-devops",
    check: (root) =>
      fs.existsSync(path.join(root, "azure-pipelines.yml"))
        ? "azure-pipelines.yml"
        : null,
  },
  {
    tool: "bitbucket",
    check: (root) =>
      fs.existsSync(path.join(root, "bitbucket-pipelines.yml"))
        ? "bitbucket-pipelines.yml"
        : null,
  },
  {
    tool: "docker",
    check: (root) =>
      fs.existsSync(path.join(root, "Dockerfile")) ? "Dockerfile" : null,
  },
];

// ---------------------------------------------------------------------------
// Common entry point file patterns
// ---------------------------------------------------------------------------

const COMMON_ENTRY_FILES = [
  "src/index.ts",
  "src/index.tsx",
  "src/index.js",
  "src/index.jsx",
  "src/main.ts",
  "src/main.tsx",
  "src/main.js",
  "src/app.ts",
  "src/app.js",
  "src/server.ts",
  "src/server.js",
  "app.py",
  "main.py",
  "manage.py",
  "index.ts",
  "index.js",
];

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Recursively walk a directory, returning relative paths of source files.
 */
function walkSourceFiles(rootDir: string, baseDir: string = ""): string[] {
  const results: string[] = [];
  const absDir = baseDir ? path.join(rootDir, baseDir) : rootDir;

  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(absDir, { withFileTypes: true });
  } catch {
    return results;
  }

  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (IGNORE_DIRS.has(entry.name)) continue;
      const subDir = baseDir ? path.join(baseDir, entry.name) : entry.name;
      results.push(...walkSourceFiles(rootDir, subDir));
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name).toLowerCase();
      if (SOURCE_EXTENSIONS.has(ext)) {
        const relPath = baseDir ? path.join(baseDir, entry.name) : entry.name;
        results.push(relPath);
      }
    }
  }

  return results;
}

/**
 * Count total lines in given files relative to rootDir.
 */
function countLinesOfCode(rootDir: string, files: string[]): number {
  let total = 0;
  for (const file of files) {
    try {
      const content = fs.readFileSync(path.join(rootDir, file), "utf-8");
      total += content.split("\n").length;
    } catch {
      // Skip unreadable files
    }
  }
  return total;
}

/**
 * Detect languages present in source files.
 */
function detectLanguagesFromFiles(files: string[]): string[] {
  const langSet = new Set<string>();
  for (const file of files) {
    const ext = path.extname(file).toLowerCase();
    switch (ext) {
      case ".ts":
      case ".tsx":
        langSet.add("TypeScript");
        break;
      case ".js":
      case ".jsx":
      case ".mjs":
      case ".cjs":
        langSet.add("JavaScript");
        break;
      case ".py":
        langSet.add("Python");
        break;
      case ".java":
        langSet.add("Java");
        break;
      case ".go":
        langSet.add("Go");
        break;
      case ".rs":
        langSet.add("Rust");
        break;
      case ".rb":
        langSet.add("Ruby");
        break;
      case ".php":
        langSet.add("PHP");
        break;
      case ".cs":
        langSet.add("C#");
        break;
      case ".swift":
        langSet.add("Swift");
        break;
      case ".kt":
        langSet.add("Kotlin");
        break;
    }
  }
  return Array.from(langSet).sort();
}

/**
 * Detect frameworks from a package.json's dependencies and devDependencies.
 */
function detectFrameworks(pkgJsonPath: string): string[] {
  if (!fs.existsSync(pkgJsonPath)) return [];

  try {
    const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, "utf-8"));
    const allDeps: Record<string, string> = {
      ...(pkg.dependencies ?? {}),
      ...(pkg.devDependencies ?? {}),
    };

    const frameworkSet = new Set<string>();
    for (const dep of Object.keys(allDeps)) {
      if (dep in FRAMEWORK_PATTERNS) {
        frameworkSet.add(FRAMEWORK_PATTERNS[dep]);
      }
    }
    return Array.from(frameworkSet).sort();
  } catch {
    return [];
  }
}

/**
 * Detect entry points from package.json fields and common file patterns.
 */
function detectEntryPoints(
  rootDir: string,
  pkgJsonPath: string,
): string[] {
  const entryPoints: string[] = [];

  // From package.json fields
  if (fs.existsSync(pkgJsonPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, "utf-8"));

      if (typeof pkg.main === "string" && pkg.main) {
        entryPoints.push(pkg.main);
      }
      if (typeof pkg.module === "string" && pkg.module) {
        entryPoints.push(pkg.module);
      }
      // Handle exports field (string or object with . key)
      if (typeof pkg.exports === "string" && pkg.exports) {
        entryPoints.push(pkg.exports);
      } else if (
        typeof pkg.exports === "object" &&
        pkg.exports !== null &&
        typeof pkg.exports["."] === "string"
      ) {
        entryPoints.push(pkg.exports["."]);
      }
    } catch {
      // Skip malformed package.json
    }
  }

  // Check common entry point file patterns
  for (const pattern of COMMON_ENTRY_FILES) {
    if (fs.existsSync(path.join(rootDir, pattern))) {
      if (!entryPoints.includes(pattern)) {
        entryPoints.push(pattern);
      }
    }
  }

  return entryPoints;
}

/**
 * Detect CI/CD configurations in the project root.
 */
function detectCiCd(rootDir: string): CiCdInfo[] {
  const results: CiCdInfo[] = [];
  for (const detector of CICD_DETECTORS) {
    const configFile = detector.check(rootDir);
    if (configFile) {
      results.push({ tool: detector.tool, configFile });
    }
  }
  return results;
}

/**
 * Build a ServiceEntry for a given service directory.
 */
function buildServiceEntry(
  projectRoot: string,
  serviceName: string,
  servicePath: string,
): ServiceEntry {
  const absServicePath = path.join(projectRoot, servicePath);
  const sourceFiles = walkSourceFiles(absServicePath);
  const loc = countLinesOfCode(absServicePath, sourceFiles);
  const languages = detectLanguagesFromFiles(sourceFiles);
  const pkgJsonPath = path.join(absServicePath, "package.json");
  const frameworks = detectFrameworks(pkgJsonPath);
  const entryPoints = detectEntryPoints(absServicePath, pkgJsonPath);

  return {
    name: serviceName,
    path: servicePath,
    loc,
    languages,
    frameworks,
    entryPoints,
  };
}

// ---------------------------------------------------------------------------
// Manifest generation
// ---------------------------------------------------------------------------

function generateManifest(
  projectType: string,
  services: ServiceEntry[],
  cicd: CiCdInfo[],
  durationMs: number,
): string {
  const now = new Date().toISOString();

  const lines: string[] = [];

  // YAML frontmatter
  lines.push("---");
  lines.push(`generated: "${now}"`);
  lines.push('generator: "scout"');
  lines.push("phase: 2");
  lines.push(`scout_duration_ms: ${durationMs}`);
  lines.push(`project_type: "${projectType}"`);
  lines.push("---");
  lines.push("");
  lines.push("# Service Manifest");
  lines.push("");
  lines.push("## Services");
  lines.push("");

  if (services.length === 0) {
    lines.push(
      "Single-service project. See root-level analysis artifacts.",
    );
  } else {
    // Service table
    lines.push(
      "| Service | Path | LOC (approx) | Languages | Frameworks | Entry Points |",
    );
    lines.push(
      "|---------|------|--------------|-----------|------------|--------------|",
    );
    for (const svc of services) {
      const langs = svc.languages.length > 0 ? svc.languages.join(", ") : "--";
      const fws =
        svc.frameworks.length > 0 ? svc.frameworks.join(", ") : "--";
      const eps =
        svc.entryPoints.length > 0
          ? svc.entryPoints.map((e) => `\`${e}\``).join(", ")
          : "--";
      lines.push(
        `| ${svc.name} | \`${svc.path}\` | ${svc.loc} | ${langs} | ${fws} | ${eps} |`,
      );
    }
  }

  lines.push("");
  lines.push("## CI/CD");
  lines.push("");

  if (cicd.length === 0) {
    lines.push("No CI/CD configuration detected.");
  } else {
    lines.push("| Tool | Config File |");
    lines.push("|------|-------------|");
    for (const ci of cicd) {
      lines.push(`| ${ci.tool} | \`${ci.configFile}\` |`);
    }
  }

  lines.push("");
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

/**
 * Run the Scout agent: extend detectProject output with LOC counting,
 * framework detection, entry point detection, and CI/CD detection.
 * Produces service-manifest.md.
 */
export async function runScout(options: ScoutOptions): Promise<ScoutResult> {
  const startTime = Date.now();
  const { projectRoot, outputDir } = options;

  // 1. Get project info (prefer config.yml, fall back to detectProject)
  let projectInfo: ProjectInfo;
  try {
    const config = loadConfig(projectRoot);
    if (config) {
      projectInfo = {
        type: config.project.type,
        languages: config.project.languages,
        buildCommand: config.project.build_command ?? null,
        testCommand: config.project.test_command ?? null,
        e2eTool: config.project.e2e_tool ?? null,
        e2eCommand: config.project.e2e_command ?? null,
        services: config.project.services ?? [],
        projectName: config.project.name,
      };
    } else {
      projectInfo = await detectProject(projectRoot);
    }
  } catch {
    // Config exists but is malformed -- fall back to detection
    projectInfo = await detectProject(projectRoot);
  }

  // 2. Build service entries with enrichment
  const services: ServiceEntry[] = [];

  if (projectInfo.services.length > 0) {
    // Multi-service project: build entry for each service
    for (const svc of projectInfo.services) {
      services.push(buildServiceEntry(projectRoot, svc.name, svc.path));
    }
  } else {
    // Single-service project: treat root as the service
    const sourceFiles = walkSourceFiles(projectRoot);
    const loc = countLinesOfCode(projectRoot, sourceFiles);
    const languages = detectLanguagesFromFiles(sourceFiles);
    const pkgJsonPath = path.join(projectRoot, "package.json");
    const frameworks = detectFrameworks(pkgJsonPath);
    const entryPoints = detectEntryPoints(projectRoot, pkgJsonPath);

    services.push({
      name: projectInfo.projectName,
      path: ".",
      loc,
      languages,
      frameworks,
      entryPoints,
    });
  }

  // 3. Detect CI/CD
  const cicd = detectCiCd(projectRoot);

  // 4. Calculate duration
  const durationMs = Date.now() - startTime;

  // 5. Generate and write manifest
  const manifestContent = generateManifest(
    projectInfo.type,
    services,
    cicd,
    durationMs,
  );

  fs.mkdirSync(outputDir, { recursive: true });
  const manifestPath = path.join(outputDir, "service-manifest.md");
  fs.writeFileSync(manifestPath, manifestContent, "utf-8");

  return {
    projectType: projectInfo.type,
    services,
    cicd,
    durationMs,
    manifestPath,
  };
}
