import * as fs from "node:fs";
import * as yaml from "js-yaml";
import { ConfigSchema, type Config } from "./schema.js";
import { getConfigPath } from "../utils/paths.js";

/**
 * Check whether a config.yml file exists at the standard location.
 */
export function configExists(projectRoot: string): boolean {
  return fs.existsSync(getConfigPath(projectRoot));
}

/**
 * Load and validate config.yml from disk.
 *
 * Returns null if the file does not exist.
 * Throws an Error with a descriptive message if the file exists but is malformed.
 */
export function loadConfig(projectRoot: string): Config | null {
  const configPath = getConfigPath(projectRoot);
  if (!fs.existsSync(configPath)) return null;

  const raw = fs.readFileSync(configPath, "utf-8");
  const parsed = yaml.load(raw);

  const result = ConfigSchema.safeParse(parsed);
  if (!result.success) {
    throw new Error(
      `config.yml validation failed: ${result.error.message}. Fix the config file or run /codescope:onboard to regenerate.`,
    );
  }
  return result.data;
}
