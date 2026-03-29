import type { DbHandle } from "./types.js";

/**
 * Get community assignments for file node IDs from SQLite.
 */
export function getFileCommunities(
  db: DbHandle,
  nodeIds: string[],
): Map<string, { communityId: number; label: string }> {
  if (nodeIds.length === 0) {
    return new Map();
  }

  const placeholders = nodeIds.map(() => "?").join(",");
  const rows = db
    .prepare(
      `SELECT node_id, community_id, modularity_class
       FROM communities WHERE node_id IN (${placeholders})`,
    )
    .all(...nodeIds.map(Number)) as Array<{
    node_id: number;
    community_id: number;
    modularity_class: string;
  }>;

  const map = new Map<string, { communityId: number; label: string }>();
  for (const row of rows) {
    map.set(String(row.node_id), {
      communityId: row.community_id,
      label: row.modularity_class,
    });
  }
  return map;
}

/**
 * Get edges involving changed files from SQLite.
 */
export function getEdgesForFiles(
  db: DbHandle,
  changedFiles: string[],
): Array<{
  source: string;
  target: string;
  kind: string;
}> {
  if (changedFiles.length === 0) {
    return [];
  }

  const placeholders = changedFiles.map(() => "?").join(",");
  const rows = db
    .prepare(
      `SELECT e.source_id, e.target_id, e.kind,
              src.file_path AS source_path, tgt.file_path AS target_path
       FROM edges e
       JOIN nodes src ON e.source_id = src.id
       JOIN nodes tgt ON e.target_id = tgt.id
       WHERE src.file_path IN (${placeholders}) OR tgt.file_path IN (${placeholders})`,
    )
    .all(...changedFiles, ...changedFiles) as Array<{
    source_id: number;
    target_id: number;
    kind: string;
    source_path: string;
    target_path: string;
  }>;

  return rows.map((row) => ({
    source: row.source_path,
    target: row.target_path,
    kind: row.kind,
  }));
}

/**
 * Get node IDs for file paths from SQLite.
 */
export function getNodeIdsForFiles(
  db: DbHandle,
  filePaths: string[],
): Map<string, string> {
  if (filePaths.length === 0) {
    return new Map();
  }

  const placeholders = filePaths.map(() => "?").join(",");
  const rows = db
    .prepare(
      `SELECT id, file_path FROM nodes WHERE file_path IN (${placeholders})`,
    )
    .all(...filePaths) as Array<{ id: number; file_path: string }>;

  const map = new Map<string, string>();
  for (const row of rows) {
    map.set(row.file_path, String(row.id));
  }
  return map;
}
