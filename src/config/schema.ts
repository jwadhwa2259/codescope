import { z } from "zod/v4";

export const AgentModelSchema = z.object({
  model: z.enum(["haiku", "sonnet", "opus", "inherited"]),
});

export const ServiceSchema = z.object({
  name: z.string(),
  path: z.string(),
  build: z.string().optional(),
  test: z.string().optional(),
});

export const ConfigSchema = z.object({
  schema_version: z.literal(1),

  project: z.object({
    name: z.string(),
    type: z.enum(["single", "monorepo", "polyrepo"]),
    languages: z.array(z.string()).min(1),
    root: z.string().optional(),
    services: z.array(ServiceSchema).optional(),
    build_command: z.string().optional(),
    test_command: z.string().optional(),
    e2e_tool: z.string().optional(),
    e2e_command: z.string().optional(),
  }),

  agents: z.object({
    researcher: AgentModelSchema,
    convention_detector: AgentModelSchema,
    risk_analyzer: AgentModelSchema,
    learning_synthesizer: AgentModelSchema,
    eval_judge: AgentModelSchema,
    debug: AgentModelSchema,
  }),

  orient: z.object({
    verbosity: z.enum(["brief", "detailed"]),
    clarification: z.enum(["thorough", "minimal", "auto"]),
    research_sources: z.array(z.string()),
    max_research_time: z.number().positive(),
  }),

  execute: z.object({
    parallel: z.enum(["auto", "sequential", "parallel"]),
    max_agents_concurrent: z.number().int().min(1).max(10),
  }),

  verify: z.object({
    build_command: z.string().optional(),
    start_command: z.string().optional(),
    health_check: z.string().optional(),
    ready_signal: z.string().optional(),
    timeout_seconds: z.number().positive(),
    tests: z.object({
      unit: z.string().optional(),
      integration: z.string().optional(),
      e2e: z
        .object({
          tool: z.enum(["playwright", "xcode", "gradle", "pytest", "none"]),
          command: z.string().optional(),
          config: z.string().optional(),
        })
        .optional(),
    }),
    auto_smoke: z.boolean(),
    static_check: z.boolean(),
    blast_radius_diff: z.boolean(),
  }),

  eval: z.object({
    mode: z.enum(["interactive", "auto-debug", "auto-skip-minor"]),
    auto_debug_max_cycles: z.number().int().min(1).max(10),
    criteria: z.object({
      scope_compliance: z.boolean(),
      convention_adherence: z.boolean(),
      completeness: z.boolean(),
      correctness: z.boolean(),
    }),
  }),

  conventions: z.object({
    detection_threshold: z.number().int().min(0).max(100),
    min_files: z.number().int().min(1),
    strictness: z.enum(["suggest-only", "warn", "block"]),
    auto_confirm_high_confidence: z.boolean(),
  }),

  learning: z.object({
    project_memory: z.boolean(),
    global_memory: z.boolean(),
    global_memory_path: z.string(),
    max_active_learnings: z.number().int().min(1),
    confidence_decay: z.object({
      gotchas: z.number().int().positive(),
      decisions: z.number().int().positive(),
    }),
    auto_capture: z.boolean(),
    capture_ignores: z.boolean(),
  }),

  bootstrap: z.object({
    scaling: z.enum(["auto", "single_squad", "manual"]),
    squad_threshold_loc: z.number().int().positive(),
    max_squads: z.number().int().min(1),
  }),

  display: z.object({
    progress_reports: z.boolean(),
    agent_activity: z.enum(["silent", "minimal", "verbose"]),
    eval_detail: z.enum(["summary", "full"]),
  }),
});

export type Config = z.infer<typeof ConfigSchema>;
