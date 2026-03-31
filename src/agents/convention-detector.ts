import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { runConventionScan } from "../conventions/runner.js";
import { inferConventions, formatInferredConventions } from "../conventions/inference.js";
import { rankGoldenFiles } from "../conventions/golden-files.js";
import { detectFrameworks } from "../onboard/detect.js";
import { walkSourceFiles } from "../graph/builder.js";
import type {
  ConventionScanResult,
  ConventionResult,
  ConflictInfo,
  GoldenFileEntry,
} from "../conventions/types.js";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface ConventionDetectorOptions {
  projectRoot: string;
  outputDir: string; // where to write conventions.md and golden-files.md
  rulesDir?: string; // optional: override default rules directory
}

export interface ConventionDetectorResult {
  conventionsPath: string;
  goldenFilesPath: string;
  conventionsDetected: number;
  conflictsDetected: number;
  goldenFileCount: number;
  durationMs: number;
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

/**
 * Runs the Convention Detector agent: scans the project for code conventions
 * using ast-grep YAML rules, produces conventions.md with adoption percentages
 * and evidence chains, and golden-files.md ranking files by convention density.
 */
export async function runConventionDetector(
  options: ConventionDetectorOptions,
): Promise<ConventionDetectorResult> {
  const startTime = Date.now();

  // Determine rules directory
  const rulesDir =
    options.rulesDir ??
    path.join(
      path.dirname(fileURLToPath(import.meta.url)),
      "..",
      "conventions",
      "rules",
    );

  // Ensure output directory exists
  fs.mkdirSync(options.outputDir, { recursive: true });

  // Detect frameworks from package.json (per D-01, D-04)
  const detectedFrameworks = detectFrameworks(options.projectRoot);

  // Run convention scan
  let scanResult: ConventionScanResult | null = null;
  let scanError: string | null = null;

  try {
    scanResult = runConventionScan(options.projectRoot, rulesDir, detectedFrameworks);
  } catch (error) {
    // Handle ast-grep not available per D-03 (graceful degradation)
    scanError =
      error instanceof Error ? error.message : String(error);
  }

  // Generate conventions.md
  let conventionsMd = generateConventionsMarkdown(
    scanResult,
    scanError,
  );

  // R8: Infer project-specific conventions beyond hardcoded rules
  let inferredCount = 0;
  let inferredHighConf = 0;
  try {
    const sourceFiles = walkSourceFiles(options.projectRoot);
    const relativeFiles = sourceFiles.map(f => path.relative(options.projectRoot, f));
    const inferred = inferConventions(options.projectRoot, relativeFiles);

    if (inferred.length > 0) {
      const inferredMd = formatInferredConventions(inferred);
      conventionsMd += inferredMd;
      inferredCount = inferred.length;
      inferredHighConf = inferred.filter(c => c.confidence === "HIGH-CONF").length;
    }
  } catch {
    // Inference is best-effort; don't fail the detector
  }

  const conventionsPath = path.join(options.outputDir, "conventions.md");
  fs.writeFileSync(conventionsPath, conventionsMd, "utf-8");

  // Generate golden-files.md
  const goldenFiles = scanResult?.goldenFiles ?? [];
  const goldenFilesMd = generateGoldenFilesMarkdown(goldenFiles);
  const goldenFilesPath = path.join(options.outputDir, "golden-files.md");
  fs.writeFileSync(goldenFilesPath, goldenFilesMd, "utf-8");

  const durationMs = Date.now() - startTime;

  return {
    conventionsPath,
    goldenFilesPath,
    conventionsDetected: (scanResult?.totalConventionsDetected ?? 0) + inferredCount,
    conflictsDetected: scanResult?.conflicts.length ?? 0,
    goldenFileCount: goldenFiles.length,
    durationMs,
  };
}

// ---------------------------------------------------------------------------
// Markdown generation -- conventions.md
// ---------------------------------------------------------------------------

function generateConventionsMarkdown(
  scanResult: ConventionScanResult | null,
  scanError: string | null,
): string {
  const timestamp = new Date().toISOString();
  const lines: string[] = [];

  // YAML frontmatter
  lines.push("---");
  lines.push(`generated: "${timestamp}"`);
  lines.push('generator: "convention-detector"');
  lines.push("phase: 2");
  lines.push(
    `total_rules_evaluated: ${scanResult?.totalRulesEvaluated ?? 0}`,
  );
  lines.push(
    `total_conventions_detected: ${scanResult?.totalConventionsDetected ?? 0}`,
  );
  lines.push('false_positive_target: "<5%"');
  lines.push("---");
  lines.push("");
  lines.push("# Conventions");
  lines.push("");

  // Handle error state
  if (scanError) {
    lines.push(`Convention detection failed: ${scanError}`);
    lines.push("");
    return lines.join("\n");
  }

  // Handle no conventions
  if (
    !scanResult ||
    scanResult.conventions.length === 0
  ) {
    lines.push(
      "No conventions detected with sufficient adoption (>10 files required).",
    );
    lines.push("");
    return lines.join("\n");
  }

  // Sort conventions by adoption % descending
  const sorted = [...scanResult.conventions].sort(
    (a, b) => b.adoptionPercent - a.adoptionPercent,
  );

  // Convention entries
  for (const conv of sorted) {
    lines.push(`### ${conv.name}`);
    lines.push("");
    lines.push("| Metric | Value |");
    lines.push("|--------|-------|");
    lines.push(
      `| Adoption | ${conv.adoptionPercent}% (${conv.matchingFiles.length}/${conv.totalApplicableFiles} files) |`,
    );
    lines.push(`| Confidence | ${conv.confidence} |`);
    lines.push(`| Trend | ${conv.trend} |`);
    lines.push(`| Category | ${conv.category} |`);
    lines.push("");
    lines.push("**Evidence:**");

    for (const ev of conv.evidence) {
      lines.push(`- \`${ev.file}:${ev.line}\` -- ${ev.description}`);
    }

    lines.push("");
  }

  // Conflict entries
  for (const conflict of scanResult.conflicts) {
    lines.push(`### [CONFLICT] ${conflict.label}`);
    lines.push("");
    lines.push(
      `${conflict.patternA.name}: ${conflict.patternA.adoption}% adoption`,
    );
    lines.push(
      `${conflict.patternB.name}: ${conflict.patternB.adoption}% adoption`,
    );
    lines.push("");
    lines.push(
      "Both patterns exceed 20% adoption. Resolution recommended before enforcement.",
    );
    lines.push("");
  }

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Markdown generation -- golden-files.md
// ---------------------------------------------------------------------------

function generateGoldenFilesMarkdown(
  goldenFiles: GoldenFileEntry[],
): string {
  const timestamp = new Date().toISOString();
  const lines: string[] = [];

  // YAML frontmatter
  lines.push("---");
  lines.push(`generated: "${timestamp}"`);
  lines.push('generator: "convention-detector"');
  lines.push("phase: 2");
  lines.push(
    'selection_criteria: "Files ranked by modern pattern density (conventions followed / conventions applicable)."',
  );
  lines.push("---");
  lines.push("");
  lines.push("# Golden Files");
  lines.push("");
  lines.push(
    "Files ranked by modern pattern density (conventions followed / conventions applicable).",
  );
  lines.push("");

  if (goldenFiles.length === 0) {
    lines.push(
      "No golden files identified. Insufficient convention data for ranking.",
    );
    lines.push("");
    return lines.join("\n");
  }

  for (let i = 0; i < goldenFiles.length; i++) {
    const gf = goldenFiles[i];
    const pct = (gf.density * 100).toFixed(0);
    lines.push(
      `${i + 1}. \`${gf.filePath}\` -- ${gf.conventionsFollowed}/${gf.conventionsApplicable} conventions followed (${pct}%)`,
    );
  }

  lines.push("");
  return lines.join("\n");
}
