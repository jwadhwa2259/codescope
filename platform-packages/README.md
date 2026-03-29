# Platform Packages

Pre-built better-sqlite3 native binaries for each supported platform. These are published as optional dependencies of the main `codescope` package.

## Current Status

| Platform | Package Name | Binary | Status |
|----------|-------------|--------|--------|
| macOS ARM (M-series) | @codescope/better-sqlite3-darwin-arm64 | better_sqlite3.node | Built locally |
| macOS Intel | @codescope/better-sqlite3-darwin-x64 | better_sqlite3.node | Requires CI build |
| Linux x64 | @codescope/better-sqlite3-linux-x64 | better_sqlite3.node | Requires CI build |
| Windows x64 | @codescope/better-sqlite3-win32-x64 | better_sqlite3.node | Requires CI build |

## Building Binaries

### Local (current platform only)

```bash
./scripts/build-platform-packages.sh
```

This detects the current platform and architecture, finds the better-sqlite3 native binary from node_modules, and copies it to the appropriate platform-packages subdirectory.

### CI (all platforms)

The GitHub Actions workflow at `.github/workflows/build-platform-packages.yml` builds binaries on all 4 platforms using a matrix strategy:

1. **Trigger manually:** Go to Actions > Build Platform Packages > Run workflow
2. **Auto-trigger:** Pushes that modify `package.json` or `scripts/build-platform-packages.sh`
3. **Download:** After the workflow completes, download the `all-platform-packages` artifact

### Runner Matrix

| Runner | Platform |
|--------|----------|
| macos-14 | darwin-arm64 (M-series) |
| macos-13 | darwin-x64 (Intel) |
| ubuntu-latest | linux-x64 |
| windows-latest | win32-x64 |

## Package Structure

Each platform directory contains:
- `package.json` -- npm package metadata with `os` and `cpu` fields
- `better_sqlite3.node` -- Native binary (after build)

## Publishing

After building all binaries:

```bash
for dir in darwin-arm64 darwin-x64 linux-x64 win32-x64; do
  cd platform-packages/$dir
  npm publish --access public
  cd ../..
done
```

## Fallback

If a platform package is unavailable, the main `codescope` package falls back to compiling better-sqlite3 from source (requires build tools). The native loader in `src/native-loader.ts` warns but does not exit on missing platform packages.
