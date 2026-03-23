import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";

const PROJECT_ROOT = path.resolve(import.meta.dirname ?? __dirname, "..", "..");

describe("Plugin Manifest", () => {
  describe("package.json", () => {
    it("exists and has name codescope", () => {
      const pkg = JSON.parse(
        fs.readFileSync(path.join(PROJECT_ROOT, "package.json"), "utf-8")
      );
      expect(pkg.name).toBe("codescope");
    });

    it("has all core dependencies", () => {
      const pkg = JSON.parse(
        fs.readFileSync(path.join(PROJECT_ROOT, "package.json"), "utf-8")
      );
      const deps = Object.keys(pkg.dependencies || {});
      expect(deps).toContain("better-sqlite3");
      expect(deps).toContain("web-tree-sitter");
      expect(deps).toContain("@modelcontextprotocol/sdk");
      expect(deps).toContain("zod");
      expect(deps).toContain("enhanced-resolve");
      expect(deps).toContain("tsconfig-paths");
      expect(deps).toContain("js-yaml");
      expect(deps).toContain("graphology");
      expect(deps).toContain("graphology-types");
    });

    it("has all dev dependencies", () => {
      const pkg = JSON.parse(
        fs.readFileSync(path.join(PROJECT_ROOT, "package.json"), "utf-8")
      );
      const devDeps = Object.keys(pkg.devDependencies || {});
      expect(devDeps).toContain("typescript");
      expect(devDeps).toContain("vitest");
      expect(devDeps).toContain("tsdown");
      expect(devDeps).toContain("tsx");
      expect(devDeps).toContain("@types/better-sqlite3");
      expect(devDeps).toContain("@types/js-yaml");
      expect(devDeps).toContain("@modelcontextprotocol/inspector");
    });
  });

  describe("tsconfig.json", () => {
    it("has correct compiler options", () => {
      const tsconfig = JSON.parse(
        fs.readFileSync(path.join(PROJECT_ROOT, "tsconfig.json"), "utf-8")
      );
      expect(tsconfig.compilerOptions.target).toBe("ES2022");
      expect(tsconfig.compilerOptions.module).toBe("NodeNext");
      expect(tsconfig.compilerOptions.strict).toBe(true);
      expect(tsconfig.compilerOptions.outDir).toBe("dist");
    });
  });

  describe(".claude-plugin/plugin.json", () => {
    it("is valid JSON with name codescope", () => {
      const manifest = JSON.parse(
        fs.readFileSync(
          path.join(PROJECT_ROOT, ".claude-plugin", "plugin.json"),
          "utf-8"
        )
      );
      expect(manifest.name).toBe("codescope");
      expect(manifest.version).toBe("0.1.0");
    });

    it("has exactly 5 skills registered", () => {
      const manifest = JSON.parse(
        fs.readFileSync(
          path.join(PROJECT_ROOT, ".claude-plugin", "plugin.json"),
          "utf-8"
        )
      );
      expect(manifest.skills).toHaveLength(5);
    });

    it("each skill path file exists on disk", () => {
      const manifest = JSON.parse(
        fs.readFileSync(
          path.join(PROJECT_ROOT, ".claude-plugin", "plugin.json"),
          "utf-8"
        )
      );
      for (const skill of manifest.skills) {
        const skillPath = path.join(PROJECT_ROOT, skill.path);
        expect(fs.existsSync(skillPath), `Missing: ${skill.path}`).toBe(true);
      }
    });
  });

  describe(".mcp.json", () => {
    it("references dist/server.js with CODESCOPE_GRAMMAR_DIR env var", () => {
      const mcpConfig = JSON.parse(
        fs.readFileSync(path.join(PROJECT_ROOT, ".mcp.json"), "utf-8")
      );
      expect(mcpConfig.mcpServers.codescope.command).toBe("node");
      expect(mcpConfig.mcpServers.codescope.args).toContain(
        "${CLAUDE_PLUGIN_ROOT}/dist/server.js"
      );
      expect(
        mcpConfig.mcpServers.codescope.env.CODESCOPE_GRAMMAR_DIR
      ).toBe("${CLAUDE_PLUGIN_ROOT}/grammars");
    });
  });

  describe("SKILL.md files", () => {
    it("each SKILL.md has valid frontmatter with name and description", () => {
      const skillNames = [
        "onboard",
        "bootstrap",
        "orient",
        "settings",
        "review-learnings",
      ];
      for (const name of skillNames) {
        const content = fs.readFileSync(
          path.join(PROJECT_ROOT, "skills", name, "SKILL.md"),
          "utf-8"
        );
        // Check frontmatter delimiters exist
        expect(content.startsWith("---"), `${name} missing frontmatter start`).toBe(true);
        const secondDelimiter = content.indexOf("---", 3);
        expect(secondDelimiter, `${name} missing frontmatter end`).toBeGreaterThan(3);

        // Extract frontmatter and check fields
        const frontmatter = content.substring(3, secondDelimiter);
        expect(frontmatter, `${name} missing name field`).toContain("name:");
        expect(frontmatter, `${name} missing description field`).toContain("description:");
      }
    });

    it("skills/onboard/SKILL.md has name onboard and describes configuration", () => {
      const content = fs.readFileSync(
        path.join(PROJECT_ROOT, "skills", "onboard", "SKILL.md"),
        "utf-8"
      );
      expect(content).toContain("name: onboard");
      expect(content).toContain("Configure CodeScope");
    });

    it("skills/bootstrap/SKILL.md body contains phase 2 message", () => {
      const content = fs.readFileSync(
        path.join(PROJECT_ROOT, "skills", "bootstrap", "SKILL.md"),
        "utf-8"
      );
      expect(content).toContain("This skill will be available after Phase 2");
    });

    it("skills/orient/SKILL.md body contains phase 4 message", () => {
      const content = fs.readFileSync(
        path.join(PROJECT_ROOT, "skills", "orient", "SKILL.md"),
        "utf-8"
      );
      expect(content).toContain("This skill will be available after Phase 4");
    });

    it("skills/settings/SKILL.md body contains phase 7 message", () => {
      const content = fs.readFileSync(
        path.join(PROJECT_ROOT, "skills", "settings", "SKILL.md"),
        "utf-8"
      );
      expect(content).toContain("This skill will be available after Phase 7");
    });

    it("skills/review-learnings/SKILL.md body contains phase 7 message", () => {
      const content = fs.readFileSync(
        path.join(PROJECT_ROOT, "skills", "review-learnings", "SKILL.md"),
        "utf-8"
      );
      expect(content).toContain("This skill will be available after Phase 7");
    });
  });
});
