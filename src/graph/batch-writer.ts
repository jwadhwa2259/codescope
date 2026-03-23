import * as fs from "node:fs";
import * as path from "node:path";
import type { Database as DatabaseType } from "better-sqlite3";

/**
 * A node record for JSONL batch writing.
 * Represents a code entity (file, class, function, variable, module).
 */
export interface NodeRecord {
  type: "node";
  name: string;
  kind: string;
  file_path: string;
  start_line?: number;
  end_line?: number;
  signature?: string;
  complexity?: number;
  is_exported?: boolean;
  is_test?: boolean;
  language?: string;
  loc?: number;
  last_modified?: number;
  metadata?: Record<string, unknown>;
}

/**
 * An edge record for JSONL batch writing.
 * Represents a relationship between two nodes, resolved by name+file_path during insert.
 */
export interface EdgeRecord {
  type: "edge";
  source_name: string;
  source_file_path: string;
  target_name: string;
  target_file_path: string;
  kind: string;
  weight?: number;
  metadata?: Record<string, unknown>;
}

type BatchRecord = NodeRecord | EdgeRecord;

/**
 * Result of processing batch JSONL files.
 */
export interface BatchResult {
  nodesInserted: number;
  edgesInserted: number;
  errors: string[];
}

/**
 * Writer side of the JSONL batch system.
 *
 * Used by sub-agents to append node/edge records to JSONL files.
 * Each agent gets its own file (named by agentName + timestamp).
 * The orchestrator later calls processBatchFiles to read and insert into SQLite.
 *
 * Pattern (from D-40): JSONL queue with batch insert for multi-agent writes.
 */
export class BatchWriter {
  private buffer: BatchRecord[] = [];
  private filePath: string;

  constructor(outputDir: string, agentName: string) {
    fs.mkdirSync(outputDir, { recursive: true });
    this.filePath = path.join(outputDir, `${agentName}-${Date.now()}.jsonl`);
  }

  /**
   * Queue a node record for writing.
   */
  addNode(node: Omit<NodeRecord, "type">): void {
    this.buffer.push({ type: "node", ...node });
  }

  /**
   * Queue an edge record for writing.
   * Edges reference nodes by name+file_path, resolved to IDs during processBatchFiles.
   */
  addEdge(edge: Omit<EdgeRecord, "type">): void {
    this.buffer.push({ type: "edge", ...edge });
  }

  /**
   * Write all buffered records to the JSONL file and reset the buffer.
   * Safe to call multiple times (no-op if buffer is empty).
   */
  flush(): void {
    if (this.buffer.length === 0) return;
    const lines = this.buffer.map((r) => JSON.stringify(r)).join("\n") + "\n";
    fs.appendFileSync(this.filePath, lines, "utf-8");
    this.buffer = [];
  }

  /**
   * Get the path of the JSONL file this writer is appending to.
   */
  getFilePath(): string {
    return this.filePath;
  }
}

/**
 * Reader side of the JSONL batch system.
 *
 * Reads all .jsonl files in batchDir, inserts records into SQLite in a single
 * transaction (all-or-nothing), and deletes processed files on success.
 *
 * Edge records are resolved by looking up source/target nodes by name+file_path.
 * If a referenced node is not found, the edge is skipped and an error is logged.
 *
 * Malformed JSON lines are skipped with an error logged (not fatal).
 */
export function processBatchFiles(
  db: DatabaseType,
  batchDir: string
): BatchResult {
  const files = fs.readdirSync(batchDir).filter((f) => f.endsWith(".jsonl"));
  let nodesInserted = 0;
  let edgesInserted = 0;
  const errors: string[] = [];

  const insertNode = db.prepare(`
    INSERT INTO nodes (name, kind, file_path, start_line, end_line, signature, complexity, is_exported, is_test, language, loc, last_modified, metadata)
    VALUES (@name, @kind, @file_path, @start_line, @end_line, @signature, @complexity, @is_exported, @is_test, @language, @loc, @last_modified, @metadata)
  `);

  const findNode = db.prepare(`
    SELECT id FROM nodes WHERE name = @name AND file_path = @file_path LIMIT 1
  `);

  const insertEdge = db.prepare(`
    INSERT INTO edges (source_id, target_id, kind, weight, metadata)
    VALUES (@source_id, @target_id, @kind, @weight, @metadata)
  `);

  const processAll = db.transaction(() => {
    // First pass: insert all nodes from all files
    for (const file of files) {
      const filePath = path.join(batchDir, file);
      const content = fs.readFileSync(filePath, "utf-8");
      const lines = content.split("\n").filter((l) => l.trim());

      for (const line of lines) {
        try {
          const record = JSON.parse(line) as BatchRecord;

          if (record.type === "node") {
            insertNode.run({
              name: record.name,
              kind: record.kind,
              file_path: record.file_path,
              start_line: record.start_line ?? null,
              end_line: record.end_line ?? null,
              signature: record.signature ?? null,
              complexity: record.complexity ?? null,
              is_exported: record.is_exported ? 1 : 0,
              is_test: record.is_test ? 1 : 0,
              language: record.language ?? null,
              loc: record.loc ?? null,
              last_modified: record.last_modified ?? null,
              metadata: record.metadata
                ? JSON.stringify(record.metadata)
                : null,
            });
            nodesInserted++;
          }
        } catch (err) {
          errors.push(`Malformed JSON line in ${file}: ${String(err)}`);
        }
      }
    }

    // Second pass: insert all edges (nodes are now available for lookup)
    for (const file of files) {
      const filePath = path.join(batchDir, file);
      // File may already be deleted if same file was processed — but we're
      // still in-transaction, file still exists at this point
      if (!fs.existsSync(filePath)) continue;
      const content = fs.readFileSync(filePath, "utf-8");
      const lines = content.split("\n").filter((l) => l.trim());

      for (const line of lines) {
        try {
          const record = JSON.parse(line) as BatchRecord;

          if (record.type === "edge") {
            const source = findNode.get({
              name: record.source_name,
              file_path: record.source_file_path,
            }) as { id: number } | undefined;
            const target = findNode.get({
              name: record.target_name,
              file_path: record.target_file_path,
            }) as { id: number } | undefined;

            if (source && target) {
              insertEdge.run({
                source_id: source.id,
                target_id: target.id,
                kind: record.kind,
                weight: record.weight ?? 1.0,
                metadata: record.metadata
                  ? JSON.stringify(record.metadata)
                  : null,
              });
              edgesInserted++;
            } else {
              errors.push(
                `Edge skipped: source or target not found for ${record.source_name} -> ${record.target_name}`
              );
            }
          }
        } catch {
          // Already logged in first pass for malformed lines
        }
      }
    }

    // Delete all processed files
    for (const file of files) {
      const filePath = path.join(batchDir, file);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    }
  });

  processAll();
  return { nodesInserted, edgesInserted, errors };
}
