// ---------------------------------------------------------------------------
// Wave-based execution scheduling with file overlap validation
// Per EXEC-07 (hybrid dependency analysis) and EXEC-10 (file overlap gate).
// ---------------------------------------------------------------------------

import type { AgentAssignment, ExecutionWave, ValidationCheck } from "../orient/types.js";

export type { AgentAssignment, ExecutionWave, ValidationCheck };

// ---------------------------------------------------------------------------
// buildWaveSchedule
// ---------------------------------------------------------------------------

/**
 * Build a wave-based execution schedule from agent assignments.
 *
 * 1. Build dependency DAG from each agent's dependsOn list
 * 2. Topological sort into waves (wave 1 = no deps, wave N = all deps in < N)
 * 3. Within each wave, check file overlap and split sub-waves if needed
 * 4. Determine overall strategy
 *
 * @param agents - Array of agent assignments with dependency info
 * @returns Waves sorted by waveNumber ascending and the overall strategy
 * @throws Error if circular dependencies detected
 */
export function buildWaveSchedule(agents: AgentAssignment[]): {
  waves: ExecutionWave[];
  strategy: "sequential" | "parallel" | "wave-based";
} {
  // Step 1: Build adjacency info
  const agentMap = new Map<string, AgentAssignment>();
  for (const agent of agents) {
    agentMap.set(agent.name, agent);
  }

  // Step 2: Topological sort into waves
  const waveAssignment = new Map<string, number>(); // agent name -> wave number
  const placed = new Set<string>();
  let changed = true;
  let maxIterations = agents.length + 1;

  // First pass: agents with no dependencies go to wave 1
  for (const agent of agents) {
    if (agent.dependsOn.length === 0) {
      waveAssignment.set(agent.name, 1);
      placed.add(agent.name);
    }
  }

  // Iteratively place agents whose dependencies are all placed
  while (changed && maxIterations > 0) {
    changed = false;
    maxIterations--;

    for (const agent of agents) {
      if (placed.has(agent.name)) continue;

      const allDepsPlaced = agent.dependsOn.every((dep) => placed.has(dep));
      if (allDepsPlaced) {
        // Wave = max(dependency waves) + 1
        const depWave = Math.max(
          ...agent.dependsOn.map((dep) => waveAssignment.get(dep) ?? 0),
        );
        waveAssignment.set(agent.name, depWave + 1);
        placed.add(agent.name);
        changed = true;
      }
    }
  }

  // Check for unplaced agents (circular dependency)
  const unplaced = agents
    .filter((a) => !placed.has(a.name))
    .map((a) => a.name);
  if (unplaced.length > 0) {
    throw new Error(
      `Circular dependency detected involving: ${unplaced.join(", ")}`,
    );
  }

  // Step 3: Group agents into waves
  const waveGroups = new Map<number, string[]>();
  for (const [agentName, waveNum] of waveAssignment) {
    const group = waveGroups.get(waveNum) ?? [];
    group.push(agentName);
    waveGroups.set(waveNum, group);
  }

  // Step 4: Within each wave, check file overlap and split if needed
  const finalWaves: ExecutionWave[] = [];
  let nextWaveNumber = 1;

  const sortedWaveNums = [...waveGroups.keys()].sort((a, b) => a - b);

  for (const origWaveNum of sortedWaveNums) {
    const agentNames = waveGroups.get(origWaveNum)!;

    if (agentNames.length <= 1) {
      // Single agent wave is always sequential
      finalWaves.push({
        waveNumber: nextWaveNumber++,
        agents: agentNames,
        mode: "sequential",
      });
      continue;
    }

    // Check for file overlap within this wave
    const overlapGroups = splitByFileOverlap(agentNames, agentMap);

    for (const group of overlapGroups) {
      finalWaves.push({
        waveNumber: nextWaveNumber++,
        agents: group,
        mode: group.length > 1 ? "parallel" : "sequential",
      });
    }
  }

  // Step 5: Determine strategy
  const strategy = determineStrategy(finalWaves);

  return { waves: finalWaves, strategy };
}

// ---------------------------------------------------------------------------
// File overlap splitting within a wave
// ---------------------------------------------------------------------------

/**
 * Split agents in a wave into groups that don't have file overlap.
 * Uses a greedy coloring approach: try to place each agent in an existing
 * group; if it overlaps with any agent already in the group, start a new one.
 */
function splitByFileOverlap(
  agentNames: string[],
  agentMap: Map<string, AgentAssignment>,
): string[][] {
  const groups: string[][] = [];

  for (const agentName of agentNames) {
    const agentFiles = new Set(
      agentMap.get(agentName)?.exclusiveWriteFiles ?? [],
    );

    let placed = false;
    for (const group of groups) {
      const hasOverlap = group.some((existingName) => {
        const existingFiles = new Set(
          agentMap.get(existingName)?.exclusiveWriteFiles ?? [],
        );
        return [...agentFiles].some((f) => existingFiles.has(f));
      });

      if (!hasOverlap) {
        group.push(agentName);
        placed = true;
        break;
      }
    }

    if (!placed) {
      groups.push([agentName]);
    }
  }

  return groups;
}

// ---------------------------------------------------------------------------
// Strategy determination
// ---------------------------------------------------------------------------

function determineStrategy(
  waves: ExecutionWave[],
): "sequential" | "parallel" | "wave-based" {
  const allSingle = waves.every((w) => w.agents.length === 1);
  if (allSingle) return "sequential";

  const hasMultiAgent = waves.some((w) => w.agents.length > 1);
  if (waves.length === 1 && hasMultiAgent) return "parallel";

  if (hasMultiAgent) return "wave-based";

  return "sequential";
}

// ---------------------------------------------------------------------------
// validateFileOverlap
// ---------------------------------------------------------------------------

/**
 * Validate that no two agents in the same parallel wave write to overlapping
 * files. Per D-19 check (1): no overlapping file writes in same parallel wave.
 *
 * @param agents - All agent assignments
 * @param waves - Wave schedule to validate
 * @returns Array of validation checks (PASS or FAIL per overlap found)
 */
export function validateFileOverlap(
  agents: AgentAssignment[],
  waves: ExecutionWave[],
): ValidationCheck[] {
  const agentMap = new Map<string, AgentAssignment>();
  for (const agent of agents) {
    agentMap.set(agent.name, agent);
  }

  const checks: ValidationCheck[] = [];

  for (const wave of waves) {
    if (wave.mode !== "parallel") continue;

    const agentNames = wave.agents;
    for (let i = 0; i < agentNames.length; i++) {
      for (let j = i + 1; j < agentNames.length; j++) {
        const filesA = new Set(
          agentMap.get(agentNames[i])?.exclusiveWriteFiles ?? [],
        );
        const filesB = new Set(
          agentMap.get(agentNames[j])?.exclusiveWriteFiles ?? [],
        );
        const overlap = [...filesA].filter((f) => filesB.has(f));

        if (overlap.length > 0) {
          checks.push({
            name: `file-overlap-wave-${wave.waveNumber}`,
            status: "FAIL",
            detail: `${agentNames[i]} and ${agentNames[j]} both write: ${overlap.join(", ")}`,
          });
        }
      }
    }
  }

  if (!checks.some((c) => c.status === "FAIL")) {
    checks.push({ name: "file-overlap", status: "PASS" });
  }

  return checks;
}

// ---------------------------------------------------------------------------
// validateDependencyOrdering
// ---------------------------------------------------------------------------

/**
 * Validate that no agent depends on another agent in the same or later wave,
 * and that there are no circular dependencies.
 * Per D-19 check (2).
 *
 * @param agents - All agent assignments
 * @param waves - Wave schedule to validate
 * @returns Array of validation checks
 */
export function validateDependencyOrdering(
  agents: AgentAssignment[],
  waves: ExecutionWave[],
): ValidationCheck[] {
  const checks: ValidationCheck[] = [];

  // Build wave lookup: agentName -> waveNumber
  const waveLookup = new Map<string, number>();
  for (const wave of waves) {
    for (const agentName of wave.agents) {
      waveLookup.set(agentName, wave.waveNumber);
    }
  }

  // Check each agent's dependencies
  for (const agent of agents) {
    const agentWave = waveLookup.get(agent.name);
    if (agentWave === undefined) continue;

    for (const dep of agent.dependsOn) {
      const depWave = waveLookup.get(dep);
      if (depWave === undefined) {
        checks.push({
          name: `dep-ordering-${agent.name}`,
          status: "FAIL",
          detail: `${agent.name} depends on ${dep} which is not in any wave`,
        });
        continue;
      }

      if (depWave >= agentWave) {
        checks.push({
          name: `dep-ordering-${agent.name}`,
          status: "FAIL",
          detail: `${agent.name} depends on ${dep} which is in wave ${depWave} (same or later than wave ${agentWave})`,
        });
      }
    }
  }

  // Check for circular dependencies via DFS
  const agentMap = new Map<string, AgentAssignment>();
  for (const agent of agents) {
    agentMap.set(agent.name, agent);
  }

  const visited = new Set<string>();
  const inStack = new Set<string>();

  function hasCycle(name: string): boolean {
    if (inStack.has(name)) return true;
    if (visited.has(name)) return false;

    visited.add(name);
    inStack.add(name);

    const agent = agentMap.get(name);
    if (agent) {
      for (const dep of agent.dependsOn) {
        if (hasCycle(dep)) return true;
      }
    }

    inStack.delete(name);
    return false;
  }

  for (const agent of agents) {
    visited.clear();
    inStack.clear();
    if (hasCycle(agent.name)) {
      checks.push({
        name: "circular-dependency",
        status: "FAIL",
        detail: `Circular dependency detected involving ${agent.name}`,
      });
      break; // One circular check is enough
    }
  }

  if (checks.length === 0) {
    checks.push({ name: "dependency-ordering", status: "PASS" });
  }

  return checks;
}

// ---------------------------------------------------------------------------
// validateScopeCoverage
// ---------------------------------------------------------------------------

/**
 * Validate that every in-scope item has at least one agent assigned.
 * Per D-19 check (3).
 *
 * @param agents - All agent assignments
 * @param inScopeItems - List of in-scope item descriptions
 * @returns Array of validation checks
 */
export function validateScopeCoverage(
  agents: AgentAssignment[],
  inScopeItems: string[],
): ValidationCheck[] {
  if (inScopeItems.length === 0) {
    return [{ name: "scope-coverage", status: "PASS" }];
  }

  // Build a combined searchable text from all agents
  const agentTexts = agents.map((a) => {
    const parts = [
      a.task.toLowerCase(),
      ...a.exclusiveWriteFiles.map((f) => f.toLowerCase()),
      ...a.readOnlyFiles.map((f) => f.toLowerCase()),
    ];
    return parts.join(" ");
  });

  const uncovered: string[] = [];

  for (const item of inScopeItems) {
    const itemLower = item.toLowerCase();
    // Split into words for flexible matching
    const words = itemLower.split(/\s+/).filter((w) => w.length > 2);

    const isCovered = agentTexts.some((text) =>
      words.some((word) => text.includes(word)),
    );

    if (!isCovered) {
      uncovered.push(item);
    }
  }

  if (uncovered.length === 0) {
    return [{ name: "scope-coverage", status: "PASS" }];
  }

  return [
    {
      name: "scope-coverage",
      status: "WARNING",
      detail: `Uncovered in-scope items: ${uncovered.join(", ")}`,
    },
  ];
}
