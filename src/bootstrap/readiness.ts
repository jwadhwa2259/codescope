import * as fs from "node:fs";
import * as path from "node:path";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface DimensionScore {
  percent: number;
  grade: string;
  delta: string | null;
  explainer: string;
}

export interface ReadinessScore {
  overall: { grade: string; percent: number };
  dimensions: {
    conventionCoverage: DimensionScore;
    typeSafety: DimensionScore;
    testCoverageProxy: DimensionScore;
    importGraphHealth: DimensionScore;
  };
  improvements: Array<{ action: string; reference: string }>;
}

export interface ReadinessInput {
  totalSourceFiles: number;
  typedFiles: number;
  testFiles: number;
  highConfidenceConventions: number;
  totalConventions: number;
  resolvedImports: number;
  totalImports: number;
  previousScores?: ReadinessScore["dimensions"];
}

// ---------------------------------------------------------------------------
// Grade mapping per D-02
// ---------------------------------------------------------------------------

/**
 * Maps a percentage (0-100) to a letter grade with +/- granularity.
 *
 * A+: 97-100, A: 93-96, A-: 90-92,
 * B+: 87-89,  B: 83-86, B-: 80-82,
 * C+: 77-79,  C: 73-76, C-: 70-72,
 * D+: 67-69,  D: 63-66, D-: 60-62,
 * F: <60
 */
export function percentToGrade(pct: number): string {
  if (pct >= 97) return "A+";
  if (pct >= 93) return "A";
  if (pct >= 90) return "A-";
  if (pct >= 87) return "B+";
  if (pct >= 83) return "B";
  if (pct >= 80) return "B-";
  if (pct >= 77) return "C+";
  if (pct >= 73) return "C";
  if (pct >= 70) return "C-";
  if (pct >= 67) return "D+";
  if (pct >= 63) return "D";
  if (pct >= 60) return "D-";
  return "F";
}

// ---------------------------------------------------------------------------
// AI explainers per D-04
// ---------------------------------------------------------------------------

const EXPLAINERS = {
  conventionCoverage:
    "High convention coverage means AI can follow established patterns with confidence.",
  typeSafety:
    "High type safety means AI can infer intent from signatures without guessing.",
  testCoverageProxy:
    "More tests give AI a safety net to verify its changes actually work.",
  importGraphHealth:
    "Clean import resolution means AI can trace dependencies and assess change impact accurately.",
} as const;

// ---------------------------------------------------------------------------
// Improvement suggestions
// ---------------------------------------------------------------------------

interface DimensionInfo {
  key: keyof ReadinessScore["dimensions"];
  label: string;
  action: string;
}

const DIMENSION_ACTIONS: DimensionInfo[] = [
  {
    key: "conventionCoverage",
    label: "Convention Coverage",
    action:
      "Add coding conventions with consistent patterns across more files",
  },
  {
    key: "typeSafety",
    label: "Type Safety",
    action:
      "Convert JavaScript files to TypeScript or add JSDoc type annotations",
  },
  {
    key: "testCoverageProxy",
    label: "Test Coverage Proxy",
    action: "Add test files to cover untested modules and components",
  },
  {
    key: "importGraphHealth",
    label: "Import Graph Health",
    action:
      "Fix unresolved imports by adding missing dependencies or path aliases",
  },
];

function generateImprovements(
  dimensions: ReadinessScore["dimensions"],
): Array<{ action: string; reference: string }> {
  // Sort dimensions by score ascending (worst first)
  const sorted = DIMENSION_ACTIONS.slice().sort(
    (a, b) => dimensions[a.key].percent - dimensions[b.key].percent,
  );

  // Return top 3
  return sorted.slice(0, 3).map((d) => ({
    action: d.action,
    reference: `${d.label} (${dimensions[d.key].percent}%)`,
  }));
}

// ---------------------------------------------------------------------------
// Core computation per D-01
// ---------------------------------------------------------------------------

/**
 * Computes the AI readiness score with 4 equally-weighted dimensions (25% each).
 *
 * Dimensions:
 * 1. Convention coverage: highConfidenceConventions / totalSourceFiles * 100
 * 2. Type safety: typedFiles / totalSourceFiles * 100
 * 3. Test coverage proxy: testFiles / totalSourceFiles * 100
 * 4. Import graph health: resolvedImports / totalImports * 100
 *
 * All divisions guarded against zero denominators.
 * Delta tracking per D-05 when previousScores provided.
 */
export function computeReadiness(input: ReadinessInput): ReadinessScore {
  // Compute raw percentages with division-by-zero guards
  const conventionPct = Math.min(
    Math.round(
      (input.highConfidenceConventions / Math.max(input.totalSourceFiles, 1)) *
        100,
    ),
    100,
  );

  const typeSafetyPct = Math.round(
    (input.typedFiles / Math.max(input.totalSourceFiles, 1)) * 100,
  );

  const testPct = Math.min(
    Math.round(
      (input.testFiles / Math.max(input.totalSourceFiles, 1)) * 100,
    ),
    100,
  );

  const importPct = Math.round(
    (input.resolvedImports / Math.max(input.totalImports, 1)) * 100,
  );

  // Build dimension scores
  function buildDelta(
    current: number,
    dimKey: keyof ReadinessScore["dimensions"],
  ): string | null {
    if (!input.previousScores) return null;
    const prev = input.previousScores[dimKey].percent;
    const diff = current - prev;
    if (diff === 0) return "0%";
    return diff > 0 ? `+${diff}%` : `${diff}%`;
  }

  const dimensions: ReadinessScore["dimensions"] = {
    conventionCoverage: {
      percent: conventionPct,
      grade: percentToGrade(conventionPct),
      delta: buildDelta(conventionPct, "conventionCoverage"),
      explainer: EXPLAINERS.conventionCoverage,
    },
    typeSafety: {
      percent: typeSafetyPct,
      grade: percentToGrade(typeSafetyPct),
      delta: buildDelta(typeSafetyPct, "typeSafety"),
      explainer: EXPLAINERS.typeSafety,
    },
    testCoverageProxy: {
      percent: testPct,
      grade: percentToGrade(testPct),
      delta: buildDelta(testPct, "testCoverageProxy"),
      explainer: EXPLAINERS.testCoverageProxy,
    },
    importGraphHealth: {
      percent: importPct,
      grade: percentToGrade(importPct),
      delta: buildDelta(importPct, "importGraphHealth"),
      explainer: EXPLAINERS.importGraphHealth,
    },
  };

  // Overall average (25% each per D-01)
  const overallPct = Math.round(
    (conventionPct + typeSafetyPct + testPct + importPct) / 4,
  );

  // Improvements per D-03
  const improvements = generateImprovements(dimensions);

  return {
    overall: {
      grade: percentToGrade(overallPct),
      percent: overallPct,
    },
    dimensions,
    improvements,
  };
}

// ---------------------------------------------------------------------------
// Artifact writer per UI-SPEC readiness.md format
// ---------------------------------------------------------------------------

/**
 * Writes readiness.md matching the UI-SPEC format.
 * Returns the file path of the written artifact.
 */
export function writeReadinessArtifact(
  outputDir: string,
  score: ReadinessScore,
): string {
  const filePath = path.join(outputDir, "readiness.md");

  const lines: string[] = [];
  lines.push(
    `# AI Readiness Score: ${score.overall.grade} (${score.overall.percent}%)`,
  );
  lines.push("");
  lines.push("## Overall Assessment");
  lines.push("");
  lines.push(
    getOverallAssessment(score.overall.grade, score.overall.percent),
  );
  lines.push("");
  lines.push("## Dimension Scores");
  lines.push("");
  lines.push(
    "| Dimension | Score | Grade | Delta | What This Means for AI |",
  );
  lines.push(
    "|-----------|-------|-------|-------|------------------------|",
  );

  const dims: Array<{
    label: string;
    dim: DimensionScore;
  }> = [
    { label: "Convention Coverage", dim: score.dimensions.conventionCoverage },
    { label: "Type Safety", dim: score.dimensions.typeSafety },
    { label: "Test Coverage Proxy", dim: score.dimensions.testCoverageProxy },
    { label: "Import Graph Health", dim: score.dimensions.importGraphHealth },
  ];

  for (const { label, dim } of dims) {
    const delta = dim.delta ?? "N/A";
    lines.push(
      `| ${label} | ${dim.percent}% | ${dim.grade} | ${delta} | ${dim.explainer} |`,
    );
  }

  lines.push("");
  lines.push("## Top 3 Improvements");
  lines.push("");
  for (let i = 0; i < score.improvements.length; i++) {
    const imp = score.improvements[i];
    lines.push(`${i + 1}. ${imp.action} -- ${imp.reference}`);
  }

  lines.push("");
  lines.push("## Grading Scale");
  lines.push("A+: 97-100% | A: 93-96% | A-: 90-92%");
  lines.push("B+: 87-89% | B: 83-86% | B-: 80-82%");
  lines.push("C+: 77-79% | C: 73-76% | C-: 70-72%");
  lines.push("D+: 67-69% | D: 63-66% | D-: 60-62%");
  lines.push("F: <60%");
  lines.push("");

  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(filePath, lines.join("\n"), "utf-8");
  return filePath;
}

// ---------------------------------------------------------------------------
// Helper: overall assessment sentence
// ---------------------------------------------------------------------------

function getOverallAssessment(grade: string, percent: number): string {
  if (percent >= 90) {
    return "This codebase is well-prepared for AI-assisted development. Strong conventions, typing, testing, and import resolution give AI tools high confidence.";
  }
  if (percent >= 80) {
    return "This codebase is ready for AI-assisted development with good foundations. A few areas could be strengthened to improve AI confidence.";
  }
  if (percent >= 70) {
    return "This codebase has moderate AI readiness. AI tools can work here but may need more guidance in areas with lower scores.";
  }
  if (percent >= 60) {
    return "This codebase has limited AI readiness. AI tools will need significant guidance and may produce less reliable results.";
  }
  return "This codebase has low AI readiness. Consider improving conventions, typing, and test coverage before relying heavily on AI tools.";
}
