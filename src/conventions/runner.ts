import { execFileSync, execSync } from "node:child_process";
import * as path from "node:path";
import * as fs from "node:fs";
import type {
  RuleMatch,
  ConventionResult,
  CompetingPair,
  ConflictInfo,
  ConventionScanResult,
} from "./types.js";
import { rankGoldenFiles } from "./golden-files.js";
import { RULE_METADATA } from "./rule-metadata.js";

/**
 * Competing pattern pairs per D-13.
 * When both sides exceed 20% adoption, flag as conflict.
 */
export const COMPETING_PAIRS: CompetingPair[] = [
  {
    a: "prefer-named-exports",
    b: "detect-default-export",
    label: "Named vs Default Exports",
  },
  {
    a: "detect-async-await",
    b: "detect-promise-then",
    label: "Async/Await vs .then() Chains",
  },
  {
    a: "functional-component",
    b: "class-component",
    label: "Functional vs Class Components",
  },
  {
    a: "arrow-function-export",
    b: "function-declaration-export",
    label: "Arrow Functions vs Function Declarations",
  },
  {
    a: "interface-over-type",
    b: "type-over-interface",
    label: "Interface vs Type Alias",
  },
];

/**
 * ast-grep JSON match output shape (relevant fields).
 */
interface AstGrepMatch {
  text: string;
  range: {
    start: { line: number; column: number };
    end: { line: number; column: number };
  };
  file: string;
  language: string;
  ruleId?: string;
}

/**
 * Scan a target directory using a single ast-grep YAML rule file.
 * Returns parsed matches.
 */
function scanSingleRule(
  ruleFile: string,
  targetDir: string,
): AstGrepMatch[] {
  try {
    const output = execFileSync(
      "sg", ["scan", "--rule", ruleFile, "--json", targetDir],
      {
        encoding: "utf-8",
        maxBuffer: 50 * 1024 * 1024,
        stdio: ["pipe", "pipe", "pipe"],
      },
    );

    if (!output || output.trim().length === 0) {
      return [];
    }

    const parsed = JSON.parse(output);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed as AstGrepMatch[];
  } catch (err: unknown) {
    // ast-grep returns non-zero exit code when no matches found
    // Try to parse stderr/stdout for valid JSON
    if (err && typeof err === "object" && "stdout" in err) {
      const stdout = (err as { stdout: string }).stdout;
      if (stdout && stdout.trim().length > 0) {
        try {
          const parsed = JSON.parse(stdout);
          if (Array.isArray(parsed)) {
            return parsed as AstGrepMatch[];
          }
        } catch {
          // Not valid JSON
        }
      }
    }
    return [];
  }
}

/**
 * Scan a target directory with all ast-grep rules in a rules directory.
 * Iterates over each .yml file and aggregates results.
 */
export function runAstGrepScan(
  rulesDir: string,
  targetDir: string,
): RuleMatch[] {
  // Verify sg is available
  try {
    execSync("sg --version", { encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] });
  } catch {
    throw new Error(
      "ast-grep CLI (sg) not found. Convention detection skipped. Install with: npm install -g @ast-grep/cli",
    );
  }

  // Check target directory exists
  if (!fs.existsSync(targetDir)) {
    return [];
  }

  // Collect all .yml rule files
  let ruleFiles: string[];
  try {
    ruleFiles = fs
      .readdirSync(rulesDir)
      .filter((f) => f.endsWith(".yml"))
      .map((f) => path.join(rulesDir, f));
  } catch {
    return [];
  }

  if (ruleFiles.length === 0) {
    return [];
  }

  const allMatches: RuleMatch[] = [];

  for (const ruleFile of ruleFiles) {
    // Extract ruleId from filename (e.g., prefer-named-exports.yml -> prefer-named-exports)
    const ruleId = path.basename(ruleFile, ".yml");

    const rawMatches = scanSingleRule(ruleFile, targetDir);

    for (const match of rawMatches) {
      allMatches.push({
        ruleId,
        file: match.file,
        line: match.range.start.line + 1, // Convert 0-based to 1-based (Pitfall 2)
        column: match.range.start.column,
        text: match.text,
        message:
          RULE_METADATA[ruleId]?.name ?? `Rule ${ruleId} matched`,
        severity: "info",
      });
    }
  }

  return allMatches;
}

/**
 * Count files applicable for a given language in a directory.
 * Skips test, config, generated, and deprecated files (per CONV-03).
 */
export function countApplicableFiles(
  targetDir: string,
  language: "TypeScript" | "Python",
): number {
  const extensions =
    language === "TypeScript"
      ? [".ts", ".tsx", ".js", ".jsx"]
      : [".py"];

  const excludePatterns = [
    // Test files
    ".test.",
    ".spec.",
    "__tests__",
    "__test__",
    // Config files
    ".config.",
    ".eslintrc",
    ".prettierrc",
    // Generated files
    ".generated.",
    ".gen.",
    ".pb.",
    // Deprecated files
    "deprecated",
    "legacy",
    "obsolete",
  ];

  /** Config files matched by exact name prefix */
  const configNamePrefixes = /^(tsconfig|jest\.config|vitest\.config|\.eslintrc|\.prettierrc)/;

  let count = 0;

  function walkDir(dir: string): void {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        // Skip node_modules, dist, build, vendor, __tests__, test, tests
        if (
          [
            "node_modules",
            "dist",
            "build",
            "vendor",
            "__tests__",
            "test",
            "tests",
          ].includes(entry.name)
        ) {
          continue;
        }
        walkDir(fullPath);
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name);
        if (!extensions.includes(ext)) {
          continue;
        }

        // Skip config files by exact name prefix
        if (configNamePrefixes.test(entry.name)) {
          continue;
        }

        // Skip test, config, generated, and deprecated files
        const isExcluded = excludePatterns.some((pattern) =>
          entry.name.includes(pattern),
        );
        if (isExcluded) {
          continue;
        }

        count++;
      }
    }
  }

  walkDir(targetDir);
  return count;
}

/**
 * Calculate adoption percentage from matches.
 * Returns adoption %, unique matching files, and confidence level.
 */
export function calculateAdoption(
  matches: RuleMatch[],
  totalApplicableFiles: number,
): {
  adoptionPercent: number;
  matchingFiles: string[];
  confidence: "HIGH-CONF" | "MEDIUM-CONF" | "LOW-CONF";
} {
  const uniqueFiles = [...new Set(matches.map((m) => m.file))];
  const adoptionPercent =
    totalApplicableFiles > 0
      ? Math.round((uniqueFiles.length / totalApplicableFiles) * 100)
      : 0;

  let confidence: "HIGH-CONF" | "MEDIUM-CONF" | "LOW-CONF";
  if (adoptionPercent >= 80 && totalApplicableFiles >= 10) {
    confidence = "HIGH-CONF";
  } else if (adoptionPercent >= 50) {
    confidence = "MEDIUM-CONF";
  } else {
    confidence = "LOW-CONF";
  }

  return { adoptionPercent, matchingFiles: uniqueFiles, confidence };
}

/**
 * Build evidence chains from matches.
 * Returns up to maxEvidence entries sorted by file path for determinism.
 */
export function buildEvidence(
  matches: RuleMatch[],
  maxEvidence: number = 3,
): Array<{ file: string; line: number; description: string }> {
  const sorted = [...matches].sort((a, b) => a.file.localeCompare(b.file));

  return sorted.slice(0, maxEvidence).map((m) => ({
    file: m.file,
    line: m.line,
    description: m.message.length > 80 ? m.message.slice(0, 77) + "..." : m.message,
  }));
}

/**
 * Detect conflicts between competing pattern pairs.
 * Per D-13: when both sides exceed 20% adoption, flag as conflict.
 */
export function detectConflicts(
  conventions: ConventionResult[],
): ConflictInfo[] {
  const conventionsByRuleId = new Map<string, ConventionResult>();
  for (const conv of conventions) {
    conventionsByRuleId.set(conv.ruleId, conv);
  }

  const conflicts: ConflictInfo[] = [];

  for (const pair of COMPETING_PAIRS) {
    const convA = conventionsByRuleId.get(pair.a);
    const convB = conventionsByRuleId.get(pair.b);

    if (
      convA &&
      convB &&
      convA.adoptionPercent > 20 &&
      convB.adoptionPercent > 20
    ) {
      conflicts.push({
        label: pair.label,
        patternA: {
          ruleId: convA.ruleId,
          name: convA.name,
          adoption: convA.adoptionPercent,
        },
        patternB: {
          ruleId: convB.ruleId,
          name: convB.name,
          adoption: convB.adoptionPercent,
        },
      });
    }
  }

  return conflicts;
}

/**
 * Determine the language of a rule by checking its directory path.
 */
function getRuleLanguage(ruleId: string): "TypeScript" | "Python" {
  if (ruleId.startsWith("python-")) {
    return "Python";
  }
  return "TypeScript";
}

/**
 * Run a complete convention scan on a target directory.
 * Scans TypeScript and Python rules, calculates adoption, detects conflicts.
 */
export function runConventionScan(
  targetDir: string,
  rulesDir: string,
): ConventionScanResult {
  const tsRulesDir = path.join(rulesDir, "typescript");
  const pyRulesDir = path.join(rulesDir, "python");

  // Count applicable files per language
  const tsFileCount = countApplicableFiles(targetDir, "TypeScript");
  const pyFileCount = countApplicableFiles(targetDir, "Python");

  // Scan TypeScript rules
  let allMatches: RuleMatch[] = [];
  if (tsFileCount > 0) {
    allMatches = allMatches.concat(runAstGrepScan(tsRulesDir, targetDir));
  }

  // Scan Python rules (only if Python files exist)
  if (pyFileCount > 0 && fs.existsSync(pyRulesDir)) {
    allMatches = allMatches.concat(runAstGrepScan(pyRulesDir, targetDir));
  }

  // Group matches by ruleId
  const matchesByRule = new Map<string, RuleMatch[]>();
  for (const match of allMatches) {
    const existing = matchesByRule.get(match.ruleId) ?? [];
    existing.push(match);
    matchesByRule.set(match.ruleId, existing);
  }

  // Count total rules evaluated (all .yml files in both directories)
  let totalRulesEvaluated = 0;
  try {
    totalRulesEvaluated += fs
      .readdirSync(tsRulesDir)
      .filter((f) => f.endsWith(".yml")).length;
  } catch {
    // Directory may not exist
  }
  try {
    if (pyFileCount > 0) {
      totalRulesEvaluated += fs
        .readdirSync(pyRulesDir)
        .filter((f) => f.endsWith(".yml")).length;
    }
  } catch {
    // Directory may not exist
  }

  // Build convention results
  const conventions: ConventionResult[] = [];

  for (const [ruleId, matches] of matchesByRule) {
    const language = getRuleLanguage(ruleId);
    const totalApplicableFiles =
      language === "Python" ? pyFileCount : tsFileCount;

    const { adoptionPercent, matchingFiles, confidence } = calculateAdoption(
      matches,
      totalApplicableFiles,
    );

    const evidence = buildEvidence(matches, 3);

    const metadata = RULE_METADATA[ruleId] ?? {
      name: ruleId,
      category: "unknown",
    };

    conventions.push({
      ruleId,
      name: metadata.name,
      category: metadata.category,
      matchingFiles,
      totalApplicableFiles,
      adoptionPercent,
      confidence,
      trend: "Stable", // D-11: always Stable in v1
      evidence,
    });
  }

  // Detect conflicts
  const conflicts = detectConflicts(conventions);

  // Rank golden files
  const goldenFiles = rankGoldenFiles(conventions);

  return {
    conventions,
    conflicts,
    goldenFiles,
    totalRulesEvaluated,
    totalConventionsDetected: conventions.length,
  };
}
