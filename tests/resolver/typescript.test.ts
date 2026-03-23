import { describe, it, expect, beforeAll, afterAll } from "vitest";
import * as path from "node:path";
import * as fs from "node:fs";
import * as os from "node:os";
import {
  createTypeScriptResolver,
  resolveTypeScriptImport,
} from "../../src/resolver/typescript.js";

describe("TypeScript import resolver", () => {
  let tempDir: string;
  let resolver: ReturnType<typeof createTypeScriptResolver>;

  beforeAll(() => {
    // Create a temp directory with a realistic project structure
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "codescope-ts-resolver-"));

    // Create tsconfig.json with path aliases
    fs.writeFileSync(
      path.join(tempDir, "tsconfig.json"),
      JSON.stringify(
        {
          compilerOptions: {
            baseUrl: ".",
            paths: {
              "@/*": ["src/*"],
            },
          },
        },
        null,
        2
      )
    );

    // Create source files
    fs.mkdirSync(path.join(tempDir, "src", "utils"), { recursive: true });
    fs.writeFileSync(
      path.join(tempDir, "src", "utils", "helpers.ts"),
      "export function helper() {}"
    );
    fs.writeFileSync(
      path.join(tempDir, "src", "index.ts"),
      "export const main = true;"
    );

    // Create node_modules with a fake package
    fs.mkdirSync(path.join(tempDir, "node_modules", "lodash"), {
      recursive: true,
    });
    fs.writeFileSync(
      path.join(tempDir, "node_modules", "lodash", "index.js"),
      "module.exports = {};"
    );
    fs.writeFileSync(
      path.join(tempDir, "node_modules", "lodash", "package.json"),
      JSON.stringify({ name: "lodash", main: "index.js" })
    );

    // Create the resolver
    resolver = createTypeScriptResolver({ projectRoot: tempDir });
  });

  afterAll(() => {
    // Clean up temp directory
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("resolves relative import './utils/helpers' to absolute path", () => {
    const fromFile = path.join(tempDir, "src", "index.ts");
    const result = resolveTypeScriptImport(
      "./utils/helpers",
      fromFile,
      resolver
    );
    expect(result).not.toBeNull();
    expect(result!).toContain("helpers.ts");
    expect(path.isAbsolute(result!)).toBe(true);
  });

  it("resolves node_modules import 'lodash' to node_modules/lodash/index.js", () => {
    const fromFile = path.join(tempDir, "src", "index.ts");
    const result = resolveTypeScriptImport("lodash", fromFile, resolver);
    expect(result).not.toBeNull();
    expect(result!).toContain("lodash");
    expect(result!).toContain("index.js");
  });

  it("resolves tsconfig path alias '@/utils/helpers' to src/utils/helpers.ts", () => {
    const fromFile = path.join(tempDir, "src", "index.ts");
    const result = resolveTypeScriptImport(
      "@/utils/helpers",
      fromFile,
      resolver
    );
    expect(result).not.toBeNull();
    expect(result!).toContain("helpers.ts");
  });

  it("returns null for unresolvable import 'nonexistent-module'", () => {
    const fromFile = path.join(tempDir, "src", "index.ts");
    const result = resolveTypeScriptImport(
      "nonexistent-module",
      fromFile,
      resolver
    );
    expect(result).toBeNull();
  });

  it("resolves .ts and .tsx extensions automatically", () => {
    const fromFile = path.join(tempDir, "src", "index.ts");
    // Should resolve ./utils/helpers (without .ts extension) to helpers.ts
    const result = resolveTypeScriptImport(
      "./utils/helpers",
      fromFile,
      resolver
    );
    expect(result).not.toBeNull();
    expect(result!.endsWith(".ts")).toBe(true);
  });

  it("resolves directory import '.' to index.ts", () => {
    // Create an index.ts in utils
    fs.writeFileSync(
      path.join(tempDir, "src", "utils", "index.ts"),
      "export * from './helpers';"
    );

    const fromFile = path.join(tempDir, "src", "index.ts");
    const result = resolveTypeScriptImport("./utils", fromFile, resolver);
    expect(result).not.toBeNull();
    // Should resolve to utils/index.ts
    expect(result!).toContain("utils");
  });
});
