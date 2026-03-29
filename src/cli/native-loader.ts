import { createRequire } from "node:module";

/**
 * Platform-specific better-sqlite3 binary resolver.
 *
 * Maps the current platform + architecture to the corresponding
 * @codescope/better-sqlite3-{platform}-{arch} optional dependency package.
 *
 * Called early in CLI startup (before any module imports better-sqlite3)
 * to verify the native binary is available. Falls back gracefully with
 * actionable guidance if the platform package is missing (D-12).
 */

const PLATFORMS: Record<string, string> = {
  "darwin-arm64": "@codescope/better-sqlite3-darwin-arm64",
  "darwin-x64": "@codescope/better-sqlite3-darwin-x64",
  "linux-x64": "@codescope/better-sqlite3-linux-x64",
  "win32-x64": "@codescope/better-sqlite3-win32-x64",
};

export function ensureNativeBindings(): void {
  const key = `${process.platform}-${process.arch}`;
  const pkg = PLATFORMS[key];

  if (!pkg) {
    console.error(
      `No prebuilt better-sqlite3 binary for ${process.platform}-${process.arch}.\n` +
        `Supported: darwin-arm64, darwin-x64, linux-x64, win32-x64.\n` +
        `You can try installing with a C compiler: npm install better-sqlite3 --build-from-source`,
    );
    // Don't exit -- better-sqlite3 from dependencies might have compiled from source during npm install
    return;
  }

  try {
    // Verify the platform package is available
    const require = createRequire(import.meta.url);
    require.resolve(pkg);
    // Platform binary is available -- better-sqlite3 will find it
  } catch {
    // Platform package not installed (e.g., yarn 1.x filtered it, or wrong platform)
    // Fall back to regular better-sqlite3 which may have compiled from source
    // Per D-12: give specific guidance
    console.warn(
      `CodeScope: Platform binary package ${pkg} not found.\n` +
        `Falling back to better-sqlite3 from dependencies.\n` +
        `If SQLite operations fail, run: npm install --build-from-source better-sqlite3`,
    );
  }
}
