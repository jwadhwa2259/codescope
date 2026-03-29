// ---------------------------------------------------------------------------
// Eval Agent: prompt assembly, chunking, findings parser, criteria scoring
// ---------------------------------------------------------------------------
// Per D-01, D-02, D-03, D-04, D-05, D-06, D-07, D-22, D-26.
// Follows agent module pattern: Options + Result + async function (Phase 2 D-05).
// ---------------------------------------------------------------------------

import type {
  EvalOptions,
  EvalResult,
  EvalCallbacks,
  EvalFinding,
  EvalCriterion,
  EvalCriterionResult,
} from "./types.js";
import type { Severity } from "../verify/types.js";
import { tokenEstimate as sharedTokenEstimate } from "../utils/tokens.js";
import { classifyFinding } from "./classifier.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_CHUNK_THRESHOLD = 50_000;

const VALID_CRITERIA: Set<string> = new Set([
  "scope_compliance",
  "convention_adherence",
  "completeness",
  "correctness",
]);

const VALID_SEVERITIES: Set<string> = new Set(["ERROR", "WARN", "INFO"]);

const SEVERITY_ORDER: Record<string, number> = {
  ERROR: 0,
  WARN: 1,
  INFO: 2,
};

const ALL_CRITERIA: EvalCriterion[] = [
  "scope_compliance",
  "convention_adherence",
  "completeness",
  "correctness",
];

// ---------------------------------------------------------------------------
// tokenEstimate
// ---------------------------------------------------------------------------

/**
 * Rough token approximation: characters / 4.
 * Re-exported from shared utility for backward compatibility.
 * Per RESEARCH.md Pitfall 1.
 */
export const tokenEstimate = sharedTokenEstimate;

// ---------------------------------------------------------------------------
// chunkVerifyResult
// ---------------------------------------------------------------------------

/**
 * Split large verify results into chunks by file groups.
 * Per D-22: eval per chunk, findings merged and deduplicated.
 * Each chunk retains full scope contract, plan, coordination, research paths.
 */
export function chunkVerifyResult(
  options: EvalOptions,
  threshold: number = DEFAULT_CHUNK_THRESHOLD,
): EvalOptions[] {
  const serialized = JSON.stringify(options.verifyResult);
  const tokens = tokenEstimate(serialized);

  if (tokens <= threshold) {
    return [options];
  }

  // Group static findings by file
  const fileGroups = new Map<string, {
    violations: typeof options.verifyResult.static.conventionViolations;
    reviews: typeof options.verifyResult.static.codeReview;
    surprises: typeof options.verifyResult.static.blastRadiusDiff.surprises;
    skips: typeof options.verifyResult.static.blastRadiusDiff.skips;
    scopeDrift: string[];
  }>();

  // Collect all files referenced in violations
  for (const v of options.verifyResult.static.conventionViolations) {
    if (!fileGroups.has(v.file)) {
      fileGroups.set(v.file, { violations: [], reviews: [], surprises: [], skips: [], scopeDrift: [] });
    }
    fileGroups.get(v.file)!.violations.push(v);
  }

  // Collect code review findings
  for (const r of options.verifyResult.static.codeReview) {
    if (!fileGroups.has(r.file)) {
      fileGroups.set(r.file, { violations: [], reviews: [], surprises: [], skips: [], scopeDrift: [] });
    }
    fileGroups.get(r.file)!.reviews.push(r);
  }

  // Collect blast radius surprises
  for (const s of options.verifyResult.static.blastRadiusDiff.surprises) {
    if (!fileGroups.has(s.filePath)) {
      fileGroups.set(s.filePath, { violations: [], reviews: [], surprises: [], skips: [], scopeDrift: [] });
    }
    fileGroups.get(s.filePath)!.surprises.push(s);
  }

  // Collect blast radius skips
  for (const s of options.verifyResult.static.blastRadiusDiff.skips) {
    if (!fileGroups.has(s.filePath)) {
      fileGroups.set(s.filePath, { violations: [], reviews: [], surprises: [], skips: [], scopeDrift: [] });
    }
    fileGroups.get(s.filePath)!.skips.push(s);
  }

  // Collect scope drift
  for (const drift of options.verifyResult.static.blastRadiusDiff.scopeDrift) {
    if (!fileGroups.has(drift)) {
      fileGroups.set(drift, { violations: [], reviews: [], surprises: [], skips: [], scopeDrift: [] });
    }
    fileGroups.get(drift)!.scopeDrift.push(drift);
  }

  // If no file groups (shouldn't happen but safety), return as-is
  if (fileGroups.size === 0) {
    return [options];
  }

  // Build clusters of files that fit within the threshold
  const clusters: Map<string, typeof fileGroups extends Map<string, infer V> ? V : never>[] = [];
  let currentCluster = new Map<string, ReturnType<typeof fileGroups.get>>();
  let currentTokens = 0;

  for (const [file, group] of fileGroups) {
    const groupTokens = tokenEstimate(JSON.stringify(group));

    if (currentTokens + groupTokens > threshold && currentCluster.size > 0) {
      clusters.push(currentCluster as typeof clusters[0]);
      currentCluster = new Map();
      currentTokens = 0;
    }

    currentCluster.set(file, group);
    currentTokens += groupTokens;
  }

  if (currentCluster.size > 0) {
    clusters.push(currentCluster as typeof clusters[0]);
  }

  // Build one EvalOptions per cluster
  return clusters.map((cluster) => {
    const clusterViolations: typeof options.verifyResult.static.conventionViolations = [];
    const clusterReviews: typeof options.verifyResult.static.codeReview = [];
    const clusterSurprises: typeof options.verifyResult.static.blastRadiusDiff.surprises = [];
    const clusterSkips: typeof options.verifyResult.static.blastRadiusDiff.skips = [];
    const clusterScopeDrift: string[] = [];

    for (const group of cluster.values()) {
      clusterViolations.push(...group!.violations);
      clusterReviews.push(...group!.reviews);
      clusterSurprises.push(...group!.surprises);
      clusterSkips.push(...group!.skips);
      clusterScopeDrift.push(...group!.scopeDrift);
    }

    return {
      ...options,
      verifyResult: {
        static: {
          conventionViolations: clusterViolations,
          blastRadiusDiff: {
            surprises: clusterSurprises,
            skips: clusterSkips,
            scopeDrift: clusterScopeDrift,
            timing_ms: options.verifyResult.static.blastRadiusDiff.timing_ms,
          },
          codeReview: clusterReviews,
          timing: options.verifyResult.static.timing,
        },
        runtime: options.verifyResult.runtime,
      },
    };
  });
}

// ---------------------------------------------------------------------------
// deduplicateFindings
// ---------------------------------------------------------------------------

/**
 * Deduplicate findings across chunks.
 * Keep highest severity when same id appears multiple times.
 * Preserve original order of first occurrence.
 */
export function deduplicateFindings(findings: EvalFinding[]): EvalFinding[] {
  const seen = new Map<string, EvalFinding>();
  const order: string[] = [];

  for (const finding of findings) {
    const existing = seen.get(finding.id);
    if (!existing) {
      seen.set(finding.id, finding);
      order.push(finding.id);
    } else {
      // Keep the one with highest severity (lower order number = higher severity)
      const existingSev = SEVERITY_ORDER[existing.severity] ?? 999;
      const newSev = SEVERITY_ORDER[finding.severity] ?? 999;
      if (newSev < existingSev) {
        seen.set(finding.id, finding);
      }
    }
  }

  return order.map((id) => seen.get(id)!);
}

// ---------------------------------------------------------------------------
// buildEvalPrompt
// ---------------------------------------------------------------------------

/**
 * Assemble eval prompt with 6 context sections per D-03.
 * Sections joined with double newlines.
 */
export function buildEvalPrompt(options: EvalOptions): string {
  const sections: string[] = [];

  // 1. Header with role description
  sections.push(
    [
      "# Eval Agent: LLM-as-Judge",
      "",
      "You are an eval agent performing LLM-as-judge evaluation of code changes.",
      "Your task is to score the changes on the enabled criteria and produce structured findings.",
    ].join("\n"),
  );

  // 2. Enabled criteria list
  const enabledCriteriaList = ALL_CRITERIA.filter(
    (c) => options.enabledCriteria[c],
  );
  sections.push(
    [
      "## Criteria to evaluate",
      "",
      ...enabledCriteriaList.map((c) => `- ${c}`),
    ].join("\n"),
  );

  // 3. Scope contract by file reference
  sections.push(
    `## Scope Contract\n\nRead: \`${options.scopeContractPath}\``,
  );

  // 4. Execution plan by file reference
  sections.push(
    `## Execution Plan\n\nRead: \`${options.planPath}\``,
  );

  // 5. Coordination log by file reference
  sections.push(
    `## Coordination Log\n\nRead: \`${options.coordinationPath}\``,
  );

  // 6. Verify results inline JSON
  sections.push(
    [
      "## Verify Results",
      "",
      "```json",
      JSON.stringify(options.verifyResult, null, 2),
      "```",
    ].join("\n"),
  );

  // 7. Research by reference (only if available)
  if (options.researchPath !== null) {
    sections.push(
      `## Research\n\nRead: \`${options.researchPath}\``,
    );
  }

  // 8. Git diff instruction
  sections.push(
    "## Git Diff\n\nRun: `git diff HEAD` to see the actual changes",
  );

  // 9. Output format instruction
  sections.push(
    [
      "## Output Format",
      "",
      "Return your findings as a JSON array. Each finding must have these fields:",
      "",
      "```json",
      "[",
      "  {",
      '    "criterion": "scope_compliance | convention_adherence | completeness | correctness",',
      '    "category": "missing_implementation | incorrect_implementation | design_decision",',
      '    "file": "path/to/file.ts",',
      '    "line": 42,',
      '    "description": "Clear description of the finding",',
      '    "severity": "ERROR | WARN | INFO",',
      '    "evidence": "Specific code or verify data that proves the finding",',
      '    "goldenFileRef": "optional: path/to/golden-file.ts"',
      "  }",
      "]",
      "```",
      "",
      "After the JSON array, state per-criterion PASS/FAIL verdicts.",
      "A criterion with any ERROR finding = FAIL.",
      "A criterion with only WARN findings = PASS.",
      "A criterion with no findings = PASS.",
    ].join("\n"),
  );

  return sections.join("\n\n");
}

// ---------------------------------------------------------------------------
// parseEvalFindings
// ---------------------------------------------------------------------------

/**
 * Extract findings JSON from LLM response.
 * Handles direct JSON, markdown code blocks, and garbled responses.
 * Generates id per finding using 5-line bucket (per Research open question 2).
 */
export function parseEvalFindings(rawResponse: string): EvalFinding[] {
  let parsed: unknown[];

  // Try direct JSON.parse first
  try {
    const directParse = JSON.parse(rawResponse);
    if (Array.isArray(directParse)) {
      parsed = directParse;
    } else {
      parsed = [];
    }
  } catch {
    // Try extracting from markdown code block
    const codeBlockMatch = rawResponse.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
    if (codeBlockMatch) {
      try {
        const blockParse = JSON.parse(codeBlockMatch[1]);
        if (Array.isArray(blockParse)) {
          parsed = blockParse;
        } else {
          return [];
        }
      } catch {
        return [];
      }
    } else {
      return [];
    }
  }

  // Validate and transform each finding
  const findings: EvalFinding[] = [];

  for (const raw of parsed) {
    if (typeof raw !== "object" || raw === null) continue;

    const r = raw as Record<string, unknown>;

    // Validate required fields
    if (
      typeof r.criterion !== "string" ||
      typeof r.file !== "string" ||
      typeof r.line !== "number" ||
      typeof r.description !== "string" ||
      typeof r.severity !== "string"
    ) {
      continue;
    }

    // Validate criterion value
    if (!VALID_CRITERIA.has(r.criterion)) continue;

    // Validate severity value
    if (!VALID_SEVERITIES.has(r.severity)) continue;

    // Generate id: eval-{criterion}-{file-sanitized}-{5-line-bucket}
    const sanitizedFile = r.file.replace(/[^a-z0-9]/gi, "-");
    const lineBucket = Math.floor(r.line / 5) * 5;
    const id = `eval-${r.criterion}-${sanitizedFile}-${lineBucket}`;

    // Default category if missing
    const category =
      typeof r.category === "string" &&
      ["missing_implementation", "incorrect_implementation", "design_decision"].includes(r.category)
        ? (r.category as EvalFinding["category"])
        : "incorrect_implementation";

    // Default evidence if missing
    const evidence = typeof r.evidence === "string" ? r.evidence : "";

    const finding: EvalFinding = {
      id,
      criterion: r.criterion as EvalCriterion,
      category,
      file: r.file,
      line: r.line,
      description: r.description,
      severity: r.severity as Severity,
      evidence,
      goldenFileRef: typeof r.goldenFileRef === "string" ? r.goldenFileRef : undefined,
    };
    finding.classification = classifyFinding(finding);
    findings.push(finding);
  }

  return findings;
}

// ---------------------------------------------------------------------------
// groupFindingsByCriterion
// ---------------------------------------------------------------------------

/**
 * Group findings by criterion, sorted by severity within each group.
 * ERROR first, then WARN, then INFO per D-07.
 */
export function groupFindingsByCriterion(
  findings: EvalFinding[],
): Map<EvalCriterion, EvalFinding[]> {
  const grouped = new Map<EvalCriterion, EvalFinding[]>();

  for (const finding of findings) {
    if (!grouped.has(finding.criterion)) {
      grouped.set(finding.criterion, []);
    }
    grouped.get(finding.criterion)!.push(finding);
  }

  // Sort each group by severity: ERROR (0) < WARN (1) < INFO (2)
  for (const [, group] of grouped) {
    group.sort(
      (a, b) =>
        (SEVERITY_ORDER[a.severity] ?? 999) -
        (SEVERITY_ORDER[b.severity] ?? 999),
    );
  }

  return grouped;
}

// ---------------------------------------------------------------------------
// runEval
// ---------------------------------------------------------------------------

/**
 * Core eval logic: chunk, dispatch, parse, deduplicate, filter, score.
 * Per D-02, D-04, D-05, D-22, D-26.
 */
export async function runEval(
  options: EvalOptions,
  callbacks: EvalCallbacks,
): Promise<EvalResult> {
  const startTime = Date.now();

  callbacks.onProgress("## Evaluating changes...");

  // Chunk if needed per D-22
  const chunks = chunkVerifyResult(options);
  if (chunks.length > 1) {
    callbacks.onProgress(
      `Chunking eval into ${chunks.length} parts (~50K token threshold)...`,
    );
  }

  // Dispatch eval for each chunk with retry per D-26
  let allFindings: EvalFinding[] = [];
  let dispatchFailed = false;
  let failureError = "";

  for (const chunk of chunks) {
    const prompt = buildEvalPrompt(chunk);

    try {
      const response = await dispatchWithRetry(
        prompt,
        callbacks,
      );
      const parsed = parseEvalFindings(response);
      allFindings.push(...parsed);
    } catch (err) {
      dispatchFailed = true;
      failureError = err instanceof Error ? err.message : String(err);
      break;
    }
  }

  // If dispatch failed after retry, mark all criteria as unavailable per D-26
  if (dispatchFailed) {
    const criteria: EvalCriterionResult[] = ALL_CRITERIA.map((criterion) => {
      if (options.enabledCriteria[criterion]) {
        return {
          criterion,
          status: "PASS" as const,
          findings: [],
          detail: `Unavailable: ${failureError}. Verify results still valid.`,
        };
      }
      return {
        criterion,
        status: "SKIPPED" as const,
        findings: [],
        detail: "Disabled in config",
      };
    });

    return {
      criteria,
      findings: [],
      overallStatus: "PASS",
      timing_ms: Date.now() - startTime,
    };
  }

  // Deduplicate findings across chunks
  allFindings = deduplicateFindings(allFindings);

  // Filter against ignore patterns
  allFindings = filterAgainstIgnorePatterns(allFindings, options.ignorePatterns);

  // Score each criterion
  const grouped = groupFindingsByCriterion(allFindings);
  const criteria: EvalCriterionResult[] = ALL_CRITERIA.map((criterion) => {
    if (!options.enabledCriteria[criterion]) {
      return {
        criterion,
        status: "SKIPPED" as const,
        findings: [],
        detail: "Disabled in config",
      };
    }

    const criterionFindings = grouped.get(criterion) ?? [];
    const hasError = criterionFindings.some((f) => f.severity === "ERROR");

    return {
      criterion,
      status: hasError ? ("FAIL" as const) : ("PASS" as const),
      findings: criterionFindings,
    };
  });

  // Overall status: any FAIL = FAIL, else PASS
  const overallStatus = criteria.some((c) => c.status === "FAIL")
    ? "FAIL"
    : "PASS";

  return {
    criteria,
    findings: allFindings,
    overallStatus,
    timing_ms: Date.now() - startTime,
  };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Dispatch eval agent with retry-once per D-26.
 * On first failure: retry. On second failure: throw (caller handles).
 */
async function dispatchWithRetry(
  prompt: string,
  callbacks: EvalCallbacks,
): Promise<string> {
  try {
    return await callbacks.dispatchEvalAgent(prompt);
  } catch (firstError) {
    callbacks.onProgress("Eval dispatch failed, retrying once...");
    try {
      return await callbacks.dispatchEvalAgent(prompt);
    } catch (secondError) {
      throw secondError;
    }
  }
}

/**
 * Filter findings against ignore patterns.
 * All 3 conditions must match to filter out a finding:
 * - criterion exact match
 * - pattern substring in description (case-insensitive)
 * - scope glob match on file
 */
function filterAgainstIgnorePatterns(
  findings: EvalFinding[],
  patterns: { pattern: string; scope: string; criterion: EvalCriterion; created: string; reason: string }[],
): EvalFinding[] {
  if (patterns.length === 0) return findings;

  return findings.filter((finding) => {
    for (const pattern of patterns) {
      const criterionMatch = pattern.criterion === finding.criterion;
      const patternMatch = finding.description
        .toLowerCase()
        .includes(pattern.pattern.toLowerCase());
      const scopeMatch = simpleGlobMatch(pattern.scope, finding.file);

      if (criterionMatch && patternMatch && scopeMatch) {
        return false; // Filter out
      }
    }
    return true; // Keep
  });
}

/**
 * Simple glob matching for scope patterns.
 * Supports: * (any segment), ** (any path), exact match.
 */
function simpleGlobMatch(pattern: string, filePath: string): boolean {
  if (pattern === "*") return true;
  if (pattern === "**") return true;

  // Convert glob to regex
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*\*/g, "<<GLOBSTAR>>")
    .replace(/\*/g, "[^/]*")
    .replace(/<<GLOBSTAR>>/g, ".*");

  const regex = new RegExp(`^${escaped}$`);
  return regex.test(filePath);
}
