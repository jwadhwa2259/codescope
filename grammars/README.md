# WASM Grammar Files

These `.wasm` files are **committed to git** and required at runtime for AST parsing.
The plugin is distributed via `git clone`, so grammars must ship in the repo.

## Current grammars (web-tree-sitter 0.25.x ABI)

| File | Language | Source |
|------|----------|--------|
| tree-sitter-typescript.wasm | TypeScript | tree-sitter-typescript |
| tree-sitter-tsx.wasm | TSX | tree-sitter-typescript (tsx sub-grammar) |
| tree-sitter-javascript.wasm | JavaScript/JSX | tree-sitter-javascript |
| tree-sitter-python.wasm | Python | tree-sitter-python |

## Rebuilding grammars

Build with: `npm run build:grammars`

Requires: tree-sitter-cli@0.25.x and Docker (for Emscripten WASM compilation).
MUST match web-tree-sitter ABI version (0.25.x uses ABI 14).

Alternatively, obtain prebuilt grammars from the `tree-sitter-wasms` npm package:
```bash
npm install --save-dev tree-sitter-wasms@0.1.13
cp node_modules/tree-sitter-wasms/out/tree-sitter-{typescript,tsx,javascript,python}.wasm grammars/
```

## Licenses

tree-sitter grammars are MIT licensed. See:
- https://github.com/tree-sitter/tree-sitter-javascript/blob/master/LICENSE
- https://github.com/tree-sitter/tree-sitter-typescript/blob/master/LICENSE
- https://github.com/tree-sitter/tree-sitter-python/blob/master/LICENSE
