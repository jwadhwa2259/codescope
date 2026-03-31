import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { processPreToolUse } from "../../src/hooks/pre-tool-use.js";
import {
  composeBudgetedMessage,
  estimateTokens,
  MAX_TOKENS,
  type InjectionItem,
} from "../../src/hooks/lib/budget-composer.js";
import type {
  HookInput,
  ConventionIndex,
  DangerZoneIndex,
  BlastRadiusIndex,
} from "../../src/hooks/lib/types.js";

/**
 * D-26 Hook injection budget validation.
 *
 * Validates that a file matching 10+ framework conventions still fits within
 * the 500-token hook injection budget with P1 items (danger zones) intact.
 */
describe("D-26: 500-token hook injection budget with 10+ conventions", () => {
  let fixtureDir: string;

  /**
   * Build a fixture project directory with:
   * - .claude/codescope/graph.db (empty file to pass existence check)
   * - .claude/codescope/injection/conventions.json with 10+ conventions for a target file
   * - .claude/codescope/injection/danger-zones.json with 1 danger zone entry
   * - .claude/codescope/injection/blast-radius.json with blast radius data
   */
  beforeEach(() => {
    fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), "codescope-budget-"));

    const codescopeDir = path.join(fixtureDir, ".claude", "codescope");
    const injectionDir = path.join(codescopeDir, "injection");
    fs.mkdirSync(injectionDir, { recursive: true });

    // Create empty graph.db to pass existence check
    fs.writeFileSync(path.join(codescopeDir, "graph.db"), "");

    // Build 12 convention entries for a single file (mix of generic + framework)
    const conventionNames = [
      "Prefer Named Exports",
      "Async/Await Functions",
      "Explicit Return Types",
      "Fastify Plugin Signature",
      "Fastify Route Handler",
      "Fastify Hook Registration",
      "Fastify Decorator",
      "Express Middleware",
      "h3 Event Handler",
      "h3 Utility Functions",
      "Named Imports",
      "Custom Error Classes",
    ];

    const fileConventions = conventionNames.map((name, i) => ({
      name,
      adoption_pct: 80 + (i % 20),
      confidence: i < 6 ? "HIGH-CONF" : "MEDIUM-CONF",
      category: `category-${i}`,
    }));

    const conventionIndex: ConventionIndex = {
      generated: new Date().toISOString(),
      files: {
        "src/routes/users.ts": fileConventions,
      },
    };
    fs.writeFileSync(
      path.join(injectionDir, "conventions.json"),
      JSON.stringify(conventionIndex),
    );

    // Create danger zone with P1 entry for the same file
    const dangerZoneIndex: DangerZoneIndex = {
      generated: new Date().toISOString(),
      files: {
        "src/routes/users.ts": {
          centrality: 0.75,
          riskScore: 0.85,
          communitiesTouched: 3,
          reasons: [
            "High in-degree centrality (0.75)",
            "Touches 3 module communities",
            "Changed frequently (12 commits in 30 days)",
          ],
        },
      },
    };
    fs.writeFileSync(
      path.join(injectionDir, "danger-zones.json"),
      JSON.stringify(dangerZoneIndex),
    );

    // Create blast radius data
    const blastRadiusIndex: BlastRadiusIndex = {
      generated: new Date().toISOString(),
      files: {
        "src/routes/users.ts": {
          totalAffected: 15,
          byRisk: { red: 2, orange: 4, yellow: 5, green: 4 },
          topAffected: ["src/services/auth.ts", "src/middleware/validate.ts", "src/db/queries.ts"],
        },
      },
    };
    fs.writeFileSync(
      path.join(injectionDir, "blast-radius.json"),
      JSON.stringify(blastRadiusIndex),
    );
  });

  afterEach(() => {
    fs.rmSync(fixtureDir, { recursive: true, force: true });
  });

  it("produces hook output under 500 tokens with 12 conventions on a single file", () => {
    const input: HookInput = {
      session_id: "test-session",
      transcript_path: "/tmp/transcript",
      cwd: fixtureDir,
      permission_mode: "default",
      hook_event_name: "PreToolUse",
      tool_name: "Edit",
      tool_input: {
        file_path: path.join(fixtureDir, "src/routes/users.ts"),
      },
      tool_use_id: "test-tool-use",
    };

    const result = processPreToolUse(input, fixtureDir);
    const context = result.hookSpecificOutput.additionalContext ?? "";

    // Must have some content
    expect(context.length).toBeGreaterThan(0);

    // Must be within 500-token budget
    const tokens = estimateTokens(context);
    expect(tokens).toBeLessThanOrEqual(MAX_TOKENS);
  });

  it("preserves P1 danger zone content even with 12 conventions competing for budget", () => {
    const input: HookInput = {
      session_id: "test-session",
      transcript_path: "/tmp/transcript",
      cwd: fixtureDir,
      permission_mode: "default",
      hook_event_name: "PreToolUse",
      tool_name: "Edit",
      tool_input: {
        file_path: path.join(fixtureDir, "src/routes/users.ts"),
      },
      tool_use_id: "test-tool-use",
    };

    const result = processPreToolUse(input, fixtureDir);
    const context = result.hookSpecificOutput.additionalContext ?? "";

    // P1 danger zone content must be present (never truncated)
    expect(context).toContain("[DANGER ZONE]");
    expect(context).toContain("risk:");
    expect(context).toContain("High in-degree centrality");
  });

  it("P1 items appear before P2 convention items in output", () => {
    const input: HookInput = {
      session_id: "test-session",
      transcript_path: "/tmp/transcript",
      cwd: fixtureDir,
      permission_mode: "default",
      hook_event_name: "PreToolUse",
      tool_name: "Edit",
      tool_input: {
        file_path: path.join(fixtureDir, "src/routes/users.ts"),
      },
      tool_use_id: "test-tool-use",
    };

    const result = processPreToolUse(input, fixtureDir);
    const context = result.hookSpecificOutput.additionalContext ?? "";

    const dzIndex = context.indexOf("[DANGER ZONE]");
    const convIndex = context.indexOf("[CONVENTIONS]");

    // Both should be present
    expect(dzIndex).toBeGreaterThanOrEqual(0);
    expect(convIndex).toBeGreaterThanOrEqual(0);

    // Danger zone (P1) must appear before conventions (P2)
    expect(dzIndex).toBeLessThan(convIndex);
  });

  it("budget composer handles 10+ convention items correctly via direct API", () => {
    // Build 12 convention lines (simulating what pre-tool-use.ts produces)
    const conventionLines = [
      "[CONVENTIONS]",
      "  - Prefer Named Exports (85% adoption, HIGH-CONF)",
      "  - Async/Await Functions (90% adoption, HIGH-CONF)",
      "  - Explicit Return Types (80% adoption, HIGH-CONF)",
      "  - Fastify Plugin Signature (85% adoption, HIGH-CONF)",
      "  - Fastify Route Handler (82% adoption, HIGH-CONF)",
      "  - Fastify Hook Registration (78% adoption, HIGH-CONF)",
      "  - Fastify Decorator (75% adoption, MEDIUM-CONF)",
      "  - Express Middleware (88% adoption, MEDIUM-CONF)",
      "  - h3 Event Handler (92% adoption, MEDIUM-CONF)",
      "  - h3 Utility Functions (80% adoption, MEDIUM-CONF)",
      "  - Named Imports (95% adoption, MEDIUM-CONF)",
      "  - Custom Error Classes (70% adoption, MEDIUM-CONF)",
    ];

    const dangerZoneContent = [
      "[DANGER ZONE] src/routes/users.ts (risk: 0.85)",
      "  - High in-degree centrality (0.75)",
      "  - Touches 3 module communities",
      "  - Changed frequently (12 commits in 30 days)",
    ].join("\n");

    const items: InjectionItem[] = [
      { priority: 1, content: dangerZoneContent },
      { priority: 2, content: conventionLines.join("\n") },
      {
        priority: 3,
        content: [
          "[BLAST RADIUS] 15 files affected",
          "  - Red: 2, Orange: 4, Yellow: 5, Green: 4",
          "  - Key dependents: src/services/auth.ts, src/middleware/validate.ts, src/db/queries.ts",
        ].join("\n"),
      },
    ];

    const composed = composeBudgetedMessage(items);

    // Must be within budget
    const tokens = estimateTokens(composed);
    expect(tokens).toBeLessThanOrEqual(MAX_TOKENS);

    // P1 danger zone must always be present
    expect(composed).toContain("[DANGER ZONE]");
    expect(composed).toContain("High in-degree centrality");
  });
});
