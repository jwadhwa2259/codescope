import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";

// Resolve from project root — tests/ is one level down from project root
const PROJECT_ROOT = path.resolve(import.meta.dirname ?? __dirname, "..", "..");
const SKILL_PATH = path.join(PROJECT_ROOT, "skills", "settings", "SKILL.md");

describe("settings SKILL.md", () => {
  const content = fs.readFileSync(SKILL_PATH, "utf-8");
  const lines = content.split("\n");

  it("file exists and is not a stub (>100 lines)", () => {
    expect(lines.length).toBeGreaterThan(100);
  });

  it("frontmatter contains name: settings", () => {
    expect(content).toMatch(/^---\n[\s\S]*?name:\s*settings[\s\S]*?---/);
  });

  it("frontmatter contains description field", () => {
    expect(content).toMatch(/^---\n[\s\S]*?description:[\s\S]*?---/);
  });

  it("frontmatter contains allowed-tools with Bash, Read, Write, Edit", () => {
    expect(content).toMatch(/^---\n[\s\S]*?allowed-tools:[\s\S]*?---/);
    expect(content).toContain("- Bash");
    expect(content).toContain("- Read");
    expect(content).toContain("- Write");
    expect(content).toContain("- Edit");
  });

  describe("flag handlers", () => {
    it("contains --reset handler section", () => {
      expect(content).toContain("### --reset");
      expect(content).toContain("Reset config.yml to defaults");
    });

    it("contains --reset-global handler section", () => {
      expect(content).toContain("### --reset-global");
      expect(content).toContain("Reset global memory to");
    });

    it("contains --set key=value handler section", () => {
      expect(content).toContain("## --set key=value");
      expect(content).toContain("Directly change a single config value");
    });

    it("contains --rollback-convention handler section", () => {
      expect(content).toContain("## --rollback-convention");
      expect(content).toContain("conventions-enforced.md");
    });

    it("contains --detect-teams handler section", () => {
      expect(content).toContain("## --detect-teams");
      expect(content).toContain("detectAgentTeams");
    });
  });

  describe("config infrastructure references", () => {
    it("references loadConfig from loader.ts", () => {
      expect(content).toContain("loadConfig");
      expect(content).toContain("config/loader");
    });

    it("references writeConfig from writer.ts", () => {
      expect(content).toContain("writeConfig");
      expect(content).toContain("config/writer");
    });

    it("references ConfigSchema from schema.ts", () => {
      expect(content).toContain("ConfigSchema");
      expect(content).toContain("config/schema");
    });

    it("references DEFAULT_CONFIG from defaults.ts", () => {
      expect(content).toContain("DEFAULT_CONFIG");
      expect(content).toContain("config/defaults");
    });
  });

  it("reset handler preserves the project section", () => {
    expect(content).toContain("project section");
    expect(content).toMatch(
      /preserve.*project|project.*preserve/i,
    );
  });

  describe("interactive mode", () => {
    it("contains Interactive Mode section", () => {
      expect(content).toContain("## Interactive Mode");
    });

    it("contains numbered section menu with all config sections", () => {
      const sections = [
        "agents",
        "orient",
        "execute",
        "verify",
        "eval",
        "conventions",
        "learning",
        "bootstrap",
        "display",
      ];
      for (const section of sections) {
        expect(content).toContain(section);
      }
    });

    it("contains Step 1: Load and Display Current Config", () => {
      expect(content).toContain("Step 1: Load and Display Current Config");
    });

    it("contains Step 2: Section Editor", () => {
      expect(content).toContain("Step 2: Section Editor");
    });

    it("contains Step 3: Validate and Save", () => {
      expect(content).toContain("Step 3: Validate and Save");
    });
  });

  it("references Zod validation (safeParse) for changes", () => {
    expect(content).toContain("safeParse");
  });

  it("contains error handling for missing config", () => {
    expect(content).toContain(
      "No config found. Run /codescope:onboard first.",
    );
  });

  it("contains error handling for invalid validation", () => {
    expect(content).toMatch(/validation fail|invalid/i);
  });

  it("contains type coercion rules for --set", () => {
    expect(content).toContain('"true"');
    expect(content).toContain('"false"');
  });

  it("does NOT contain context: fork (per Issue #17283)", () => {
    expect(content).not.toContain("context: fork");
  });
});
