import type {
  RuleMatch,
  ConventionResult,
  CompetingPair,
  ConflictInfo,
  ConventionScanResult,
} from "./types.js";

export const COMPETING_PAIRS: CompetingPair[] = [];

export function runAstGrepScan(
  _rulesDir: string,
  _targetDir: string,
): RuleMatch[] {
  throw new Error("Not implemented");
}

export function countApplicableFiles(
  _targetDir: string,
  _language: "TypeScript" | "Python",
): number {
  throw new Error("Not implemented");
}

export function calculateAdoption(
  _matches: RuleMatch[],
  _totalApplicableFiles: number,
): {
  adoptionPercent: number;
  matchingFiles: string[];
  confidence: "HIGH-CONF" | "MEDIUM-CONF" | "LOW-CONF";
} {
  throw new Error("Not implemented");
}

export function buildEvidence(
  _matches: RuleMatch[],
  _maxEvidence: number = 3,
): Array<{ file: string; line: number; description: string }> {
  throw new Error("Not implemented");
}

export function detectConflicts(
  _conventions: ConventionResult[],
): ConflictInfo[] {
  throw new Error("Not implemented");
}

export function runConventionScan(
  _targetDir: string,
  _rulesDir: string,
): ConventionScanResult {
  throw new Error("Not implemented");
}
