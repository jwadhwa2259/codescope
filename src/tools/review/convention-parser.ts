import type { ParsedConvention } from "./types.js";

/**
 * Parse conventions.md into structured convention objects.
 * Duplicated from conventions.ts for isolation.
 */
export function parseConventions(content: string): ParsedConvention[] {
  const conventions: ParsedConvention[] = [];
  const sections = content.split(/^## /m).filter((s) => s.trim().length > 0);

  for (const section of sections) {
    const lines = section.split("\n");

    let name = "";
    let adoption = 0;
    let confidence = "";
    let category = "";
    let files: string[] = [];
    const evidence: string[] = [];
    let inEvidence = false;

    for (const line of lines) {
      const trimmed = line.trim();

      if (trimmed.startsWith("**Convention:**")) {
        name = trimmed.replace("**Convention:**", "").trim();
        inEvidence = false;
      } else if (trimmed.startsWith("**Adoption:**")) {
        const pctStr = trimmed.replace("**Adoption:**", "").trim();
        adoption = parseInt(pctStr.replace("%", ""), 10) || 0;
        inEvidence = false;
      } else if (trimmed.startsWith("**Confidence:**")) {
        confidence = trimmed.replace("**Confidence:**", "").trim();
        inEvidence = false;
      } else if (trimmed.startsWith("**Category:**")) {
        category = trimmed.replace("**Category:**", "").trim();
        inEvidence = false;
      } else if (trimmed.startsWith("**Files:**")) {
        const fileStr = trimmed.replace("**Files:**", "").trim();
        files = fileStr
          .split(",")
          .map((f) => f.trim())
          .filter((f) => f.length > 0);
        inEvidence = false;
      } else if (trimmed.startsWith("**Evidence:**")) {
        inEvidence = true;
      } else if (inEvidence && trimmed.startsWith("-")) {
        evidence.push(trimmed.replace(/^-\s*/, "").trim());
      } else if (inEvidence && trimmed === "") {
        inEvidence = false;
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
