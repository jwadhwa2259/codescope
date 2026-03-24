// ---------------------------------------------------------------------------
// Smoke Generator -- New Endpoint Detection via web-tree-sitter AST
// ---------------------------------------------------------------------------
// Per D-14: endpoint detection MUST use web-tree-sitter AST analysis, NOT regex.
// Per D-12: auto-smoke generates minimal reachability checks for new endpoints.
// Per CLAUDE.md: call tree.delete() after every parse to prevent memory leaks.
// ---------------------------------------------------------------------------

import { execSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { Parser, Language } from "web-tree-sitter";
import { detectLanguage, getGrammarDir, loadLanguage } from "../parser/languages.js";

// ---- Types ----

export interface DetectedEndpoint {
  file: string;
  method: string;
  route: string;
  code: string; // the endpoint handler code (capped at 30 lines)
}

// ---- Helpers ----

/** Cap code text to 30 lines */
function capCode(text: string, maxLines: number = 30): string {
  const lines = text.split("\n");
  if (lines.length <= maxLines) return text;
  return lines.slice(0, maxLines).join("\n") + "\n// ... (truncated)";
}

/** Clean quote characters from a string literal AST node text */
function cleanStringLiteral(text: string): string {
  return text.replace(/^['"`]|['"`]$/g, "");
}

// HTTP methods for endpoint detection
const HTTP_METHODS = new Set(["get", "post", "put", "delete", "patch", "head"]);
const NEXTJS_METHODS = new Set(["GET", "POST", "PUT", "DELETE", "PATCH", "HEAD"]);
const SERVER_OBJECTS = new Set(["app", "router", "server", "blueprint"]);

// ---- AST-based Endpoint Detection ----

/**
 * Detect Express/Koa-style endpoints from call_expression nodes.
 * Looks for: app.get('/route', handler), router.post('/route', handler), etc.
 */
function detectExpressEndpoints(
  rootNode: any,
  filePath: string,
): DetectedEndpoint[] {
  const endpoints: DetectedEndpoint[] = [];
  const callNodes = rootNode.descendantsOfType("call_expression");

  for (const node of callNodes) {
    const callee = node.childForFieldName("function");
    if (!callee || callee.type !== "member_expression") continue;

    const object = callee.childForFieldName("object");
    const property = callee.childForFieldName("property");
    if (!object || !property) continue;

    const objectName = object.text?.toLowerCase();
    const methodName = property.text?.toLowerCase();

    if (!SERVER_OBJECTS.has(objectName) || !HTTP_METHODS.has(methodName)) continue;

    // Extract route from first string argument
    const args = node.childForFieldName("arguments");
    if (!args) continue;

    const firstStringArg = args.children?.find(
      (c: any) => c.type === "string" || c.type === "template_string",
    );
    if (!firstStringArg) continue;

    const route = cleanStringLiteral(firstStringArg.text);
    endpoints.push({
      file: filePath,
      method: methodName.toUpperCase(),
      route,
      code: capCode(node.text),
    });
  }

  return endpoints;
}

/**
 * Detect Next.js App Router endpoints from export_statement nodes.
 * Looks for: export function GET/POST/PUT/DELETE/PATCH in route.ts files.
 */
function detectNextJsAppRouterEndpoints(
  rootNode: any,
  filePath: string,
): DetectedEndpoint[] {
  // Only applies to route.ts/route.js files
  const fileName = path.basename(filePath);
  if (fileName !== "route.ts" && fileName !== "route.js") return [];

  const endpoints: DetectedEndpoint[] = [];
  const exportNodes = rootNode.descendantsOfType("export_statement");

  // Infer route from file path: app/api/users/route.ts -> /api/users
  const routeParts = filePath.split(path.sep);
  const appIndex = routeParts.indexOf("app");
  let inferredRoute = "/";
  if (appIndex !== -1) {
    const relevantParts = routeParts.slice(appIndex + 1, -1); // exclude route.ts
    inferredRoute = "/" + relevantParts.join("/");
  }

  for (const node of exportNodes) {
    const funcDecl = node.children?.find(
      (c: any) => c.type === "function_declaration",
    );
    if (!funcDecl) continue;

    const nameNode = funcDecl.childForFieldName("name");
    if (!nameNode) continue;

    const funcName = nameNode.text;
    if (!NEXTJS_METHODS.has(funcName)) continue;

    endpoints.push({
      file: filePath,
      method: funcName,
      route: inferredRoute,
      code: capCode(funcDecl.text),
    });
  }

  return endpoints;
}

/**
 * Detect Next.js Pages Router endpoints from export_statement with default keyword.
 * Looks for: export default in files under pages/api/.
 */
function detectNextJsPagesRouterEndpoints(
  rootNode: any,
  filePath: string,
): DetectedEndpoint[] {
  // Only applies to pages/api/ files
  if (!filePath.includes("pages/api/") && !filePath.includes("pages\\api\\")) {
    return [];
  }

  const endpoints: DetectedEndpoint[] = [];
  const exportNodes = rootNode.descendantsOfType("export_statement");

  // Infer route from file path: pages/api/users.ts -> /api/users
  const pagesIndex = filePath.indexOf("pages/");
  let inferredRoute = "/";
  if (pagesIndex !== -1) {
    inferredRoute =
      "/" +
      filePath
        .slice(pagesIndex + "pages/".length)
        .replace(/\.(ts|tsx|js|jsx)$/, "")
        .replace(/\/index$/, "");
  }

  for (const node of exportNodes) {
    // Check if this is a default export
    if (node.text?.includes("default")) {
      endpoints.push({
        file: filePath,
        method: "ALL",
        route: inferredRoute,
        code: capCode(node.text),
      });
      break; // Only one default export
    }
  }

  return endpoints;
}

/**
 * Detect Flask/FastAPI endpoints from decorated_definition nodes.
 * Looks for: @app.route('/path'), @app.get('/path'), @router.post('/path'), etc.
 */
function detectFlaskEndpoints(
  rootNode: any,
  filePath: string,
): DetectedEndpoint[] {
  const endpoints: DetectedEndpoint[] = [];
  const decoratedNodes = rootNode.descendantsOfType("decorated_definition");

  for (const node of decoratedNodes) {
    const decorator = node.children?.find((c: any) => c.type === "decorator");
    if (!decorator) continue;

    const callNode = decorator.children?.find((c: any) => c.type === "call");
    if (!callNode) continue;

    const funcNode = callNode.childForFieldName("function");
    if (!funcNode || funcNode.type !== "attribute") continue;

    const objectNode = funcNode.childForFieldName("object");
    const attrNode = funcNode.childForFieldName("attribute");
    if (!objectNode || !attrNode) continue;

    const objectName = objectNode.text?.toLowerCase();
    const attrName = attrNode.text?.toLowerCase();

    if (!SERVER_OBJECTS.has(objectName)) continue;
    if (!HTTP_METHODS.has(attrName) && attrName !== "route") continue;

    // Extract route from first string argument
    const args = callNode.childForFieldName("arguments");
    if (!args) continue;

    const firstStringArg = args.children?.find(
      (c: any) => c.type === "string" || c.type === "concatenated_string",
    );
    if (!firstStringArg) continue;

    const route = cleanStringLiteral(firstStringArg.text);
    const method = attrName === "route" ? "ALL" : attrName.toUpperCase();

    // Get the function definition text
    const funcDef = node.children?.find(
      (c: any) => c.type === "function_definition",
    );

    endpoints.push({
      file: filePath,
      method,
      route,
      code: capCode(funcDef?.text ?? node.text),
    });
  }

  return endpoints;
}

// ---- Main Functions ----

/**
 * Detect new endpoints in newly created files using web-tree-sitter AST analysis.
 *
 * Per D-14: Uses git diff to find new files, then parses each with web-tree-sitter
 * to detect route/endpoint declarations. Supports Express/Koa, Next.js (App Router
 * and Pages Router), Flask, and FastAPI.
 *
 * Per CLAUDE.md: Calls tree.delete() after parsing each file.
 */
export async function detectNewEndpoints(
  projectRoot: string,
  changedFiles: string[],
): Promise<DetectedEndpoint[]> {
  // Get list of newly created files from git diff (Added files only)
  let newFiles: string[];
  try {
    const diffOutput = execSync("git diff --name-only --diff-filter=A HEAD", {
      encoding: "utf-8",
      cwd: projectRoot,
    }).trim();
    newFiles = diffOutput ? diffOutput.split("\n").filter(Boolean) : [];
  } catch {
    // No git or no HEAD, treat all changed files as new
    newFiles = changedFiles;
  }

  // Intersect with changedFiles (only analyze files both new AND in changed set)
  const changedSet = new Set(changedFiles);
  const filesToAnalyze = newFiles.filter((f) => changedSet.has(f));

  if (filesToAnalyze.length === 0) return [];

  // Initialize web-tree-sitter
  await Parser.init();

  const allEndpoints: DetectedEndpoint[] = [];

  for (const file of filesToAnalyze) {
    const lang = detectLanguage(file);
    if (!lang) continue;

    const fullPath = path.join(projectRoot, file);
    let content: string;
    try {
      content = fs.readFileSync(fullPath, "utf-8") as string;
    } catch {
      continue; // Skip unreadable files
    }

    // Load grammar and parse
    const language = await loadLanguage(lang);
    const parser = new Parser();
    parser.setLanguage(language);
    const tree = parser.parse(content);

    try {
      const rootNode = tree.rootNode;

      if (lang === "python") {
        // Python: Flask/FastAPI patterns
        allEndpoints.push(...detectFlaskEndpoints(rootNode, file));
      } else {
        // JS/TS: Express/Koa, Next.js App Router, Next.js Pages Router
        allEndpoints.push(...detectExpressEndpoints(rootNode, file));
        allEndpoints.push(...detectNextJsAppRouterEndpoints(rootNode, file));
        allEndpoints.push(...detectNextJsPagesRouterEndpoints(rootNode, file));
      }
    } finally {
      // Per CLAUDE.md: call tree.delete() after every parse to prevent memory leaks
      tree.delete();
      parser.delete();
    }
  }

  return allEndpoints;
}

/**
 * Build an LLM prompt for generating minimal smoke tests for detected endpoints.
 *
 * Per D-12/D-13: Generates temp test file for reachability checks only.
 */
export function buildSmokePrompt(
  endpoints: DetectedEndpoint[],
  projectTestFramework: string,
): string {
  const endpointDescriptions = endpoints
    .map(
      (ep, i) =>
        `### Endpoint ${i + 1}\n- **Method:** ${ep.method}\n- **Route:** ${ep.route}\n- **File:** ${ep.file}\n- **Handler code:**\n\`\`\`\n${ep.code}\n\`\`\``,
    )
    .join("\n\n");

  return `Generate a minimal smoke test for these new endpoints. Test reachability only, not functionality.

${endpointDescriptions}

## Instructions
- Use the ${projectTestFramework} test framework.
- For HTTP endpoints: test that the endpoint responds (GET returns 200 or expected status). For auth-required endpoints, expect 401.
- Do NOT test business logic, only that the endpoint is reachable and returns a valid HTTP status.
- Write the test to a temp file. The file will be cleaned up after running.
- Output the test code as a single code block.
- Keep the test minimal -- one test per endpoint, basic status code assertion.`;
}
