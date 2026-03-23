export interface RuleMatch {
  ruleId: string;
  file: string;
  line: number; // 1-based (convert from ast-grep's 0-based)
  column: number;
  text: string;
  message: string;
  severity: string;
}

export interface ConventionResult {
  ruleId: string;
  name: string; // human-readable convention name
  category: string; // error-handling, imports, async, exports, components, types
  matchingFiles: string[];
  totalApplicableFiles: number;
  adoptionPercent: number; // 0-100
  confidence: "HIGH-CONF" | "MEDIUM-CONF" | "LOW-CONF";
  trend: "Stable"; // always Stable in v1 per D-11
  evidence: Array<{ file: string; line: number; description: string }>;
}

export interface CompetingPair {
  a: string; // ruleId of pattern A
  b: string; // ruleId of pattern B
  label: string; // human-readable conflict name
}

export interface ConflictInfo {
  label: string;
  patternA: { ruleId: string; name: string; adoption: number };
  patternB: { ruleId: string; name: string; adoption: number };
}

export interface GoldenFileEntry {
  filePath: string;
  conventionsFollowed: number;
  conventionsApplicable: number;
  density: number; // conventionsFollowed / conventionsApplicable
}

export interface ConventionScanResult {
  conventions: ConventionResult[];
  conflicts: ConflictInfo[];
  goldenFiles: GoldenFileEntry[];
  totalRulesEvaluated: number;
  totalConventionsDetected: number;
}
