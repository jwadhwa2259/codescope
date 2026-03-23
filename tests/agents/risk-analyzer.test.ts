import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import * as crypto from "node:crypto";

import {
  runRiskAnalyzer,
  type RiskAnalyzerOptions,
  type RiskAnalyzerResult,
} from "../../src/agents/risk-analyzer.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTmpDir(name?: string): string {
  const dirName = name
    ? `codescope-risk-test-${name}-${crypto.randomUUID()}`
    : `codescope-risk-test-${crypto.randomUUID()}`;
  const dir = path.join(os.tmpdir(), dirName);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/**
 * Create a fixture project with interconnected TypeScript files.
 * Files import each other so the graph has edges.
 */
function createFixtureProject(dir: string): void {
  // package.json
  fs.writeFileSync(
    path.join(dir, "package.json"),
    JSON.stringify({ name: "test-project", version: "1.0.0" }, null, 2),
  );
  fs.writeFileSync(path.join(dir, "tsconfig.json"), "{}");

  const srcDir = path.join(dir, "src");
  fs.mkdirSync(srcDir, { recursive: true });

  // utils.ts -- shared utility (many things will import this)
  fs.writeFileSync(
    path.join(srcDir, "utils.ts"),
    `export function formatDate(d: Date): string {
  return d.toISOString();
}

export function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
`,
  );

  // types.ts -- type definitions
  fs.writeFileSync(
    path.join(srcDir, "types.ts"),
    `export interface User {
  id: string;
  name: string;
  email: string;
}

export interface Config {
  debug: boolean;
  maxRetries: number;
}
`,
  );

  // service.ts -- imports utils and types
  fs.writeFileSync(
    path.join(srcDir, "service.ts"),
    `import { formatDate, capitalize } from "./utils";
import { User } from "./types";

export function getUser(id: string): User {
  return { id, name: capitalize("user"), email: "test@test.com" };
}

export function getUserDate(user: User): string {
  return formatDate(new Date());
}
`,
  );

  // handler.ts -- imports service and utils
  fs.writeFileSync(
    path.join(srcDir, "handler.ts"),
    `import { getUser } from "./service";
import { clamp } from "./utils";
import { Config } from "./types";

export function handleRequest(id: string, config: Config): void {
  const user = getUser(id);
  const retries = clamp(config.maxRetries, 1, 10);
  console.log(user, retries);
}
`,
  );

  // index.ts -- imports handler and service
  fs.writeFileSync(
    path.join(srcDir, "index.ts"),
    `import { handleRequest } from "./handler";
import { getUser } from "./service";

export { handleRequest, getUser };
`,
  );
}

/**
 * Create a minimal project with no imports (isolated files).
 */
function createMinimalProject(dir: string): void {
  fs.writeFileSync(
    path.join(dir, "package.json"),
    JSON.stringify({ name: "minimal", version: "1.0.0" }, null, 2),
  );
  fs.writeFileSync(path.join(dir, "tsconfig.json"), "{}");
  const srcDir = path.join(dir, "src");
  fs.mkdirSync(srcDir, { recursive: true });
  fs.writeFileSync(
    path.join(srcDir, "solo.ts"),
    `export const value = 42;\n`,
  );
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe("Risk Analyzer Agent", () => {
  let projectDir: string;
  let outputDir: string;
  let dbPath: string;
  let batchDir: string;

  beforeEach(() => {
    projectDir = makeTmpDir("project");
    outputDir = makeTmpDir("output");
    dbPath = path.join(makeTmpDir("db"), "graph.db");
    batchDir = makeTmpDir("batch");
  });

  afterEach(() => {
    // Clean up temp dirs
    for (const dir of [projectDir, outputDir, path.dirname(dbPath), batchDir]) {
      try {
        fs.rmSync(dir, { recursive: true, force: true });
      } catch {
        // Ignore cleanup errors
      }
    }
  });

  it("should produce danger-zones.md with '# Danger Zones' title", async () => {
    createFixtureProject(projectDir);
    const result = await runRiskAnalyzer({
      projectRoot: projectDir,
      outputDir,
      dbPath,
      batchDir,
    });
    const content = fs.readFileSync(result.dangerZonesPath, "utf-8");
    expect(content).toContain("# Danger Zones");
  });

  it("should contain YAML frontmatter with required keys", async () => {
    createFixtureProject(projectDir);
    const result = await runRiskAnalyzer({
      projectRoot: projectDir,
      outputDir,
      dbPath,
      batchDir,
    });
    const content = fs.readFileSync(result.dangerZonesPath, "utf-8");

    // Extract frontmatter
    const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
    expect(fmMatch).not.toBeNull();
    const frontmatter = fmMatch![1];

    expect(frontmatter).toContain("generated:");
    expect(frontmatter).toContain('generator: "risk-analyzer"');
    expect(frontmatter).toContain("total_nodes:");
    expect(frontmatter).toContain("total_edges:");
    expect(frontmatter).toContain("communities_detected:");
  });

  it("should contain '## High-Centrality Nodes' section with ranked table", async () => {
    createFixtureProject(projectDir);
    const result = await runRiskAnalyzer({
      projectRoot: projectDir,
      outputDir,
      dbPath,
      batchDir,
    });
    const content = fs.readFileSync(result.dangerZonesPath, "utf-8");

    expect(content).toContain("## High-Centrality Nodes");
    // Table header with correct columns
    expect(content).toContain("| Rank | File | In-Degree | Communities Touched | Risk Score |");
  });

  it("should contain '## Cross-Boundary Dependencies' section", async () => {
    createFixtureProject(projectDir);
    const result = await runRiskAnalyzer({
      projectRoot: projectDir,
      outputDir,
      dbPath,
      batchDir,
    });
    const content = fs.readFileSync(result.dangerZonesPath, "utf-8");

    expect(content).toContain("## Cross-Boundary Dependencies");
  });

  it("should contain '## Risk Summary' section", async () => {
    createFixtureProject(projectDir);
    const result = await runRiskAnalyzer({
      projectRoot: projectDir,
      outputDir,
      dbPath,
      batchDir,
    });
    const content = fs.readFileSync(result.dangerZonesPath, "utf-8");

    expect(content).toContain("## Risk Summary");
    expect(content).toContain("**Total files analyzed:**");
    expect(content).toContain("**Graph nodes:**");
    expect(content).toContain("**Graph edges:**");
    expect(content).toContain("**Communities detected:**");
    expect(content).toContain("**Danger zone files:**");
  });

  it("should rank danger zones by risk score (highest first)", async () => {
    createFixtureProject(projectDir);
    const result = await runRiskAnalyzer({
      projectRoot: projectDir,
      outputDir,
      dbPath,
      batchDir,
    });
    const content = fs.readFileSync(result.dangerZonesPath, "utf-8");

    // Extract table rows from High-Centrality Nodes section
    const tableSection = content.split("## High-Centrality Nodes")[1]?.split("##")[0] ?? "";
    const rowPattern = /\|\s*(\d+)\s*\|[^|]+\|[^|]+\|[^|]+\|\s*([\d.]+)\s*\|/g;
    const scores: number[] = [];
    let match;
    while ((match = rowPattern.exec(tableSection)) !== null) {
      scores.push(parseFloat(match[2]));
    }

    // If we have scores, verify they are in descending order
    if (scores.length > 1) {
      for (let i = 1; i < scores.length; i++) {
        expect(scores[i]).toBeLessThanOrEqual(scores[i - 1]);
      }
    }
  });

  it("should return result with correct graph stats", async () => {
    createFixtureProject(projectDir);
    const result = await runRiskAnalyzer({
      projectRoot: projectDir,
      outputDir,
      dbPath,
      batchDir,
    });

    expect(result.nodesCreated).toBeGreaterThan(0);
    expect(result.edgesCreated).toBeGreaterThan(0);
    expect(result.communitiesDetected).toBeGreaterThanOrEqual(0);
    expect(result.dangerZoneCount).toBeGreaterThanOrEqual(0);
    expect(result.durationMs).toBeGreaterThan(0);
    expect(result.dangerZonesPath).toContain("danger-zones.md");
  });

  it("should have correct table columns in high-centrality nodes", async () => {
    createFixtureProject(projectDir);
    const result = await runRiskAnalyzer({
      projectRoot: projectDir,
      outputDir,
      dbPath,
      batchDir,
    });
    const content = fs.readFileSync(result.dangerZonesPath, "utf-8");

    // Check the separator row follows the header
    expect(content).toContain("|------|------|-----------|---------------------|------------|");
  });

  it("should produce danger-zones.md with empty state message for minimal project", async () => {
    createMinimalProject(projectDir);
    const result = await runRiskAnalyzer({
      projectRoot: projectDir,
      outputDir,
      dbPath,
      batchDir,
    });
    const content = fs.readFileSync(result.dangerZonesPath, "utf-8");

    expect(content).toContain("# Danger Zones");
    // Minimal project with no imports produces insufficient edges message
    expect(content).toContain(
      "Knowledge graph contains insufficient edges for danger zone analysis.",
    );
  });
});
