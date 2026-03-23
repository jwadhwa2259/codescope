import * as fs from "node:fs";
import * as path from "node:path";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface LearningSynthesizerOptions {
  projectRoot: string;
  outputDir: string; // where to write learnings.md
}

export interface LearningSynthesizerResult {
  learningsPath: string;
  durationMs: number;
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

/**
 * Runs the Learning Synthesizer agent: creates learnings.md with
 * header/schema structure but no entries (per D-24).
 *
 * The Learning Synthesizer's real work happens in Phase 7 when learnings
 * accumulate from completed orient-to-debug pipeline runs.
 */
export async function runLearningSynthesizer(
  options: LearningSynthesizerOptions,
): Promise<LearningSynthesizerResult> {
  const startTime = Date.now();

  // Ensure output directory exists
  fs.mkdirSync(options.outputDir, { recursive: true });

  // Generate learnings.md
  const markdown = generateLearningsMarkdown();
  const learningsPath = path.join(options.outputDir, "learnings.md");
  fs.writeFileSync(learningsPath, markdown, "utf-8");

  const durationMs = Date.now() - startTime;

  return {
    learningsPath,
    durationMs,
  };
}

// ---------------------------------------------------------------------------
// Markdown generation
// ---------------------------------------------------------------------------

function generateLearningsMarkdown(): string {
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
