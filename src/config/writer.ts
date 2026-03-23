import * as fs from "node:fs";
import * as path from "node:path";
import * as yaml from "js-yaml";
import type { Config } from "./schema.js";
import { getConfigPath } from "../utils/paths.js";

/**
 * Write a Config object to disk as YAML at the standard config.yml location.
 * Creates parent directories if they do not exist.
 */
export function writeConfig(projectRoot: string, config: Config): void {
  const configPath = getConfigPath(projectRoot);
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  const content = yaml.dump(config, {
    lineWidth: 120,
    noRefs: true,
    sortKeys: false,
  });
  fs.writeFileSync(configPath, content, "utf-8");
}
