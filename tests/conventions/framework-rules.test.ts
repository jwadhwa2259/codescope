import { describe, it, expect, beforeAll, afterAll } from "vitest";
import * as path from "node:path";
import * as fs from "node:fs";
import * as os from "node:os";
import { runConventionScan } from "../../src/conventions/runner.js";

const RULES_DIR = path.resolve(
  import.meta.dirname,
  "../../src/conventions/rules",
);

/**
 * Helper: create a temp directory with sample framework source files.
 */
function createTempProject(files: Record<string, string>): string {
  const tmpDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "codescope-fw-test-"),
  );
  for (const [relativePath, content] of Object.entries(files)) {
    const fullPath = path.join(tmpDir, relativePath);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, content);
  }
  return tmpDir;
}

describe("framework-aware runConventionScan", () => {
  let fastifyDir: string;
  let expressDir: string;
  let h3Dir: string;
  let plainDir: string;

  beforeAll(() => {
    // Create Fastify project fixture
    fastifyDir = createTempProject({
      "src/routes.ts": `
import fastify from 'fastify';
const app = fastify();
app.get('/users', async (request, reply) => {
  return { users: [] };
});
app.post('/users', async (request, reply) => {
  return { created: true };
});
app.addHook('onRequest', async (request, reply) => {
  console.log('hook');
});
app.decorate('utility', () => 'value');
`,
    });

    // Create Express project fixture
    expressDir = createTempProject({
      "src/app.ts": `
import express from 'express';
const app = express();
app.use(express.json());
app.use(cors());
app.get('/users', (req, res) => {
  res.json({ users: [] });
});
app.post('/items', (req, res) => {
  res.json({ ok: true });
});
function errorHandler(err, req, res, next) {
  res.status(500).json({ error: err.message });
}
`,
    });

    // Create h3 project fixture
    h3Dir = createTempProject({
      "src/handler.ts": `
import { defineEventHandler, readBody, getQuery } from 'h3';
export default defineEventHandler(async (event) => {
  const body = readBody(event);
  const query = getQuery(event);
  return { body, query };
});
`,
    });

    // Create plain TypeScript project (no framework code)
    plainDir = createTempProject({
      "src/utils.ts": `
export function add(a: number, b: number): number {
  return a + b;
}
export function multiply(a: number, b: number): number {
  return a * b;
}
`,
    });
  });

  afterAll(() => {
    for (const dir of [fastifyDir, expressDir, h3Dir, plainDir]) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("scans fastify rules when detectedFrameworks includes 'fastify'", () => {
    const result = runConventionScan(fastifyDir, RULES_DIR, ["fastify"]);
    const fwConventions = result.conventions.filter((c) =>
      c.ruleId.startsWith("fastify-"),
    );
    expect(fwConventions.length).toBeGreaterThan(0);

    // Should detect route handlers and hooks
    const routeHandler = fwConventions.find(
      (c) => c.ruleId === "fastify-route-handler",
    );
    expect(routeHandler).toBeDefined();

    const hook = fwConventions.find((c) => c.ruleId === "fastify-hook");
    expect(hook).toBeDefined();
  });

  it("does NOT scan any framework directory when detectedFrameworks is empty", () => {
    const result = runConventionScan(fastifyDir, RULES_DIR, []);
    const fwConventions = result.conventions.filter(
      (c) =>
        c.ruleId.startsWith("fastify-") ||
        c.ruleId.startsWith("express-") ||
        c.ruleId.startsWith("h3-"),
    );
    expect(fwConventions.length).toBe(0);
  });

  it("scans both express and h3 rules when both frameworks detected", () => {
    // Create a combined project with both express and h3 patterns
    const combinedDir = createTempProject({
      "src/express-app.ts": `
import express from 'express';
const app = express();
app.use(express.json());
app.get('/api', (req, res) => { res.json({}); });
`,
      "src/h3-handler.ts": `
import { defineEventHandler, readBody } from 'h3';
export default defineEventHandler(async (event) => {
  const body = readBody(event);
  return body;
});
`,
    });

    try {
      const result = runConventionScan(combinedDir, RULES_DIR, [
        "express",
        "h3",
      ]);
      const expressConventions = result.conventions.filter((c) =>
        c.ruleId.startsWith("express-"),
      );
      const h3Conventions = result.conventions.filter((c) =>
        c.ruleId.startsWith("h3-"),
      );

      expect(expressConventions.length).toBeGreaterThan(0);
      expect(h3Conventions.length).toBeGreaterThan(0);
    } finally {
      fs.rmSync(combinedDir, { recursive: true, force: true });
    }
  });

  it("framework rule matches use human-readable RULE_METADATA names", () => {
    const result = runConventionScan(fastifyDir, RULES_DIR, ["fastify"]);
    const routeHandler = result.conventions.find(
      (c) => c.ruleId === "fastify-route-handler",
    );
    expect(routeHandler).toBeDefined();
    expect(routeHandler!.name).toBe("Fastify Route Handler");
    expect(routeHandler!.category).toBe("fastify-routing");
  });

  it("totalRulesEvaluated includes framework rules when frameworks detected", () => {
    const withoutFw = runConventionScan(fastifyDir, RULES_DIR, []);
    const withFw = runConventionScan(fastifyDir, RULES_DIR, ["fastify"]);

    // With fastify, should have 4 more rules evaluated (the 4 fastify yml files)
    expect(withFw.totalRulesEvaluated).toBe(
      withoutFw.totalRulesEvaluated + 4,
    );
  });

  it("backward compatible: omitting detectedFrameworks defaults to empty array", () => {
    // Call without the third parameter -- should work exactly like passing []
    const result = runConventionScan(plainDir, RULES_DIR);
    const fwConventions = result.conventions.filter(
      (c) =>
        c.ruleId.startsWith("fastify-") ||
        c.ruleId.startsWith("express-") ||
        c.ruleId.startsWith("h3-"),
    );
    expect(fwConventions.length).toBe(0);
  });
});
