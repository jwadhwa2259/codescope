import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

// Module under test -- will be created in GREEN phase
import { handleServiceMap } from "../../src/tools/service-map.js";

describe("codescope_service_map", () => {
  let tmpDir: string;
  let codescopePath: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "codescope-service-map-test-"),
    );
    codescopePath = path.join(tmpDir, ".claude", "codescope");
    fs.mkdirSync(codescopePath, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function setupBootstrapped(): void {
    fs.writeFileSync(path.join(codescopePath, "graph.db"), "");
    fs.writeFileSync(
      path.join(codescopePath, "bootstrap-meta.json"),
      JSON.stringify({
        last_bootstrap: new Date().toISOString(),
        duration_ms: 5000,
        mode: "full",
        version: "0.1.0",
      }),
    );
  }

  /** Sample service-manifest.md with markdown table */
  const SAMPLE_SERVICE_MANIFEST = `# Service Manifest

| Service | Path | LOC | Framework | Analysis |
|---------|------|-----|-----------|----------|
| api | packages/api | 15000 | Express | Full |
| web | packages/web | 22000 | Next.js | Full |
| shared | packages/shared | 3000 | none | Lightweight |
`;

  /** Sample cross-service-map.md */
  const SAMPLE_CROSS_SERVICE_MAP = `# Cross-Service Dependency Map

## Services

| Service | Path | LOC | Framework | Analysis |
|---------|------|-----|-----------|----------|
| api | packages/api | 15000 | Express | Full |
| web | packages/web | 22000 | Next.js | Full |
| shared | packages/shared | 3000 | none | Lightweight |

## Dependencies

| From | To | Shared Types | Import Count |
|------|-----|-------------|--------------|
| api | shared | ApiResponse, UserType | 12 |
| web | shared | ApiResponse, PageProps | 8 |
| web | api | RouteParams | 3 |
`;

  it("Test 7: Returns service list with LOC, framework, analysis status from service-manifest.md", async () => {
    setupBootstrapped();
    fs.writeFileSync(
      path.join(codescopePath, "service-manifest.md"),
      SAMPLE_SERVICE_MANIFEST,
    );
    fs.writeFileSync(
      path.join(codescopePath, "cross-service-map.md"),
      SAMPLE_CROSS_SERVICE_MAP,
    );

    const result = await handleServiceMap(tmpDir);
    const parsed = JSON.parse(result.content[0].text);

    expect(parsed.status).toBe("ok");
    expect(parsed.data.services).toHaveLength(3);

    const api = parsed.data.services.find(
      (s: { name: string }) => s.name === "api",
    );
    expect(api).toBeDefined();
    expect(api.path).toBe("packages/api");
    expect(api.loc).toBe(15000);
    expect(api.framework).toBe("Express");
    expect(api.analysis).toBe("Full");
  });

  it("Test 8: Returns dependency edges from cross-service-map.md (shared types, import counts)", async () => {
    setupBootstrapped();
    fs.writeFileSync(
      path.join(codescopePath, "service-manifest.md"),
      SAMPLE_SERVICE_MANIFEST,
    );
    fs.writeFileSync(
      path.join(codescopePath, "cross-service-map.md"),
      SAMPLE_CROSS_SERVICE_MAP,
    );

    const result = await handleServiceMap(tmpDir);
    const parsed = JSON.parse(result.content[0].text);

    expect(parsed.data.dependencies).toHaveLength(3);

    const apiToShared = parsed.data.dependencies.find(
      (d: { from: string; to: string }) =>
        d.from === "api" && d.to === "shared",
    );
    expect(apiToShared).toBeDefined();
    expect(apiToShared.shared_types).toEqual(["ApiResponse", "UserType"]);
    expect(apiToShared.import_count).toBe(12);
  });

  it("Test 9: Single-service project returns one-service response with empty dependencies per D-34", async () => {
    setupBootstrapped();

    const singleServiceManifest = `# Service Manifest

| Service | Path | LOC | Framework | Analysis |
|---------|------|-----|-----------|----------|
| root | . | 8000 | Express | Full |
`;
    fs.writeFileSync(
      path.join(codescopePath, "service-manifest.md"),
      singleServiceManifest,
    );
    // No cross-service-map.md (single service)

    const result = await handleServiceMap(tmpDir);
    const parsed = JSON.parse(result.content[0].text);

    expect(parsed.data.services).toHaveLength(1);
    expect(parsed.data.services[0].name).toBe("root");
    expect(parsed.data.dependencies).toEqual([]);
  });

  it("Test 10: Returns NOT_BOOTSTRAPPED error when not bootstrapped", async () => {
    // No graph.db
    const result = await handleServiceMap(tmpDir);
    const parsed = JSON.parse(result.content[0].text);

    expect(parsed.status).toBe("error");
    expect(parsed.error.code).toBe("NOT_BOOTSTRAPPED");
    expect(parsed.error.recovery).toContain("bootstrap");
  });

  it("Test 11: Returns partial response when cross-service-map.md missing but service-manifest.md exists", async () => {
    setupBootstrapped();
    fs.writeFileSync(
      path.join(codescopePath, "service-manifest.md"),
      SAMPLE_SERVICE_MANIFEST,
    );
    // No cross-service-map.md

    const result = await handleServiceMap(tmpDir);
    const parsed = JSON.parse(result.content[0].text);

    // With multiple services and no cross-service map, should be partial
    expect(parsed.status).toBe("partial");
    expect(parsed.data.services).toHaveLength(3);
    expect(parsed.data.dependencies).toEqual([]);
    expect(parsed.warnings).toBeDefined();
    expect(parsed.warnings.length).toBeGreaterThan(0);
  });

  it("Test 12: Response follows D-17 format", async () => {
    setupBootstrapped();
    fs.writeFileSync(
      path.join(codescopePath, "service-manifest.md"),
      SAMPLE_SERVICE_MANIFEST,
    );
    fs.writeFileSync(
      path.join(codescopePath, "cross-service-map.md"),
      SAMPLE_CROSS_SERVICE_MAP,
    );

    const result = await handleServiceMap(tmpDir);
    const parsed = JSON.parse(result.content[0].text);

    expect(parsed.status).toBe("ok");
    expect(parsed.metadata).toBeDefined();
    expect(parsed.metadata).toHaveProperty("last_bootstrap");
    expect(parsed.metadata).toHaveProperty("staleness");
    expect(parsed.metadata).toHaveProperty("query_ms");
    expect(typeof parsed.metadata.query_ms).toBe("number");
  });
});
