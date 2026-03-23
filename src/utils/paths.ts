import * as path from "node:path";
import * as os from "node:os";

export const CODESCOPE_ROOT = ".claude/codescope";

export const CODESCOPE_DIRS = [
  "",                    // .claude/codescope itself
  "services",
  "orient",
  "plans",
  "execution",
  "reports",
  "reports/screenshots",
] as const;

export function getCodescopePath(projectRoot: string): string {
  return path.join(projectRoot, CODESCOPE_ROOT);
}

export function getConfigPath(projectRoot: string): string {
  return path.join(projectRoot, CODESCOPE_ROOT, "config.yml");
}

export function getGraphDbPath(projectRoot: string): string {
  return path.join(projectRoot, CODESCOPE_ROOT, "graph.db");
}

export function getGlobalDir(): string {
  return path.join(os.homedir(), ".codescope");
}

export function getGlobalMemoryPath(): string {
  return path.join(os.homedir(), ".codescope", "global-memory.md");
}
