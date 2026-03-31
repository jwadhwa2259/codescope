import { describe, it, expect } from "vitest";
import * as path from "node:path";
import * as fs from "node:fs";
import {
  RULE_METADATA,
  RULE_NAME_TO_ID,
  RULE_ID_TO_NAME,
} from "../../src/conventions/rule-metadata.js";
import type { RuleMetadataEntry } from "../../src/conventions/rule-metadata.js";

const RULES_DIR = path.resolve(
  import.meta.dirname,
  "../../src/conventions/rules",
);

describe("RULE_METADATA", () => {
  it("contains all 27 entries with correct name and category", () => {
    const entries = Object.entries(RULE_METADATA);
    expect(entries.length).toBe(27);

    // Spot-check TypeScript rules
    expect(RULE_METADATA["prefer-named-exports"]).toEqual({
      name: "Prefer Named Exports",
      category: "exports",
    });
    expect(RULE_METADATA["detect-async-await"]).toEqual({
      name: "Async/Await Functions",
      category: "async",
    });
    expect(RULE_METADATA["custom-error-class"]).toEqual({
      name: "Custom Error Classes",
      category: "error-handling",
    });
    expect(RULE_METADATA["interface-over-type"]).toEqual({
      name: "Interface Declarations",
      category: "types",
    });

    // Spot-check Python rules
    expect(RULE_METADATA["python-type-hints"]).toEqual({
      name: "Python Type Hints",
      category: "types",
    });
    expect(RULE_METADATA["python-docstrings"]).toEqual({
      name: "Python Docstrings",
      category: "documentation",
    });
    expect(RULE_METADATA["python-class-inheritance"]).toEqual({
      name: "Python Class Inheritance",
      category: "class-patterns",
    });

    // Every entry has name and category strings
    for (const [id, meta] of entries) {
      expect(typeof meta.name).toBe("string");
      expect(meta.name.length).toBeGreaterThan(0);
      expect(typeof meta.category).toBe("string");
      expect(meta.category.length).toBeGreaterThan(0);
    }
  });

  it("RULE_NAME_TO_ID maps display name to ruleId for all entries", () => {
    expect(RULE_NAME_TO_ID.get("Prefer Named Exports")).toBe(
      "prefer-named-exports",
    );
    expect(RULE_NAME_TO_ID.get("Default Export")).toBe("detect-default-export");
    expect(RULE_NAME_TO_ID.get("Async/Await Functions")).toBe(
      "detect-async-await",
    );
    expect(RULE_NAME_TO_ID.get("Python Type Hints")).toBe("python-type-hints");

    // Every RULE_METADATA entry has a corresponding RULE_NAME_TO_ID entry
    for (const [id, meta] of Object.entries(RULE_METADATA)) {
      expect(RULE_NAME_TO_ID.get(meta.name)).toBe(id);
    }
  });

  it("RULE_ID_TO_NAME maps ruleId to display name for all entries", () => {
    expect(RULE_ID_TO_NAME.get("prefer-named-exports")).toBe(
      "Prefer Named Exports",
    );
    expect(RULE_ID_TO_NAME.get("detect-default-export")).toBe(
      "Default Export",
    );
    expect(RULE_ID_TO_NAME.get("python-docstrings")).toBe("Python Docstrings");

    // Every RULE_METADATA entry has a corresponding RULE_ID_TO_NAME entry
    for (const [id, meta] of Object.entries(RULE_METADATA)) {
      expect(RULE_ID_TO_NAME.get(id)).toBe(meta.name);
    }
  });

  it("every TypeScript ruleId matches a .yml file in rules/typescript/", () => {
    const tsRulesDir = path.join(RULES_DIR, "typescript");
    const tsRuleFiles = fs
      .readdirSync(tsRulesDir)
      .filter((f) => f.endsWith(".yml"))
      .map((f) => path.basename(f, ".yml"));

    // TypeScript rules: not python-* and not framework-specific
    const frameworkPrefixes = ["fastify-", "express-", "h3-"];
    const tsRuleIds = Object.keys(RULE_METADATA).filter(
      (id) =>
        !id.startsWith("python-") &&
        !frameworkPrefixes.some((p) => id.startsWith(p)),
    );

    for (const ruleId of tsRuleIds) {
      expect(tsRuleFiles).toContain(ruleId);
    }
  });

  it("every framework ruleId matches a .yml file in rules/frameworks/", () => {
    const frameworksDir = path.join(RULES_DIR, "frameworks");
    const frameworkRuleFiles: string[] = [];
    for (const fw of fs.readdirSync(frameworksDir)) {
      const fwDir = path.join(frameworksDir, fw);
      if (fs.statSync(fwDir).isDirectory()) {
        for (const f of fs.readdirSync(fwDir)) {
          if (f.endsWith(".yml")) {
            frameworkRuleFiles.push(path.basename(f, ".yml"));
          }
        }
      }
    }

    const frameworkPrefixes = ["fastify-", "express-", "h3-"];
    const frameworkRuleIds = Object.keys(RULE_METADATA).filter((id) =>
      frameworkPrefixes.some((p) => id.startsWith(p)),
    );

    expect(frameworkRuleIds.length).toBe(9);

    for (const ruleId of frameworkRuleIds) {
      expect(frameworkRuleFiles).toContain(ruleId);
    }
  });

  it("has no duplicate display names across entries", () => {
    const names = Object.values(RULE_METADATA).map((m) => m.name);
    const uniqueNames = new Set(names);
    expect(uniqueNames.size).toBe(names.length);
  });
});
