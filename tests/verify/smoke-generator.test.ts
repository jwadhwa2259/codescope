import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

// Mock node:child_process
vi.mock("node:child_process", () => ({
  execSync: vi.fn(),
}));

// Mock node:fs
vi.mock("node:fs", async () => {
  const actual = await vi.importActual<typeof import("node:fs")>("node:fs");
  return {
    ...actual,
    readFileSync: vi.fn(),
    existsSync: vi.fn().mockReturnValue(true),
  };
});

// Mock web-tree-sitter
const mockTreeDelete = vi.fn();
const mockTree = {
  rootNode: {
    descendantsOfType: vi.fn().mockReturnValue([]),
    children: [],
    type: "program",
  },
  delete: mockTreeDelete,
};

const mockParser = {
  setLanguage: vi.fn(),
  parse: vi.fn().mockReturnValue(mockTree),
  delete: vi.fn(),
};

const mockLanguageLoad = vi.fn().mockResolvedValue({});
const mockParserInit = vi.fn().mockResolvedValue(undefined);

vi.mock("web-tree-sitter", () => {
  const ParserClass = vi.fn().mockImplementation(() => mockParser);
  (ParserClass as any).init = mockParserInit;
  (ParserClass as any).Language = { load: mockLanguageLoad };
  return { Parser: ParserClass, Language: { load: mockLanguageLoad }, default: ParserClass };
});

// Mock parser/languages for grammar path resolution
vi.mock("../../src/parser/languages.js", () => ({
  detectLanguage: vi.fn((filePath: string) => {
    if (filePath.endsWith(".ts") || filePath.endsWith(".tsx")) return "typescript";
    if (filePath.endsWith(".js") || filePath.endsWith(".jsx")) return "javascript";
    if (filePath.endsWith(".py")) return "python";
    return null;
  }),
  getGrammarDir: vi.fn().mockReturnValue("/mock/grammars"),
  loadLanguage: vi.fn().mockResolvedValue({}),
}));

import { execSync } from "node:child_process";
import * as fs from "node:fs";
import { detectNewEndpoints, buildSmokePrompt, type DetectedEndpoint } from "../../src/verify/smoke-generator.js";

// ---------------------------------------------------------------------------
// Fixtures -- source code strings for AST endpoint detection
// ---------------------------------------------------------------------------

const EXPRESS_SOURCE = `
const express = require('express');
const app = express();

app.get('/api/users', (req, res) => {
  res.json(users);
});

app.post('/api/users', (req, res) => {
  res.status(201).json({ id: 1 });
});
`;

const NEXTJS_APP_ROUTER_SOURCE = `
export async function GET(request: Request) {
  return Response.json({ users: [] });
}

export async function POST(request: Request) {
  return new Response('Created', { status: 201 });
}
`;

const FLASK_SOURCE = `
from flask import Flask
app = Flask(__name__)

@app.route('/api/items', methods=['GET'])
def get_items():
    return jsonify(items)

@app.get('/api/items/<int:id>')
def get_item(id):
    return jsonify(item)
`;

// ---------------------------------------------------------------------------
// Helpers -- build mock AST nodes for different patterns
// ---------------------------------------------------------------------------

function buildExpressCallNodes() {
  return [
    {
      type: "call_expression",
      text: "app.get('/api/users', (req, res) => {\n  res.json(users);\n})",
      startPosition: { row: 4, column: 0 },
      endPosition: { row: 6, column: 2 },
      childForFieldName: vi.fn((field: string) => {
        if (field === "function") {
          return {
            type: "member_expression",
            childForFieldName: vi.fn((f: string) => {
              if (f === "object") return { type: "identifier", text: "app" };
              if (f === "property") return { type: "property_identifier", text: "get" };
              return null;
            }),
          };
        }
        if (field === "arguments") {
          return {
            children: [
              { type: "string", text: "'/api/users'" },
            ],
          };
        }
        return null;
      }),
    },
    {
      type: "call_expression",
      text: "app.post('/api/users', (req, res) => {\n  res.status(201).json({ id: 1 });\n})",
      startPosition: { row: 8, column: 0 },
      endPosition: { row: 10, column: 2 },
      childForFieldName: vi.fn((field: string) => {
        if (field === "function") {
          return {
            type: "member_expression",
            childForFieldName: vi.fn((f: string) => {
              if (f === "object") return { type: "identifier", text: "app" };
              if (f === "property") return { type: "property_identifier", text: "post" };
              return null;
            }),
          };
        }
        if (field === "arguments") {
          return {
            children: [
              { type: "string", text: "'/api/users'" },
            ],
          };
        }
        return null;
      }),
    },
  ];
}

function buildNextJsAppRouterNodes() {
  return [
    {
      type: "export_statement",
      text: "export async function GET(request: Request) {\n  return Response.json({ users: [] });\n}",
      startPosition: { row: 1, column: 0 },
      endPosition: { row: 3, column: 1 },
      children: [
        {
          type: "function_declaration",
          childForFieldName: vi.fn((f: string) => {
            if (f === "name") return { type: "identifier", text: "GET" };
            if (f === "body") return { type: "statement_block", text: "{\n  return Response.json({ users: [] });\n}" };
            return null;
          }),
          text: "async function GET(request: Request) {\n  return Response.json({ users: [] });\n}",
        },
      ],
    },
    {
      type: "export_statement",
      text: "export async function POST(request: Request) {\n  return new Response('Created', { status: 201 });\n}",
      startPosition: { row: 5, column: 0 },
      endPosition: { row: 7, column: 1 },
      children: [
        {
          type: "function_declaration",
          childForFieldName: vi.fn((f: string) => {
            if (f === "name") return { type: "identifier", text: "POST" };
            if (f === "body") return { type: "statement_block", text: "{\n  return new Response('Created', { status: 201 });\n}" };
            return null;
          }),
          text: "async function POST(request: Request) {\n  return new Response('Created', { status: 201 });\n}",
        },
      ],
    },
  ];
}

function buildFlaskDecoratorNodes() {
  return [
    {
      type: "decorated_definition",
      text: "@app.route('/api/items', methods=['GET'])\ndef get_items():\n    return jsonify(items)",
      startPosition: { row: 3, column: 0 },
      endPosition: { row: 5, column: 25 },
      children: [
        {
          type: "decorator",
          children: [
            {
              type: "call",
              childForFieldName: vi.fn((f: string) => {
                if (f === "function") {
                  return {
                    type: "attribute",
                    childForFieldName: vi.fn((f2: string) => {
                      if (f2 === "object") return { type: "identifier", text: "app" };
                      if (f2 === "attribute") return { type: "identifier", text: "route" };
                      return null;
                    }),
                  };
                }
                if (f === "arguments") {
                  return {
                    children: [
                      { type: "string", text: "'/api/items'" },
                    ],
                  };
                }
                return null;
              }),
            },
          ],
        },
        {
          type: "function_definition",
          text: "def get_items():\n    return jsonify(items)",
        },
      ],
    },
    {
      type: "decorated_definition",
      text: "@app.get('/api/items/<int:id>')\ndef get_item(id):\n    return jsonify(item)",
      startPosition: { row: 7, column: 0 },
      endPosition: { row: 9, column: 25 },
      children: [
        {
          type: "decorator",
          children: [
            {
              type: "call",
              childForFieldName: vi.fn((f: string) => {
                if (f === "function") {
                  return {
                    type: "attribute",
                    childForFieldName: vi.fn((f2: string) => {
                      if (f2 === "object") return { type: "identifier", text: "app" };
                      if (f2 === "attribute") return { type: "identifier", text: "get" };
                      return null;
                    }),
                  };
                }
                if (f === "arguments") {
                  return {
                    children: [
                      { type: "string", text: "'/api/items/<int:id>'" },
                    ],
                  };
                }
                return null;
              }),
            },
          ],
        },
        {
          type: "function_definition",
          text: "def get_item(id):\n    return jsonify(item)",
        },
      ],
    },
  ];
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("smoke-generator", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockTreeDelete.mockClear();
  });

  describe("detectNewEndpoints", () => {
    it("Test 8: parses Express app.get/post call expressions via AST", async () => {
      // Git diff returns newly added files
      vi.mocked(execSync).mockReturnValue(Buffer.from("src/routes/users.ts\n"));
      vi.mocked(fs.readFileSync).mockReturnValue(EXPRESS_SOURCE);

      // Configure mock tree to return Express-style AST nodes
      mockTree.rootNode.descendantsOfType.mockImplementation((types: string | string[]) => {
        const typeArr = Array.isArray(types) ? types : [types];
        if (typeArr.includes("call_expression")) {
          return buildExpressCallNodes();
        }
        return [];
      });

      const endpoints = await detectNewEndpoints("/project", ["src/routes/users.ts"]);

      expect(endpoints.length).toBeGreaterThanOrEqual(2);
      expect(endpoints[0].method.toLowerCase()).toBe("get");
      expect(endpoints[0].route).toContain("/api/users");
      expect(endpoints[1].method.toLowerCase()).toBe("post");
      // tree.delete() must be called after parsing
      expect(mockTreeDelete).toHaveBeenCalled();
    });

    it("Test 9: finds Next.js App Router exported GET/POST/PUT/DELETE/PATCH", async () => {
      vi.mocked(execSync).mockReturnValue(Buffer.from("app/api/users/route.ts\n"));
      vi.mocked(fs.readFileSync).mockReturnValue(NEXTJS_APP_ROUTER_SOURCE);

      // Configure mock tree to return Next.js App Router nodes
      mockTree.rootNode.descendantsOfType.mockImplementation((types: string | string[]) => {
        const typeArr = Array.isArray(types) ? types : [types];
        if (typeArr.includes("export_statement")) {
          return buildNextJsAppRouterNodes();
        }
        return [];
      });

      const endpoints = await detectNewEndpoints("/project", ["app/api/users/route.ts"]);

      expect(endpoints.length).toBeGreaterThanOrEqual(2);
      const methods = endpoints.map((e) => e.method);
      expect(methods).toContain("GET");
      expect(methods).toContain("POST");
      // Route inferred from file path
      expect(endpoints[0].route).toContain("/api/users");
      expect(mockTreeDelete).toHaveBeenCalled();
    });

    it("Test 10: finds Flask/FastAPI decorator patterns via AST", async () => {
      vi.mocked(execSync).mockReturnValue(Buffer.from("app/routes.py\n"));
      vi.mocked(fs.readFileSync).mockReturnValue(FLASK_SOURCE);

      mockTree.rootNode.descendantsOfType.mockImplementation((types: string | string[]) => {
        const typeArr = Array.isArray(types) ? types : [types];
        if (typeArr.includes("decorated_definition")) {
          return buildFlaskDecoratorNodes();
        }
        return [];
      });

      const endpoints = await detectNewEndpoints("/project", ["app/routes.py"]);

      expect(endpoints.length).toBeGreaterThanOrEqual(2);
      expect(endpoints[0].route).toContain("/api/items");
      expect(mockTreeDelete).toHaveBeenCalled();
    });

    it("Test 11: returns empty array for files with no endpoint declarations", async () => {
      vi.mocked(execSync).mockReturnValue(Buffer.from("src/utils/helpers.ts\n"));
      vi.mocked(fs.readFileSync).mockReturnValue("export function add(a: number, b: number) { return a + b; }");

      mockTree.rootNode.descendantsOfType.mockReturnValue([]);

      const endpoints = await detectNewEndpoints("/project", ["src/utils/helpers.ts"]);

      expect(endpoints).toEqual([]);
      expect(mockTreeDelete).toHaveBeenCalled();
    });
  });

  describe("buildSmokePrompt", () => {
    it("Test 12: generates LLM prompt with endpoint code and project test framework", () => {
      const endpoints: DetectedEndpoint[] = [
        {
          file: "src/routes/users.ts",
          method: "GET",
          route: "/api/users",
          code: "app.get('/api/users', (req, res) => { res.json(users); })",
        },
      ];

      const prompt = buildSmokePrompt(endpoints, "vitest");

      expect(prompt).toContain("smoke test");
      expect(prompt).toContain("GET");
      expect(prompt).toContain("/api/users");
      expect(prompt).toContain("vitest");
      expect(prompt).toContain("reachability");
    });

    it("Test 13: instructs temp file placement and cleanup", () => {
      const endpoints: DetectedEndpoint[] = [
        {
          file: "src/routes/items.ts",
          method: "POST",
          route: "/api/items",
          code: "app.post('/api/items', ...)",
        },
      ];

      const prompt = buildSmokePrompt(endpoints, "jest");

      expect(prompt).toContain("temp");
      expect(prompt).toContain("clean");
      expect(prompt).toContain("code block");
    });
  });
});
