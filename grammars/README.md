# WASM Grammar Files

Build with: `npm run build:grammars`

Requires: tree-sitter-cli@0.25.10 and Docker (for Emscripten WASM compilation)

Alternatively, prebuilt grammars can be obtained from the `tree-sitter-wasms` npm package:
```bash
npm install --save-dev tree-sitter-wasms@0.1.13
cp node_modules/tree-sitter-wasms/out/tree-sitter-{typescript,tsx,javascript,python}.wasm grammars/
```

These .wasm files are bundled in the plugin package per D-19.
They are NOT committed to git (build artifacts).
