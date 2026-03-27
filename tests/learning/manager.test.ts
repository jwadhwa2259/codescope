// ---------------------------------------------------------------------------
// Tests for learning manager (high-level orchestrator)
// ---------------------------------------------------------------------------
// Per 07-01-PLAN.md Task 2 behavior specifications.
// ---------------------------------------------------------------------------

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import type { LearningEntry, DecayConfig } from "../../src/learning/types.js";
import {
  loadLearnings,
  saveLearnings,
  addLearnings,
} from "../../src/learning/manager.js";
import { parseLearnings, serializeLearnings } from "../../src/learning/parser.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "learning-manager-test-"));
  fs.mkdirSync(path.join(tmpDir, ".claude", "codescope"), { recursive: true });
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function makeLearningsMd(entries: string[]): string {
  return [
    "---",
    'generated: "2026-03-15T10:00:00Z"',
    'generator: "learning-synthesizer"',
    "phase: 2",
    `total_learnings: ${entries.length}`,
    "---",
    "",
    "# Learnings",
    "",
    "## Entries",
    "",
    ...entries,
  ].join("\n");
}

function makeEntry(overrides?: Partial<LearningEntry>): LearningEntry {
  return {
    title: "Test learning",
    status: "UNVERIFIED",
    type: "gotcha",
    discovered: "2026-03-01",
    expires: "2026-06-01",
    evidence: "test evidence",
    ...overrides,
  };
}

const DEFAULT_DECAY: DecayConfig = { gotchas: 90, decisions: 180 };

// ---------------------------------------------------------------------------
// loadLearnings tests
// ---------------------------------------------------------------------------

describe("loadLearnings", () => {
  it("reads learnings.md from disk and returns ParsedLearnings", () => {
    const content = makeLearningsMd([
      "### Test gotcha",
      "- **Status:** UNVERIFIED",
      "- **Type:** gotcha",
      "- **Discovered:** 2026-03-01",
      "- **Expires:** 2026-06-01",
      "- **Evidence:** test file:10",
    ]);
    fs.writeFileSync(
      path.join(tmpDir, ".claude", "codescope", "learnings.md"),
      content,
    );

    const result = loadLearnings(tmpDir);
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0].title).toBe("Test gotcha");
    expect(result.frontmatter.generator).toBe("learning-synthesizer");
  });

  it("returns empty ParsedLearnings when file does not exist", () => {
    const result = loadLearnings(tmpDir);
    expect(result.entries).toHaveLength(0);
    expect(result.frontmatter).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// saveLearnings tests
// ---------------------------------------------------------------------------

describe("saveLearnings", () => {
  it("writes serialized content to learnings.md", () => {
    const parsed = parseLearnings(
      makeLearningsMd([
        "### Saved learning",
        "- **Status:** UNVERIFIED",
        "- **Type:** gotcha",
        "- **Discovered:** 2026-03-01",
        "- **Expires:** 2026-06-01",
        "- **Evidence:** save test",
      ]),
    );

    saveLearnings(tmpDir, parsed);

    const written = fs.readFileSync(
      path.join(tmpDir, ".claude", "codescope", "learnings.md"),
      "utf-8",
    );
    expect(written).toContain("### Saved learning");
    expect(written).toContain("total_learnings: 1");
  });
});

// ---------------------------------------------------------------------------
// addLearnings tests
// ---------------------------------------------------------------------------

describe("addLearnings", () => {
  it("runs the full flow: decay -> check contradictions -> enforce cap -> save", async () => {
    // Set up existing learnings with one about to expire
    const content = makeLearningsMd([
      "### Old gotcha",
      "- **Status:** UNVERIFIED",
      "- **Type:** gotcha",
      "- **Discovered:** 2025-01-01",
      "- **Expires:** 2025-04-01",
      "- **Evidence:** old test",
    ]);
    fs.writeFileSync(
      path.join(tmpDir, ".claude", "codescope", "learnings.md"),
      content,
    );

    const newEntries = [
      makeEntry({ title: "Brand new learning", discovered: "2026-03-20" }),
    ];

    const result = await addLearnings(tmpDir, newEntries, DEFAULT_DECAY, 50);

    // The old gotcha should be decayed to EXPIRED
    const saved = loadLearnings(tmpDir);
    const oldEntry = saved.entries.find((e) => e.title === "Old gotcha");
    expect(oldEntry?.status).toBe("EXPIRED");

    // New entry should be added
    const newEntry = saved.entries.find((e) => e.title === "Brand new learning");
    expect(newEntry).toBeDefined();

    expect(result.added.length).toBeGreaterThanOrEqual(1);
  });

  it("marks contradicting entry as CONTRADICTED with contradicts field", async () => {
    const content = makeLearningsMd([
      "### Use async/await for IO",
      "- **Status:** UNVERIFIED",
      "- **Type:** decision",
      "- **Discovered:** 2026-03-01",
      "- **Expires:** 2026-09-01",
      "- **Evidence:** style guide",
    ]);
    fs.writeFileSync(
      path.join(tmpDir, ".claude", "codescope", "learnings.md"),
      content,
    );

    const newEntries = [
      makeEntry({
        title: "Avoid async/await for IO",
        type: "decision",
        discovered: "2026-03-20",
        expires: "2026-09-20",
      }),
    ];

    const result = await addLearnings(tmpDir, newEntries, DEFAULT_DECAY, 50);

    // The new entry should be marked contradicted
    expect(result.contradicted.length).toBe(1);
    expect(result.contradicted[0].status).toBe("CONTRADICTED");
    expect(result.contradicted[0].contradicts).toBe("Use async/await for IO");
  });

  it("respects maxActive cap and returns skipped entries", async () => {
    // Create 50 entries (at cap)
    const entryLines: string[] = [];
    for (let i = 0; i < 50; i++) {
      entryLines.push(
        `### Learning ${i}`,
        "- **Status:** UNVERIFIED",
        "- **Type:** gotcha",
        `- **Discovered:** 2026-03-${String(1 + (i % 28)).padStart(2, "0")}`,
        "- **Expires:** 2026-09-01",
        `- **Evidence:** test ${i}`,
        "",
      );
    }
    const content = makeLearningsMd(entryLines);
    fs.writeFileSync(
      path.join(tmpDir, ".claude", "codescope", "learnings.md"),
      content,
    );

    const newEntries = [makeEntry({ title: "Cannot fit" })];

    const result = await addLearnings(tmpDir, newEntries, DEFAULT_DECAY, 50);
    expect(result.skipped.length).toBe(1);
    expect(result.skipped[0].title).toBe("Cannot fit");
  });
});
