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

    it("has exactly 6 skills registered", () => {
      const manifest = JSON.parse(
        fs.readFileSync(
          path.join(PROJECT_ROOT, ".claude-plugin", "plugin.json"),
          "utf-8"
        )
      );
      expect(manifest.skills).toHaveLength(8);
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

    it("has hooks field pointing to hooks.json", () => {
      const manifest = JSON.parse(
        fs.readFileSync(
          path.join(PROJECT_ROOT, ".claude-plugin", "plugin.json"),
          "utf-8"
        )
      );
      expect(manifest.hooks).toBe("./hooks/hooks.json");
    });

    it("hooks file referenced in plugin.json exists on disk", () => {
      const manifest = JSON.parse(
        fs.readFileSync(
          path.join(PROJECT_ROOT, ".claude-plugin", "plugin.json"),
          "utf-8"
        )
      );
      const hooksPath = path.join(PROJECT_ROOT, manifest.hooks);
      expect(fs.existsSync(hooksPath), `Missing: ${manifest.hooks}`).toBe(
        true
      );
    });
  });

  describe("hooks/hooks.json", () => {
    it("exists and is valid JSON", () => {
      const content = fs.readFileSync(
        path.join(PROJECT_ROOT, "hooks", "hooks.json"),
        "utf-8"
      );
      const hooks = JSON.parse(content);
      expect(hooks).toBeDefined();
      expect(hooks.hooks).toBeDefined();
    });

    it("has PreToolUse and PostToolUse keys", () => {
      const hooks = JSON.parse(
        fs.readFileSync(
          path.join(PROJECT_ROOT, "hooks", "hooks.json"),
          "utf-8"
        )
      );
      expect(hooks.hooks.PreToolUse).toBeDefined();
      expect(hooks.hooks.PostToolUse).toBeDefined();
    });

    it('PreToolUse matcher is "Edit|Write"', () => {
      const hooks = JSON.parse(
        fs.readFileSync(
          path.join(PROJECT_ROOT, "hooks", "hooks.json"),
          "utf-8"
        )
      );
      expect(hooks.hooks.PreToolUse[0].matcher).toBe("Edit|Write");
    });

    it("PreToolUse command references dist/hooks/pre-tool-use.mjs", () => {
      const hooks = JSON.parse(
        fs.readFileSync(
          path.join(PROJECT_ROOT, "hooks", "hooks.json"),
          "utf-8"
        )
      );
      expect(hooks.hooks.PreToolUse[0].hooks[0].command).toContain(
        "dist/hooks/pre-tool-use.mjs"
      );
    });

    it("PostToolUse command references dist/hooks/post-tool-use.mjs", () => {
      const hooks = JSON.parse(
        fs.readFileSync(
          path.join(PROJECT_ROOT, "hooks", "hooks.json"),
          "utf-8"
        )
      );
      expect(hooks.hooks.PostToolUse[0].hooks[0].command).toContain(
        "dist/hooks/post-tool-use.mjs"
      );
    });

    it("PreToolUse timeout is 5 seconds", () => {
      const hooks = JSON.parse(
        fs.readFileSync(
          path.join(PROJECT_ROOT, "hooks", "hooks.json"),
          "utf-8"
        )
      );
      expect(hooks.hooks.PreToolUse[0].hooks[0].timeout).toBe(5);
    });

    it("PostToolUse timeout is 10 seconds", () => {
      const hooks = JSON.parse(
        fs.readFileSync(
          path.join(PROJECT_ROOT, "hooks", "hooks.json"),
          "utf-8"
        )
      );
      expect(hooks.hooks.PostToolUse[0].hooks[0].timeout).toBe(10);
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

    it("skills/bootstrap/SKILL.md body contains bootstrap instructions", () => {
      const content = fs.readFileSync(
        path.join(PROJECT_ROOT, "skills", "bootstrap", "SKILL.md"),
        "utf-8"
      );
      expect(content).toContain("name: bootstrap");
      expect(content).toContain("## /codescope:bootstrap");
      expect(content).toContain("codescope_status");
    });

    it("skills/orient/SKILL.md body contains full orient pipeline", () => {
      const content = fs.readFileSync(
        path.join(PROJECT_ROOT, "skills", "orient", "SKILL.md"),
        "utf-8"
      );
      expect(content).toContain("name: orient");
      expect(content).toContain("# /codescope:orient");
      expect(content).toContain("run-orient.ts");
      expect(content).toContain("run-execution.ts");
    });

    it("skills/settings/SKILL.md body contains full settings skill", () => {
      const content = fs.readFileSync(
        path.join(PROJECT_ROOT, "skills", "settings", "SKILL.md"),
        "utf-8"
      );
      expect(content).toContain("name: settings");
      expect(content).toContain("loadConfig");
    });

    it("skills/review-learnings/SKILL.md body contains full review skill", () => {
      const content = fs.readFileSync(
        path.join(PROJECT_ROOT, "skills", "review-learnings", "SKILL.md"),
        "utf-8"
      );
      expect(content).toContain("name: review-learnings");
      expect(content).toContain("loadLearnings");
    });
  });
});
