/**
 * Convention inference for project-specific patterns (R8).
 *
 * Detects patterns beyond the 27 hardcoded ast-grep rules by analyzing
 * import extensions, package ecosystems, and high-frequency API calls.
 * Produces conventions in the canonical h3+table format so downstream
 * parsers (parseDetectorConventions) can consume them.
 */

import * as fs from "node:fs";
import * as path from "node:path";

export interface InferredConvention {
  name: string;
  pattern: string;
  frequency: number;
  totalFiles: number;
  adoptionPercent: number;
  confidence: "HIGH-CONF" | "MEDIUM-CONF" | "LOW-CONF";
  evidence: Array<{ file: string; line: number; snippet: string }>;
}

// Language features to exclude from inference (not project-specific)
const EXCLUDED_PATTERNS = new Set([
  "import", "export", "const", "let", "var", "function", "class",
  "return", "if", "for", "while", "switch", "try", "catch",
  "async", "await", "new", "typeof", "instanceof",
]);

const MIN_ADOPTION_PERCENT = 40;
const MAX_CONVENTIONS = 15;

/**
 * Infer project-specific conventions by analyzing source file patterns.
 *
 * Analyzes:
 * 1. Import extension patterns (.js, .ts, no extension)
 * 2. High-frequency package imports (e.g., @effect/*)
 * 3. High-frequency function/method calls
 * 4. Export patterns (dual(), re-exports)
 */
export function inferConventions(
  projectRoot: string,
  sourceFiles: string[],
): InferredConvention[] {
  if (sourceFiles.length === 0) return [];

  const conventions: InferredConvention[] = [];
  const nonTestFiles = sourceFiles.filter(f => !isTestFile(f));
  const totalFiles = nonTestFiles.length;
  if (totalFiles < 3) return []; // Need minimum sample size

  // --- 1. Import extension analysis ---
  const extCounts: Record<string, { count: number; files: Set<string>; evidence: Array<{ file: string; line: number; snippet: string }> }> = {
    ".js": { count: 0, files: new Set(), evidence: [] },
    ".ts": { count: 0, files: new Set(), evidence: [] },
    "none": { count: 0, files: new Set(), evidence: [] },
  };

  // --- 2. Package import frequency ---
  const packageImports = new Map<string, { count: number; files: Set<string>; evidence: Array<{ file: string; line: number; snippet: string }> }>();

  // --- 3. Function call frequency ---
  const functionCalls = new Map<string, { count: number; files: Set<string>; evidence: Array<{ file: string; line: number; snippet: string }> }>();

  for (const filePath of nonTestFiles) {
    const absPath = path.isAbsolute(filePath) ? filePath : path.join(projectRoot, filePath);
    let content: string;
    try {
      content = fs.readFileSync(absPath, "utf-8");
    } catch { continue; }

    const lines = content.split("\n");
    const relPath = path.isAbsolute(filePath)
      ? path.relative(projectRoot, filePath)
      : filePath;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Import analysis
      const importMatch = line.match(/(?:import|from)\s+['"]([^'"]+)['"]/);
      if (importMatch) {
        const source = importMatch[1];
        if (source.startsWith(".")) {
          // Relative import -- check extension
          if (source.endsWith(".js")) {
            extCounts[".js"].count++;
            extCounts[".js"].files.add(relPath);
            if (extCounts[".js"].evidence.length < 3) {
              extCounts[".js"].evidence.push({ file: relPath, line: i + 1, snippet: line.trim() });
            }
          } else if (source.endsWith(".ts") || source.endsWith(".tsx")) {
            extCounts[".ts"].count++;
            extCounts[".ts"].files.add(relPath);
            if (extCounts[".ts"].evidence.length < 3) {
              extCounts[".ts"].evidence.push({ file: relPath, line: i + 1, snippet: line.trim() });
            }
          } else {
            extCounts["none"].count++;
            extCounts["none"].files.add(relPath);
            if (extCounts["none"].evidence.length < 3) {
              extCounts["none"].evidence.push({ file: relPath, line: i + 1, snippet: line.trim() });
            }
          }
        } else {
          // Package import
          const pkgName = source.startsWith("@")
            ? source.split("/").slice(0, 2).join("/")
            : source.split("/")[0];
          if (!pkgName.startsWith("node:")) {
            const existing = packageImports.get(pkgName) ?? { count: 0, files: new Set(), evidence: [] };
            existing.count++;
            existing.files.add(relPath);
            if (existing.evidence.length < 3) {
              existing.evidence.push({ file: relPath, line: i + 1, snippet: line.trim() });
            }
            packageImports.set(pkgName, existing);
          }
        }
      }

      // Standalone function call analysis (pipe, dual, flow, etc.)
      const standaloneCallMatches = line.matchAll(/\b(pipe|dual|flow|unsafeCoerce|gen|succeed|fail|flatMap|map|tap)\s*\(/g);
      for (const match of standaloneCallMatches) {
        const callName = match[1];
        const existing = functionCalls.get(callName) ?? { count: 0, files: new Set(), evidence: [] };
        existing.count++;
        existing.files.add(relPath);
        if (existing.evidence.length < 3) {
          existing.evidence.push({ file: relPath, line: i + 1, snippet: line.trim() });
        }
        functionCalls.set(callName, existing);
      }

      // Also catch PascalCase.method() patterns (Class.method calls)
      const methodCallMatches = line.matchAll(/\b([A-Z][a-zA-Z0-9]*\.[a-zA-Z][a-zA-Z0-9]*)\s*\(/g);
      for (const match of methodCallMatches) {
        const callName = match[1];
        if (EXCLUDED_PATTERNS.has(callName.toLowerCase())) continue;
        const existing = functionCalls.get(callName) ?? { count: 0, files: new Set(), evidence: [] };
        existing.count++;
        existing.files.add(relPath);
        if (existing.evidence.length < 3) {
          existing.evidence.push({ file: relPath, line: i + 1, snippet: line.trim() });
        }
        functionCalls.set(callName, existing);
      }
    }
  }

  // --- Produce conventions ---

  // Import extension convention
  const totalRelativeImports = extCounts[".js"].count + extCounts[".ts"].count + extCounts["none"].count;
  if (totalRelativeImports > 0) {
    for (const [ext, data] of Object.entries(extCounts)) {
      const pct = Math.round((data.count / totalRelativeImports) * 100);
      if (pct >= MIN_ADOPTION_PERCENT) {
        const label = ext === "none" ? "No Extension" : ext;
        conventions.push({
          name: `Import Extension: ${label}`,
          pattern: `Relative imports use "${label}" extension`,
          frequency: data.count,
          totalFiles: totalRelativeImports,
          adoptionPercent: pct,
          confidence: pct >= 80 ? "HIGH-CONF" : "MEDIUM-CONF",
          evidence: data.evidence,
        });
      }
    }
  }

  // Package ecosystem convention
  const pkgEntries = [...packageImports.entries()]
    .filter(([_, data]) => data.files.size >= 2) // at least 2 different files
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 5);

  for (const [pkg, data] of pkgEntries) {
    const filesUsing = data.files.size;
    const pct = Math.round((data.count / totalFiles) * 100);
    if (pct >= MIN_ADOPTION_PERCENT) {
      conventions.push({
        name: `Package Ecosystem: ${pkg}`,
        pattern: `Imports from ${pkg} appear in ${filesUsing}+ files (${data.count} imports)`,
        frequency: data.count,
        totalFiles: totalFiles,
        adoptionPercent: Math.min(pct, 100),
        confidence: pct >= 80 ? "HIGH-CONF" : "MEDIUM-CONF",
        evidence: data.evidence,
      });
    }
  }

  // Function call conventions
  const callEntries = [...functionCalls.entries()]
    .filter(([name, data]) => {
      return data.files.size >= 2 && !EXCLUDED_PATTERNS.has(name.toLowerCase());
    })
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 5);

  for (const [name, data] of callEntries) {
    const filesUsing = data.files.size;
    const pct = Math.round((filesUsing / totalFiles) * 100);
    if (pct >= MIN_ADOPTION_PERCENT) {
      conventions.push({
        name: `API Pattern: ${name}()`,
        pattern: `${name}() called in ${filesUsing} files (${data.count} times)`,
        frequency: data.count,
        totalFiles: totalFiles,
        adoptionPercent: Math.min(pct, 100),
        confidence: pct >= 70 ? "HIGH-CONF" : "MEDIUM-CONF",
        evidence: data.evidence,
      });
    }
  }

  return conventions
    .sort((a, b) => b.adoptionPercent - a.adoptionPercent)
    .slice(0, MAX_CONVENTIONS);
}

function isTestFile(filePath: string): boolean {
  return /\.(test|spec)\.(ts|tsx|js|jsx|mjs)$/.test(filePath) ||
    filePath.includes("__tests__") ||
    filePath.includes("/test/") ||
    filePath.includes("/tests/");
}

/**
 * Format inferred conventions as markdown in the canonical h3+table format.
 */
export function formatInferredConventions(conventions: InferredConvention[]): string {
  if (conventions.length === 0) return "";

  const lines: string[] = [];
  lines.push("");
  lines.push("### Inferred Project-Specific Conventions");
  lines.push("");

  for (const conv of conventions) {
    lines.push(`### ${conv.name}`);
    lines.push("");
    lines.push("| Metric | Value |");
    lines.push("|--------|-------|");
    lines.push(`| Adoption | ${conv.adoptionPercent}% (${conv.frequency}/${conv.totalFiles} files) |`);
    lines.push(`| Confidence | ${conv.confidence} |`);
    lines.push(`| Category | inferred |`);
    lines.push("");
    lines.push("**Evidence:**");
    for (const ev of conv.evidence.slice(0, 3)) {
      lines.push(`- \`${ev.file}:${ev.line}\` -- ${ev.snippet.slice(0, 80)}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}
