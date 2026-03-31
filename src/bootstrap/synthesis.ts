import * as fs from "node:fs";
import * as path from "node:path";
import { loadGraphFromSQLite } from "../graph/analytics.js";
import { openDatabase, closeDatabase } from "../graph/database.js";
import { getGraphDbPath } from "../utils/paths.js";
import { parseDetectorConventions } from "../conventions/parser.js";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface SynthesisOptions {
  projectRoot: string;
  outputDir: string;
  services: Array<{
    name: string;
    path: string;
    loc: number;
    framework: string;
    analysisStatus: "full" | "lightweight";
  }>;
}

export interface CrossServiceDep {
  from: string;
  to: string;
  sharedTypes: string[];
  importCount: number;
}

export interface SynthesisResult {
  crossServiceMapPath: string;
  dependencies: CrossServiceDep[];
  mergedConventions: Array<{
    name: string;
    adoption: Record<string, number>;
  }>;
  durationMs: number;
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

/**
 * Runs cross-service synthesis: detects cross-service import edges,
 * counts shared types per service pair, merges conventions with
 * per-service adoption tags, and writes cross-service-map.md.
 *
 * Per D-10: Captures shared type imports only (most reliable signal).
 * Per D-11: Written as markdown artifact at outputDir/cross-service-map.md.
 */
export async function runSynthesis(
  options: SynthesisOptions,
): Promise<SynthesisResult> {
  const startMs = Date.now();
  const { projectRoot, outputDir, services } = options;

  fs.mkdirSync(outputDir, { recursive: true });

  // ---- Step 1: Load graph and detect cross-service edges ----
  let dependencies: CrossServiceDep[] = [];

  try {
    const dbPath = getGraphDbPath(projectRoot);
    if (fs.existsSync(dbPath)) {
      const db = openDatabase(dbPath);
      try {
        const graph = loadGraphFromSQLite(db);
        dependencies = detectCrossServiceEdges(graph, services);
      } finally {
        closeDatabase(db);
      }
    }
  } catch {
    // If graph loading fails, proceed with empty dependencies
    dependencies = [];
  }

  // ---- Step 2: Merge per-service conventions ----
  const mergedConventions = mergeConventions(outputDir, services);

  // ---- Step 3: Write cross-service-map.md ----
  const crossServiceMapPath = writeCrossServiceMap(
    outputDir,
    services,
    dependencies,
    mergedConventions,
  );

  const durationMs = Date.now() - startMs;

  return {
    crossServiceMapPath,
    dependencies,
    mergedConventions,
    durationMs,
  };
}

// ---------------------------------------------------------------------------
// Cross-service edge detection
// ---------------------------------------------------------------------------

/**
 * Maps a file path to its owning service by checking which service path
 * prefix matches.
 */
function fileToService(
  filePath: string,
  services: SynthesisOptions["services"],
): string | null {
  for (const service of services) {
    const normalizedServicePath = service.path.replace(/\/$/, "");
    if (
      normalizedServicePath === "." ||
      filePath.startsWith(normalizedServicePath + "/") ||
      filePath === normalizedServicePath
    ) {
      // For root service ("."), only match if no other service matches
      if (normalizedServicePath === ".") continue;
      return service.name;
    }
  }
  // If no specific service matched, check for root service
  const rootService = services.find((s) => s.path === "." || s.path === "./");
  return rootService?.name ?? null;
}

/**
 * Detects cross-service import edges in the graph.
 * An edge is cross-service when its source node's file path belongs to
 * a different service than its target node's file path.
 */
function detectCrossServiceEdges(
  graph: import("graphology").DirectedGraph,
  services: SynthesisOptions["services"],
): CrossServiceDep[] {
  // Accumulator: "fromService|toService" -> { sharedTypes, importCount }
  const depMap = new Map<
    string,
    { from: string; to: string; sharedTypes: Set<string>; importCount: number }
  >();

  graph.forEachEdge(
    (
      _edge,
      _attrs,
      source,
      target,
      sourceAttrs,
      targetAttrs,
    ) => {
      const sourceFilePath = (sourceAttrs?.filePath as string) ?? "";
      const targetFilePath = (targetAttrs?.filePath as string) ?? "";

      const sourceService = fileToService(sourceFilePath, services);
      const targetService = fileToService(targetFilePath, services);

      // Only count edges that cross service boundaries
      if (
        sourceService &&
        targetService &&
        sourceService !== targetService
      ) {
        const key = `${sourceService}|${targetService}`;
        const existing = depMap.get(key);
        const targetName = (targetAttrs?.name as string) ?? "";

        if (existing) {
          existing.importCount++;
          if (targetName) existing.sharedTypes.add(targetName);
        } else {
          const sharedTypes = new Set<string>();
          if (targetName) sharedTypes.add(targetName);
          depMap.set(key, {
            from: sourceService,
            to: targetService,
            sharedTypes,
            importCount: 1,
          });
        }
      }
    },
  );

  return Array.from(depMap.values()).map((d) => ({
    from: d.from,
    to: d.to,
    sharedTypes: Array.from(d.sharedTypes),
    importCount: d.importCount,
  }));
}

// ---------------------------------------------------------------------------
// Convention merging per D-10
// ---------------------------------------------------------------------------

/**
 * Reads per-service conventions.md files and merges them with
 * per-service adoption tags. Uses the canonical parseDetectorConventions
 * parser to handle h3+table format written by the convention detector.
 */
function mergeConventions(
  outputDir: string,
  services: SynthesisOptions["services"],
): Array<{ name: string; adoption: Record<string, number> }> {
  const allConventions = new Map<string, Record<string, number>>();

  for (const service of services) {
    const convPath = path.join(
      outputDir,
      "services",
      service.name,
      "conventions.md",
    );
    if (!fs.existsSync(convPath)) continue;

    const content = fs.readFileSync(convPath, "utf-8");
    const parsed = parseDetectorConventions(content);

    for (const conv of parsed) {
      const existing = allConventions.get(conv.name);
      if (existing) {
        existing[service.name] = conv.adoption_pct;
      } else {
        allConventions.set(conv.name, { [service.name]: conv.adoption_pct });
      }
    }
  }

  return Array.from(allConventions.entries()).map(([name, adoption]) => ({
    name,
    adoption,
  }));
}

// ---------------------------------------------------------------------------
// Cross-service map writer per UI-SPEC format
// ---------------------------------------------------------------------------

function writeCrossServiceMap(
  outputDir: string,
  services: SynthesisOptions["services"],
  dependencies: CrossServiceDep[],
  mergedConventions: Array<{ name: string; adoption: Record<string, number> }>,
): string {
  const filePath = path.join(outputDir, "cross-service-map.md");
  const lines: string[] = [];

  lines.push("# Cross-Service Dependency Map");
  lines.push("");
  lines.push("## Services");
  lines.push("");
  lines.push("| Service | Path | LOC | Framework | Analysis |");
  lines.push("|---------|------|-----|-----------|----------|");
  for (const svc of services) {
    const analysis =
      svc.analysisStatus === "full" ? "Full" : "Lightweight";
    lines.push(
      `| ${svc.name} | ${svc.path} | ${svc.loc} | ${svc.framework || "N/A"} | ${analysis} |`,
    );
  }

  lines.push("");
  lines.push("## Dependencies");
  lines.push("");
  if (dependencies.length === 0) {
    lines.push(
      "No cross-service dependencies detected. Services appear to be independent.",
    );
  } else {
    lines.push("| From | To | Shared Types | Import Count |");
    lines.push("|------|-----|-------------|--------------|");
    for (const dep of dependencies) {
      lines.push(
        `| ${dep.from} | ${dep.to} | ${dep.sharedTypes.join(", ")} | ${dep.importCount} |`,
      );
    }
  }

  lines.push("");
  lines.push("## Merged Conventions");
  lines.push("");
  if (mergedConventions.length === 0) {
    lines.push("No merged conventions detected.");
  } else {
    const serviceNames = services.map((s) => s.name);
    const header = `| Convention | ${serviceNames.join(" | ")} |`;
    const divider = `|${serviceNames.map(() => "---").join("|")}|---|`;
    lines.push(header);
    lines.push(divider);
    for (const conv of mergedConventions) {
      const values = serviceNames.map(
        (sn) => (conv.adoption[sn] !== undefined ? `${conv.adoption[sn]}%` : "N/A"),
      );
      lines.push(`| ${conv.name} | ${values.join(" | ")} |`);
    }
  }
  lines.push("");

  fs.writeFileSync(filePath, lines.join("\n"), "utf-8");
  return filePath;
}
