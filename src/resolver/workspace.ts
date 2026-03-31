import * as fs from "node:fs";
import * as path from "node:path";

export interface WorkspacePackage {
  name: string;       // "@effect/platform"
  path: string;       // "packages/platform"
  entryPoint: string; // "packages/platform/src/index.ts" (resolved relative to projectRoot)
}

/**
 * Discover workspace packages from workspace directory patterns.
 * Reads package.json in each matching subdirectory to get the package name.
 * Resolves entry point via exports, main, or src/index.ts fallback.
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

        // Resolve entry point: exports > main > src/index.ts fallback
        let entryPoint: string | null = null;

        // Check exports field (simplified: look for "." entry)
        if (pkg.exports) {
          const dotExport = typeof pkg.exports === "string"
            ? pkg.exports
            : pkg.exports["."]
              ? (typeof pkg.exports["."] === "string"
                ? pkg.exports["."]
                : pkg.exports["."].import || pkg.exports["."].default || pkg.exports["."].types)
              : null;
          if (typeof dotExport === "string") {
            entryPoint = path.join(baseDir, entry.name, dotExport);
          }
        }

        // Fallback to main
        if (!entryPoint && pkg.main) {
          entryPoint = path.join(baseDir, entry.name, pkg.main);
        }

        // Fallback to src/index.ts
        if (!entryPoint) {
          const srcIndex = path.join(pkgDir, "src", "index.ts");
          if (fs.existsSync(srcIndex)) {
            entryPoint = path.join(baseDir, entry.name, "src", "index.ts");
          }
        }

        // Last resort: index.ts in package root
        if (!entryPoint) {
          const rootIndex = path.join(pkgDir, "index.ts");
          if (fs.existsSync(rootIndex)) {
            entryPoint = path.join(baseDir, entry.name, "index.ts");
          }
        }

        if (entryPoint) {
          packages.push({ name, path: path.join(baseDir, entry.name), entryPoint });
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
