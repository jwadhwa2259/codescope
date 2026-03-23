import type { SupportedLanguage } from "./languages.js";
import type { ParserPool } from "./lifecycle.js";
import type { Node as SyntaxNode } from "web-tree-sitter";

export interface ImportInfo {
  source: string;
  specifiers: string[];
  line: number;
  isDefault: boolean;
  isNamespace: boolean;
}

export interface ExportInfo {
  name: string;
  kind:
    | "function"
    | "class"
    | "variable"
    | "type"
    | "interface"
    | "enum"
    | "default"
    | "re-export";
  line: number;
}

export interface ClassInfo {
  name: string;
  methods: string[];
  properties: string[];
  startLine: number;
  endLine: number;
  isExported: boolean;
}

export interface FunctionInfo {
  name: string;
  params: string[];
  startLine: number;
  endLine: number;
  isExported: boolean;
  isAsync: boolean;
}

export interface VariableInfo {
  name: string;
  isExported: boolean;
  line: number;
}

export interface ParseResult {
  imports: ImportInfo[];
  exports: ExportInfo[];
  classes: ClassInfo[];
  functions: FunctionInfo[];
  variables: VariableInfo[];
  errors: string[];
}

function emptyResult(): ParseResult {
  return {
    imports: [],
    exports: [],
    classes: [],
    functions: [],
    variables: [],
    errors: [],
  };
}

// ---- TypeScript / JavaScript extraction ----

function extractTSImport(node: SyntaxNode): ImportInfo | null {
  // import_statement: import { foo, bar } from "module"
  // import_statement: import foo from "module"
  // import_statement: import * as foo from "module"
  const sourceNode = node.childForFieldName("source");
  if (!sourceNode) return null;

  // Remove quotes from string literal
  const source = sourceNode.text.replace(/['"]/g, "");

  const specifiers: string[] = [];
  let isDefault = false;
  let isNamespace = false;

  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i)!;
    if (child.type === "import_clause") {
      for (let j = 0; j < child.childCount; j++) {
        const clauseChild = child.child(j)!;
        if (clauseChild.type === "identifier") {
          // Default import: import foo from "bar"
          specifiers.push(clauseChild.text);
          isDefault = true;
        } else if (clauseChild.type === "named_imports") {
          // Named imports: import { foo, bar } from "bar"
          for (let k = 0; k < clauseChild.childCount; k++) {
            const specNode = clauseChild.child(k)!;
            if (specNode.type === "import_specifier") {
              const nameNode =
                specNode.childForFieldName("alias") ??
                specNode.childForFieldName("name");
              if (nameNode) specifiers.push(nameNode.text);
            }
          }
        } else if (clauseChild.type === "namespace_import") {
          // Namespace import: import * as foo from "bar"
          isNamespace = true;
          const nameNode = clauseChild.childForFieldName("name");
          if (nameNode) specifiers.push(nameNode.text);
        }
      }
    }
  }

  return {
    source,
    specifiers,
    line: node.startPosition.row + 1,
    isDefault,
    isNamespace,
  };
}

function extractTSExportStatement(
  node: SyntaxNode,
  result: ParseResult,
  shallow: boolean
): void {
  // export_statement wraps other declarations
  // Check what's being exported
  let isExported = true;

  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i)!;

    if (child.type === "function_declaration") {
      extractTSFunction(child, result, isExported);
      const name = child.childForFieldName("name")?.text ?? "anonymous";
      result.exports.push({
        name,
        kind: "function",
        line: node.startPosition.row + 1,
      });
    } else if (child.type === "class_declaration") {
      extractTSClass(child, result, isExported, shallow);
      const name = child.childForFieldName("name")?.text ?? "anonymous";
      result.exports.push({
        name,
        kind: "class",
        line: node.startPosition.row + 1,
      });
    } else if (
      child.type === "lexical_declaration" ||
      child.type === "variable_declaration"
    ) {
      extractTSVariableDeclaration(child, result, isExported);
    } else if (child.type === "type_alias_declaration") {
      const name = child.childForFieldName("name")?.text ?? "anonymous";
      result.exports.push({
        name,
        kind: "type",
        line: node.startPosition.row + 1,
      });
    } else if (child.type === "interface_declaration") {
      const name = child.childForFieldName("name")?.text ?? "anonymous";
      result.exports.push({
        name,
        kind: "interface",
        line: node.startPosition.row + 1,
      });
    } else if (child.type === "enum_declaration") {
      const name = child.childForFieldName("name")?.text ?? "anonymous";
      result.exports.push({
        name,
        kind: "enum",
        line: node.startPosition.row + 1,
      });
    } else if (child.type === "export_clause") {
      // export { foo, bar }
      for (let j = 0; j < child.childCount; j++) {
        const spec = child.child(j)!;
        if (spec.type === "export_specifier") {
          const name =
            spec.childForFieldName("alias")?.text ??
            spec.childForFieldName("name")?.text ??
            spec.text;
          result.exports.push({
            name,
            kind: "re-export",
            line: node.startPosition.row + 1,
          });
        }
      }
    }
  }

  // Check for default export: export default ...
  if (node.text.startsWith("export default")) {
    const declaration = node.childCount > 1 ? node.child(node.childCount - 1) : null;
    if (declaration) {
      const name =
        declaration.childForFieldName("name")?.text ?? "default";
      if (
        !result.exports.some(
          (e) => e.line === node.startPosition.row + 1
        )
      ) {
        result.exports.push({
          name,
          kind: "default",
          line: node.startPosition.row + 1,
        });
      }
    }
  }
}

function extractTSFunction(
  node: SyntaxNode,
  result: ParseResult,
  isExported: boolean
): void {
  const name = node.childForFieldName("name")?.text ?? "anonymous";
  const params: string[] = [];
  const paramsNode = node.childForFieldName("parameters");
  if (paramsNode) {
    for (let i = 0; i < paramsNode.childCount; i++) {
      const param = paramsNode.child(i)!;
      if (
        param.type === "required_parameter" ||
        param.type === "optional_parameter" ||
        param.type === "identifier"
      ) {
        const paramName =
          param.childForFieldName("pattern")?.text ?? param.text;
        // Clean up type annotations from parameter name
        const cleanName = paramName.split(":")[0].trim().replace("?", "");
        if (cleanName && cleanName !== "," && cleanName !== "(" && cleanName !== ")") {
          params.push(cleanName);
        }
      }
    }
  }

  const isAsync = node.text.startsWith("async ");

  result.functions.push({
    name,
    params,
    startLine: node.startPosition.row + 1,
    endLine: node.endPosition.row + 1,
    isExported,
    isAsync,
  });
}

function extractTSClass(
  node: SyntaxNode,
  result: ParseResult,
  isExported: boolean,
  shallow: boolean
): void {
  const name = node.childForFieldName("name")?.text ?? "anonymous";
  const methods: string[] = [];
  const properties: string[] = [];

  if (!shallow) {
    const body = node.childForFieldName("body");
    if (body) {
      for (let i = 0; i < body.childCount; i++) {
        const member = body.child(i)!;
        if (
          member.type === "method_definition" ||
          member.type === "method_signature"
        ) {
          const methodName = member.childForFieldName("name")?.text;
          if (methodName) methods.push(methodName);
        } else if (
          member.type === "public_field_definition" ||
          member.type === "property_declaration"
        ) {
          const propName = member.childForFieldName("name")?.text;
          if (propName) properties.push(propName);
        }
      }
    }
  }

  result.classes.push({
    name,
    methods,
    properties,
    startLine: node.startPosition.row + 1,
    endLine: node.endPosition.row + 1,
    isExported,
  });
}

function extractTSVariableDeclaration(
  node: SyntaxNode,
  result: ParseResult,
  isExported: boolean
): void {
  // lexical_declaration or variable_declaration contains variable_declarator children
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i)!;
    if (child.type === "variable_declarator") {
      const name = child.childForFieldName("name")?.text ?? "unknown";
      result.variables.push({
        name,
        isExported,
        line: child.startPosition.row + 1,
      });
      if (isExported) {
        result.exports.push({
          name,
          kind: "variable",
          line: child.startPosition.row + 1,
        });
      }
    }
  }
}

// ---- Python extraction ----

function extractPythonImport(node: SyntaxNode): ImportInfo | null {
  if (node.type === "import_statement") {
    // import foo, import foo.bar
    const nameNode = node.childForFieldName("name");
    if (nameNode) {
      const source = nameNode.text;
      return {
        source,
        specifiers: [],
        line: node.startPosition.row + 1,
        isDefault: false,
        isNamespace: true,
      };
    }
    // Fallback: parse child nodes
    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i)!;
      if (
        child.type === "dotted_name" ||
        child.type === "aliased_import"
      ) {
        const source =
          child.type === "aliased_import"
            ? (child.childForFieldName("name")?.text ?? child.text)
            : child.text;
        return {
          source,
          specifiers: [],
          line: node.startPosition.row + 1,
          isDefault: false,
          isNamespace: true,
        };
      }
    }
  } else if (node.type === "import_from_statement") {
    // from foo import bar, baz
    const moduleNode = node.childForFieldName("module_name");
    const source = moduleNode?.text ?? "";

    const specifiers: string[] = [];
    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i)!;
      if (child.type === "dotted_name" && child !== moduleNode) {
        specifiers.push(child.text);
      } else if (child.type === "aliased_import") {
        const name = child.childForFieldName("name")?.text ?? child.text;
        specifiers.push(name);
      } else if (
        child.type === "identifier" &&
        child.text !== "from" &&
        child.text !== "import"
      ) {
        specifiers.push(child.text);
      }
    }

    return {
      source,
      specifiers,
      line: node.startPosition.row + 1,
      isDefault: false,
      isNamespace: false,
    };
  }

  return null;
}

function extractPythonFunction(
  node: SyntaxNode,
  result: ParseResult
): void {
  const name = node.childForFieldName("name")?.text ?? "anonymous";
  const params: string[] = [];
  const paramsNode = node.childForFieldName("parameters");
  if (paramsNode) {
    for (let i = 0; i < paramsNode.childCount; i++) {
      const param = paramsNode.child(i)!;
      if (param.type === "identifier") {
        if (param.text !== "self" && param.text !== "cls") {
          params.push(param.text);
        }
      } else if (
        param.type === "default_parameter" ||
        param.type === "typed_parameter" ||
        param.type === "typed_default_parameter"
      ) {
        const paramName = param.childForFieldName("name")?.text ?? param.child(0)?.text;
        if (paramName && paramName !== "self" && paramName !== "cls") {
          params.push(paramName);
        }
      } else if (
        param.type === "list_splat_pattern" ||
        param.type === "dictionary_splat_pattern"
      ) {
        const paramName = param.child(0)?.text;
        if (paramName) params.push(paramName);
      }
    }
  }

  const isAsync = node.type === "decorated_definition"
    ? false
    : node.previousSibling?.type === "async" ||
      node.text.startsWith("async ");

  result.functions.push({
    name,
    params,
    startLine: node.startPosition.row + 1,
    endLine: node.endPosition.row + 1,
    isExported: false, // Python doesn't have export keyword; everything is "public"
    isAsync,
  });
}

function extractPythonClass(
  node: SyntaxNode,
  result: ParseResult,
  shallow: boolean
): void {
  const name = node.childForFieldName("name")?.text ?? "anonymous";
  const methods: string[] = [];
  const properties: string[] = [];

  if (!shallow) {
    const body = node.childForFieldName("body");
    if (body) {
      for (let i = 0; i < body.childCount; i++) {
        const member = body.child(i)!;
        if (member.type === "function_definition") {
          const methodName = member.childForFieldName("name")?.text;
          if (methodName) methods.push(methodName);
        } else if (member.type === "expression_statement") {
          // Class variable assignments
          const expr = member.child(0);
          if (expr?.type === "assignment") {
            const target = expr.childForFieldName("left")?.text;
            if (target) properties.push(target);
          }
        }
      }
    }
  }

  result.classes.push({
    name,
    methods,
    properties,
    startLine: node.startPosition.row + 1,
    endLine: node.endPosition.row + 1,
    isExported: false,
  });
}

// ---- Error collection ----

function collectErrors(node: SyntaxNode, errors: string[]): void {
  if (node.type === "ERROR" || node.isMissing) {
    errors.push(
      `Syntax error at line ${node.startPosition.row + 1}, column ${node.startPosition.column}: ${node.type === "ERROR" ? "unexpected token" : "missing node"}`
    );
  }
  for (let i = 0; i < node.childCount; i++) {
    collectErrors(node.child(i)!, errors);
  }
}

// ---- Main extraction function ----

export async function extractFromSource(
  source: string,
  language: SupportedLanguage,
  pool: ParserPool,
  options?: { shallow?: boolean }
): Promise<ParseResult> {
  const result = emptyResult();
  const shallow = options?.shallow ?? false;

  const parser = await pool.getParser(language);
  const tree = parser.parse(source);

  if (!tree) {
    result.errors.push("Parser returned null tree");
    pool.incrementParseCount(language);
    return result;
  }

  try {
    const root = tree.rootNode;

    // Collect errors from the tree
    collectErrors(root, result.errors);

    const isPython = language === "python";

    for (let i = 0; i < root.childCount; i++) {
      const node = root.child(i)!;

      if (isPython) {
        // Python node types
        switch (node.type) {
          case "import_statement":
          case "import_from_statement": {
            const importInfo = extractPythonImport(node);
            if (importInfo) result.imports.push(importInfo);
            break;
          }
          case "function_definition":
            extractPythonFunction(node, result);
            break;
          case "class_definition":
            extractPythonClass(node, result, shallow);
            break;
          case "expression_statement": {
            // Top-level variable assignments
            const expr = node.child(0);
            if (expr?.type === "assignment") {
              const name = expr.childForFieldName("left")?.text ?? "unknown";
              result.variables.push({
                name,
                isExported: false,
                line: node.startPosition.row + 1,
              });
            }
            break;
          }
          // Decorated definitions
          case "decorated_definition": {
            const definition = node.childForFieldName("definition");
            if (definition) {
              if (definition.type === "function_definition") {
                extractPythonFunction(definition, result);
              } else if (definition.type === "class_definition") {
                extractPythonClass(definition, result, shallow);
              }
            }
            break;
          }
        }
      } else {
        // TypeScript / JavaScript node types
        switch (node.type) {
          case "import_statement": {
            const importInfo = extractTSImport(node);
            if (importInfo) result.imports.push(importInfo);
            break;
          }
          case "export_statement":
            extractTSExportStatement(node, result, shallow);
            break;
          case "class_declaration":
            extractTSClass(node, result, false, shallow);
            break;
          case "function_declaration":
            extractTSFunction(node, result, false);
            break;
          case "lexical_declaration":
          case "variable_declaration":
            extractTSVariableDeclaration(node, result, false);
            break;
          // Abstract class declarations (TypeScript-specific)
          case "abstract_class_declaration":
            extractTSClass(node, result, false, shallow);
            break;
        }
      }
    }
  } finally {
    // CRITICAL: Always delete tree to prevent memory leaks (per CLAUDE.md)
    tree.delete();
  }

  pool.incrementParseCount(language);
  return result;
}
