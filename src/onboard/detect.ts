import * as fs from "node:fs";
import * as path from "node:path";

export interface ProjectInfo {
  type: "single" | "monorepo" | "polyrepo";
  languages: string[];
  buildCommand: string | null;
  testCommand: string | null;
  e2eTool: string | null;
  e2eCommand: string | null;
  services: Array<{ name: string; path: string; build?: string; test?: string }>;
  projectName: string;
}

/**
 * Detect project type, languages, build/test commands, E2E tools, and services
 * from filesystem configuration files. Returns safe defaults when nothing is detectable (D-04).
 */
export async function detectProject(rootDir: string): Promise<ProjectInfo> {
  const info: ProjectInfo = {
    type: "single",
    languages: [],
    buildCommand: null,
    testCommand: null,
    e2eTool: null,
    e2eCommand: null,
    services: [],
    projectName: path.basename(rootDir),
  };

  // 1. Check package.json
  const pkgPath = path.join(rootDir, "package.json");
  if (fs.existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
      if (pkg.name) info.projectName = pkg.name;
      if (pkg.scripts?.build) info.buildCommand = "npm run build";
      if (pkg.scripts?.test) info.testCommand = "npm test";
      if (pkg.workspaces) {
        info.type = "monorepo";
        // Resolve workspace patterns to actual directories
        const patterns: string[] = Array.isArray(pkg.workspaces)
          ? pkg.workspaces
          : pkg.workspaces?.packages ?? [];
        for (const pattern of patterns) {
          // Simple glob: "packages/*" -> list directories in packages/
          const baseDir = pattern.replace("/*", "").replace("/**", "");
          const fullBase = path.join(rootDir, baseDir);
          if (fs.existsSync(fullBase) && fs.statSync(fullBase).isDirectory()) {
            const entries = fs.readdirSync(fullBase, { withFileTypes: true });
            for (const entry of entries) {
              if (entry.isDirectory()) {
                const servicePath = path.join(baseDir, entry.name);
                const servicePkgPath = path.join(rootDir, servicePath, "package.json");
                let serviceBuild: string | undefined;
                let serviceTest: string | undefined;
                if (fs.existsSync(servicePkgPath)) {
                  try {
                    const servicePkg = JSON.parse(
                      fs.readFileSync(servicePkgPath, "utf-8"),
                    );
                    if (servicePkg.scripts?.build) serviceBuild = "npm run build";
                    if (servicePkg.scripts?.test) serviceTest = "npm test";
                  } catch {
                    /* ignore malformed package.json in workspace */
                  }
                }
                info.services.push({
                  name: entry.name,
                  path: servicePath,
                  build: serviceBuild,
                  test: serviceTest,
                });
              }
            }
          }
        }
      }
    } catch {
      /* malformed package.json, continue detection */
    }
  }

  // 2. Check for TypeScript
  if (
    fs.existsSync(path.join(rootDir, "tsconfig.json")) ||
    fs.existsSync(path.join(rootDir, "jsconfig.json"))
  ) {
    if (!info.languages.includes("typescript")) info.languages.push("typescript");
  } else if (fs.existsSync(pkgPath)) {
    // Check if JS project (has package.json but no tsconfig)
    if (
      !info.languages.includes("javascript") &&
      !info.languages.includes("typescript")
    ) {
      info.languages.push("javascript");
    }
  }

  // Confirm TS over JS when tsconfig exists
  if (fs.existsSync(path.join(rootDir, "tsconfig.json"))) {
    const jsIdx = info.languages.indexOf("javascript");
    if (jsIdx >= 0) info.languages[jsIdx] = "typescript";
    if (!info.languages.includes("typescript")) info.languages.push("typescript");
  }

  // 3. Check for Python
  const pythonIndicators = [
    "pyproject.toml",
    "setup.py",
    "requirements.txt",
    "Pipfile",
    "setup.cfg",
  ];
  for (const indicator of pythonIndicators) {
    if (fs.existsSync(path.join(rootDir, indicator))) {
      if (!info.languages.includes("python")) info.languages.push("python");
      break;
    }
  }

  // 4. Check for E2E tools
  const e2eConfigs: Array<{ file: string; tool: string; command: string }> = [
    { file: "playwright.config.ts", tool: "playwright", command: "npx playwright test" },
    { file: "playwright.config.js", tool: "playwright", command: "npx playwright test" },
    { file: "cypress.config.ts", tool: "cypress", command: "npx cypress run" },
    { file: "cypress.config.js", tool: "cypress", command: "npx cypress run" },
  ];
  for (const e2e of e2eConfigs) {
    if (fs.existsSync(path.join(rootDir, e2e.file))) {
      info.e2eTool = e2e.tool;
      info.e2eCommand = e2e.command;
      break;
    }
  }

  // 5. Check for Docker Compose (additional monorepo/polyrepo indicator)
  const dockerComposePaths = [
    "docker-compose.yml",
    "docker-compose.yaml",
    "compose.yml",
    "compose.yaml",
  ];
  for (const dcPath of dockerComposePaths) {
    const fullPath = path.join(rootDir, dcPath);
    if (fs.existsSync(fullPath)) {
      try {
        const yaml = await import("js-yaml");
        const content = fs.readFileSync(fullPath, "utf-8");
        const dc = yaml.load(content) as Record<string, unknown>;
        if (
          dc &&
          typeof dc === "object" &&
          "services" in dc &&
          typeof dc.services === "object" &&
          dc.services !== null
        ) {
          const serviceNames = Object.keys(dc.services as Record<string, unknown>);
          // Only add services not already detected from package.json workspaces
          for (const name of serviceNames) {
            if (!info.services.some((s) => s.name === name)) {
              // Try to find directory for service (D-27: derive from directory names)
              const possiblePaths = [`services/${name}`, `apps/${name}`, name];
              let servicePath = name;
              for (const pp of possiblePaths) {
                if (fs.existsSync(path.join(rootDir, pp))) {
                  servicePath = pp;
                  break;
                }
              }
              info.services.push({ name, path: servicePath });
            }
          }
          if (info.services.length > 1 && info.type === "single") {
            info.type = "monorepo";
          }
        }
      } catch {
        /* ignore parsing errors */
      }
      break;
    }
  }

  return info;
}

// ---------------------------------------------------------------------------
// Framework Detection
// ---------------------------------------------------------------------------

/**
 * Known framework packages to detect from package.json.
 */
const KNOWN_FRAMEWORKS: Record<string, string> = {
  fastify: "fastify",
  express: "express",
  h3: "h3",
};

/**
 * Detect known frameworks from package.json dependencies and devDependencies.
 *
 * @param projectRoot - Absolute path to project root
 * @returns Array of detected framework names (e.g., ["fastify", "express"])
 */
export function detectFrameworks(projectRoot: string): string[] {
  const pkgPath = path.join(projectRoot, "package.json");
  if (!fs.existsSync(pkgPath)) return [];
  try {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
    const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };
    return Object.keys(KNOWN_FRAMEWORKS)
      .filter((dep) => dep in allDeps)
      .map((dep) => KNOWN_FRAMEWORKS[dep]);
  } catch {
    return [];
  }
}
