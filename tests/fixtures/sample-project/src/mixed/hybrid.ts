/**
 * Hybrid file demonstrating mixed patterns.
 * - Mix of named exports AND a default export
 * - Mix of async/await AND .then() chains
 * - Helps test conflict detection thresholds
 */

import { EventEmitter } from "node:events";

export interface HybridConfig {
  mode: string;
  retries: number;
}

export async function processAsync(data: string): Promise<string> {
  const result = await Promise.resolve(data.toUpperCase());
  return result;
}

export function processSync(data: string): string {
  return data.toLowerCase();
}

function fetchData(url: string): Promise<unknown> {
  return fetch(url)
    .then((res) => res.json())
    .then((data) => data);
}

export class HybridService {
  private emitter = new EventEmitter();

  async run(url: string): Promise<void> {
    const data = await fetchData(url);
    this.emitter.emit("data", data);
  }
}

export default class DefaultHybrid {
  name = "hybrid";
}
