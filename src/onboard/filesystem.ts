import * as fs from "node:fs";
import * as path from "node:path";
import {
  CODESCOPE_DIRS,
  getCodescopePath,
  getGlobalDir,
  getGlobalMemoryPath,
} from "../utils/paths.js";

/**
 * Eagerly create the .claude/codescope/ directory tree (D-21).
 * Creates all 7 subdirectories and writes the selective .gitignore.
 */
export function createDirectoryTree(projectRoot: string): void {
  const base = getCodescopePath(projectRoot);
  for (const dir of CODESCOPE_DIRS) {
    fs.mkdirSync(path.join(base, dir), { recursive: true });
  }
  writeGitignore(projectRoot);
}

/**
 * Write selective .gitignore inside .claude/codescope/ (D-22).
 * Ignores transient files (graph.db, execution/, reports/screenshots/)
 * but tracks shareable files (config.yml, conventions-enforced.md).
 */
export function writeGitignore(projectRoot: string): void {
  const gitignorePath = path.join(getCodescopePath(projectRoot), ".gitignore");
  const content = `# CodeScope - ignore transient files, track shareable files
# Tracked: config.yml, conventions-enforced.md
# Ignored: database, execution artifacts, reports

graph.db
graph.db-wal
graph.db-shm
execution/
reports/screenshots/
usage.md
`;
  fs.writeFileSync(gitignorePath, content, "utf-8");
}

/**
 * Create ~/.codescope/ and global-memory.md (D-23).
 * Accepts an optional custom base directory for testing.
 * Idempotent: does not overwrite existing global-memory.md.
 */
export function createGlobalMemoryDir(customDir?: string): void {
  const globalDir = customDir ?? getGlobalDir();
  fs.mkdirSync(globalDir, { recursive: true });

  const memoryPath = path.join(globalDir, "global-memory.md");
  if (!fs.existsSync(memoryPath)) {
    fs.writeFileSync(
      memoryPath,
      "# CodeScope Global Memory\n\nNo previous preferences found. Starting fresh.\n",
      "utf-8"
    );
  }
}
