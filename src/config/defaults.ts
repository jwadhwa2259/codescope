import type { Config } from "./schema.js";

/**
 * Default config values per D-12 (thorough defaults).
 *
 * Note: project.name and project.languages are placeholders — they will be
 * populated by the onboarding skill. The defaults object itself won't pass
 * ConfigSchema validation until those fields are filled in. This is intentional:
 * defaults serve as a merge base for onboarding.
 */
export const DEFAULT_CONFIG: Omit<Config, "project"> & {
  project: { name: string; type: Config["project"]["type"]; languages: string[] };
} = {
  schema_version: 1,

  project: {
    name: "",
    type: "single",
    languages: [],
  },

  agents: {
    researcher: { model: "inherited" },
    convention_detector: { model: "inherited" },
    risk_analyzer: { model: "inherited" },
    learning_synthesizer: { model: "inherited" },
    eval_judge: { model: "inherited" },
    debug: { model: "inherited" },
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
    confidence_decay: {
      gotchas: 90,
      decisions: 180,
    },
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
