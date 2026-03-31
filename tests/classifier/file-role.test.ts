import { describe, it, expect } from "vitest";
import { classifyFileRole } from "../../src/classifier/file-role.js";

describe("classifyFileRole", () => {
  // Tier 1: filename-based classification
  it("classifies .test.ts files as test with confidence >= 0.90", () => {
    const result = classifyFileRole("src/utils/hash.test.ts");
    expect(result.role).toBe("test");
    expect(result.confidence).toBeGreaterThanOrEqual(0.90);
  });

  it("classifies .config.ts files as config with confidence >= 0.90", () => {
    const result = classifyFileRole("vitest.config.ts");
    expect(result.role).toBe("config");
    expect(result.confidence).toBeGreaterThanOrEqual(0.90);
  });

  it("classifies files with 'deprecated' in basename as deprecated", () => {
    const result = classifyFileRole("src/utils/deprecated-helpers.ts");
    expect(result.role).toBe("deprecated");
  });

  // Tier 2: path-based classification
  it("classifies files in /routes/ as route-handler", () => {
    const result = classifyFileRole("src/routes/users.ts");
    expect(result.role).toBe("route-handler");
    expect(result.confidence).toBeGreaterThanOrEqual(0.80);
  });

  it("classifies files in /utils/ as utility", () => {
    const result = classifyFileRole("src/utils/hash.ts");
    expect(result.role).toBe("utility");
    expect(result.confidence).toBeGreaterThanOrEqual(0.80);
  });

  // Tier 3: fallback
  it("classifies index.ts at project root as general", () => {
    const result = classifyFileRole("index.ts");
    expect(result.role).toBe("general");
    expect(result.confidence).toBe(0.50);
  });

  // Additional coverage
  it("classifies tsconfig.json as config", () => {
    const result = classifyFileRole("tsconfig.json");
    expect(result.role).toBe("config");
    expect(result.confidence).toBeGreaterThanOrEqual(0.90);
  });

  it("classifies files in __tests__ as test", () => {
    const result = classifyFileRole("__tests__/foo.ts");
    expect(result.role).toBe("test");
    expect(result.confidence).toBeGreaterThanOrEqual(0.85);
  });

  // Priority: filename wins over path
  it("classifies test file in routes/ as test (filename wins over path)", () => {
    const result = classifyFileRole("src/routes/users.test.ts");
    expect(result.role).toBe("test");
    expect(result.confidence).toBe(0.95);
  });

  // Additional tier 2 paths
  it("classifies files in /api/ as route-handler", () => {
    const result = classifyFileRole("src/api/auth.ts");
    expect(result.role).toBe("route-handler");
  });

  it("classifies files in /handlers/ as route-handler", () => {
    const result = classifyFileRole("src/handlers/webhook.ts");
    expect(result.role).toBe("route-handler");
  });

  it("classifies files in /helpers/ as utility", () => {
    const result = classifyFileRole("src/helpers/format.ts");
    expect(result.role).toBe("utility");
  });

  it("classifies files in /lib/ as utility", () => {
    const result = classifyFileRole("src/lib/db.ts");
    expect(result.role).toBe("utility");
  });

  it("classifies files in /shared/ as utility", () => {
    const result = classifyFileRole("src/shared/constants.ts");
    expect(result.role).toBe("utility");
  });

  it("classifies .spec.tsx files as test", () => {
    const result = classifyFileRole("src/components/Button.spec.tsx");
    expect(result.role).toBe("test");
    expect(result.confidence).toBe(0.95);
  });

  it("classifies .eslintrc.json as config", () => {
    const result = classifyFileRole(".eslintrc.json");
    expect(result.role).toBe("config");
  });

  it("classifies .prettierrc as config", () => {
    const result = classifyFileRole(".prettierrc");
    expect(result.role).toBe("config");
  });

  it("classifies jest.config.js as config", () => {
    const result = classifyFileRole("jest.config.js");
    expect(result.role).toBe("config");
  });

  it("classifies src/app.ts as general", () => {
    const result = classifyFileRole("src/app.ts");
    expect(result.role).toBe("general");
    expect(result.confidence).toBe(0.50);
  });
});
