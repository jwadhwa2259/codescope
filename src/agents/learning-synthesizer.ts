import * as fs from "node:fs";
import * as path from "node:path";
import type { LearningEntry, DecayConfig } from "../learning/types.js";
import { addLearnings } from "../learning/manager.js";
import { computeExpiry } from "../learning/decay.js";
import {
  detectRepeatedIgnores,
  buildEnrichmentUpdates,
} from "../learning/global-enrichment.js";
import {
  readGlobalMemory,
  addGlobalEnrichment,
} from "../onboard/global-memory.js";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface LearningSynthesizerOptions {
  projectRoot: string;
  outputDir: string;
  /** Path to the coordination log (optional for LLM mode) */
  coordinationLogPath?: string;
  /** Path to the eval report (optional for LLM mode) */
  evalReportPath?: string;
  /** Path to debug cycles directory (optional) */
  debugCyclesDir?: string;
  /** Path to the verify report (optional for LLM mode) */
  verifyReportPath?: string;
  /** Path to the scope contract (optional for LLM mode) */
  scopeContractPath?: string;
  /** Decay configuration for expiry computation */
  decayConfig?: DecayConfig;
  /** Maximum active learnings cap */
  maxActive?: number;
  /** LLM dispatch callback for learning extraction. When provided, enables LLM-driven mode. */
  dispatchSynthesizer?: (prompt: string) => Promise<string>;
}

export interface LearningSynthesizerResult {
  learningsPath: string;
  durationMs: number;
  /** Number of new learnings added (LLM mode only) */
  newLearnings?: number;
  /** Number of contradicted entries (LLM mode only) */
  contradicted?: number;
  /** Number of skipped entries (LLM mode only) */
  skipped?: number;
  /** Cap status string e.g. "3/50 active" (LLM mode only) */
  capStatus?: string;
}

// ---------------------------------------------------------------------------
// Prompt building types (for buildSynthesizerPrompt)
// ---------------------------------------------------------------------------

interface PromptOptions {
  coordinationLogPath?: string;
  evalReportPath?: string;
  debugCyclesDir?: string;
  verifyReportPath?: string;
  scopeContractPath?: string;
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

/**
 * Build the prompt for the LLM learning synthesizer.
 *
 * Reads pipeline artifact files and assembles a prompt asking the LLM to
 * extract 3-5 structured learnings as a JSON array.
 *
 * Handles missing files gracefully by noting "(not available)" in the prompt.
 */
export function buildSynthesizerPrompt(options: PromptOptions): string {
  const sections: string[] = [];

  sections.push("You are a learning synthesizer agent. Analyze the following pipeline artifacts and extract structured learnings.");
  sections.push("");

  // Coordination log
  sections.push("## Coordination Log");
  sections.push(readArtifact(options.coordinationLogPath));
  sections.push("");

  // Eval report
  sections.push("## Eval Report");
  sections.push(readArtifact(options.evalReportPath));
  sections.push("");

  // Verify report
  sections.push("## Verify Report");
  sections.push(readArtifact(options.verifyReportPath));
  sections.push("");

  // Scope contract
  sections.push("## Scope Contract");
  sections.push(readArtifact(options.scopeContractPath));
  sections.push("");

  // Debug cycles (directory of files)
  if (options.debugCyclesDir && fs.existsSync(options.debugCyclesDir)) {
    sections.push("## Debug Cycles");
    try {
      const files = fs.readdirSync(options.debugCyclesDir);
      for (const file of files) {
        const filePath = path.join(options.debugCyclesDir, file);
        if (fs.statSync(filePath).isFile()) {
          sections.push(`### ${file}`);
          sections.push(fs.readFileSync(filePath, "utf-8"));
        }
      }
    } catch {
      sections.push("(not available)");
    }
    sections.push("");
  }

  sections.push("---");
  sections.push("");
  sections.push("Extract what WORKED (patterns), what FAILED unexpectedly (gotchas), and what DESIGN CHOICES were made (decisions).");
  sections.push("Return JSON array: [{title, type, evidence}]. Max 5 entries. Focus on non-obvious insights, not trivial observations.");
  sections.push('Each entry must have: "title" (string), "type" ("gotcha" | "decision" | "pattern"), "evidence" (string: file:line or description).');
  sections.push("Return ONLY the JSON array, no other text.");

  return sections.join("\n");
}

/**
 * Run the Learning Synthesizer agent.
 *
 * When `dispatchSynthesizer` is not provided, falls back to empty-init behavior
 * (creates learnings.md with header/schema structure but no entries).
 *
 * When `dispatchSynthesizer` IS provided, performs LLM-driven extraction:
 * 1. Build prompt from pipeline artifacts
 * 2. Dispatch to LLM via callback
 * 3. Parse JSON response as learning entries
 * 4. Map to LearningEntry with UNVERIFIED status and computed expiry
 * 5. Cap at 5 entries per D-03
 * 6. Persist via addLearnings (respects decay + cap)
 * 7. Run global enrichment for repeated ignore patterns
 * 8. Return structured result
 */
export async function runLearningSynthesizer(
  options: LearningSynthesizerOptions,
): Promise<LearningSynthesizerResult> {
  const startTime = Date.now();

  // If no dispatchSynthesizer callback, fall back to empty-init behavior
  if (!options.dispatchSynthesizer) {
    fs.mkdirSync(options.outputDir, { recursive: true });
    const markdown = generateEmptyLearningsMarkdown();
    const learningsPath = path.join(options.outputDir, "learnings.md");
    fs.writeFileSync(learningsPath, markdown, "utf-8");

    return {
      learningsPath,
      durationMs: Date.now() - startTime,
    };
  }

  // LLM-driven extraction mode
  const decayConfig = options.decayConfig ?? { gotchas: 90, decisions: 180 };
  const maxActive = options.maxActive ?? 50;

  // 1. Build prompt
  const prompt = buildSynthesizerPrompt({
    coordinationLogPath: options.coordinationLogPath,
    evalReportPath: options.evalReportPath,
    debugCyclesDir: options.debugCyclesDir,
    verifyReportPath: options.verifyReportPath,
    scopeContractPath: options.scopeContractPath,
  });

  // 2. Dispatch to LLM
  const rawResponse = await options.dispatchSynthesizer(prompt);

  // 3. Parse JSON response
  let rawLearnings: Array<{ title: string; type: string; evidence: string }> =
    [];
  try {
    const parsed = JSON.parse(rawResponse);
    if (Array.isArray(parsed)) {
      rawLearnings = parsed;
    }
  } catch {
    // If parsing fails, no learnings extracted
    rawLearnings = [];
  }

  // 4. Map to LearningEntry with UNVERIFIED status and computed expiry
  const today = new Date();
  const todayStr = formatDateISO(today);

  let newEntries: LearningEntry[] = rawLearnings.map((raw) => {
    const type = validateType(raw.type);
    return {
      title: raw.title || "Untitled learning",
      status: "UNVERIFIED" as const,
      type,
      discovered: todayStr,
      expires: computeExpiry(type, today, decayConfig),
      evidence: raw.evidence || "",
    };
  });

  // 5. Cap at 5 entries per D-03
  if (newEntries.length > 5) {
    newEntries = newEntries.slice(0, 5);
  }

  // 6. Persist via addLearnings
  const addResult = await addLearnings(
    options.projectRoot,
    newEntries,
    decayConfig,
    maxActive,
  );

  // 7. Global enrichment: detect repeated ignores and update global memory
  try {
    const { loadLearnings } = await import("../learning/manager.js");
    const allLearnings = loadLearnings(options.projectRoot);
    const repeated = detectRepeatedIgnores(allLearnings.entries);
    if (repeated.length > 0) {
      const currentMemory = readGlobalMemory();
      const existingIgnores = currentMemory?.ignorePatterns ?? [];
      // Convert string[] to minimal GlobalEnrichmentEntry[] for comparison
      const existingAsEntries = existingIgnores.map((value) => ({
        type: "ignore_pattern" as const,
        value,
        source: "",
        recordedDate: "",
      }));
      const updates = buildEnrichmentUpdates(repeated, existingAsEntries);
      if (updates.length > 0) {
        addGlobalEnrichment(updates);
      }
    }
  } catch {
    // Global enrichment is best-effort -- do not fail the pipeline
  }

  // 8. Return result
  const learningsPath = path.join(
    options.outputDir,
    "learnings.md",
  );

  // Compute cap status
  const capStatus = `${addResult.added.length + (await countCurrentActive(options.projectRoot))}/${maxActive} active`;

  return {
    learningsPath,
    durationMs: Date.now() - startTime,
    newLearnings: addResult.added.length,
    contradicted: addResult.contradicted.length,
    skipped: addResult.skipped.length,
    capStatus,
  };
}

// ---------------------------------------------------------------------------
// Markdown generation (backward compat - renamed export)
// ---------------------------------------------------------------------------

/**
 * Generate empty learnings.md markdown with schema structure.
 * Preserved for backward compatibility with bootstrap.
 */
export function generateEmptyLearningsMarkdown(): string {
  const timestamp = new Date().toISOString();
  const lines: string[] = [];

  // YAML frontmatter
  lines.push("---");
  lines.push(`generated: "${timestamp}"`);
  lines.push('generator: "learning-synthesizer"');
  lines.push("phase: 2");
  lines.push("total_learnings: 0");
  lines.push("---");
  lines.push("");
  lines.push("# Learnings");
  lines.push("");
  lines.push("## Schema");
  lines.push("");
  lines.push("Each learning entry follows this format:");
  lines.push("");
  lines.push("```");
  lines.push("### {Learning Title}");
  lines.push("- **Status:** UNVERIFIED");
  lines.push("- **Type:** {gotcha/decision/pattern}");
  lines.push("- **Discovered:** {date}");
  lines.push("- **Expires:** {date based on type decay}");
  lines.push("- **Evidence:** {file:line or description}");
  lines.push("```");
  lines.push("");
  lines.push("## Entries");
  lines.push("");
  lines.push(
    "No learnings recorded yet. Learnings accumulate from completed orient-to-debug pipeline runs.",
  );

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function readArtifact(filePath?: string): string {
  if (!filePath || !fs.existsSync(filePath)) {
    return "(not available)";
  }
  try {
    return fs.readFileSync(filePath, "utf-8");
  } catch {
    return "(not available)";
  }
}

function validateType(type: string): "gotcha" | "decision" | "pattern" {
  const valid = ["gotcha", "decision", "pattern"];
  if (valid.includes(type)) {
    return type as "gotcha" | "decision" | "pattern";
  }
  return "gotcha"; // Default to gotcha for unknown types
}

function formatDateISO(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

async function countCurrentActive(projectRoot: string): Promise<number> {
  try {
    const { loadLearnings } = await import("../learning/manager.js");
    const parsed = loadLearnings(projectRoot);
    return parsed.entries.filter(
      (e) => e.status !== "EXPIRED",
    ).length;
  } catch {
    return 0;
  }
}
