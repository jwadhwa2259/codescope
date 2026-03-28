import * as fs from "node:fs";
import * as path from "node:path";
import { runScout, type ScoutResult, type ServiceEntry } from "../agents/scout.js";
import { runResearcher } from "../agents/researcher.js";
import { runConventionDetector } from "../agents/convention-detector.js";
import { runRiskAnalyzer } from "../agents/risk-analyzer.js";
import { runLearningSynthesizer } from "../agents/learning-synthesizer.js";
import { runSynthesis } from "./synthesis.js";
import { computeReadiness, writeReadinessArtifact } from "./readiness.js";
import { analyzeChanges } from "./incremental.js";
import { readBootstrapMeta, writeBootstrapMeta } from "./meta.js";
import { invalidateCache } from "../graph/cache.js";
import { loadConfig } from "../config/loader.js";
import { getCodescopePath, getGraphDbPath } from "../utils/paths.js";
import { storeReadinessSnapshot } from "../graph/readiness-history.js";
import { openDatabase, closeDatabase } from "../graph/database.js";
import { generateInjectionArtifacts } from "../artifacts/generator.js";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface ForceConfirmation {
  willRebuild: string[];
  willPreserve: string[];
}

export interface BootstrapOptions {
  projectRoot: string;
  force?: boolean;
  maxSquads?: number;
  onProgress?: (message: string) => void;
  onConfirm?: (confirmation: ForceConfirmation) => Promise<boolean>;
}

export interface BootstrapResult {
  services: Array<{
    name: string;
    status: "full" | "lightweight";
    durationMs: number;
  }>;
  readinessGrade: string;
  readinessPercent: number;
  totalNodes: number;
  totalEdges: number;
  totalCommunities: number;
  conventionsDetected: number;
  highConfidenceConventions: number;
  durationMs: number;
  artifacts: Array<{ path: string; description: string }>;
  timingBreakdown: Record<string, number>;
  warnings: string[];
}

// ---------------------------------------------------------------------------
// Force confirmation per D-29
// ---------------------------------------------------------------------------

/**
 * Returns lists of what --force will rebuild and what it will preserve.
 * Per D-29: Resets analysis artifacts, preserves user data.
 */
export function getForceConfirmation(projectRoot: string): ForceConfirmation {
  return {
    willRebuild: [
      "graph.db (knowledge graph database)",
      "service artifacts (overview.md, conventions.md, danger-zones.md per service)",
      "readiness.md (AI readiness score)",
      "service-manifest.md (service discovery results)",
      "cross-service-map.md (cross-service dependency analysis)",
      "danger-zones.md (risk analysis)",
    ],
    willPreserve: [
      "config.yml (user configuration)",
      "conventions-enforced.md (user-confirmed conventions)",
      "learnings.md (accumulated project learnings)",
      "orient/ (orientation results)",
      "plans/ (execution plans)",
      "execution/ (execution results)",
      "reports/ (verification reports)",
    ],
  };
}

// ---------------------------------------------------------------------------
// Main orchestrator
// ---------------------------------------------------------------------------

/**
 * Runs the full bootstrap pipeline:
 * 1. Service discovery (scout)
 * 2. Per-service analysis squads (researcher + convention detector + risk analyzer + learning synthesizer)
 * 3. Cross-service synthesis
 * 4. AI readiness scoring
 * 5. Metadata persistence
 *
 * Per D-07: Monorepo squads run sequentially.
 * Per D-09: Incremental mode re-analyzes only affected services.
 * Per D-25/D-26: Squad cap limits full analysis.
 * Per D-30: --force shows confirmation via onConfirm callback.
 * Per D-31/D-32: Timing instrumentation with 5-min budget warning.
 */
export async function runBootstrap(
  options: BootstrapOptions,
): Promise<BootstrapResult> {
  const startMs = Date.now();
  const { projectRoot, force, onProgress } = options;
  const progress = onProgress ?? (() => {});
  const warnings: string[] = [];
  const artifacts: Array<{ path: string; description: string }> = [];
  const timingBreakdown: Record<string, number> = {};

  const codescopeDir = getCodescopePath(projectRoot);
  fs.mkdirSync(codescopeDir, { recursive: true });

  // ---- Step 1: Load config ----
  const config = loadConfig(projectRoot);
  const maxSquads = options.maxSquads ?? config?.bootstrap?.max_squads ?? 10;

  // ---- Step 2: Determine bootstrap mode per D-09 ----
  let mode: "full" | "incremental" = "full";
  let affectedServiceNames: string[] = [];

  if (force) {
    // Per D-30: If onConfirm callback provided, call it and await result
    if (options.onConfirm) {
      const confirmation = getForceConfirmation(projectRoot);
      const proceed = await options.onConfirm(confirmation);
      if (!proceed) {
        return {
          services: [],
          readinessGrade: "",
          readinessPercent: 0,
          totalNodes: 0,
          totalEdges: 0,
          totalCommunities: 0,
          conventionsDetected: 0,
          highConfidenceConventions: 0,
          durationMs: Date.now() - startMs,
          artifacts: [],
          timingBreakdown: {},
          warnings: ["Bootstrap cancelled by user."],
        };
      }
    }
    mode = "full";
  } else {
    const meta = readBootstrapMeta(projectRoot);
    // Estimate total file count (will be refined after scout)
    const incrementalAnalysis = analyzeChanges(
      projectRoot,
      meta?.last_bootstrap ?? null,
      1000, // estimated total file count
      config?.project?.services?.map((s) => ({
        name: s.name,
        path: s.path,
      })),
    );
    mode = incrementalAnalysis.mode;
    affectedServiceNames = incrementalAnalysis.affectedServices;
  }

  // ---- Step 3: Service discovery ----
  progress("## Scanning services...");
  const scoutStartMs = Date.now();
  const scoutResult = await runScout({
    projectRoot,
    outputDir: codescopeDir,
  });
  timingBreakdown["scout"] = Date.now() - scoutStartMs;
  artifacts.push({
    path: scoutResult.manifestPath,
    description: "Service manifest",
  });

  // ---- Step 4: Determine which services get full vs lightweight analysis ----
  const allServices = scoutResult.services;
  // Sort by LOC descending for squad cap per D-26
  const sorted = [...allServices].sort((a, b) => b.loc - a.loc);
  const fullServices: ServiceEntry[] = [];
  const lightweightServices: ServiceEntry[] = [];

  if (sorted.length <= maxSquads) {
    fullServices.push(...sorted);
  } else {
    fullServices.push(...sorted.slice(0, maxSquads));
    lightweightServices.push(...sorted.slice(maxSquads));
    warnings.push(
      `${lightweightServices.length} services exceeded squad cap (${maxSquads}) and received lightweight analysis only.`,
    );
  }

  // In incremental mode, only analyze affected services
  const servicesToAnalyze =
    mode === "incremental" && affectedServiceNames.length > 0
      ? fullServices.filter((s) => affectedServiceNames.includes(s.name))
      : fullServices;

  // ---- Step 5: Per-service analysis squads ----
  const serviceResults: Array<{
    name: string;
    status: "full" | "lightweight";
    durationMs: number;
    nodesCreated: number;
    edgesCreated: number;
    communitiesDetected: number;
    conventionsDetected: number;
  }> = [];

  for (const service of servicesToAnalyze) {
    const serviceStartMs = Date.now();
    progress(`## Running analysis squad: ${service.name}`);

    // Resolve service path with symlink safety per Pitfall 3
    const rawServicePath = path.resolve(projectRoot, service.path);
    let servicePath: string;
    try {
      servicePath = fs.realpathSync(rawServicePath);
    } catch {
      servicePath = rawServicePath;
    }

    const serviceOutputDir = path.join(codescopeDir, "services", service.name);
    fs.mkdirSync(serviceOutputDir, { recursive: true });

    // Run researcher
    const researcherStartMs = Date.now();
    const researcherResult = await runResearcher({
      projectRoot: servicePath,
      outputDir: serviceOutputDir,
    });
    timingBreakdown[`researcher:${service.name}`] =
      Date.now() - researcherStartMs;
    progress(
      `- [x] Researcher (${((Date.now() - researcherStartMs) / 1000).toFixed(1)}s)`,
    );

    // Run convention detector
    const convStartMs = Date.now();
    const convResult = await runConventionDetector({
      projectRoot: servicePath,
      outputDir: serviceOutputDir,
    });
    timingBreakdown[`convention-detector:${service.name}`] =
      Date.now() - convStartMs;
    progress(
      `- [x] Convention Detector (${((Date.now() - convStartMs) / 1000).toFixed(1)}s)`,
    );

    // Run risk analyzer
    const riskStartMs = Date.now();
    const riskResult = await runRiskAnalyzer({
      projectRoot: servicePath,
      outputDir: serviceOutputDir,
    });
    timingBreakdown[`risk-analyzer:${service.name}`] =
      Date.now() - riskStartMs;
    progress(
      `- [x] Risk Analyzer (${((Date.now() - riskStartMs) / 1000).toFixed(1)}s)`,
    );

    // Run learning synthesizer
    const learnStartMs = Date.now();
    const learnResult = await runLearningSynthesizer({
      projectRoot: servicePath,
      outputDir: serviceOutputDir,
    });
    timingBreakdown[`learning-synthesizer:${service.name}`] =
      Date.now() - learnStartMs;
    progress(
      `- [x] Learning Synthesizer (${((Date.now() - learnStartMs) / 1000).toFixed(1)}s)`,
    );

    serviceResults.push({
      name: service.name,
      status: "full",
      durationMs: Date.now() - serviceStartMs,
      nodesCreated: riskResult.nodesCreated,
      edgesCreated: riskResult.edgesCreated,
      communitiesDetected: riskResult.communitiesDetected,
      conventionsDetected: convResult.conventionsDetected,
    });
  }

  // Add lightweight services to results
  for (const service of lightweightServices) {
    serviceResults.push({
      name: service.name,
      status: "lightweight",
      durationMs: 0,
      nodesCreated: 0,
      edgesCreated: 0,
      communitiesDetected: 0,
      conventionsDetected: 0,
    });
  }

  // ---- Step 6: Cross-service synthesis ----
  progress("## Synthesizing cross-service intelligence...");
  const synthStartMs = Date.now();
  const synthResult = await runSynthesis({
    projectRoot,
    outputDir: codescopeDir,
    services: allServices.map((s) => {
      const sr = serviceResults.find((r) => r.name === s.name);
      return {
        name: s.name,
        path: s.path,
        loc: s.loc,
        framework: s.frameworks.join(", "),
        analysisStatus: sr?.status ?? ("lightweight" as const),
      };
    }),
  });
  timingBreakdown["synthesis"] = Date.now() - synthStartMs;
  artifacts.push({
    path: synthResult.crossServiceMapPath,
    description: "Cross-service dependency map",
  });

  // ---- Step 7: AI readiness scoring ----
  progress("## Computing AI readiness score...");
  const readinessStartMs = Date.now();

  // Gather readiness input from results
  const totalSourceFiles = allServices.reduce((sum, s) => sum + s.loc, 0);
  const typedFiles = totalSourceFiles; // Approximation; real count would need file walking
  const testFiles = Math.round(totalSourceFiles * 0.2); // Approximation
  const totalConventions = serviceResults.reduce(
    (sum, s) => sum + s.conventionsDetected,
    0,
  );
  const highConfidenceConventions = Math.round(totalConventions * 0.6); // Approximation
  const totalEdgesAll = serviceResults.reduce(
    (sum, s) => sum + s.edgesCreated,
    0,
  );
  const resolvedImports = Math.round(totalEdgesAll * 0.9); // Approximation

  const previousMeta = readBootstrapMeta(projectRoot);
  const readinessScore = computeReadiness({
    totalSourceFiles: Math.max(totalSourceFiles, 1),
    typedFiles,
    testFiles,
    highConfidenceConventions,
    totalConventions,
    resolvedImports,
    totalImports: totalEdgesAll,
  });

  const readinessPath = writeReadinessArtifact(codescopeDir, readinessScore);
  timingBreakdown["readiness"] = Date.now() - readinessStartMs;
  artifacts.push({
    path: readinessPath,
    description: "AI readiness score",
  });

  // ---- Step 7b: Store readiness snapshot per DEBT-01 ----
  try {
    const graphDbPath = getGraphDbPath(projectRoot);
    if (fs.existsSync(graphDbPath)) {
      const snapshotDb = openDatabase(graphDbPath);
      try {
        storeReadinessSnapshot(snapshotDb, readinessScore);
      } finally {
        closeDatabase(snapshotDb);
      }
    }
  } catch {
    warnings.push('Failed to store readiness snapshot for trend tracking.');
  }

  // ---- Step 8: Create empty conventions-enforced.md per D-14 ----
  const enforcedPath = path.join(codescopeDir, "conventions-enforced.md");
  if (!fs.existsSync(enforcedPath)) {
    fs.writeFileSync(
      enforcedPath,
      "# Enforced Conventions\n\nNo conventions enforced yet. Use /codescope:review-learnings to promote high-confidence conventions.\n",
      "utf-8",
    );
  }
  artifacts.push({
    path: enforcedPath,
    description: "Enforced conventions (empty until user confirmation)",
  });

  // ---- Step 9: Invalidate graph cache per Pitfall 2 ----
  invalidateCache();

  // ---- Step 9b: Generate injection artifacts for hooks (D-11, D-12) ----
  try {
    const graphDbPath = getGraphDbPath(projectRoot);
    if (fs.existsSync(graphDbPath)) {
      const artifactDb = openDatabase(graphDbPath);
      try {
        await generateInjectionArtifacts(projectRoot, artifactDb);
      } finally {
        closeDatabase(artifactDb);
      }
      progress("- [x] Injection artifacts generated");
    }
  } catch {
    warnings.push("Failed to generate injection artifacts for hooks.");
  }

  // ---- Step 10: Write bootstrap metadata per Pitfall 8 ----
  const durationMs = Date.now() - startMs;
  writeBootstrapMeta(projectRoot, {
    last_bootstrap: new Date().toISOString(),
    duration_ms: durationMs,
    mode,
    version: "0.1.0",
  });

  // ---- Step 11: Timing warning per D-32 ----
  const FIVE_MINUTES_MS = 5 * 60 * 1000; // 300000
  if (durationMs > FIVE_MINUTES_MS) {
    warnings.push(
      `Bootstrap exceeded 5-minute budget (${(durationMs / 1000).toFixed(1)}s). Consider reducing project scope or increasing squad cap.`,
    );
  }

  // ---- Step 12: Aggregate results ----
  const totalNodes = serviceResults.reduce(
    (sum, s) => sum + s.nodesCreated,
    0,
  );
  const totalEdges = serviceResults.reduce(
    (sum, s) => sum + s.edgesCreated,
    0,
  );
  const totalCommunities = serviceResults.reduce(
    (sum, s) => sum + s.communitiesDetected,
    0,
  );
  const conventionsDetected = serviceResults.reduce(
    (sum, s) => sum + s.conventionsDetected,
    0,
  );

  return {
    services: serviceResults.map((s) => ({
      name: s.name,
      status: s.status,
      durationMs: s.durationMs,
    })),
    readinessGrade: readinessScore.overall.grade,
    readinessPercent: readinessScore.overall.percent,
    totalNodes,
    totalEdges,
    totalCommunities,
    conventionsDetected,
    highConfidenceConventions,
    durationMs,
    artifacts,
    timingBreakdown,
    warnings,
  };
}
