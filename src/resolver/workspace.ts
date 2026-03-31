import * as fs from "node:fs";
import * as path from "node:path";

export interface WorkspacePackage {
  name: string;       // "@effect/platform"
  path: string;       // "packages/platform"
  entryPoint: string; // "packages/platform/src/index.ts" (resolved relative to projectRoot)
}

/**
 * Extract the "." entry point path from a package.json exports field.
 * Handles string exports, condition maps, and Tiptap-style nested structures
 * like { ".": { types: { import: ... }, import: "./dist/index.js" } }.
 *
 * Prefers: import > default > require > module > types (source over declarations).
 * For nested objects (e.g. types: { import: ... }), only recurses one level.
 */
function extractDotExport(exports: unknown): string | null {
  if (typeof exports === "string") return exports;
  if (!exports || typeof exports !== "object") return null;

  const exportsObj = exports as Record<string, unknown>;
  const dotEntry = exportsObj["."];
  if (dotEntry === undefined) return null;
  if (typeof dotEntry === "string") return dotEntry;
  if (!dotEntry || typeof dotEntry !== "object") return null;

  const dot = dotEntry as Record<string, unknown>;

  // Prefer import > default > require — skip nested objects on first pass
  for (const key of ["import", "default", "require", "module"]) {
    if (typeof dot[key] === "string") return dot[key] as string;
  }

  // Handle nested condition objects like { types: { import: "..." } }
  for (const key of ["import", "default", "require", "module", "types"]) {
    const nested = dot[key];
    if (nested && typeof nested === "object") {
      const nestedObj = nested as Record<string, unknown>;
      for (const subKey of ["import", "default", "require"]) {
        if (typeof nestedObj[subKey] === "string") return nestedObj[subKey] as string;
      }
    }
  }

  // types at top level as last resort (declaration files are better than nothing)
  if (typeof dot["types"] === "string") return dot["types"] as string;

  return null;
}

/**
 * Resolve the entry point for a workspace package with file-existence checks.
 * Tries exports > main > module fields, but only accepts paths that exist on disk.
 * Falls back to src/index.ts, src/index.tsx, or index.ts.
 */
export function resolveEntryPoint(
  pkgDir: string,
  pkg: Record<string, unknown>,
  relativeBase: string,
): string | null {
  // Candidate paths from package.json fields (in priority order)
  const candidates: string[] = [];

  // 1. exports["."] field
  const dotExport = extractDotExport(pkg.exports);
  if (typeof dotExport === "string") {
    candidates.push(dotExport);
  }

  // 2. main field
  if (typeof pkg.main === "string") {
    candidates.push(pkg.main);
  }

  // 3. module field
  if (typeof pkg.module === "string") {
    candidates.push(pkg.module);
  }

  // Check each candidate — only accept if the file exists on disk
  for (const candidate of candidates) {
    const absPath = path.join(pkgDir, candidate);
    if (fs.existsSync(absPath)) {
      return path.join(relativeBase, candidate);
    }
  }

  // 4. Fallback: src/index.ts
  if (fs.existsSync(path.join(pkgDir, "src", "index.ts"))) {
    return path.join(relativeBase, "src", "index.ts");
  }

  // 5. Fallback: src/index.tsx
  if (fs.existsSync(path.join(pkgDir, "src", "index.tsx"))) {
    return path.join(relativeBase, "src", "index.tsx");
  }

  // 6. Last resort: index.ts in package root
  if (fs.existsSync(path.join(pkgDir, "index.ts"))) {
    return path.join(relativeBase, "index.ts");
  }

  return null;
}

/**
 * Discover workspace packages from workspace directory patterns.
 * Reads package.json in each matching subdirectory to get the package name.
 * Resolves entry point via exports, main, or src/index.ts fallback.
 * Entry points from exports/main are verified to exist on disk before use.
 */
export function discoverWorkspacePackages(
  projectRoot: string,
  workspacePatterns: string[],
): WorkspacePackage[] {
  const packages: WorkspacePackage[] = [];
  const seen = new Set<string>();

  for (const pattern of workspacePatterns) {
    if (pattern.startsWith("!")) continue; // skip exclusion patterns
    const baseDir = pattern.replace("/*", "").replace("/**", "");
    const fullBase = path.join(projectRoot, baseDir);
    if (!fs.existsSync(fullBase) || !fs.statSync(fullBase).isDirectory()) continue;

    const entries = fs.readdirSync(fullBase, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const pkgDir = path.join(fullBase, entry.name);
      const pkgJsonPath = path.join(pkgDir, "package.json");
      if (!fs.existsSync(pkgJsonPath)) continue;

      try {
        const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, "utf-8"));
        const name = pkg.name;
        if (!name || seen.has(name)) continue;
        seen.add(name);

        const relativeBase = path.join(baseDir, entry.name);
        const entryPoint = resolveEntryPoint(pkgDir, pkg, relativeBase);

        if (entryPoint) {
          packages.push({ name, path: relativeBase, entryPoint });
        }
      } catch { /* skip malformed package.json */ }
    }
  }

  return packages;
}

/**
 * Build an alias map from workspace packages for use with enhanced-resolve.
 */
export function buildWorkspaceAliases(
  projectRoot: string,
  packages: WorkspacePackage[],
): Record<string, string> {
  const aliases: Record<string, string> = {};
  for (const pkg of packages) {
    aliases[pkg.name] = path.resolve(projectRoot, pkg.entryPoint);
  }
  return aliases;
}
