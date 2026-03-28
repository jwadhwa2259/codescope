// ---------------------------------------------------------------------------
// Tests for orient --resume flag and artifact-based phase skipping
// ---------------------------------------------------------------------------
// Tests determineResumePhase() and parseArgs() --resume flag support.
// ---------------------------------------------------------------------------

import { describe, it, expect, afterEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { determineResumePhase, parseArgsExported as parseArgs } from "../../src/orient/run-orient.js";

describe("orient --resume", () => {
  const tempDirs: string[] = [];

  function makeTempDir(): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "orient-resume-"));
    tempDirs.push(dir);
    return dir;
  }

  afterEach(() => {
    for (const dir of tempDirs) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
    tempDirs.length = 0;
  });

  // Test 1: parseArgs extracts --resume value as taskSlug
  it("parseArgs extracts --resume value as taskSlug", () => {
    const result = parseArgs(["--resume", "my-task-slug"]);
    expect(result.resume).toBe("my-task-slug");
  });

  // Test 2: returns "clarification" when no artifacts exist
  it('returns "clarification" when no artifacts exist in execution dir', () => {
    const dir = makeTempDir();
    const result = determineResumePhase(dir);
    expect(result.phase).toBe("clarification");
    expect(result.skipped).toEqual([]);
  });

  // Test 3: returns "research" when clarification.json and scope-contract.md exist
  it('returns "research" when clarification.json and scope-contract.md exist', () => {
    const dir = makeTempDir();
    fs.writeFileSync(path.join(dir, "clarification.json"), "");
    fs.writeFileSync(path.join(dir, "scope-contract.md"), "");
    const result = determineResumePhase(dir);
    expect(result.phase).toBe("research");
    expect(result.skipped).toEqual(["clarification", "scope-contract"]);
  });

  // Test 4: returns "analysis-and-planning" when clarification + scope-contract + research exist
  it('returns "analysis-and-planning" when clarification + scope-contract + research all exist', () => {
    const dir = makeTempDir();
    fs.writeFileSync(path.join(dir, "clarification.json"), "");
    fs.writeFileSync(path.join(dir, "scope-contract.md"), "");
    fs.writeFileSync(path.join(dir, "research.md"), "");
    const result = determineResumePhase(dir);
    expect(result.phase).toBe("analysis-and-planning");
    expect(result.skipped).toEqual(["clarification", "scope-contract", "research"]);
  });

  // Test 5: returns "execution" when all pre-execution artifacts exist
  it('returns "execution" when all pre-execution artifacts exist', () => {
    const dir = makeTempDir();
    fs.writeFileSync(path.join(dir, "clarification.json"), "");
    fs.writeFileSync(path.join(dir, "scope-contract.md"), "");
    fs.writeFileSync(path.join(dir, "research.md"), "");
    fs.writeFileSync(path.join(dir, "analysis.json"), "");
    fs.writeFileSync(path.join(dir, "coordination.md"), "");
    const result = determineResumePhase(dir);
    expect(result.phase).toBe("execution");
    expect(result.skipped).toEqual([
      "clarification",
      "scope-contract",
      "research",
      "analysis-and-planning",
      "execution",
    ]);
  });

  // Test 6: resume with non-existent taskSlug -- covered by existsSync check in main()
  // We test that determineResumePhase handles missing dir gracefully by testing
  // the exported function directly (main() would exit(1) before calling it)
  it("resume with non-existent execution directory returns clarification", () => {
    const nonExistentDir = path.join(os.tmpdir(), "does-not-exist-" + Date.now());
    // determineResumePhase requires the dir to exist (main validates first),
    // but if somehow called with non-existent dir, existsSync returns false for all artifacts
    const result = determineResumePhase(nonExistentDir);
    expect(result.phase).toBe("clarification");
    expect(result.skipped).toEqual([]);
  });
});
