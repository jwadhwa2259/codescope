import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { RULE_METADATA } from "../../src/conventions/rule-metadata.js";

const RULES_DIR = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../src/conventions/rules",
);
const KNOWN_FRAMEWORKS = ["fastify", "express", "h3"];

/**
 * Recursively find all .yml rule files under a directory.
 */
function findAllRuleFiles(dir: string): string[] {
  const files: string[] = [];
  function walk(d: string) {
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith(".yml")) files.push(full);
    }
  }
  walk(dir);
  return files;
}

/**
 * Extract the `id:` field from a YAML rule file.
 */
function extractRuleId(filePath: string): string | null {
  const content = fs.readFileSync(filePath, "utf-8");
  const match = content.match(/^id:\s*(.+)$/m);
  return match ? match[1].trim() : null;
}

describe("Rule Validation (CI-style per D-28)", () => {
  const allRuleFiles = findAllRuleFiles(RULES_DIR);

  it("finds at least 20 rule files across all directories", () => {
    expect(allRuleFiles.length).toBeGreaterThanOrEqual(20);
  });

  it("all .yml rule files have unique ruleId values (no duplicates)", () => {
    const ids: string[] = [];
    const duplicates: string[] = [];

    for (const file of allRuleFiles) {
      const id = extractRuleId(file);
      expect(id, `Missing id: field in ${path.relative(RULES_DIR, file)}`).not.toBeNull();
      if (id) {
        if (ids.includes(id)) {
          duplicates.push(`Duplicate ruleId '${id}' in ${path.relative(RULES_DIR, file)}`);
        }
        ids.push(id);
      }
    }

    expect(duplicates, `Found duplicate ruleIds:\n${duplicates.join("\n")}`).toHaveLength(0);
    // Also verify via Set size
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("every ruleId found in .yml files has a corresponding RULE_METADATA entry", () => {
    const missingMetadata: string[] = [];

    for (const file of allRuleFiles) {
      const ruleId = extractRuleId(file);
      if (ruleId && !RULE_METADATA[ruleId]) {
        missingMetadata.push(`${ruleId} (from ${path.relative(RULES_DIR, file)})`);
      }
    }

    expect(
      missingMetadata,
      `Rule files without RULE_METADATA entries:\n${missingMetadata.join("\n")}`,
    ).toHaveLength(0);
  });

  it("every RULE_METADATA entry has a matching .yml file somewhere in rules/", () => {
    const allRuleIds = allRuleFiles
      .map((f) => extractRuleId(f))
      .filter((id): id is string => id !== null);

    const missingFiles: string[] = [];

    for (const metadataId of Object.keys(RULE_METADATA)) {
      if (!allRuleIds.includes(metadataId)) {
        missingFiles.push(metadataId);
      }
    }

    expect(
      missingFiles,
      `RULE_METADATA entries without .yml files:\n${missingFiles.join("\n")}`,
    ).toHaveLength(0);
  });

  it("framework directory names match known frameworks", () => {
    const frameworksDir = path.join(RULES_DIR, "frameworks");
    if (!fs.existsSync(frameworksDir)) {
      expect.fail("frameworks/ directory does not exist");
    }

    const dirs = fs
      .readdirSync(frameworksDir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name);

    expect(dirs.length).toBeGreaterThan(0);

    const unknownFrameworks = dirs.filter((d) => !KNOWN_FRAMEWORKS.includes(d));
    expect(
      unknownFrameworks,
      `Unknown framework directories: ${unknownFrameworks.join(", ")}`,
    ).toHaveLength(0);
  });

  it("every .yml file has language: and severity: fields", () => {
    const missingFields: string[] = [];

    for (const file of allRuleFiles) {
      const content = fs.readFileSync(file, "utf-8");
      const relPath = path.relative(RULES_DIR, file);

      if (!content.match(/^language:\s*.+$/m)) {
        missingFields.push(`${relPath}: missing 'language:' field`);
      }
      if (!content.match(/^severity:\s*.+$/m)) {
        missingFields.push(`${relPath}: missing 'severity:' field`);
      }
    }

    expect(
      missingFields,
      `Rule files with missing required fields:\n${missingFields.join("\n")}`,
    ).toHaveLength(0);
  });
});
