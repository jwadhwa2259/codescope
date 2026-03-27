// ---------------------------------------------------------------------------
// Learning Manager: high-level orchestrator for learning lifecycle
// ---------------------------------------------------------------------------
// Orchestrates parser + decay + contradiction + cap for the full
// addLearnings flow. Reads/writes learnings.md from disk.
// ---------------------------------------------------------------------------

import * as fs from "node:fs";
import * as path from "node:path";
import { getCodescopePath } from "../utils/paths.js";
import { parseLearnings, serializeLearnings } from "./parser.js";
import { runDecay } from "./decay.js";
import { checkContradictions } from "./contradiction.js";
import { enforceCapWithEviction } from "./cap.js";
import type {
  LearningEntry,
  DecayConfig,
  ParsedLearnings,
} from "./types.js";

// ---------------------------------------------------------------------------
// Result type for addLearnings
// ---------------------------------------------------------------------------

export interface AddLearningsResult {
  added: LearningEntry[];
  skipped: LearningEntry[];
  contradicted: LearningEntry[];
  evicted: LearningEntry[];
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Load learnings from disk.
 *
 * Reads learnings.md from the project's .claude/codescope/ directory.
 * Returns empty ParsedLearnings with default frontmatter when file does not exist.
 *
 * @param projectRoot - Project root directory
 * @returns Parsed learnings data
 */
export function loadLearnings(projectRoot: string): ParsedLearnings {
  const csPath = getCodescopePath(projectRoot);
  const learningsPath = path.join(csPath, "learnings.md");

  if (!fs.existsSync(learningsPath)) {
    return {
      frontmatter: {
        generated: new Date().toISOString(),
        generator: "learning-synthesizer",
        total_learnings: 0,
      },
      entries: [],
      rawSections: new Map(),
    };
  }

  const content = fs.readFileSync(learningsPath, "utf-8");
  return parseLearnings(content);
}

/**
 * Save learnings to disk.
 *
 * Serializes the ParsedLearnings and writes to learnings.md.
 * Updates frontmatter.total_learnings to match entries.length.
 *
 * @param projectRoot - Project root directory
 * @param parsed - Learnings data to save
 */
export function saveLearnings(
  projectRoot: string,
  parsed: ParsedLearnings,
): void {
  const csPath = getCodescopePath(projectRoot);
  const learningsPath = path.join(csPath, "learnings.md");

  // Update total_learnings to match actual count
  parsed.frontmatter.total_learnings = parsed.entries.length;

  const content = serializeLearnings(parsed);

  // Ensure directory exists
  fs.mkdirSync(csPath, { recursive: true });
  fs.writeFileSync(learningsPath, content, "utf-8");
}

/**
 * Add new learnings through the full lifecycle pipeline.
 *
 * Flow:
 * 1. Load existing learnings from disk
 * 2. Run decay on existing entries (mark expired ones)
 * 3. For each new entry, check contradictions against existing entries
 *    - If contradicted, mark as CONTRADICTED with contradicts field
 * 4. Enforce cap with eviction
 * 5. Save to disk
 *
 * @param projectRoot - Project root directory
 * @param newEntries - New learning entries to add
 * @param decayConfig - Decay configuration
 * @param maxActive - Maximum active entries (cap)
 * @param llmCallback - Optional LLM callback for semantic contradiction detection
 * @returns Result with added, skipped, contradicted, and evicted entries
 */
export async function addLearnings(
  projectRoot: string,
  newEntries: LearningEntry[],
  decayConfig: DecayConfig,
  maxActive: number = 50,
  llmCallback?: (prompt: string) => Promise<string>,
): Promise<AddLearningsResult> {
  // 1. Load existing
  const parsed = loadLearnings(projectRoot);

  // 2. Run decay on existing entries
  const now = new Date();
  const decayed = runDecay(parsed.entries, decayConfig, now);

  // 3. Check contradictions for each new entry
  const contradicted: LearningEntry[] = [];
  const processedNew: LearningEntry[] = [];

  for (const entry of newEntries) {
    const contradictions = await checkContradictions(
      entry,
      decayed,
      llmCallback,
    );

    if (contradictions.length > 0) {
      const markedEntry = {
        ...entry,
        status: "CONTRADICTED" as const,
        contradicts: contradictions[0].contradicts,
      };
      contradicted.push(markedEntry);
      processedNew.push(markedEntry);
    } else {
      processedNew.push(entry);
    }
  }

  // 4. Enforce cap with eviction
  const capResult = enforceCapWithEviction(decayed, processedNew, maxActive);

  // 5. Save to disk
  const updatedParsed: ParsedLearnings = {
    frontmatter: parsed.frontmatter,
    entries: capResult.entries,
    rawSections: parsed.rawSections,
  };
  saveLearnings(projectRoot, updatedParsed);

  // Determine which entries were actually added (in final entries but not in decayed)
  const decayedTitles = new Set(decayed.map((e) => e.title));
  const added = capResult.entries.filter((e) => !decayedTitles.has(e.title));

  return {
    added,
    skipped: capResult.skipped,
    contradicted,
    evicted: capResult.evicted,
  };
}
