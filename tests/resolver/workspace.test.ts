import { describe, it, expect, beforeAll, afterAll } from "vitest";
import * as path from "node:path";
import * as fs from "node:fs";
import * as os from "node:os";
import {
  discoverWorkspacePackages,
  buildWorkspaceAliases,
  type WorkspacePackage,
} from "../../src/resolver/workspace.js";
import {
  createTypeScriptResolver,
  resolveTypeScriptImport,
} from "../../src/resolver/typescript.js";

describe("Workspace package discovery", () => {
  let tempDir: string;

  beforeAll(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "codescope-ws-"));

    // Create packages/foo with package.json and src/index.ts
    fs.mkdirSync(path.join(tempDir, "packages", "foo", "src"), { recursive: true });
    fs.writeFileSync(
      path.join(tempDir, "packages", "foo", "package.json"),
      JSON.stringify({ name: "@test/foo", main: "src/index.ts" }),
    );
    fs.writeFileSync(
      path.join(tempDir, "packages", "foo", "src", "index.ts"),
      "export const foo = true;",
    );

    // Create packages/bar with exports field
    fs.mkdirSync(path.join(tempDir, "packages", "bar", "src"), { recursive: true });
    fs.writeFileSync(
      path.join(tempDir, "packages", "bar", "package.json"),
      JSON.stringify({
        name: "@test/bar",
        exports: { ".": { import: "./src/index.ts", default: "./src/index.ts" } },
      }),
    );
    fs.writeFileSync(
      path.join(tempDir, "packages", "bar", "src", "index.ts"),
      "export const bar = true;",
    );

    // Create packages/no-pkg (no package.json -- should be skipped)
    fs.mkdirSync(path.join(tempDir, "packages", "no-pkg"), { recursive: true });
  });

  afterAll(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("discovers packages from workspace directory patterns", () => {
    const packages = discoverWorkspacePackages(tempDir, ["packages/*"]);
    expect(packages.length).toBe(2);

    const foo = packages.find((p) => p.name === "@test/foo");
    expect(foo).toBeDefined();
    expect(foo!.path).toBe("packages/foo");
    expect(foo!.entryPoint).toBe("packages/foo/src/index.ts");

    const bar = packages.find((p) => p.name === "@test/bar");
    expect(bar).toBeDefined();
    expect(bar!.path).toBe("packages/bar");
    expect(bar!.entryPoint).toBe("packages/bar/src/index.ts");
  });

  it("handles missing package.json in subdirectory gracefully", () => {
    const packages = discoverWorkspacePackages(tempDir, ["packages/*"]);
    // no-pkg should not appear
    const noPkg = packages.find((p) => p.name === "no-pkg" || p.path.includes("no-pkg"));
    expect(noPkg).toBeUndefined();
  });

  it("skips exclusion patterns", () => {
    const packages = discoverWorkspacePackages(tempDir, ["packages/*", "!packages/bar"]);
    // bar should not appear since exclusion patterns are filtered out
    // (exclusion patterns are skipped in discoverWorkspacePackages)
    // Actually discoverWorkspacePackages only skips "!" prefix patterns from iteration
    // It does NOT apply exclusion filtering -- that's done by detectProject
    // So we just verify the function skips the ! prefix pattern itself
    expect(packages.length).toBe(2); // both foo and bar found
  });

  it("builds workspace aliases from discovered packages", () => {
    const packages = discoverWorkspacePackages(tempDir, ["packages/*"]);
    const aliases = buildWorkspaceAliases(tempDir, packages);
    expect(aliases["@test/foo"]).toBe(path.resolve(tempDir, "packages/foo/src/index.ts"));
    expect(aliases["@test/bar"]).toBe(path.resolve(tempDir, "packages/bar/src/index.ts"));
  });

  it("uses src/index.ts fallback when no main or exports", () => {
    // Create packages/fallback with only src/index.ts
    fs.mkdirSync(path.join(tempDir, "packages", "fallback", "src"), { recursive: true });
    fs.writeFileSync(
      path.join(tempDir, "packages", "fallback", "package.json"),
      JSON.stringify({ name: "@test/fallback" }),
    );
    fs.writeFileSync(
      path.join(tempDir, "packages", "fallback", "src", "index.ts"),
      "export const fallback = true;",
    );

    const packages = discoverWorkspacePackages(tempDir, ["packages/*"]);
    const fallback = packages.find((p) => p.name === "@test/fallback");
    expect(fallback).toBeDefined();
    expect(fallback!.entryPoint).toBe("packages/fallback/src/index.ts");

    // Cleanup
    fs.rmSync(path.join(tempDir, "packages", "fallback"), { recursive: true, force: true });
  });
});

describe("Workspace-aware TypeScript resolver", () => {
  let tempDir: string;

  beforeAll(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "codescope-ws-resolve-"));

    // Create tsconfig with path aliases
    fs.writeFileSync(
      path.join(tempDir, "tsconfig.json"),
      JSON.stringify({
        compilerOptions: {
          baseUrl: ".",
          paths: { "@/*": ["src/*"] },
        },
      }, null, 2),
    );

    // Create source files
    fs.mkdirSync(path.join(tempDir, "src", "utils"), { recursive: true });
    fs.writeFileSync(
      path.join(tempDir, "src", "utils", "helpers.ts"),
      "export function helper() {}",
    );
    fs.writeFileSync(
      path.join(tempDir, "src", "index.ts"),
      "export const main = true;",
    );

    // Create workspace package
    fs.mkdirSync(path.join(tempDir, "packages", "platform", "src"), { recursive: true });
    fs.writeFileSync(
      path.join(tempDir, "packages", "platform", "package.json"),
      JSON.stringify({ name: "@effect/platform", main: "src/index.ts" }),
    );
    fs.writeFileSync(
      path.join(tempDir, "packages", "platform", "src", "index.ts"),
      "export const platform = true;",
    );

    // Create node_modules/lodash
    fs.mkdirSync(path.join(tempDir, "node_modules", "lodash"), { recursive: true });
    fs.writeFileSync(
      path.join(tempDir, "node_modules", "lodash", "index.js"),
      "module.exports = {};",
    );
    fs.writeFileSync(
      path.join(tempDir, "node_modules", "lodash", "package.json"),
      JSON.stringify({ name: "lodash", main: "index.js" }),
    );
  });

  afterAll(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("resolves workspace package import to local source file", () => {
    const workspaceAliases: Record<string, string> = {
      "@effect/platform": path.resolve(tempDir, "packages/platform/src/index.ts"),
    };
    const resolver = createTypeScriptResolver({
      projectRoot: tempDir,
      workspaceAliases,
    });
    const fromFile = path.join(tempDir, "src", "index.ts");
    const result = resolveTypeScriptImport("@effect/platform", fromFile, resolver);
    expect(result).not.toBeNull();
    expect(result!).toContain("packages/platform/src/index.ts");
  });

  it("non-workspace imports still resolve correctly with workspace aliases", () => {
    const workspaceAliases: Record<string, string> = {
      "@effect/platform": path.resolve(tempDir, "packages/platform/src/index.ts"),
    };
    const resolver = createTypeScriptResolver({
      projectRoot: tempDir,
      workspaceAliases,
    });
    const fromFile = path.join(tempDir, "src", "index.ts");

    // Relative import
    const relResult = resolveTypeScriptImport("./utils/helpers", fromFile, resolver);
    expect(relResult).not.toBeNull();
    expect(relResult!).toContain("helpers.ts");

    // node_modules import
    const nmResult = resolveTypeScriptImport("lodash", fromFile, resolver);
    expect(nmResult).not.toBeNull();
    expect(nmResult!).toContain("lodash");
  });

  it("workspace aliases merge with tsconfig path aliases", () => {
    const workspaceAliases: Record<string, string> = {
      "@effect/platform": path.resolve(tempDir, "packages/platform/src/index.ts"),
    };
    const resolver = createTypeScriptResolver({
      projectRoot: tempDir,
      workspaceAliases,
    });
    const fromFile = path.join(tempDir, "src", "index.ts");

    // tsconfig alias should still work
    const tsconfigResult = resolveTypeScriptImport("@/utils/helpers", fromFile, resolver);
    expect(tsconfigResult).not.toBeNull();
    expect(tsconfigResult!).toContain("helpers.ts");

    // workspace alias should also work
    const wsResult = resolveTypeScriptImport("@effect/platform", fromFile, resolver);
    expect(wsResult).not.toBeNull();
    expect(wsResult!).toContain("platform");
  });

  it("workspace aliases take precedence for overlapping keys", () => {
    // Create a tsconfig that maps @effect/* to some other path
    const customDir = fs.mkdtempSync(path.join(os.tmpdir(), "codescope-ws-overlap-"));
    try {
      fs.writeFileSync(
        path.join(customDir, "tsconfig.json"),
        JSON.stringify({
          compilerOptions: {
            baseUrl: ".",
            paths: { "@effect/platform": ["vendor/platform/index.ts"] },
          },
        }, null, 2),
      );

      // Create the workspace target
      fs.mkdirSync(path.join(customDir, "packages", "platform", "src"), { recursive: true });
      fs.writeFileSync(
        path.join(customDir, "packages", "platform", "src", "index.ts"),
        "export const platform = true;",
      );

      // Create the tsconfig target (should be overridden)
      fs.mkdirSync(path.join(customDir, "vendor", "platform"), { recursive: true });
      fs.writeFileSync(
        path.join(customDir, "vendor", "platform", "index.ts"),
        "export const old = true;",
      );

      const workspaceAliases: Record<string, string> = {
        "@effect/platform": path.resolve(customDir, "packages/platform/src/index.ts"),
      };
      const resolver = createTypeScriptResolver({
        projectRoot: customDir,
        workspaceAliases,
      });
      const fromFile = path.join(customDir, "packages", "platform", "src", "index.ts");
      const result = resolveTypeScriptImport("@effect/platform", fromFile, resolver);
      expect(result).not.toBeNull();
      // Should resolve to the workspace path, not the vendor path
      expect(result!).toContain("packages/platform/src/index.ts");
    } finally {
      fs.rmSync(customDir, { recursive: true, force: true });
    }
  });
});
