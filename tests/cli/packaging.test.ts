import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";

const pkg = JSON.parse(
  fs.readFileSync(path.join(process.cwd(), "package.json"), "utf-8"),
);

describe("package.json distribution config", () => {
  it("has bin entry pointing to dist/cli.mjs", () => {
    expect(pkg.bin).toBeDefined();
    expect(pkg.bin.codescope).toBe("./dist/cli.mjs");
  });

  it("has files array with required distribution files", () => {
    expect(pkg.files).toBeDefined();
    expect(pkg.files).toContain("dist/");
    expect(pkg.files).toContain("grammars/*.wasm");
    expect(pkg.files).toContain("hooks/");
    expect(pkg.files).toContain("skills/");
    expect(pkg.files).toContain(".claude-plugin/");
    expect(pkg.files).toContain(".mcp.json");
    expect(pkg.files).toContain("README.md");
  });

  it("has optionalDependencies for all 4 platforms", () => {
    expect(pkg.optionalDependencies).toBeDefined();
    expect(pkg.optionalDependencies["@codescope/better-sqlite3-darwin-arm64"]).toBe("12.8.0");
    expect(pkg.optionalDependencies["@codescope/better-sqlite3-darwin-x64"]).toBe("12.8.0");
    expect(pkg.optionalDependencies["@codescope/better-sqlite3-linux-x64"]).toBe("12.8.0");
    expect(pkg.optionalDependencies["@codescope/better-sqlite3-win32-x64"]).toBe("12.8.0");
  });

  it("has engines requiring Node >= 22", () => {
    expect(pkg.engines).toBeDefined();
    expect(pkg.engines.node).toBe(">=22.0.0");
  });

  it("keeps better-sqlite3 as external in dependencies", () => {
    expect(pkg.dependencies["better-sqlite3"]).toBeDefined();
  });

  it("has type module for ESM", () => {
    expect(pkg.type).toBe("module");
  });
});

describe("platform package scaffolding", () => {
  const platforms = [
    { dir: "darwin-arm64", os: "darwin", cpu: "arm64" },
    { dir: "darwin-x64", os: "darwin", cpu: "x64" },
    { dir: "linux-x64", os: "linux", cpu: "x64" },
    { dir: "win32-x64", os: "win32", cpu: "x64" },
  ];

  for (const { dir, os, cpu } of platforms) {
    it(`platform-packages/${dir}/package.json has correct os and cpu`, () => {
      const pkgPath = path.join(
        process.cwd(),
        "platform-packages",
        dir,
        "package.json",
      );
      expect(fs.existsSync(pkgPath)).toBe(true);
      const platformPkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
      expect(platformPkg.os).toEqual([os]);
      expect(platformPkg.cpu).toEqual([cpu]);
      expect(platformPkg.name).toContain("@codescope/better-sqlite3-");
      expect(platformPkg.version).toBe("12.8.0");
    });
  }
});

describe("distribution files exist", () => {
  it("grammars directory exists", () => {
    const grammarsDir = path.join(process.cwd(), "grammars");
    expect(fs.existsSync(grammarsDir)).toBe(true);
    // WASM files are build artifacts (npm run build:grammars / copy:grammars)
    // They may not be present in a fresh checkout but will be in the published package
  });

  it("hooks/hooks.json exists", () => {
    expect(
      fs.existsSync(path.join(process.cwd(), "hooks", "hooks.json")),
    ).toBe(true);
  });

  it(".claude-plugin/plugin.json exists", () => {
    expect(
      fs.existsSync(
        path.join(process.cwd(), ".claude-plugin", "plugin.json"),
      ),
    ).toBe(true);
  });

  it(".mcp.json exists", () => {
    expect(fs.existsSync(path.join(process.cwd(), ".mcp.json"))).toBe(true);
  });

  it("README.md exists and contains quickstart", () => {
    const readme = fs.readFileSync(
      path.join(process.cwd(), "README.md"),
      "utf-8",
    );
    expect(readme).toContain("npx codescope init");
    expect(readme).toContain("## Commands");
  });

  it("build-platform-packages.sh exists", () => {
    expect(
      fs.existsSync(
        path.join(process.cwd(), "scripts", "build-platform-packages.sh"),
      ),
    ).toBe(true);
  });
});
