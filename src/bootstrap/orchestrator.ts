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
import { buildGraph, type BuildGraphResult } from "../graph/builder.js";
import { storeReadinessSnapshot } from "../graph/readiness-history.js";
import { openDatabase, closeDatabase } from "../graph/database.js";
import { generateInjectionArtifacts } from "../artifacts/generator.js";
import { parseDetectorConventions } from "../conventions/parser.js";
import { createSchema } from "../graph/schema.js";
import { validateGrammars } from "../parser/languages.js";
import type { Database as DatabaseType } from "better-sqlite3";

// ---------------------------------------------------------------------------
// Graph merge utility (R1)
// ---------------------------------------------------------------------------

/**
 * Merge a per-service graph DB into the root graph DB.
 * Remaps node IDs and prepends service path to file_path for namespace isolation.
 *
 * Skips if:
 * - serviceDbPath === rootDb path (self-merge)
 * - serviceDbPath does not exist
 */
export function mergeServiceGraph(
  rootDb: DatabaseType,
  serviceDbPath: string,
  servicePath: string,
): void {
  // Skip if service DB doesn't exist
  if (!fs.existsSync(serviceDbPath)) return;

  // Skip self-merge: compare resolved paths
  const rootDbPath = (rootDb as any).name as string | undefined;
  if (rootDbPath && path.resolve(rootDbPath) === path.resolve(serviceDbPath)) {
    return;
  }

  const serviceDb = openDatabase(serviceDbPath);
  try {
    // Read all nodes from service DB
    const serviceNodes = serviceDb
      .prepare(
        "SELECT id, name, kind, file_path, language, loc, is_exported, is_test FROM nodes",
      )
      .all() as Array<{
      id: number;
      name: string;
      kind: string;
      file_path: string | null;
      language: string | null;
      loc: number;
      is_exported: number;
      is_test: number;
    }>;

    // Build old->new ID map
    const idMap = new Map<number, number>();
    const insertNode = rootDb.prepare(
      "INSERT INTO nodes (name, kind, file_path, language, loc, is_exported, is_test) VALUES (?, ?, ?, ?, ?, ?, ?)",
    );

    for (const node of serviceNodes) {
      // Prepend service path to file_path for namespace isolation
      const filePath = node.file_path
        ? path.join(servicePath, node.file_path)
        : node.file_path;
      const result = insertNode.run(
        node.name,
        node.kind,
        filePath,
        node.language,
        node.loc,
        node.is_exported,
        node.is_test,
      );
      idMap.set(node.id, Number(result.lastInsertRowid));
    }

    // Read and remap edges
    const serviceEdges = serviceDb
      .prepare("SELECT source_id, target_id, kind, weight FROM edges")
      .all() as Array<{
      source_id: number;
      target_id: number;
      kind: string;
      weight: number;
    }>;

    const insertEdge = rootDb.prepare(
      "INSERT INTO edges (source_id, target_id, kind, weight) VALUES (?, ?, ?, ?)",
    );

    for (const edge of serviceEdges) {
      const newSourceId = idMap.get(edge.source_id);
      const newTargetId = idMap.get(edge.target_id);
      if (newSourceId !== undefined && newTargetId !== undefined) {
        insertEdge.run(newSourceId, newTargetId, edge.kind, edge.weight);
      }
    }

    // Read and remap communities
    const serviceCommunities = serviceDb
      .prepare(
        "SELECT node_id, community_id, modularity_class FROM communities",
      )
      .all() as Array<{
      node_id: number;
      community_id: number;
      modularity_class: string | null;
    }>;

    if (serviceCommunities.length > 0) {
      const insertComm = rootDb.prepare(
        "INSERT INTO communities (node_id, community_id, modularity_class) VALUES (?, ?, ?)",
      );
      for (const comm of serviceCommunities) {
        const newNodeId = idMap.get(comm.node_id);
        if (newNodeId !== undefined) {
          insertComm.run(newNodeId, comm.community_id, comm.modularity_class);
        }
      }
    }
  } finally {
    closeDatabase(serviceDb);
  }
}

// ---------------------------------------------------------------------------
// Event emission helper (inline for build isolation per D-33)
// ---------------------------------------------------------------------------

/**
 * Append a JSON-line event to events.log for dashboard WebSocket broadcasting.
 * Events are observability, not critical path -- errors are swallowed.
 */
function emitEvent(projectRoot: string, event: Record<string, unknown>): void {
  try {
    const eventsPath = path.join(getCodescopePath(projectRoot), "events.log");
    fs.appendFileSync(
      eventsPath,
      JSON.stringify({ ...event, ts: new Date().toISOString() }) + "\n",
    );
  } catch {
    // Dashboard events are observability, not critical path. Swallow errors.
  }
}

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

  // ---- Step 0: Validate grammar files exist ----
  const grammarCheck = validateGrammars();
  if (!grammarCheck.ok) {
    throw new Error(
      `WASM grammar files missing — graph building will fail.\n` +
        `Missing: ${grammarCheck.missing.join(", ")}\n` +
        `Run 'npm run build:grammars' or reinstall the CodeScope plugin.`
    );
  }

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
  emitEvent(projectRoot, { type: "bootstrap:progress", stage: "Scanning services", percentage: 10 });
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

  // ---- Step 5a: Discover workspace aliases for import resolution ----
  let workspaceAliases: Record<string, string> = {};
  if (scoutResult.projectType === "monorepo" || allServices.length > 1) {
    try {
      const { discoverWorkspacePackages, buildWorkspaceAliases } = await import(
        "../resolver/workspace.js"
      );
      const pnpmPath = path.join(projectRoot, "pnpm-workspace.yaml");
      let patterns: string[] = [];
      if (fs.existsSync(pnpmPath)) {
        const yaml = await import("js-yaml");
        const content = fs.readFileSync(pnpmPath, "utf-8");
        const ws = yaml.load(content) as { packages?: string[] } | null;
        patterns =
          ws?.packages?.filter((p: string) => !p.startsWith("!")) ?? [];
      }
      if (patterns.length === 0) {
        const pkgPath = path.join(projectRoot, "package.json");
        if (fs.existsSync(pkgPath)) {
          const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
          patterns = Array.isArray(pkg.workspaces)
            ? pkg.workspaces
            : (pkg.workspaces?.packages ?? []);
        }
      }
      if (patterns.length > 0) {
        const packages = discoverWorkspacePackages(projectRoot, patterns);
        workspaceAliases = buildWorkspaceAliases(projectRoot, packages);
      }
    } catch {
      // Workspace discovery is optional -- ignore errors (module may not exist yet)
    }
  }

  // ---- Step 5 (monorepo only): Root-level graph build ----
  let rootGraphResult: BuildGraphResult | undefined;
  if (scoutResult.projectType === "monorepo") {
    progress("## Building root-level import graph...");
    emitEvent(projectRoot, { type: "bootstrap:progress", stage: "Building root graph", percentage: 20 });
    const graphStartMs = Date.now();
    rootGraphResult = await buildGraph({
      projectRoot,
      dbPath: getGraphDbPath(projectRoot),
      batchDir: path.join(codescopeDir, "batch"),
      workspaceAliases,
    });
    timingBreakdown["graph:root"] = Date.now() - graphStartMs;
    progress(
      `- [x] Root graph built (${rootGraphResult.nodesCreated} nodes, ${rootGraphResult.edgesCreated} edges, ${((Date.now() - graphStartMs) / 1000).toFixed(1)}s)`,
    );
  }

  // ---- Step 5b: Per-service analysis squads ----
  const serviceResults: Array<{
    name: string;
    status: "full" | "lightweight";
    durationMs: number;
    nodesCreated: number;
    edgesCreated: number;
    totalImports: number;
    communitiesDetected: number;
    conventionsDetected: number;
  }> = [];

  for (const service of servicesToAnalyze) {
    const serviceStartMs = Date.now();
    progress(`## Running analysis squad: ${service.name}`);
    emitEvent(projectRoot, { type: "bootstrap:progress", stage: `Running squad: ${service.name}`, percentage: 25 });

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
      workspaceAliases,
      // Monorepo: use root-level prebuilt graph instead of building per-service
      ...(scoutResult.projectType === "monorepo" && rootGraphResult
        ? {
            prebuiltDbPath: getGraphDbPath(projectRoot),
            prebuiltResult: {
              filesProcessed: rootGraphResult.filesProcessed,
              nodesCreated: rootGraphResult.nodesCreated,
              edgesCreated: rootGraphResult.edgesCreated,
              errors: rootGraphResult.errors,
              totalImports: rootGraphResult.totalImports,
            },
          }
        : {}),
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
      totalImports: riskResult.totalImports,
      communitiesDetected: riskResult.communitiesDetected,
      conventionsDetected: convResult.conventionsDetected,
    });
  }

  // NOTE: Per-service graph merging (old Step 5b) removed — monorepos now build
  // a single root-level graph. mergeServiceGraph remains exported for external use.

  // Add lightweight services to results
  for (const service of lightweightServices) {
    serviceResults.push({
      name: service.name,
      status: "lightweight",
      durationMs: 0,
      nodesCreated: 0,
      edgesCreated: 0,
      totalImports: 0,
      communitiesDetected: 0,
      conventionsDetected: 0,
    });
  }

  // ---- Step 6: Cross-service synthesis ----
  progress("## Synthesizing cross-service intelligence...");
  emitEvent(projectRoot, { type: "bootstrap:progress", stage: "Building graph", percentage: 60 });
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
  emitEvent(projectRoot, { type: "bootstrap:progress", stage: "Computing analytics", percentage: 75 });
  const readinessStartMs = Date.now();

  // ---- Gather readiness input from ACTUAL bootstrap data (per D-13) ----
  // Query graph DB for real file counts instead of hardcoded approximations
  let totalSourceFiles = 0;
  let typedFiles = 0;
  let testFiles = 0;
  const graphDbPath = getGraphDbPath(projectRoot);
  if (fs.existsSync(graphDbPath)) {
    const readinessDb = openDatabase(graphDbPath);
    try {
      const totalRow = readinessDb
        .prepare("SELECT COUNT(*) as count FROM nodes WHERE kind = 'file'")
        .get() as { count: number } | undefined;
      totalSourceFiles = totalRow?.count ?? 0;

      const typedRow = readinessDb
        .prepare(
          "SELECT COUNT(*) as count FROM nodes WHERE kind = 'file' AND (language = 'typescript' OR language = 'tsx')",
        )
        .get() as { count: number } | undefined;
      typedFiles = typedRow?.count ?? 0;

      const testRow = readinessDb
        .prepare(
          "SELECT COUNT(*) as count FROM nodes WHERE kind = 'file' AND is_test = 1",
        )
        .get() as { count: number } | undefined;
      testFiles = testRow?.count ?? 0;
    } finally {
      closeDatabase(readinessDb);
    }
  }

  // Count HIGH-CONF conventions from actual detector output
  const totalConventions = serviceResults.reduce(
    (sum, s) => sum + s.conventionsDetected,
    0,
  );
  let highConfidenceConventions = 0;
  for (const service of servicesToAnalyze) {
    const convPath = path.join(
      codescopeDir,
      "services",
      service.name,
      "conventions.md",
    );
    if (fs.existsSync(convPath)) {
      const convContent = fs.readFileSync(convPath, "utf-8");
      const parsed = parseDetectorConventions(convContent);
      highConfidenceConventions += parsed.filter(
        (c) => c.confidence === "HIGH-CONF",
      ).length;
    }
  }
  // Also check top-level conventions.md
  const topConvPath = path.join(codescopeDir, "conventions.md");
  if (fs.existsSync(topConvPath)) {
    const topContent = fs.readFileSync(topConvPath, "utf-8");
    const topParsed = parseDetectorConventions(topContent);
    highConfidenceConventions += topParsed.filter(
      (c) => c.confidence === "HIGH-CONF",
    ).length;
  }

  // Cap highConfidenceConventions to prevent readiness inflation (D-25)
  // Adding framework rules can increase HIGH-CONF count significantly
  // on small projects, inflating the convention dimension artificially.
  highConfidenceConventions = Math.min(highConfidenceConventions, totalSourceFiles);

  // edgesCreated IS the resolved import count (edges only created when resolved)
  // For monorepos, use root graph result directly; for single projects, sum per-service
  const totalEdgesAll = rootGraphResult
    ? rootGraphResult.edgesCreated
    : serviceResults.reduce((sum, s) => sum + s.edgesCreated, 0);
  const resolvedImports = totalEdgesAll;

  // R5 FIX: totalImports from AST count, not from resolved edges
  const totalImportStatements = rootGraphResult
    ? rootGraphResult.totalImports
    : serviceResults.reduce(
        (sum, s) => sum + (s.totalImports ?? s.edgesCreated),
        0,
      );

  // CRITICAL warning when 0 edges produced from a non-trivial number of files
  if (totalEdgesAll === 0 && totalSourceFiles > 5) {
    warnings.push(
      `CRITICAL: Import graph produced 0 edges from ${totalSourceFiles} files. ` +
      `Blast radius, impact prediction, and review tools cannot assess risk accurately. ` +
      `Likely causes: (1) no import/require statements found in source files, ` +
      `(2) all imports resolve to external packages outside the project.`
    );
  }

  const previousMeta = readBootstrapMeta(projectRoot);
  const readinessScore = computeReadiness({
    totalSourceFiles: Math.max(totalSourceFiles, 1),
    typedFiles,
    testFiles,
    highConfidenceConventions,
    totalConventions,
    resolvedImports,
    totalImports: totalImportStatements,
  });

  // D-03: Diagnostic steps when import_graph_health is 0%
  if (readinessScore.dimensions.importGraphHealth.percent === 0) {
    warnings.push(
      "Import Graph Health: 0% -- No import relationships were resolved between source files. " +
        "Diagnostic: (1) Check that source files contain import/require statements pointing to other project files (not just external packages). " +
        "(2) For TypeScript projects, verify tsconfig.json exists with correct path aliases. " +
        "(3) For CommonJS projects, ensure require() calls use string literals (dynamic require is not supported). " +
        "Impact: blast_radius, predict_impact, and review tools cannot assess change risk without import edges.",
    );
  }

  const readinessPath = writeReadinessArtifact(codescopeDir, readinessScore);
  timingBreakdown["readiness"] = Date.now() - readinessStartMs;
  artifacts.push({
    path: readinessPath,
    description: "AI readiness score",
  });

  emitEvent(projectRoot, { type: "bootstrap:progress", stage: "Generating artifacts", percentage: 85 });

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
  emitEvent(projectRoot, { type: "bootstrap:progress", stage: "Storing readiness", percentage: 95 });
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
  // For monorepos, use root graph result for node/edge counts; communities still from per-service analytics
  const totalNodes = rootGraphResult
    ? rootGraphResult.nodesCreated
    : serviceResults.reduce((sum, s) => sum + s.nodesCreated, 0);
  const totalEdges = rootGraphResult
    ? rootGraphResult.edgesCreated
    : serviceResults.reduce((sum, s) => sum + s.edgesCreated, 0);
  const totalCommunities = serviceResults.reduce(
    (sum, s) => sum + s.communitiesDetected,
    0,
  );
  const conventionsDetected = serviceResults.reduce(
    (sum, s) => sum + s.conventionsDetected,
    0,
  );

  // Emit completion events for dashboard WebSocket feed (D-32)
  emitEvent(projectRoot, { type: "bootstrap:progress", stage: "Complete", percentage: 100 });
  emitEvent(projectRoot, { type: "graph:updated" });
  emitEvent(projectRoot, { type: "readiness:snapshot" });

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
