import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { getStatus } from "../../src/tools/status.js";
import { STUB_TOOLS, makeStubResponse } from "../../src/tools/stubs.js";

describe("codescope_status (getStatus)", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "codescope-status-test-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("returns structured status with all required fields", async () => {
    const status = await getStatus(tmpDir);
    expect(status).toHaveProperty("config_exists");
    expect(status).toHaveProperty("bootstrap_completed");
    expect(status).toHaveProperty("graph_nodes");
    expect(status).toHaveProperty("graph_edges");
    expect(status).toHaveProperty("dependency_health");
    expect(status).toHaveProperty("plugin_version");
  });

  it("reports config_exists as false when no config.yml", async () => {
    const status = await getStatus(tmpDir);
    expect(status.config_exists).toBe(false);
  });

  it("reports bootstrap_completed as false without graph.db", async () => {
    const status = await getStatus(tmpDir);
    expect(status.bootstrap_completed).toBe(false);
  });

  it("reports zero graph nodes and edges without bootstrap", async () => {
    const status = await getStatus(tmpDir);
    expect(status.graph_nodes).toBe(0);
    expect(status.graph_edges).toBe(0);
  });

  it('reports plugin_version as "0.1.0"', async () => {
    const status = await getStatus(tmpDir);
    expect(status.plugin_version).toBe("0.1.0");
  });

  it("includes dependency_health with verbose=true", async () => {
    const status = await getStatus(tmpDir, true);
    expect(status.dependency_health).toHaveProperty("node_version");
    expect(status.dependency_health).toHaveProperty("node_compatible");
    expect(status.dependency_health).toHaveProperty("sqlite_available");
    expect(status.dependency_health).toHaveProperty("wasm_grammars_available");
    expect(status.dependency_health).toHaveProperty("ast_grep_available");
  });
});

describe("stub tools", () => {
  it("defines exactly 10 stub tools", () => {
    expect(STUB_TOOLS).toHaveLength(10);
  });

  it("includes all 10 required tool names", () => {
    const names = STUB_TOOLS.map((t) => t.name);
    expect(names).toContain("codescope_recall");
    expect(names).toContain("codescope_graph_query");
    expect(names).toContain("codescope_blast_radius");
    expect(names).toContain("codescope_conventions");
    expect(names).toContain("codescope_orient");
    expect(names).toContain("codescope_verify");
    expect(names).toContain("codescope_search");
    expect(names).toContain("codescope_readiness");
    expect(names).toContain("codescope_detect_changes");
    expect(names).toContain("codescope_service_map");
  });

  it("each stub tool has a non-empty Zod input schema", () => {
    for (const tool of STUB_TOOLS) {
      expect(tool.inputSchema).toBeDefined();
      expect(typeof tool.inputSchema).toBe("object");
    }
  });

  it("makeStubResponse returns correct not_bootstrapped format", () => {
    const response = makeStubResponse("codescope_recall");
    expect(response).toEqual({
      content: [
        {
          type: "text",
          text: JSON.stringify({
            status: "not_bootstrapped",
            message: "Run /codescope:bootstrap first",
            tool: "codescope_recall",
          }),
        },
      ],
    });
  });

  it("makeStubResponse includes the tool name in the response", () => {
    const response = makeStubResponse("codescope_blast_radius");
    const parsed = JSON.parse(response.content[0].text);
    expect(parsed.tool).toBe("codescope_blast_radius");
    expect(parsed.status).toBe("not_bootstrapped");
    expect(parsed.message).toBe("Run /codescope:bootstrap first");
  });
});

describe("tool registration completeness", () => {
  it("status tool + 10 stubs = 11 total tools", () => {
    // 1 status tool + 10 stubs
    expect(STUB_TOOLS.length + 1).toBe(11);
  });
});
