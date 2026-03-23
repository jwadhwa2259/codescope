import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod/v4";
import * as fs from "node:fs";
import * as path from "node:path";
import { execSync } from "node:child_process";
import { getCodescopePath } from "../utils/paths.js";
import {
  isBootstrapped,
  errorResponse,
  okResponse,
  buildMetadata,
} from "./helpers.js";

// ---- Types ----

interface VerifyInput {
  files: string[];
  checks?: string[];
}

interface Violation {
  file: string;
  line: number;
  convention: string;
  message: string;
}

interface VerifyData {
  files_checked: number;
  violations: Violation[];
  summary: {
    total_violations: number;
    files_with_violations: number;
  };
  message?: string;
}

interface EnforcedConvention {
  name: string;
  rule: string;
}

// ---- Convention Parsing ----

/**
 * Parses enforced conventions from conventions-enforced.md.
 *
 * Expected format:
 * ```
 * ## Enforced Conventions
 *
 * **Convention:** convention name
 * **Rule:** rule-id
 * **Adoption:** N%
 * ```
 */
function parseEnforcedConventions(content: string): EnforcedConvention[] {
  const conventions: EnforcedConvention[] = [];
  const lines = content.split("\n");

  let currentName = "";
  let currentRule = "";

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed.startsWith("**Convention:**")) {
      // Save previous convention if we have one
      if (currentName && currentRule) {
        conventions.push({ name: currentName, rule: currentRule });
      }
      currentName = trimmed.replace("**Convention:**", "").trim();
      currentRule = "";
    } else if (trimmed.startsWith("**Rule:**")) {
      currentRule = trimmed.replace("**Rule:**", "").trim();
    }
  }

  // Save last convention
  if (currentName && currentRule) {
    conventions.push({ name: currentName, rule: currentRule });
  }

  return conventions;
}

// ---- ast-grep Scanning ----

interface AstGrepMatch {
  text: string;
  range: {
    start: { line: number; column: number };
    end: { line: number; column: number };
  };
  file: string;
  ruleId?: string;
}

/**
 * Run ast-grep on specific files against a rule.
 * Returns violations found.
 */
function scanFilesAgainstRule(
  ruleFile: string,
  files: string[],
): AstGrepMatch[] {
  const allMatches: AstGrepMatch[] = [];

  for (const filePath of files) {
    if (!fs.existsSync(filePath)) continue;

    try {
      const output = execSync(
        `sg scan --rule ${ruleFile} --json ${filePath}`,
        {
          encoding: "utf-8",
          maxBuffer: 50 * 1024 * 1024,
          stdio: ["pipe", "pipe", "pipe"],
        },
      );

      if (output && output.trim().length > 0) {
        const parsed = JSON.parse(output);
        if (Array.isArray(parsed)) {
          allMatches.push(...(parsed as AstGrepMatch[]));
        }
      }
    } catch (err: unknown) {
      // ast-grep returns non-zero exit code when no matches found
      if (err && typeof err === "object" && "stdout" in err) {
        const stdout = (err as { stdout: string }).stdout;
        if (stdout && stdout.trim().length > 0) {
          try {
            const parsed = JSON.parse(stdout);
            if (Array.isArray(parsed)) {
              allMatches.push(...(parsed as AstGrepMatch[]));
            }
          } catch {
            // Not valid JSON
          }
        }
      }
    }
  }

  return allMatches;
}

// ---- Handler ----

/**
 * Core verify logic, extracted for testability without MCP transport.
 *
 * Per D-36: Phase 3 provides convention compliance checking only.
 * Per D-38: Includes capabilities and upcoming arrays in metadata.
 */
export async function handleVerify(
  projectRoot: string,
  input: VerifyInput,
): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  const startMs = Date.now();

  // Guard: must be bootstrapped
  if (!isBootstrapped(projectRoot)) {
    return errorResponse(
      "NOT_BOOTSTRAPPED",
      "No bootstrap data found. Run /codescope:bootstrap first.",
      "Run /codescope:bootstrap to analyze your codebase.",
    );
  }

  const csPath = getCodescopePath(projectRoot);
  const enforcedPath = path.join(csPath, "conventions-enforced.md");

  // Read conventions-enforced.md
  let enforcedContent = "";
  if (fs.existsSync(enforcedPath)) {
    enforcedContent = fs.readFileSync(enforcedPath, "utf-8").trim();
  }

  // Per D-14 / UI-SPEC: empty state message when no enforced conventions
  if (!enforcedContent) {
    const metadata = buildMetadata(projectRoot, startMs, {
      capabilities: ["convention_compliance"],
      upcoming: ["blast_radius_diff", "build_verification", "test_verification"],
    });

    return okResponse(
      {
        files_checked: input.files.length,
        violations: [],
        summary: {
          total_violations: 0,
          files_with_violations: 0,
        },
        message:
          "No conventions enforced yet. Use /codescope:review-learnings (Phase 7) to promote high-confidence conventions.",
      } satisfies VerifyData,
      metadata,
    );
  }

  // Parse enforced conventions
  const enforcedConventions = parseEnforcedConventions(enforcedContent);

  if (enforcedConventions.length === 0) {
    const metadata = buildMetadata(projectRoot, startMs, {
      capabilities: ["convention_compliance"],
      upcoming: ["blast_radius_diff", "build_verification", "test_verification"],
    });

    return okResponse(
      {
        files_checked: input.files.length,
        violations: [],
        summary: {
          total_violations: 0,
          files_with_violations: 0,
        },
        message:
          "No conventions enforced yet. Use /codescope:review-learnings (Phase 7) to promote high-confidence conventions.",
      } satisfies VerifyData,
      metadata,
    );
  }

  // Run ast-grep for each enforced convention against the specified files
  const violations: Violation[] = [];
  const rulesDir = path.join(csPath, "rules");

  for (const convention of enforcedConventions) {
    // Try to find the rule file
    const tsRulePath = path.join(rulesDir, "typescript", `${convention.rule}.yml`);
    const pyRulePath = path.join(rulesDir, "python", `${convention.rule}.yml`);

    let rulePath: string | null = null;
    if (fs.existsSync(tsRulePath)) {
      rulePath = tsRulePath;
    } else if (fs.existsSync(pyRulePath)) {
      rulePath = pyRulePath;
    }

    if (!rulePath) continue;

    const matches = scanFilesAgainstRule(rulePath, input.files);

    for (const match of matches) {
      violations.push({
        file: match.file,
        line: match.range.start.line + 1, // Convert 0-based to 1-based
        convention: convention.name,
        message: `Violates enforced convention: ${convention.name}`,
      });
    }
  }

  // Compute summary
  const filesWithViolations = new Set(violations.map((v) => v.file)).size;

  const metadata = buildMetadata(projectRoot, startMs, {
    capabilities: ["convention_compliance"],
    upcoming: ["blast_radius_diff", "build_verification", "test_verification"],
  });

  const data: VerifyData = {
    files_checked: input.files.length,
    violations,
    summary: {
      total_violations: violations.length,
      files_with_violations: filesWithViolations,
    },
  };

  return okResponse(data, metadata);
}

// ---- MCP Registration ----

/**
 * Register the codescope_verify tool on the MCP server.
 *
 * Per D-35, D-36: Rich description noting partial Phase 3 functionality.
 */
export function registerVerifyTool(
  server: McpServer,
  projectRoot: string,
): void {
  server.tool(
    "codescope_verify",
    "Run verification checks on code changes. Phase 3 provides convention compliance checking only (runs ast-grep against detected conventions). Blast radius diff, build verification, and test verification coming in Phase 5. Related tools: codescope_conventions, codescope_detect_changes.",
    {
      files: z
        .array(z.string())
        .describe("File paths to verify against conventions"),
      checks: z
        .array(z.enum(["convention_compliance"]))
        .optional()
        .describe(
          "Checks to run (only 'convention_compliance' available in Phase 3)",
        ),
    },
    async ({ files, checks }) => {
      return handleVerify(projectRoot, { files, checks });
    },
  );
}
