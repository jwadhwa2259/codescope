import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

// These will be imported once we implement them
import { loadConfig, configExists } from "../../src/config/loader.js";
import { writeConfig } from "../../src/config/writer.js";
import type { Config } from "../../src/config/schema.js";

// Helper: a complete valid config object for round-trip testing
function validConfig(): Config {
  return {
    schema_version: 1,
    project: {
      name: "test-project",
      type: "single",
      languages: ["typescript"],
    },
    agents: {
      researcher: { model: "inherited" },
      convention_detector: { model: "sonnet" },
      risk_analyzer: { model: "inherited" },
      learning_synthesizer: { model: "inherited" },
      eval_judge: { model: "opus" },
      debug: { model: "haiku" },
    },
    orient: {
      verbosity: "brief",
      clarification: "thorough",
      research_sources: ["context7", "web_search"],
      max_research_time: 60,
    },
    execute: {
      parallel: "auto",
      max_agents_concurrent: 3,
    },
    verify: {
      timeout_seconds: 120,
      tests: {},
      auto_smoke: true,
      static_check: true,
      blast_radius_diff: true,
    },
    eval: {
      mode: "interactive",
      auto_debug_max_cycles: 3,
      criteria: {
        scope_compliance: true,
        convention_adherence: true,
        completeness: true,
        correctness: true,
      },
    },
    conventions: {
      detection_threshold: 80,
      min_files: 10,
      strictness: "suggest-only",
      auto_confirm_high_confidence: false,
    },
    learning: {
      project_memory: true,
      global_memory: true,
      global_memory_path: "~/.codescope/global-memory.md",
      max_active_learnings: 50,
      confidence_decay: { gotchas: 90, decisions: 180 },
      auto_capture: true,
      capture_ignores: true,
    },
    bootstrap: {
      scaling: "auto",
      squad_threshold_loc: 100000,
      max_squads: 10,
    },
    display: {
      progress_reports: true,
      agent_activity: "minimal",
      eval_detail: "full",
    },
  };
}

describe("config loader", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "codescope-test-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("round-trips writeConfig then loadConfig correctly", () => {
    const config = validConfig();
    writeConfig(tmpDir, config);
    const loaded = loadConfig(tmpDir);
    expect(loaded).toEqual(config);
  });

  it("loadConfig returns null for missing file", () => {
    const result = loadConfig(tmpDir);
    expect(result).toBeNull();
  });

  it("configExists returns false when file missing", () => {
    expect(configExists(tmpDir)).toBe(false);
  });

  it("configExists returns true when file present", () => {
    writeConfig(tmpDir, validConfig());
    expect(configExists(tmpDir)).toBe(true);
  });

  it('loadConfig throws descriptive error mentioning "config.yml validation failed" for malformed YAML', () => {
    // Write raw invalid YAML content directly
    const configPath = path.join(tmpDir, ".claude", "codescope", "config.yml");
    fs.mkdirSync(path.dirname(configPath), { recursive: true });
    fs.writeFileSync(configPath, "schema_version: 99\ninvalid: true\n", "utf-8");

    expect(() => loadConfig(tmpDir)).toThrow("config.yml validation failed");
  });
});
