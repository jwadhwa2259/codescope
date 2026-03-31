import { describe, it, expect, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { detectFrameworks } from "../../src/onboard/detect.js";

describe("detectFrameworks", () => {
  const tmpDirs: string[] = [];

  function makeTmpDir(): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "detect-fw-"));
    tmpDirs.push(dir);
    return dir;
  }

  afterEach(() => {
    for (const dir of tmpDirs) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
    tmpDirs.length = 0;
  });

  it("detects fastify from dependencies", () => {
    const dir = makeTmpDir();
    fs.writeFileSync(
      path.join(dir, "package.json"),
      JSON.stringify({ dependencies: { fastify: "^5.0.0" } }),
    );
    expect(detectFrameworks(dir)).toEqual(["fastify"]);
  });

  it("detects h3 from dependencies", () => {
    const dir = makeTmpDir();
    fs.writeFileSync(
      path.join(dir, "package.json"),
      JSON.stringify({ dependencies: { h3: "^1.0.0" } }),
    );
    expect(detectFrameworks(dir)).toEqual(["h3"]);
  });

  it("detects express from dependencies", () => {
    const dir = makeTmpDir();
    fs.writeFileSync(
      path.join(dir, "package.json"),
      JSON.stringify({ dependencies: { express: "^4.0.0" } }),
    );
    expect(detectFrameworks(dir)).toEqual(["express"]);
  });

  it("detects multiple frameworks", () => {
    const dir = makeTmpDir();
    fs.writeFileSync(
      path.join(dir, "package.json"),
      JSON.stringify({
        dependencies: { fastify: "^5.0.0", express: "^4.0.0" },
      }),
    );
    const result = detectFrameworks(dir);
    expect(result).toContain("fastify");
    expect(result).toContain("express");
    expect(result.length).toBe(2);
  });

  it("returns empty array when package.json is missing", () => {
    const dir = makeTmpDir();
    expect(detectFrameworks(dir)).toEqual([]);
  });

  it("returns empty array when no known frameworks in package.json", () => {
    const dir = makeTmpDir();
    fs.writeFileSync(
      path.join(dir, "package.json"),
      JSON.stringify({ dependencies: { lodash: "^4.0.0" } }),
    );
    expect(detectFrameworks(dir)).toEqual([]);
  });

  it("detects frameworks in devDependencies too", () => {
    const dir = makeTmpDir();
    fs.writeFileSync(
      path.join(dir, "package.json"),
      JSON.stringify({ devDependencies: { express: "^4.0.0" } }),
    );
    expect(detectFrameworks(dir)).toEqual(["express"]);
  });

  it("handles malformed package.json gracefully", () => {
    const dir = makeTmpDir();
    fs.writeFileSync(path.join(dir, "package.json"), "not json");
    expect(detectFrameworks(dir)).toEqual([]);
  });
});
