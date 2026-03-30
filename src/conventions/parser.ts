/**
 * Canonical convention parser for detector output.
 *
 * The convention detector writes h3 headings + markdown tables:
 *
 * ```markdown
 * ### Convention Name
 *
 * | Metric | Value |
 * |--------|-------|
 * | Adoption | 85% (17/20 files) |
 * | Confidence | HIGH-CONF |
 * | Trend | Stable |
 * | Category | async |
 *
 * **Evidence:**
 * - `src/file.ts:15` -- description
 * ```
 *
 * ALL consumers (convention-index, conventions tool, review parser)
 * MUST use this single canonical parser. No local parsing duplicates.
 */

export interface ParsedConvention {
  name: string;
  adoption_pct: number;
  confidence: string;
  category: string;
  files: string[];
  evidence: string[];
}

/**
 * Parse convention detector markdown output into structured objects.
 *
 * Handles:
 * - YAML frontmatter stripping
 * - h3 heading convention names
 * - Markdown table metric rows (Adoption, Confidence, Trend, Category)
 * - Evidence lines with file path extraction
 * - [CONFLICT] prefix skipping
 *
 * @param content - Raw markdown content from convention detector
 * @returns Array of parsed conventions
 */
export function parseDetectorConventions(content: string): ParsedConvention[] {
  const conventions: ParsedConvention[] = [];

  if (!content || content.trim().length === 0) {
    return conventions;
  }

  // Strip YAML frontmatter (--- ... ---)
  const fmMatch = content.match(/^---\n[\s\S]*?\n---\n/);
  const body = fmMatch ? content.slice(fmMatch[0].length) : content;

  // Split on ### headings (detector uses h3)
  const sections = body.split(/^### /m).filter((s) => s.trim().length > 0);

  for (const section of sections) {
    const lines = section.split("\n");
    const name = lines[0]?.trim() ?? "";
    // Skip empty, [CONFLICT] prefixed, and h1/h2 headings (not from ### split)
    if (!name || name.startsWith("[CONFLICT]") || name.startsWith("#")) continue;

    let adoption = 0;
    let confidence = "";
    let category = "";
    const evidence: string[] = [];
    const files: string[] = [];

    for (const line of lines) {
      const trimmed = line.trim();
      // Table format: | Adoption | 85% (17/20 files) |
      if (/^\|\s*Adoption\s*\|/.test(trimmed)) {
        const match = trimmed.match(/\|\s*Adoption\s*\|\s*(\d+)%/);
        if (match) adoption = parseInt(match[1], 10);
      } else if (/^\|\s*Confidence\s*\|/.test(trimmed)) {
        const match = trimmed.match(/\|\s*Confidence\s*\|\s*(.+?)\s*\|$/);
        if (match) confidence = match[1].trim();
      } else if (/^\|\s*Category\s*\|/.test(trimmed)) {
        const match = trimmed.match(/\|\s*Category\s*\|\s*(.+?)\s*\|$/);
        if (match) category = match[1].trim();
      } else if (trimmed.startsWith("- `") && trimmed.includes(":")) {
        // Evidence line: - `src/file.ts:15` -- description
        evidence.push(trimmed.replace(/^-\s*/, "").trim());
        const fileMatch = trimmed.match(/`([^:]+):/);
        if (fileMatch && !files.includes(fileMatch[1])) {
          files.push(fileMatch[1]);
        }
      }
    }

    if (name) {
      conventions.push({
        name,
        adoption_pct: adoption,
        confidence,
        category,
        files,
        evidence,
      });
    }
  }

  return conventions;
}
