import * as path from "node:path";
import * as fs from "node:fs";

export interface PythonResolveResult {
  modulePath: string | null; // Absolute path to .py file, or null if unresolvable
  moduleName: string; // The import module name
  isExternal: boolean; // True for stdlib/third-party
  isRelative: boolean; // True for relative imports (from .foo import bar)
}

// Common Python stdlib modules (top 50 most used)
const PYTHON_STDLIB = new Set([
  "os",
  "sys",
  "json",
  "re",
  "math",
  "datetime",
  "collections",
  "itertools",
  "functools",
  "typing",
  "pathlib",
  "abc",
  "io",
  "logging",
  "unittest",
  "argparse",
  "subprocess",
  "threading",
  "multiprocessing",
  "socket",
  "http",
  "urllib",
  "email",
  "csv",
  "sqlite3",
  "xml",
  "html",
  "hashlib",
  "hmac",
  "base64",
  "copy",
  "dataclasses",
  "enum",
  "contextlib",
  "string",
  "textwrap",
  "difflib",
  "struct",
  "codecs",
  "pickle",
  "shelve",
  "configparser",
  "pprint",
  "warnings",
  "traceback",
  "ast",
  "dis",
  "inspect",
  "importlib",
  "time",
  "random",
  "tempfile",
  "shutil",
  "glob",
]);

export function resolvePythonImport(
  moduleName: string,
  fromFile: string,
  projectRoot: string,
  isRelative: boolean = false
): PythonResolveResult {
  // Handle relative imports
  if (isRelative || moduleName.startsWith(".")) {
    const cleanModule = moduleName.replace(/^\.+/, "");
    const dotCount = moduleName.length - cleanModule.length;
    let baseDir = path.dirname(fromFile);
    for (let i = 1; i < dotCount; i++) {
      baseDir = path.dirname(baseDir);
    }

    const parts = cleanModule ? cleanModule.split(".") : [];
    const candidates =
      parts.length > 0
        ? [
            path.join(baseDir, ...parts) + ".py",
            path.join(baseDir, ...parts, "__init__.py"),
          ]
        : [
            // Bare relative import (just dots)
            path.join(baseDir, "__init__.py"),
          ];

    for (const candidate of candidates) {
      if (fs.existsSync(candidate)) {
        return {
          modulePath: candidate,
          moduleName,
          isExternal: false,
          isRelative: true,
        };
      }
    }

    return {
      modulePath: null,
      moduleName,
      isExternal: false,
      isRelative: true,
    };
  }

  // Check if stdlib
  const topLevel = moduleName.split(".")[0];
  if (PYTHON_STDLIB.has(topLevel)) {
    return {
      modulePath: null,
      moduleName,
      isExternal: true,
      isRelative: false,
    };
  }

  // Try to resolve as a project-local module
  const parts = moduleName.split(".");
  const searchDirs = [projectRoot, path.join(projectRoot, "src")];

  for (const searchDir of searchDirs) {
    const candidates = [
      path.join(searchDir, ...parts) + ".py",
      path.join(searchDir, ...parts, "__init__.py"),
    ];
    for (const candidate of candidates) {
      if (fs.existsSync(candidate)) {
        return {
          modulePath: candidate,
          moduleName,
          isExternal: false,
          isRelative: false,
        };
      }
    }
  }

  // Assume external (third-party package)
  return {
    modulePath: null,
    moduleName,
    isExternal: true,
    isRelative: false,
  };
}
