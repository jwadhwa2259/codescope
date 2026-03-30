// ---------------------------------------------------------------------------
// Tests for PIPE-04: Token Budget — planner costTier computation
// ---------------------------------------------------------------------------
// Verifies that parsePlanOutput attaches the correct costTier to each
// AgentAssignment based on estimatedTokens, using classifyCostTier from
// src/utils/tokens.ts.  This is the orient-side coverage for PIPE-04.
// ---------------------------------------------------------------------------

import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock loadConfig so parsePlanOutput doesn't need a real filesystem
vi.mock("../../src/config/loader.js", () => ({
  loadConfig: vi.fn(() => ({
    schema_version: 1,
    orient: { max_research_time: 30 },
    execute: { max_agents_concurrent: 3 },
  })),
}));

import { parsePlanOutput } from "../../src/orient/planner.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makePlanMarkdown(agents: Array<{ name: string; tokens: string }>): string {
  const agentSections = agents
    .map(
      ({ name, tokens }) => `### Agent: ${name}

- **Wave:** 1
- **Task:** Do something
- **Files (exclusive write):** \`src/${name}.ts\`
- **Files (read-only):** none
- **Conventions:** none
- **Golden files:** none
- **Depends on:** none
- **Estimated tokens:** ~${tokens}
- **Timeout:** 180s
`,
    )
    .join("\n");

  const agentNames = agents.map((a) => a.name).join(", ");
  const totalK = agents.reduce((sum, a) => sum + parseInt(a.tokens, 10), 0);

  return `# Execution Plan: test-task

**Created:** 2026-03-29T00:00:00Z
**Status:** PENDING
**Strategy:** sequential
**Estimated agents:** ${agents.length}
**Estimated total tokens:** ~${totalK}K

## Agents

${agentSections}

## Execution Order

| Wave | Agents | Mode | Files |
|------|--------|------|-------|
| 1 | ${agentNames} | sequential | ${agents.length} |

## Validation

- [x] No overlapping file writes within waves: **PASS**

## Removed by User

`;
}

// ---------------------------------------------------------------------------
// costTier on parsed AgentAssignment (PIPE-04)
// ---------------------------------------------------------------------------

describe("parsePlanOutput — costTier assignment (PIPE-04)", () => {
  it("assigns LIGHT costTier to agent with 15K estimated tokens", () => {
    const markdown = makePlanMarkdown([{ name: "light-agent", tokens: "15" }]);
    const plan = parsePlanOutput(markdown, "test-task");

    const agent = plan.agents.find((a) => a.name === "light-agent");
    expect(agent).toBeDefined();
    expect(agent?.estimatedTokens).toBe(15_000);
    expect(agent?.costTier).toBe("LIGHT");
  });

  it("assigns MODERATE costTier to agent with 25K estimated tokens", () => {
    const markdown = makePlanMarkdown([{ name: "moderate-agent", tokens: "25" }]);
    const plan = parsePlanOutput(markdown, "test-task");

    const agent = plan.agents.find((a) => a.name === "moderate-agent");
    expect(agent).toBeDefined();
    expect(agent?.estimatedTokens).toBe(25_000);
    expect(agent?.costTier).toBe("MODERATE");
  });

  it("assigns HEAVY costTier to agent with 60K estimated tokens", () => {
    const markdown = makePlanMarkdown([{ name: "heavy-agent", tokens: "60" }]);
    const plan = parsePlanOutput(markdown, "test-task");

    const agent = plan.agents.find((a) => a.name === "heavy-agent");
    expect(agent).toBeDefined();
    expect(agent?.estimatedTokens).toBe(60_000);
    expect(agent?.costTier).toBe("HEAVY");
  });

  it("assigns costTier to every agent in a multi-agent plan", () => {
    const markdown = makePlanMarkdown([
      { name: "a1", tokens: "10" },
      { name: "a2", tokens: "30" },
      { name: "a3", tokens: "55" },
    ]);
    const plan = parsePlanOutput(markdown, "test-task");

    expect(plan.agents).toHaveLength(3);

    const a1 = plan.agents.find((a) => a.name === "a1")!;
    const a2 = plan.agents.find((a) => a.name === "a2")!;
    const a3 = plan.agents.find((a) => a.name === "a3")!;

    expect(a1.costTier).toBe("LIGHT");
    expect(a2.costTier).toBe("MODERATE");
    expect(a3.costTier).toBe("HEAVY");
  });

  it("assigns MODERATE for agent at exactly the 20K lower boundary", () => {
    const markdown = makePlanMarkdown([{ name: "boundary-agent", tokens: "20" }]);
    const plan = parsePlanOutput(markdown, "test-task");

    const agent = plan.agents.find((a) => a.name === "boundary-agent")!;
    expect(agent?.costTier).toBe("MODERATE");
  });

  it("assigns MODERATE for agent at exactly the 50K upper boundary", () => {
    const markdown = makePlanMarkdown([{ name: "upper-agent", tokens: "50" }]);
    const plan = parsePlanOutput(markdown, "test-task");

    const agent = plan.agents.find((a) => a.name === "upper-agent")!;
    expect(agent?.costTier).toBe("MODERATE");
  });

  it("assigns LIGHT for agent with 0 estimated tokens (missing token line)", () => {
    // Agent section without a token line -- defaults to 0 tokens
    const markdown = `# Execution Plan: test-task

**Created:** 2026-03-29T00:00:00Z
**Status:** PENDING
**Strategy:** sequential
**Estimated agents:** 1
**Estimated total tokens:** ~0K

## Agents

### Agent: no-tokens-agent

- **Wave:** 1
- **Task:** Do something minimal
- **Files (exclusive write):** \`src/no-tokens-agent.ts\`
- **Files (read-only):** none
- **Conventions:** none
- **Golden files:** none
- **Depends on:** none
- **Timeout:** 180s

## Execution Order

| Wave | Agents | Mode | Files |
|------|--------|------|-------|
| 1 | no-tokens-agent | sequential | 1 |

## Validation

- [x] No overlapping file writes within waves: **PASS**

## Removed by User

`;
    const plan = parsePlanOutput(markdown, "test-task");

    const agent = plan.agents.find((a) => a.name === "no-tokens-agent")!;
    expect(agent).toBeDefined();
    expect(agent?.estimatedTokens).toBe(0);
    expect(agent?.costTier).toBe("LIGHT");
  });
});
