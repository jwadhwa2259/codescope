// ---------------------------------------------------------------------------
// Tests for learning parser (parse and serialize learnings.md)
// ---------------------------------------------------------------------------
// Per 07-01-PLAN.md Task 1 behavior specifications.
// ---------------------------------------------------------------------------

import { describe, it, expect } from "vitest";
import type { LearningEntry, ParsedLearnings } from "../../src/learning/types.js";
import {
  parseLearnings,
  serializeLearnings,
  serializeLearningEntry,
} from "../../src/learning/parser.js";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const EMPTY_LEARNINGS = "";

const VALID_LEARNINGS = `---
generated: "2026-03-15T10:00:00Z"
generator: "learning-synthesizer"
phase: 2
total_learnings: 2
---

# Learnings

## Schema

Each learning entry follows this format:

\`\`\`
### {Learning Title}
- **Status:** UNVERIFIED
- **Type:** {gotcha/decision/pattern}
- **Discovered:** {date}
- **Expires:** {date based on type decay}
- **Evidence:** {file:line or description}
\`\`\`

## Entries

### Use path.join for cross-platform paths
- **Status:** UNVERIFIED
- **Type:** gotcha
- **Discovered:** 2026-03-01
- **Expires:** 2026-05-30
- **Evidence:** src/utils/paths.ts:15

### Prefer async/await over raw promises
- **Status:** VERIFIED
- **Type:** decision
- **Discovered:** 2026-02-15
- **Expires:** 2026-08-14
- **Evidence:** Code review finding from bootstrap pipeline
- **Note:** Confirmed by team lead
`;

const IGNORE_ENTRY_MD = `
### IGNORE: Missing error boundary in component
- **Status:** IGNORE
- **Pattern:** \`Missing error boundary\`
- **Scope:** \`*\`
- **Criterion:** \`convention_adherence\`
- **Recorded:** 2026-03-10T08:00:00Z
- **Context:** Ignored at eval gate for task \`fix-header\`
`;

const TODO_ENTRY_MD = `
### TODO: Add input validation to handler
- **Status:** TODO
- **File:** \`src/handler.ts:42\`
- **Severity:** medium
- **Criterion:** \`correctness\`
- **Evidence:** Missing null check on user input
- **Recorded:** 2026-03-11T09:00:00Z
- **Context:** Deferred at eval gate for task \`add-auth\`
`;

const CONTRADICTED_ENTRY_MD = `
### Use sync filesystem calls everywhere
- **Status:** CONTRADICTED
- **Type:** decision
- **Discovered:** 2026-03-05
- **Expires:** 2026-09-01
- **Evidence:** Performance analysis
- **Contradicts:** Prefer async/await over raw promises
`;

// ---------------------------------------------------------------------------
// Parser tests
// ---------------------------------------------------------------------------

describe("parseLearnings", () => {
  it("returns empty result for empty string", () => {
    const result = parseLearnings(EMPTY_LEARNINGS);
    expect(result.frontmatter).toEqual({});
    expect(result.entries).toEqual([]);
  });

  it("parses valid markdown with correct fields", () => {
    const result = parseLearnings(VALID_LEARNINGS);
    expect(result.entries).toHaveLength(2);

    const first = result.entries[0];
    expect(first.title).toBe("Use path.join for cross-platform paths");
    expect(first.status).toBe("UNVERIFIED");
    expect(first.type).toBe("gotcha");
    expect(first.discovered).toBe("2026-03-01");
    expect(first.expires).toBe("2026-05-30");
    expect(first.evidence).toBe("src/utils/paths.ts:15");

    const second = result.entries[1];
    expect(second.title).toBe("Prefer async/await over raw promises");
    expect(second.status).toBe("VERIFIED");
    expect(second.type).toBe("decision");
    expect(second.note).toBe("Confirmed by team lead");
  });

  it("handles IGNORE entries with pattern, scope, criterion fields", () => {
    const md = VALID_LEARNINGS + IGNORE_ENTRY_MD;
    const result = parseLearnings(md);

    const ignoreEntry = result.entries.find((e) => e.status === "IGNORE");
    expect(ignoreEntry).toBeDefined();
    expect(ignoreEntry!.title).toBe("IGNORE: Missing error boundary in component");
    expect(ignoreEntry!.pattern).toBe("Missing error boundary");
    expect(ignoreEntry!.scope).toBe("*");
    expect(ignoreEntry!.criterion).toBe("convention_adherence");
  });

  it("handles TODO entries with file, severity fields", () => {
    const md = VALID_LEARNINGS + TODO_ENTRY_MD;
    const result = parseLearnings(md);

    const todoEntry = result.entries.find((e) => e.status === "TODO");
    expect(todoEntry).toBeDefined();
    expect(todoEntry!.title).toBe("TODO: Add input validation to handler");
    expect(todoEntry!.file).toBe("src/handler.ts:42");
    expect(todoEntry!.severity).toBe("medium");
    expect(todoEntry!.criterion).toBe("correctness");
  });

  it("handles CONTRADICTED entries with contradicts field", () => {
    const md = VALID_LEARNINGS + CONTRADICTED_ENTRY_MD;
    const result = parseLearnings(md);

    const contradicted = result.entries.find((e) => e.status === "CONTRADICTED");
    expect(contradicted).toBeDefined();
    expect(contradicted!.title).toBe("Use sync filesystem calls everywhere");
    expect(contradicted!.contradicts).toBe("Prefer async/await over raw promises");
  });

  it("preserves frontmatter fields", () => {
    const result = parseLearnings(VALID_LEARNINGS);
    expect(result.frontmatter.generated).toBe("2026-03-15T10:00:00Z");
    expect(result.frontmatter.generator).toBe("learning-synthesizer");
    expect(result.frontmatter.phase).toBe(2);
    expect(result.frontmatter.total_learnings).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// Serializer tests
// ---------------------------------------------------------------------------

describe("serializeLearningEntry", () => {
  it("produces markdown matching existing format", () => {
    const entry: LearningEntry = {
      title: "IGNORE: Test pattern",
      status: "IGNORE",
      type: "ignore",
      discovered: "2026-03-10",
      expires: "",
      evidence: "",
      pattern: "Test pattern",
      scope: "*",
      criterion: "convention_adherence",
      context: "Ignored at eval gate for task `test-task`",
    };

    const md = serializeLearningEntry(entry);
    expect(md).toContain("### IGNORE: Test pattern");
    expect(md).toContain("- **Status:** IGNORE");
    expect(md).toContain("- **Pattern:** `Test pattern`");
    expect(md).toContain("- **Scope:** `*`");
    expect(md).toContain("- **Criterion:** `convention_adherence`");
  });
});

describe("serializeLearnings roundtrip", () => {
  it("parse then serialize then parse produces identical entries", () => {
    const allEntries =
      VALID_LEARNINGS + IGNORE_ENTRY_MD + TODO_ENTRY_MD + CONTRADICTED_ENTRY_MD;
    const parsed1 = parseLearnings(allEntries);
    const serialized = serializeLearnings(parsed1);
    const parsed2 = parseLearnings(serialized);

    expect(parsed2.entries).toHaveLength(parsed1.entries.length);
    for (let i = 0; i < parsed1.entries.length; i++) {
      expect(parsed2.entries[i].title).toBe(parsed1.entries[i].title);
      expect(parsed2.entries[i].status).toBe(parsed1.entries[i].status);
      expect(parsed2.entries[i].type).toBe(parsed1.entries[i].type);
      expect(parsed2.entries[i].discovered).toBe(parsed1.entries[i].discovered);
      expect(parsed2.entries[i].expires).toBe(parsed1.entries[i].expires);
      expect(parsed2.entries[i].evidence).toBe(parsed1.entries[i].evidence);
    }

    // Frontmatter preserved
    expect(parsed2.frontmatter.generated).toBe(parsed1.frontmatter.generated);
    expect(parsed2.frontmatter.generator).toBe(parsed1.frontmatter.generator);
  });
});
