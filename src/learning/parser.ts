// ---------------------------------------------------------------------------
// Learning Parser: parse and serialize learnings.md entries
// ---------------------------------------------------------------------------
// Handles the learnings.md markdown format established by learning-synthesizer.ts
// and ignore-filter.ts. Supports lossless roundtrip of frontmatter, entries,
// and additional sections (e.g., ## Ignore Patterns).
// ---------------------------------------------------------------------------

import type {
  LearningEntry,
  LearningStatus,
  LearningType,
  LearningsFrontmatter,
  ParsedLearnings,
} from "./types.js";

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Parse a learnings.md file content into structured data.
 *
 * @param content - Raw markdown content of learnings.md
 * @returns Parsed learnings with frontmatter, entries, and preserved sections
 */
export function parseLearnings(content: string): ParsedLearnings {
  if (!content.trim()) {
    return {
      frontmatter: {},
      entries: [],
      rawSections: new Map(),
    };
  }

  const frontmatter = parseFrontmatter(content);
  const entries = parseEntries(content);
  const rawSections = parseRawSections(content);

  return { frontmatter, entries, rawSections };
}

/**
 * Serialize a ParsedLearnings back to markdown string.
 * Updates total_learnings in frontmatter to match actual entry count.
 *
 * @param parsed - Structured learnings data
 * @returns Markdown string
 */
export function serializeLearnings(parsed: ParsedLearnings): string {
  const lines: string[] = [];

  // Frontmatter
  const fm = { ...parsed.frontmatter, total_learnings: parsed.entries.length };
  lines.push("---");
  if (fm.generated) lines.push(`generated: "${fm.generated}"`);
  if (fm.generator) lines.push(`generator: "${fm.generator}"`);
  if (fm.phase !== undefined) lines.push(`phase: ${fm.phase}`);
  lines.push(`total_learnings: ${fm.total_learnings}`);
  lines.push("---");
  lines.push("");

  // Title
  lines.push("# Learnings");
  lines.push("");

  // Schema section (preserved from raw sections or default)
  const schemaSection = parsed.rawSections.get("Schema");
  if (schemaSection) {
    lines.push("## Schema");
    lines.push("");
    lines.push(schemaSection.trim());
    lines.push("");
  }

  // Entries section
  lines.push("## Entries");
  lines.push("");

  if (parsed.entries.length === 0) {
    lines.push(
      "No learnings recorded yet. Learnings accumulate from completed orient-to-debug pipeline runs.",
    );
  } else {
    for (const entry of parsed.entries) {
      lines.push(serializeLearningEntry(entry));
      lines.push("");
    }
  }

  // Preserved additional sections (excluding Schema and Entries)
  for (const [name, content] of parsed.rawSections) {
    if (name === "Schema" || name === "Entries") continue;
    lines.push(`## ${name}`);
    lines.push("");
    lines.push(content.trim());
    lines.push("");
  }

  return lines.join("\n");
}

/**
 * Serialize a single learning entry to markdown format.
 * Matches the format used by ignore-filter.ts and learning-synthesizer.ts.
 *
 * @param entry - Learning entry to serialize
 * @returns Markdown string for the entry
 */
export function serializeLearningEntry(entry: LearningEntry): string {
  const lines: string[] = [];

  lines.push(`### ${entry.title}`);
  lines.push(`- **Status:** ${entry.status}`);

  // Type field -- present for gotcha/decision/pattern/todo but IGNORE entries
  // use status-based identification (the existing ignore-filter.ts format
  // writes Status without Type)
  if (entry.type && entry.status !== "IGNORE") {
    lines.push(`- **Type:** ${entry.type}`);
  }

  // Common fields
  if (entry.discovered) {
    lines.push(`- **Discovered:** ${entry.discovered}`);
  }

  if (entry.expires) {
    lines.push(`- **Expires:** ${entry.expires}`);
  }

  // Optional fields in specific order
  if (entry.pattern !== undefined) {
    lines.push(`- **Pattern:** \`${entry.pattern}\``);
  }

  if (entry.scope !== undefined) {
    lines.push(`- **Scope:** \`${entry.scope}\``);
  }

  if (entry.file !== undefined) {
    lines.push(`- **File:** \`${entry.file}\``);
  }

  if (entry.severity !== undefined) {
    lines.push(`- **Severity:** ${entry.severity}`);
  }

  if (entry.criterion !== undefined) {
    lines.push(`- **Criterion:** \`${entry.criterion}\``);
  }

  if (entry.evidence) {
    lines.push(`- **Evidence:** ${entry.evidence}`);
  }

  if (entry.contradicts) {
    lines.push(`- **Contradicts:** ${entry.contradicts}`);
  }

  if (entry.note) {
    lines.push(`- **Note:** ${entry.note}`);
  }

  // Context (Recorded + Context are combined from ignore-filter format)
  if (entry.context) {
    lines.push(`- **Context:** ${entry.context}`);
  }

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Internal: Frontmatter parsing
// ---------------------------------------------------------------------------

function parseFrontmatter(content: string): Partial<LearningsFrontmatter> {
  const fmMatch = content.match(/^---\s*\n([\s\S]*?)\n---/);
  if (!fmMatch) return {};

  const fm: Partial<LearningsFrontmatter> = {};
  const lines = fmMatch[1].split("\n");

  for (const line of lines) {
    const trimmed = line.trim();
    const colonIndex = trimmed.indexOf(":");
    if (colonIndex === -1) continue;

    const key = trimmed.slice(0, colonIndex).trim();
    let value = trimmed.slice(colonIndex + 1).trim();

    // Remove quotes
    if (value.startsWith('"') && value.endsWith('"')) {
      value = value.slice(1, -1);
    }

    switch (key) {
      case "generated":
        fm.generated = value;
        break;
      case "generator":
        fm.generator = value;
        break;
      case "phase":
        fm.phase = parseInt(value, 10);
        break;
      case "total_learnings":
        fm.total_learnings = parseInt(value, 10);
        break;
    }
  }

  return fm;
}

// ---------------------------------------------------------------------------
// Internal: Entry parsing
// ---------------------------------------------------------------------------

function parseEntries(content: string): LearningEntry[] {
  const entries: LearningEntry[] = [];

  // Strip code blocks to avoid parsing ### inside ``` blocks as entries
  const stripped = content.replace(/```[\s\S]*?```/g, "");

  // Split by ### headings
  const headingPattern = /^### (.+)$/gm;
  const headings: Array<{ title: string; start: number }> = [];

  let match: RegExpExecArray | null;
  while ((match = headingPattern.exec(stripped)) !== null) {
    headings.push({ title: match[1].trim(), start: match.index });
  }

  for (let i = 0; i < headings.length; i++) {
    const heading = headings[i];
    const nextStart =
      i < headings.length - 1 ? headings[i + 1].start : stripped.length;
    const block = stripped.slice(heading.start, nextStart);

    const entry = parseEntryBlock(heading.title, block);
    if (entry) {
      entries.push(entry);
    }
  }

  return entries;
}

function parseEntryBlock(title: string, block: string): LearningEntry | null {
  const fields = parseFields(block);

  // Must have at least a status to be a valid entry
  const status = fields.get("Status") as LearningStatus | undefined;
  if (!status) return null;

  // Determine type from explicit field or infer from status
  let type: LearningType = "gotcha";
  const explicitType = fields.get("Type");
  if (explicitType) {
    type = explicitType.toLowerCase() as LearningType;
  } else if (status === "IGNORE") {
    type = "ignore";
  } else if (status === "TODO") {
    type = "todo";
  }

  return {
    title,
    status,
    type,
    discovered: fields.get("Discovered") || "",
    expires: fields.get("Expires") || "",
    evidence: fields.get("Evidence") || "",
    note: fields.get("Note"),
    pattern: fields.get("Pattern"),
    scope: fields.get("Scope"),
    criterion: fields.get("Criterion"),
    file: fields.get("File"),
    severity: fields.get("Severity"),
    contradicts: fields.get("Contradicts"),
    context: fields.get("Context"),
  };
}

/**
 * Parse `- **Field:** value` patterns from a markdown block.
 * Strips backticks from values for fields like Pattern, Scope, Criterion, File.
 */
function parseFields(block: string): Map<string, string> {
  const fields = new Map<string, string>();
  const fieldPattern = /^- \*\*(\w+):\*\* (.+)$/gm;

  let match: RegExpExecArray | null;
  while ((match = fieldPattern.exec(block)) !== null) {
    const key = match[1];
    let value = match[2].trim();

    // Strip surrounding backticks for known fields
    if (["Pattern", "Scope", "Criterion", "File"].includes(key)) {
      value = value.replace(/^`(.*)`$/, "$1");
      // Also handle "`value` (extra text)" format
      value = value.replace(/^`([^`]*)`.*$/, "$1");
    }

    // Strip "Recorded:" lines are actually dates; handle separately
    // "Recorded" is not a field we store separately; it maps to discovered date
    if (key === "Recorded") {
      // For IGNORE/TODO entries, Recorded maps to discovered
      fields.set("Discovered", value.split("T")[0]);
      continue;
    }

    fields.set(key, value);
  }

  return fields;
}

// ---------------------------------------------------------------------------
// Internal: Raw section parsing (for lossless roundtrip)
// ---------------------------------------------------------------------------

function parseRawSections(content: string): Map<string, string> {
  const sections = new Map<string, string>();

  // Remove frontmatter
  const withoutFm = content.replace(/^---\s*\n[\s\S]*?\n---\s*\n/, "");

  // Remove the # Learnings title
  const withoutTitle = withoutFm.replace(/^# Learnings\s*\n/, "");

  // Split by ## headings
  const sectionPattern = /^## (.+)$/gm;
  const headings: Array<{ name: string; start: number }> = [];

  let match: RegExpExecArray | null;
  while ((match = sectionPattern.exec(withoutTitle)) !== null) {
    headings.push({ name: match[1].trim(), start: match.index });
  }

  for (let i = 0; i < headings.length; i++) {
    const heading = headings[i];
    const contentStart = heading.start + `## ${heading.name}`.length + 1; // +1 for newline
    const nextStart =
      i < headings.length - 1 ? headings[i + 1].start : withoutTitle.length;
    const sectionContent = withoutTitle.slice(contentStart, nextStart).trim();

    // Don't store Entries section as raw (we reconstruct it from entries array)
    if (heading.name !== "Entries") {
      sections.set(heading.name, sectionContent);
    }
  }

  return sections;
}
