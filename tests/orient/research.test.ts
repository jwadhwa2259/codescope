import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { DirectedGraph } from "graphology";

// Mock getGraph so we don't need a real SQLite database
vi.mock("../../src/graph/cache.js", () => {
  const { DirectedGraph } = require("graphology") as typeof import("graphology");

  function buildMockGraph(): {
    graph: InstanceType<typeof DirectedGraph>;
    centralities: Map<string, number>;
  } {
    const graph = new DirectedGraph();

    // Internal source files
    graph.addNode("f1", { name: "auth.ts", kind: "file", filePath: "src/auth.ts", loc: 200, community: 0 });
    graph.addNode("f2", { name: "user.ts", kind: "file", filePath: "src/user.ts", loc: 150, community: 0 });
    graph.addNode("f3", { name: "database.ts", kind: "file", filePath: "src/database.ts", loc: 300, community: 1 });
    graph.addNode("f4", { name: "router.ts", kind: "file", filePath: "src/router.ts", loc: 100, community: 2 });
    graph.addNode("f5", { name: "utils.ts", kind: "file", filePath: "src/utils.ts", loc: 50, community: 3 });

    // External library nodes (node_modules)
    graph.addNode("lib1", { name: "express", kind: "module", filePath: "node_modules/express/index.js", loc: 0, community: null });
    graph.addNode("lib2", { name: "jsonwebtoken", kind: "module", filePath: "node_modules/jsonwebtoken/index.js", loc: 0, community: null });
    graph.addNode("lib3", { name: "lodash", kind: "module", filePath: "node_modules/lodash/index.js", loc: 0, community: null });

    // IMPORTS edges from source files to libraries
    graph.mergeEdge("f1", "lib2", { kind: "IMPORTS", weight: 1 }); // auth imports jsonwebtoken
    graph.mergeEdge("f4", "lib1", { kind: "IMPORTS", weight: 1 }); // router imports express
    graph.mergeEdge("f2", "lib1", { kind: "IMPORTS", weight: 1 }); // user imports express
    graph.mergeEdge("f3", "lib1", { kind: "IMPORTS", weight: 1 }); // database imports express
    graph.mergeEdge("f5", "lib3", { kind: "IMPORTS", weight: 1 }); // utils imports lodash

    // Internal edges
    graph.mergeEdge("f1", "f2", { kind: "IMPORTS", weight: 1 });
    graph.mergeEdge("f4", "f1", { kind: "IMPORTS", weight: 1 });
    graph.mergeEdge("f2", "f3", { kind: "IMPORTS", weight: 1 });

    const centralities = new Map<string, number>();
    centralities.set("f1", 0.8);  // auth is high centrality
    centralities.set("f2", 0.5);
    centralities.set("f3", 0.9);  // database is highest
    centralities.set("f4", 0.3);
    centralities.set("f5", 0.05); // utils is low
    centralities.set("lib1", 0.6);
    centralities.set("lib2", 0.3);
    centralities.set("lib3", 0.02);

    return { graph, centralities };
  }

  return {
    getGraph: vi.fn(async () => {
      const mock = buildMockGraph();
      return {
        graph: mock.graph,
        centralities: mock.centralities,
        loadedAt: Date.now(),
      };
    }),
    invalidateCache: vi.fn(),
  };
});

// Mock loadConfig
vi.mock("../../src/config/loader.js", () => ({
  loadConfig: vi.fn(() => ({
    schema_version: 1,
    orient: {
      max_research_time: 30,
      research_sources: ["context7", "web_search"],
      clarification: "auto",
      verbosity: "brief",
    },
    execute: {
      max_agents_concurrent: 3,
    },
  })),
}));

// ---------------------------------------------------------------------------
// Imports under test (after mocks)
// ---------------------------------------------------------------------------
import {
  extractResearchTopics,
  rankTopics,
  buildResearchPrompt,
  parseResearchOutput,
  writeResearchArtifact,
  runResearch,
} from "../../src/orient/research.js";
import type { ResearchOptions } from "../../src/orient/research.js";
import type {
  AffectedFile,
  AnalysisResult,
  ScopeContract,
  ResearchOutput,
  ResearchTopic,
} from "../../src/orient/types.js";

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

function makeAffectedFiles(): AffectedFile[] {
  return [
    { filePath: "src/auth.ts", risk: "HIGH", centrality: 0.8, community: "0" },
    { filePath: "src/user.ts", risk: "MEDIUM", centrality: 0.5, community: "0" },
    { filePath: "src/database.ts", risk: "HIGH", centrality: 0.9, community: "1" },
    { filePath: "src/router.ts", risk: "MEDIUM", centrality: 0.3, community: "2" },
    { filePath: "src/utils.ts", risk: "LOW", centrality: 0.05, community: "3" },
  ];
}

function makeScopeContract(): ScopeContract {
  return {
    task: "Add JWT authentication to API routes",
    taskSlug: "add-jwt-auth",
    createdAt: "2026-03-24T00:00:00Z",
    status: "APPROVED",
    inScope: ["JWT token validation", "Auth middleware", "Protected routes"],
    outOfScope: ["User registration", "OAuth integration"],
    affectedFiles: makeAffectedFiles(),
    assumptions: ["Using existing express setup"],
    conventionsInScope: ["error-handling-pattern"],
    riskFlags: [{ filePath: "src/auth.ts", reason: "High centrality danger zone" }],
  };
}

function makeAnalysisResult(): AnalysisResult {
  return {
    affectedFiles: makeAffectedFiles(),
    blastRadiusFiles: [
      { filePath: "src/auth.ts", hopDistance: 0, riskLevel: "HIGH" },
      { filePath: "src/user.ts", hopDistance: 1, riskLevel: "MEDIUM" },
    ],
    conventionMatches: ["error-handling-pattern"],
    testFiles: ["tests/auth.test.ts"],
    crossCommunityImpact: [
      { communityId: 0, nodeCount: 10, affectedCount: 2 },
      { communityId: 1, nodeCount: 5, affectedCount: 1 },
    ],
    durationMs: 50,
  };
}

function makeResearchMd(): string {
  return `# Research: add-jwt-auth

**Completed:** 2026-03-24T00:00:00Z
**Topics researched:** 2
**Topics skipped (low-impact):** 1

## Relevant APIs

### jsonwebtoken

Use \`jwt.sign(payload, secret, options)\` and \`jwt.verify(token, secret)\`.

### express

Use \`app.use()\` for middleware registration.

## Best Practices

- Always validate token expiry
- Use refresh tokens for long-lived sessions

## Known Issues / Pitfalls

- jsonwebtoken 9.x changed default algorithm to ES256

## Version-Specific Notes

- express 4.x vs 5.x middleware signature change

## Skipped Topics

- lodash: low graph impact (0.02, 1 files using it)
`;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("extractResearchTopics", () => {
  it("identifies external libraries from affected file imports in graph", async () => {
    const topics = await extractResearchTopics("/fake/project", makeAffectedFiles());
    const names = topics.map((t) => t.name);
    // auth.ts imports jsonwebtoken, router.ts/user.ts/database.ts import express, utils.ts imports lodash
    expect(names).toContain("jsonwebtoken");
    expect(names).toContain("express");
    expect(names).toContain("lodash");
  });

  it("does not include internal modules as research topics", async () => {
    const topics = await extractResearchTopics("/fake/project", makeAffectedFiles());
    const names = topics.map((t) => t.name);
    // Internal files should NOT appear
    expect(names).not.toContain("auth.ts");
    expect(names).not.toContain("user.ts");
    expect(names).not.toContain("database.ts");
  });

  it("deduplicates libraries and takes max impactScore", async () => {
    const topics = await extractResearchTopics("/fake/project", makeAffectedFiles());
    const expressTopics = topics.filter((t) => t.name === "express");
    expect(expressTopics).toHaveLength(1);
    // express is imported by 3 files (router 0.3, user 0.5, database 0.9),
    // impactScore = max(centrality * fileCount for each importing file)
    expect(expressTopics[0].impactScore).toBeGreaterThan(0);
  });

  it("sorts topics by impactScore descending", async () => {
    const topics = await extractResearchTopics("/fake/project", makeAffectedFiles());
    for (let i = 1; i < topics.length; i++) {
      expect(topics[i].impactScore).toBeLessThanOrEqual(topics[i - 1].impactScore);
    }
  });
});

describe("rankTopics", () => {
  it("marks high-impact topics (score >= 0.5) for context7 + web_search", () => {
    const topics: ResearchTopic[] = [
      { name: "express", impactScore: 0.7, source: "skipped" },
    ];
    const ranked = rankTopics(topics, { researchSources: ["context7", "web_search"], maxResearchTime: 30 });
    // Per D-11: high-impact => context7 source (context7 first)
    expect(ranked[0].source).toBe("context7");
  });

  it("marks mid-impact topics (0.1 <= score < 0.5) for context7 only", () => {
    const topics: ResearchTopic[] = [
      { name: "jsonwebtoken", impactScore: 0.3, source: "skipped" },
    ];
    const ranked = rankTopics(topics, { researchSources: ["context7", "web_search"], maxResearchTime: 30 });
    expect(ranked[0].source).toBe("context7");
  });

  it("marks low-impact topics (score < 0.1) as skipped with reason", () => {
    const topics: ResearchTopic[] = [
      { name: "lodash", impactScore: 0.02, source: "skipped" },
    ];
    const ranked = rankTopics(topics, { researchSources: ["context7", "web_search"], maxResearchTime: 30 });
    expect(ranked[0].source).toBe("skipped");
    expect(ranked[0].reason).toContain("low graph impact");
  });

  it("upgrades mid-impact to web_search if context7 not in sources", () => {
    const topics: ResearchTopic[] = [
      { name: "jsonwebtoken", impactScore: 0.3, source: "skipped" },
    ];
    const ranked = rankTopics(topics, { researchSources: ["web_search"], maxResearchTime: 30 });
    expect(ranked[0].source).toBe("web_search");
  });

  it("downgrades high-impact to context7 only if web_search not in sources", () => {
    const topics: ResearchTopic[] = [
      { name: "express", impactScore: 0.7, source: "skipped" },
    ];
    const ranked = rankTopics(topics, { researchSources: ["context7"], maxResearchTime: 30 });
    expect(ranked[0].source).toBe("context7");
  });
});

describe("buildResearchPrompt", () => {
  it("includes task description in the prompt", () => {
    const topics: ResearchTopic[] = [
      { name: "express", impactScore: 0.7, source: "context7" },
    ];
    const prompt = buildResearchPrompt(
      "Add JWT authentication",
      topics,
      makeScopeContract(),
      { maxResearchTime: 30 },
    );
    expect(prompt).toContain("Add JWT authentication");
  });

  it("includes non-skipped topics with Context7 instructions", () => {
    const topics: ResearchTopic[] = [
      { name: "express", impactScore: 0.7, source: "context7" },
      { name: "lodash", impactScore: 0.02, source: "skipped", reason: "low graph impact" },
    ];
    const prompt = buildResearchPrompt(
      "Add JWT authentication",
      topics,
      makeScopeContract(),
      { maxResearchTime: 30 },
    );
    expect(prompt).toContain("express");
    // Skipped topics should not be in the research instructions
    expect(prompt).not.toMatch(/research.*lodash/i);
  });

  it("includes scope contract In Scope items", () => {
    const prompt = buildResearchPrompt(
      "Add JWT authentication",
      [{ name: "express", impactScore: 0.7, source: "context7" }],
      makeScopeContract(),
      { maxResearchTime: 30 },
    );
    expect(prompt).toContain("JWT token validation");
    expect(prompt).toContain("Auth middleware");
  });

  it("includes time budget from config", () => {
    const prompt = buildResearchPrompt(
      "task",
      [{ name: "express", impactScore: 0.7, source: "context7" }],
      makeScopeContract(),
      { maxResearchTime: 45 },
    );
    expect(prompt).toContain("45");
  });

  it("respects research_sources from config", () => {
    const topics: ResearchTopic[] = [
      { name: "express", impactScore: 0.7, source: "web_search" },
    ];
    const prompt = buildResearchPrompt(
      "task",
      topics,
      makeScopeContract(),
      { maxResearchTime: 30 },
    );
    expect(prompt).toContain("web search");
  });

  it("keeps prompt under ~5K tokens (20000 chars)", () => {
    const topics: ResearchTopic[] = Array.from({ length: 20 }, (_, i) => ({
      name: `library-${i}`,
      impactScore: 0.6,
      source: "context7" as const,
    }));
    const prompt = buildResearchPrompt(
      "Large task with many libraries",
      topics,
      makeScopeContract(),
      { maxResearchTime: 30 },
    );
    expect(prompt.length).toBeLessThan(20000);
  });
});

describe("parseResearchOutput", () => {
  it("extracts completedAt from markdown", () => {
    const result = parseResearchOutput(makeResearchMd());
    expect(result.completedAt).toBe("2026-03-24T00:00:00Z");
  });

  it("extracts topicsResearched count", () => {
    const result = parseResearchOutput(makeResearchMd());
    expect(result.topicsResearched).toBe(2);
  });

  it("extracts topicsSkipped count", () => {
    const result = parseResearchOutput(makeResearchMd());
    expect(result.topicsSkipped).toBe(1);
  });

  it("populates topics array from sections", () => {
    const result = parseResearchOutput(makeResearchMd());
    expect(result.topics.length).toBeGreaterThan(0);
  });
});

describe("writeResearchArtifact", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "research-test-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("creates research.md in the output directory", () => {
    const output: ResearchOutput = {
      completedAt: "2026-03-24T00:00:00Z",
      topicsResearched: 2,
      topicsSkipped: 1,
      topics: [
        { name: "express", impactScore: 0.7, source: "context7" },
        { name: "lodash", impactScore: 0.02, source: "skipped", reason: "low graph impact (0.02, 1 files)" },
      ],
      outputPath: "",
      durationMs: 100,
    };
    const filePath = writeResearchArtifact(output, tmpDir);
    expect(fs.existsSync(filePath)).toBe(true);
  });

  it("output contains '# Research' heading", () => {
    const output: ResearchOutput = {
      completedAt: "2026-03-24T00:00:00Z",
      topicsResearched: 1,
      topicsSkipped: 0,
      topics: [{ name: "express", impactScore: 0.7, source: "context7" }],
      outputPath: "",
      durationMs: 100,
    };
    const filePath = writeResearchArtifact(output, tmpDir);
    const content = fs.readFileSync(filePath, "utf-8");
    expect(content).toContain("# Research");
  });

  it("output contains '## Relevant APIs' section", () => {
    const output: ResearchOutput = {
      completedAt: "2026-03-24T00:00:00Z",
      topicsResearched: 1,
      topicsSkipped: 0,
      topics: [{ name: "express", impactScore: 0.7, source: "context7" }],
      outputPath: "",
      durationMs: 100,
    };
    const filePath = writeResearchArtifact(output, tmpDir);
    const content = fs.readFileSync(filePath, "utf-8");
    expect(content).toContain("## Relevant APIs");
  });

  it("output contains '## Skipped Topics' section with skipped items", () => {
    const output: ResearchOutput = {
      completedAt: "2026-03-24T00:00:00Z",
      topicsResearched: 1,
      topicsSkipped: 1,
      topics: [
        { name: "express", impactScore: 0.7, source: "context7" },
        { name: "lodash", impactScore: 0.02, source: "skipped", reason: "low graph impact (0.02, 1 files)" },
      ],
      outputPath: "",
      durationMs: 100,
    };
    const filePath = writeResearchArtifact(output, tmpDir);
    const content = fs.readFileSync(filePath, "utf-8");
    expect(content).toContain("## Skipped Topics");
    expect(content).toContain("lodash");
  });
});

describe("runResearch", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "research-run-test-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("returns a ResearchOutput with prompt when topics exist", async () => {
    const options: ResearchOptions = {
      projectRoot: "/fake/project",
      taskSlug: "add-jwt-auth",
      task: "Add JWT authentication",
      analysisResult: makeAnalysisResult(),
      scopeContract: makeScopeContract(),
      outputDir: tmpDir,
    };
    const result = await runResearch(options);
    expect(result.topicsResearched).toBeGreaterThanOrEqual(0);
    expect(result.topics.length).toBeGreaterThan(0);
  });

  it("writes minimal research.md when all topics are internal", async () => {
    // Affected files with no external imports (all internal)
    const analysisResult = makeAnalysisResult();
    analysisResult.affectedFiles = [
      { filePath: "src/internal-only.ts", risk: "LOW", centrality: 0.1, community: "0" },
    ];
    const options: ResearchOptions = {
      projectRoot: "/fake/project",
      taskSlug: "internal-task",
      task: "Internal refactor",
      analysisResult,
      scopeContract: makeScopeContract(),
      outputDir: tmpDir,
    };
    const result = await runResearch(options);
    // Should still produce valid output even with no external topics
    expect(result).toBeDefined();
    expect(result.outputPath).toBeTruthy();
  });
});
