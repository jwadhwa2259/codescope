import { describe, it, expect } from "vitest";
import { ConfigSchema, AgentModelSchema } from "../../src/config/schema.js";
import { DEFAULT_CONFIG } from "../../src/config/defaults.js";

// Helper: a complete valid config object matching the full Zod schema
function validConfig() {
  return {
    schema_version: 1 as const,
    project: {
      name: "my-project",
      type: "single" as const,
      languages: ["typescript"],
    },
    agents: {
      researcher: { model: "inherited" as const },
      convention_detector: { model: "inherited" as const },
      risk_analyzer: { model: "inherited" as const },
      learning_synthesizer: { model: "inherited" as const },
      eval_judge: { model: "inherited" as const },
      debug: { model: "inherited" as const },
    },
    orient: {
      verbosity: "brief" as const,
      clarification: "thorough" as const,
      research_sources: ["context7", "web_search"],
      max_research_time: 60,
    },
    execute: {
      parallel: "auto" as const,
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
      mode: "interactive" as const,
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
      strictness: "suggest-only" as const,
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
      scaling: "auto" as const,
      squad_threshold_loc: 100000,
      max_squads: 10,
    },
    display: {
      progress_reports: true,
      agent_activity: "minimal" as const,
      eval_detail: "full" as const,
    },
  };
}

describe("ConfigSchema", () => {
  it("accepts a complete valid config", () => {
    const result = ConfigSchema.safeParse(validConfig());
    expect(result.success).toBe(true);
  });

  it("rejects an empty object with ZodError", () => {
    const result = ConfigSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it("rejects schema_version other than 1", () => {
    const config = validConfig();
    (config as any).schema_version = 2;
    const result = ConfigSchema.safeParse(config);
    expect(result.success).toBe(false);
  });

  it('rejects invalid agent model "gpt-4"', () => {
    const config = validConfig();
    config.agents.researcher = { model: "gpt-4" as any };
    const result = ConfigSchema.safeParse(config);
    expect(result.success).toBe(false);
  });

  it('rejects invalid eval mode "aggressive"', () => {
    const config = validConfig();
    config.eval.mode = "aggressive" as any;
    const result = ConfigSchema.safeParse(config);
    expect(result.success).toBe(false);
  });

  it('accepts convention strictness "suggest-only", "warn", "block"', () => {
    for (const strictness of ["suggest-only", "warn", "block"] as const) {
      const config = validConfig();
      config.conventions.strictness = strictness;
      const result = ConfigSchema.safeParse(config);
      expect(result.success).toBe(true);
    }
  });

  it('rejects invalid convention strictness "ignore"', () => {
    const config = validConfig();
    config.conventions.strictness = "ignore" as any;
    const result = ConfigSchema.safeParse(config);
    expect(result.success).toBe(false);
  });

  it("accepts config with execute.parallel present (backward compat, D-44)", () => {
    const config = validConfig();
    config.execute.parallel = "sequential" as any;
    const result = ConfigSchema.safeParse(config);
    expect(result.success).toBe(true);
  });

  it("accepts config WITHOUT execute.parallel (new configs, D-44)", () => {
    const config = validConfig();
    const { parallel, ...executeWithout } = config.execute;
    (config as any).execute = executeWithout;
    const result = ConfigSchema.safeParse(config);
    expect(result.success).toBe(true);
  });

  it("still requires execute.max_agents_concurrent", () => {
    const config = validConfig();
    const { max_agents_concurrent, ...executeWithout } = config.execute;
    (config as any).execute = executeWithout;
    const result = ConfigSchema.safeParse(config);
    expect(result.success).toBe(false);
  });
});

describe("AgentModelSchema", () => {
  it("accepts valid agent models", () => {
    for (const model of ["haiku", "sonnet", "opus", "inherited"] as const) {
      const result = AgentModelSchema.safeParse({ model });
      expect(result.success).toBe(true);
    }
  });

  it("rejects invalid model names", () => {
    const result = AgentModelSchema.safeParse({ model: "gpt-4" });
    expect(result.success).toBe(false);
  });
});

describe("DEFAULT_CONFIG", () => {
  it("has schema_version 1", () => {
    expect(DEFAULT_CONFIG.schema_version).toBe(1);
  });

  it('has orient.verbosity "brief" (D-12)', () => {
    expect(DEFAULT_CONFIG.orient.verbosity).toBe("brief");
  });

  it('has orient.clarification "thorough" (D-12)', () => {
    expect(DEFAULT_CONFIG.orient.clarification).toBe("thorough");
  });

  it('has eval.mode "interactive" (D-12)', () => {
    expect(DEFAULT_CONFIG.eval.mode).toBe("interactive");
  });

  it('has conventions.strictness "suggest-only" (D-12)', () => {
    expect(DEFAULT_CONFIG.conventions.strictness).toBe("suggest-only");
  });

  it("has conventions.detection_threshold 80 (D-17)", () => {
    expect(DEFAULT_CONFIG.conventions.detection_threshold).toBe(80);
  });

  it("has conventions.min_files 10 (D-17)", () => {
    expect(DEFAULT_CONFIG.conventions.min_files).toBe(10);
  });
});
