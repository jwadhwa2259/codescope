import enhancedResolve from "enhanced-resolve";
const { ResolverFactory, CachedInputFileSystem } = enhancedResolve;
import * as fs from "node:fs";
import * as path from "node:path";

interface ResolverOptions {
  projectRoot: string;
  tsconfigPath?: string;
  workspaceAliases?: Record<string, string>;
}

type Resolver = ReturnType<typeof ResolverFactory.createResolver>;

export function createTypeScriptResolver(options: ResolverOptions): Resolver {
  // Load tsconfig paths if available
  let pathMappings: Record<string, string[]> | undefined;
  let baseUrl: string | undefined;

  const tsconfigPath =
    options.tsconfigPath ??
    path.join(options.projectRoot, "tsconfig.json");
  if (fs.existsSync(tsconfigPath)) {
    try {
      const tsconfig = JSON.parse(fs.readFileSync(tsconfigPath, "utf-8"));
      baseUrl = tsconfig.compilerOptions?.baseUrl
        ? path.resolve(
            path.dirname(tsconfigPath),
            tsconfig.compilerOptions.baseUrl
          )
        : undefined;
      pathMappings = tsconfig.compilerOptions?.paths;
    } catch {
      /* ignore malformed tsconfig */
    }
  }

  // Build alias map: workspace exact aliases first (with "$" suffix for exact matching),
  // then tsconfig prefix aliases. enhanced-resolve processes aliases in insertion order;
  // placing exact workspace aliases before tsconfig prefix aliases ensures that e.g.
  // "@tiptap/core$" is matched before "@tiptap" (from tsconfig "@tiptap/*").
  const alias: Record<string, string | string[]> = {};

  // 1. Workspace aliases first — exact match with "$" suffix
  if (options.workspaceAliases) {
    for (const [key, value] of Object.entries(options.workspaceAliases)) {
      alias[`${key}$`] = value;
    }
  }

  // 2. tsconfig path aliases — prefix matching
  if (pathMappings && baseUrl) {
    for (const [pattern, targets] of Object.entries(pathMappings)) {
      const cleanPattern = pattern.replace("/*", "");
      // Skip tsconfig alias if a workspace alias exists for the same key
      // (workspace aliases take precedence for overlapping keys)
      if (options.workspaceAliases && cleanPattern in options.workspaceAliases) {
        continue;
      }
      const cleanTargets = (targets as string[]).map((t) =>
        path.resolve(baseUrl!, t.replace("/*", ""))
      );
      alias[cleanPattern] =
        cleanTargets.length === 1 ? cleanTargets[0] : cleanTargets;
    }
  }

  const resolver = ResolverFactory.createResolver({
    fileSystem: new CachedInputFileSystem(fs, 4000),
    extensions: [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".json"],
    mainFields: ["types", "typings", "main", "module"],
    mainFiles: ["index"],
    alias,
    conditionNames: ["import", "require", "node", "default"],
    modules: ["node_modules"],
    useSyncFileSystemCalls: true,
  });

  return resolver;
}

export function resolveTypeScriptImport(
  importSource: string,
  fromFile: string,
  resolver: Resolver
): string | null {
  const context = path.dirname(fromFile);
  try {
    const result = resolver.resolveSync({}, context, importSource);
    return result || null;
  } catch {
    return null;
  }
}
