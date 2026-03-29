#!/bin/bash
# Build platform-specific better-sqlite3 packages for npm publishing
# Run on each target platform (or in CI matrix) to extract the .node binary
#
# Usage: ./scripts/build-platform-packages.sh
#
# Prerequisites: npm install better-sqlite3 (installs prebuild for current platform)

set -euo pipefail

PLATFORM=$(node -e "console.log(process.platform)")
ARCH=$(node -e "console.log(process.arch)")
VERSION="12.8.0"
PKG_DIR="platform-packages/${PLATFORM}-${ARCH}"

echo "Building platform package for ${PLATFORM}-${ARCH}..."

# Find the better-sqlite3 .node binary
# Try the standard build location first
BINDING_PATH="node_modules/better-sqlite3/build/Release/better_sqlite3.node"

if [ ! -f "$BINDING_PATH" ]; then
  # Try prebuildify format
  BINDING_PATH="node_modules/better-sqlite3/prebuilds/${PLATFORM}-${ARCH}/better-sqlite3.node"
fi

if [ ! -f "$BINDING_PATH" ]; then
  # Try napi prebuild format
  BINDING_PATH="node_modules/better-sqlite3/prebuilds/${PLATFORM}-${ARCH}/node.napi.node"
fi

if [ ! -f "$BINDING_PATH" ]; then
  # Search for any .node file in better-sqlite3
  BINDING_PATH=$(find node_modules/better-sqlite3 -name "*.node" -type f | head -1)
fi

if [ -z "$BINDING_PATH" ] || [ ! -f "$BINDING_PATH" ]; then
  echo "ERROR: Could not find better-sqlite3 .node binary"
  echo "Run 'npm install better-sqlite3' first"
  exit 1
fi

echo "Found binary: ${BINDING_PATH}"

# Ensure package directory exists
mkdir -p "$PKG_DIR"

# Copy binary
cp "$BINDING_PATH" "${PKG_DIR}/better_sqlite3.node"

# Verify package.json exists
if [ ! -f "${PKG_DIR}/package.json" ]; then
  echo "ERROR: ${PKG_DIR}/package.json not found. Create platform package scaffolding first."
  exit 1
fi

# Verify version matches
PKG_VERSION=$(node -e "console.log(JSON.parse(require('fs').readFileSync('${PKG_DIR}/package.json','utf-8')).version)")
if [ "$PKG_VERSION" != "$VERSION" ]; then
  echo "WARNING: Package version ${PKG_VERSION} does not match expected ${VERSION}"
fi

echo "Platform package ready: ${PKG_DIR}"
echo "Contents:"
ls -la "${PKG_DIR}/"
echo ""
echo "To publish: cd ${PKG_DIR} && npm publish --access public"
