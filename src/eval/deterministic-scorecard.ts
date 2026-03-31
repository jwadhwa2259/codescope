// ---------------------------------------------------------------------------
// Deterministic Scorecard
// ---------------------------------------------------------------------------
// Computes 6 code quality metrics from local data (graph, conventions,
// violations) without any AI model calls. Pure computation functions.
//
// Per D-17, D-20, D-21 grade mapping and weights.
// ---------------------------------------------------------------------------

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import type { Database as DatabaseType } from "better-sqlite3";
import type { ScorecardInput, DeterministicScorecard } from "./types.js";
import { parseDetectorConventions } from "../conventions/parser.js";
import { loadGraphFromSQLite, blastRadius } from "../graph/analytics.js";

// ---------------------------------------------------------------------------
// Convention Adherence
// ---------------------------------------------------------------------------

/**
 * Measures how well changed files follow HIGH-CONF conventions.
 *
 * Reads conventions.md, filters to HIGH-CONF only, and checks
 * each changed file against convention evidence file lists.
 */
export function computeConventionAdherence(options: {
  changedFiles: string[];
  conventionsPath: string;
}): { percent: number; violatingFiles: number; totalFiles: number } {
  const { changedFiles, conventionsPath } = options;

  if (changedFiles.length === 0) {
    return { percent: 100, violatingFiles: 0, totalFiles: 0 };
  }

  if (!existsSync(conventionsPath)) {
    return { percent: 100, violatingFiles: 0, totalFiles: 0 };
  }

  let content: string;
  try {
    content = readFileSync(conventionsPath, "utf-8");
  } catch {
    return { percent: 100, violatingFiles: 0, totalFiles: 0 };
  }

  const conventions = parseDetectorConventions(content);
  const highConf = conventions.filter((c) => c.confidence === "HIGH-CONF");

  if (highConf.length === 0) {
    return { percent: 100, violatingFiles: 0, totalFiles: 0 };
  }

  // For each changed file, count how many HIGH-CONF conventions it appears in
  let violatingFiles = 0;
  for (const file of changedFiles) {
    // A file "violates" if it doesn't appear in any HIGH-CONF convention's file list
    const appearsInConvention = highConf.some((c) =>
      c.files.some((f) => file.endsWith(f) || f.endsWith(file)),
    );
    if (!appearsInConvention) {
      violatingFiles++;
    }
  }

  const percent = Math.round(
    ((changedFiles.length - violatingFiles) / changedFiles.length) * 100,
  );

  return { percent, violatingFiles, totalFiles: changedFiles.length };
}

// ---------------------------------------------------------------------------
// Blast Radius Score
// ---------------------------------------------------------------------------

/**
 * Measures the blast radius impact of changed files.
 *
 * Normalizes blast radius counts:
 * - 0 affected = 100%
 * - 1-5 = 90%
 * - 6-20 = 70%
 * - 21-50 = 50%
 * - 50+ = 30%
 */
export function computeBlastRadiusScore(options: {
  changedFiles: string[];
  db: DatabaseType | null;
}): { totalAffected: number; normalized: number; riskBreakdown: Record<string, number> } {
  const { changedFiles, db } = options;

  if (changedFiles.length === 0 || !db) {
    return { totalAffected: 0, normalized: 100, riskBreakdown: {} };
  }

  let graph;
  try {
    graph = loadGraphFromSQLite(db);
  } catch {
    return { totalAffected: 0, normalized: 100, riskBreakdown: {} };
  }

  if (graph.order === 0) {
    return { totalAffected: 0, normalized: 100, riskBreakdown: {} };
  }

  let totalAffected = 0;
  const riskBreakdown: Record<string, number> = {};
  const scores: number[] = [];

  for (const filePath of changedFiles) {
    // Find matching node
    const matchingNodes = graph.filterNodes(
      (_n: string, attr: Record<string, unknown>) =>
        attr.filePath === filePath && attr.kind === "file",
    );

    if (matchingNodes.length === 0) {
      scores.push(100);
      continue;
    }

    const nodeId = matchingNodes[0];
    const blastNodes = blastRadius(graph, nodeId, 4);
    // Exclude the node itself (hop 0)
    const affected = blastNodes.filter((n) => n.hop > 0);
    const count = affected.length;
    totalAffected += count;

    // Count risk breakdown
    for (const node of affected) {
      riskBreakdown[node.risk] = (riskBreakdown[node.risk] ?? 0) + 1;
    }

    // Normalize per file
    if (count === 0) scores.push(100);
    else if (count <= 5) scores.push(90);
    else if (count <= 20) scores.push(70);
    else if (count <= 50) scores.push(50);
    else scores.push(30);
  }

  const normalized =
    scores.length > 0
      ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
      : 100;

  return { totalAffected, normalized, riskBreakdown };
}

// ---------------------------------------------------------------------------
// Violation Impact
// ---------------------------------------------------------------------------

/**
 * Measures violation count for changed files from convention-violations.json.
 *
 * Normalized:
 * - 0 violations = 100%
 * - 1-2 = 85%
 * - 3-5 = 70%
 * - 6-10 = 50%
 * - 10+ = 30%
 */
export function computeViolationImpact(options: {
  changedFiles: string[];
  violationsPath: string;
}): { total: number; byRule: Record<string, number>; normalized: number } {
  const { changedFiles, violationsPath } = options;

  if (changedFiles.length === 0) {
    return { total: 0, byRule: {}, normalized: 100 };
  }

  if (!existsSync(violationsPath)) {
    return { total: 0, byRule: {}, normalized: 100 };
  }

  let violations: Array<{ file?: string; rule?: string; ruleId?: string }>;
  try {
    const raw = readFileSync(violationsPath, "utf-8");
    violations = JSON.parse(raw);
    if (!Array.isArray(violations)) {
      return { total: 0, byRule: {}, normalized: 100 };
    }
  } catch {
    return { total: 0, byRule: {}, normalized: 100 };
  }

  // Filter violations to changed files
  const relevant = violations.filter((v) =>
    changedFiles.some(
      (f) => v.file === f || (v.file && (f.endsWith(v.file) || v.file.endsWith(f))),
    ),
  );

  const total = relevant.length;
  const byRule: Record<string, number> = {};
  for (const v of relevant) {
    const rule = v.ruleId ?? v.rule ?? "unknown";
    byRule[rule] = (byRule[rule] ?? 0) + 1;
  }

  let normalized: number;
  if (total === 0) normalized = 100;
  else if (total <= 2) normalized = 85;
  else if (total <= 5) normalized = 70;
  else if (total <= 10) normalized = 50;
  else normalized = 30;

  return { total, byRule, normalized };
}

// ---------------------------------------------------------------------------
// Import Correctness
// ---------------------------------------------------------------------------

/**
 * Measures import resolution correctness for changed files.
 *
 * For each changed file, checks if all import edges in the graph
 * resolve to existing nodes. Files not in graph scored as 100%.
 */
export function computeImportCorrectness(options: {
  changedFiles: string[];
  db: DatabaseType | null;
}): { percent: number; broken: number; total: number } {
  const { changedFiles, db } = options;

  if (changedFiles.length === 0 || !db) {
    return { percent: 100, broken: 0, total: 0 };
  }

  let totalImports = 0;
  let brokenImports = 0;

  try {
    // Query edges for changed files
    const stmt = db.prepare(
      `SELECT e.source_id, e.target_id, e.kind, n.file_path
       FROM edges e
       JOIN nodes n ON n.id = e.source_id
       WHERE e.kind = 'imports' AND n.file_path IN (${changedFiles.map(() => "?").join(",")})`,
    );

    const edges = stmt.all(...changedFiles) as Array<{
      source_id: number;
      target_id: number;
      kind: string;
      file_path: string;
    }>;

    totalImports = edges.length;

    // Check if target nodes exist
    if (totalImports > 0) {
      const targetIds = edges.map((e) => e.target_id);
      const checkStmt = db.prepare(
        `SELECT id FROM nodes WHERE id IN (${targetIds.map(() => "?").join(",")})`,
      );
      const existingTargets = new Set(
        (checkStmt.all(...targetIds) as Array<{ id: number }>).map((r) => r.id),
      );

      for (const edge of edges) {
        if (!existingTargets.has(edge.target_id)) {
          brokenImports++;
        }
      }
    }
  } catch {
    // DB query failure -- treat as no data
    return { percent: 100, broken: 0, total: 0 };
  }

  if (totalImports === 0) {
    return { percent: 100, broken: 0, total: 0 };
  }

  const percent = Math.round(
    ((totalImports - brokenImports) / totalImports) * 100,
  );

  return { percent, broken: brokenImports, total: totalImports };
}

// ---------------------------------------------------------------------------
// Risk Files Modified
// ---------------------------------------------------------------------------

/**
 * Counts how many changed files appear in the danger zones index.
 */
export function computeRiskFilesModified(
  changedFiles: string[],
  dangerZonesPath: string,
): { count: number; files: string[] } {
  if (changedFiles.length === 0 || !existsSync(dangerZonesPath)) {
    return { count: 0, files: [] };
  }

  try {
    const raw = readFileSync(dangerZonesPath, "utf-8");
    const dangerZones = JSON.parse(raw);
    const dangerFiles = dangerZones.files
      ? Object.keys(dangerZones.files)
      : Array.isArray(dangerZones)
        ? dangerZones.map((d: { filePath?: string }) => d.filePath).filter(Boolean)
        : [];

    const riskFiles = changedFiles.filter((f) =>
      dangerFiles.some(
        (d: string) => f === d || f.endsWith(d) || d.endsWith(f),
      ),
    );

    return { count: riskFiles.length, files: riskFiles };
  } catch {
    return { count: 0, files: [] };
  }
}

// ---------------------------------------------------------------------------
// Composite Score (D-21)
// ---------------------------------------------------------------------------

/**
 * Computes weighted average of 4 metric scores with equal 25% weights.
 *
 * Grade mapping (D-21, extended):
 * - A: 90-100
 * - B+: 85-89
 * - B: 80-84
 * - C+: 70-79 (extended from D-21's 70-74% to cover 75-79% gap)
 * - C: 60-69
 * - F: <60
 */
export function computeCompositeScore(
  conventionAdherence: number,
  blastRadiusNormalized: number,
  violationImpact: number,
  importCorrectness: number,
): { percent: number; grade: string } {
  const raw =
    conventionAdherence * 0.25 +
    blastRadiusNormalized * 0.25 +
    violationImpact * 0.25 +
    importCorrectness * 0.25;
  const percent = Math.round(Math.max(0, Math.min(100, raw)));
  const grade =
    percent >= 90
      ? "A"
      : percent >= 85
        ? "B+"
        : percent >= 80
          ? "B"
          : percent >= 70
            ? "C+"
            : percent >= 60
              ? "C"
              : "F";
  return { percent, grade };
}

// ---------------------------------------------------------------------------
// Render Scorecard
// ---------------------------------------------------------------------------

/**
 * Renders a DeterministicScorecard as a markdown string.
 */
export function renderScorecard(scorecard: DeterministicScorecard): string {
  const lines: string[] = [];

  lines.push(
    `## CodeScope Scorecard: ${scorecard.composite.grade} (${scorecard.composite.percent}%)`,
  );
  lines.push("");
  lines.push("| Metric | Score | Detail |");
  lines.push("|--------|-------|--------|");
  lines.push(
    `| Convention Adherence | ${scorecard.conventionAdherence.percent}% | ${scorecard.conventionAdherence.violatingFiles}/${scorecard.conventionAdherence.totalFiles} files violating |`,
  );
  lines.push(
    `| Blast Radius | ${scorecard.blastRadius.normalized}% | ${scorecard.blastRadius.totalAffected} affected nodes |`,
  );
  lines.push(
    `| Violations | ${scorecard.violationImpact.normalized}% | ${scorecard.violationImpact.total} violations found |`,
  );
  lines.push(
    `| Import Correctness | ${scorecard.importCorrectness.percent}% | ${scorecard.importCorrectness.broken}/${scorecard.importCorrectness.total} broken imports |`,
  );
  lines.push(
    `| Risk Files Modified | -- | ${scorecard.riskFilesModified.count} danger zone files |`,
  );
  lines.push(
    `| **Composite** | **${scorecard.composite.percent}%** | **Grade: ${scorecard.composite.grade}** |`,
  );
  lines.push("");

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Top-level Scorecard Computation
// ---------------------------------------------------------------------------

/**
 * Computes the full deterministic scorecard from input.
 * Pure computation -- no AI model calls.
 */
export function computeScorecard(input: ScorecardInput): DeterministicScorecard {
  const { changedFiles, codescopeDir, db } = input;

  const conventionsPath = join(codescopeDir, "conventions.md");
  const violationsPath = join(codescopeDir, "convention-violations.json");
  const dangerZonesPath = join(codescopeDir, "injection", "danger-zones.json");

  const conventionAdherence = computeConventionAdherence({
    changedFiles,
    conventionsPath,
  });

  const blastRadiusResult = computeBlastRadiusScore({
    changedFiles,
    db,
  });

  const violationImpactResult = computeViolationImpact({
    changedFiles,
    violationsPath,
  });

  const importCorrectnessResult = computeImportCorrectness({
    changedFiles,
    db,
  });

  const riskFilesModified = computeRiskFilesModified(
    changedFiles,
    dangerZonesPath,
  );

  const composite = computeCompositeScore(
    conventionAdherence.percent,
    blastRadiusResult.normalized,
    violationImpactResult.normalized,
    importCorrectnessResult.percent,
  );

  return {
    conventionAdherence,
    blastRadius: blastRadiusResult,
    violationImpact: violationImpactResult,
    importCorrectness: importCorrectnessResult,
    riskFilesModified,
    composite,
  };
}
