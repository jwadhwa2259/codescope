import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import type { Database as DatabaseType } from "better-sqlite3";

/**
 * Computes the SHA-256 content hash of a file.
 *
 * Returns a 64-character lowercase hex string, or null if the file
 * cannot be read (e.g., deleted, unreadable).
 *
 * Per D-02: File changes detected via SHA-256 content hash.
 */
export function computeFileHash(filePath: string): string | null {
  try {
    const content = fs.readFileSync(filePath, "utf-8");
    return crypto.createHash("sha256").update(content).digest("hex");
  } catch {
    // File deleted or unreadable
    return null;
  }
}

/**
 * Returns an array of file paths (relative) that are stale -- meaning their
 * current content hash differs from the stored hash in the database, or they
 * have no stored hash (new file, lazy population per Open Question 3), or
 * they have a stored hash but the file was deleted from disk.
 *
 * Per D-03: Hash checks scoped to queried files only.
 * Per D-01: Staleness checks run on every MCP tool call.
 *
 * @param db - The database connection with file_hashes table
 * @param filePaths - Relative file paths to check
 * @param projectRoot - Project root directory for resolving absolute paths
 * @returns Array of stale relative file paths
 */
export function getStaleFiles(
  db: DatabaseType,
  filePaths: string[],
  projectRoot: string
): string[] {
  const stale: string[] = [];
  const getHash = db.prepare(
    "SELECT content_hash FROM file_hashes WHERE file_path = ?"
  );

  for (const relPath of filePaths) {
    const absolutePath = path.join(projectRoot, relPath);
    const currentHash = computeFileHash(absolutePath);
    const row = getHash.get(relPath) as { content_hash: string } | undefined;
    const storedHash = row?.content_hash ?? null;

    if (currentHash === null && storedHash !== null) {
      // File deleted but hash exists -- stale
      stale.push(relPath);
    } else if (storedHash === null) {
      // No stored hash (new file, lazy population) -- stale
      stale.push(relPath);
    } else if (storedHash !== currentHash) {
      // Hash mismatch -- stale
      stale.push(relPath);
    }
    // else: hashes match -- fresh, skip
  }

  return stale;
}

/**
 * Inserts or updates the content hash for a file in the file_hashes table.
 *
 * Uses INSERT OR REPLACE to upsert (file_path is PRIMARY KEY).
 *
 * @param db - The database connection
 * @param filePath - Relative file path (matches file_hashes.file_path)
 * @param contentHash - SHA-256 hex hash string
 */
export function updateFileHash(
  db: DatabaseType,
  filePath: string,
  contentHash: string
): void {
  db.prepare(
    "INSERT OR REPLACE INTO file_hashes (file_path, content_hash, updated_at) VALUES (?, ?, ?)"
  ).run(filePath, contentHash, Date.now());
}

/**
 * Removes the stored hash for a file from the file_hashes table.
 *
 * Called when a file is deleted from the project.
 *
 * @param db - The database connection
 * @param filePath - Relative file path to remove
 */
export function removeFileHash(db: DatabaseType, filePath: string): void {
  db.prepare("DELETE FROM file_hashes WHERE file_path = ?").run(filePath);
}
