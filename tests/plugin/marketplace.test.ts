import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";

const PROJECT_ROOT = path.resolve(import.meta.dirname ?? __dirname, "..", "..");

describe("Plugin marketplace", () => {
  it("marketplace.json does not exist (prevents recursive cloning loop per PLUG-01)", () => {
    const marketplacePath = path.join(PROJECT_ROOT, ".claude-plugin", "marketplace.json");
    expect(fs.existsSync(marketplacePath)).toBe(false);
  });

  it("plugin.json exists and is valid JSON (PLUG-02)", () => {
    const pluginPath = path.join(PROJECT_ROOT, ".claude-plugin", "plugin.json");
    expect(fs.existsSync(pluginPath)).toBe(true);
    const content = JSON.parse(fs.readFileSync(pluginPath, "utf-8"));
    expect(content.name).toBe("codescope");
    expect(content.skills).toBeDefined();
    expect(content.mcpServers).toBeDefined();
  });
});
