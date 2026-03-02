import { describe, expect, it, vi } from "vitest";
import { pluginToolsHandlers } from "./plugin-tools.js";
import type { RespondFn } from "./types.js";

// Mock dependencies
vi.mock("../../agents/agent-scope.js", () => ({
  resolveAgentDir: () => "/mock/agent",
  resolveAgentWorkspaceDir: () => "/mock/workspace",
  resolveDefaultAgentId: () => "default",
}));

vi.mock("../../config/config.js", () => ({
  loadConfig: () => ({}),
}));

const mockResolvePluginTools = vi.fn();
vi.mock("../../plugins/tools.js", () => ({
  resolvePluginTools: (...args: unknown[]) => mockResolvePluginTools(...args),
}));

function createHandlerArgs(method: string, params: Record<string, unknown> = {}) {
  const respond = vi.fn() as unknown as RespondFn & ReturnType<typeof vi.fn>;
  return {
    opts: {
      req: { method, params },
      params,
      client: undefined,
      isWebchatConnect: false,
      respond,
      context: { logGateway: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } },
    },
    respond,
  };
}

describe("plugin:tools:list", () => {
  it("returns tool names, descriptions, and schemas", () => {
    const mockTool = {
      name: "vector_search",
      description: "Search vector memory",
      parameters: {
        type: "object",
        properties: { query: { type: "string" } },
        required: ["query"],
      },
    };
    mockResolvePluginTools.mockReturnValue([mockTool]);

    const { opts, respond } = createHandlerArgs("plugin:tools:list");
    // oxlint-disable-next-line typescript/no-explicit-any
    void pluginToolsHandlers["plugin:tools:list"](opts as any);

    expect(respond).toHaveBeenCalledWith(
      true,
      expect.objectContaining({
        agentId: "default",
        tools: [
          {
            name: "vector_search",
            description: "Search vector memory",
            inputSchema: {
              type: "object",
              properties: { query: { type: "string" } },
              required: ["query"],
            },
          },
        ],
      }),
    );
  });

  it("returns empty array when no plugins registered", () => {
    mockResolvePluginTools.mockReturnValue([]);

    const { opts, respond } = createHandlerArgs("plugin:tools:list");
    // oxlint-disable-next-line typescript/no-explicit-any
    void pluginToolsHandlers["plugin:tools:list"](opts as any);

    expect(respond).toHaveBeenCalledWith(true, expect.objectContaining({ tools: [] }));
  });

  it("provides fallback description for tools without one", () => {
    const mockTool = {
      name: "bare_tool",
      description: "",
      parameters: { type: "object" },
    };
    mockResolvePluginTools.mockReturnValue([mockTool]);

    const { opts, respond } = createHandlerArgs("plugin:tools:list");
    // oxlint-disable-next-line typescript/no-explicit-any
    void pluginToolsHandlers["plugin:tools:list"](opts as any);

    expect(respond).toHaveBeenCalledWith(
      true,
      expect.objectContaining({
        tools: [expect.objectContaining({ description: "Plugin tool" })],
      }),
    );
  });

  it("provides fallback schema for tools without parameters", () => {
    const mockTool = {
      name: "no_schema_tool",
      description: "Tool without schema",
      parameters: undefined,
    };
    mockResolvePluginTools.mockReturnValue([mockTool]);

    const { opts, respond } = createHandlerArgs("plugin:tools:list");
    // oxlint-disable-next-line typescript/no-explicit-any
    void pluginToolsHandlers["plugin:tools:list"](opts as any);

    expect(respond).toHaveBeenCalledWith(
      true,
      expect.objectContaining({
        tools: [
          expect.objectContaining({
            inputSchema: { type: "object", properties: {} },
          }),
        ],
      }),
    );
  });
});

describe("plugin:tools:invoke", () => {
  it("executes a plugin tool and returns result", async () => {
    const mockExecute = vi.fn().mockResolvedValue({
      content: [{ type: "text", text: "result data" }],
      details: { found: 3 },
    });
    mockResolvePluginTools.mockReturnValue([{ name: "vector_search", execute: mockExecute }]);

    const { opts, respond } = createHandlerArgs("plugin:tools:invoke", {
      toolName: "vector_search",
      params: { query: "test" },
    });
    // oxlint-disable-next-line typescript/no-explicit-any
    await pluginToolsHandlers["plugin:tools:invoke"](opts as any);

    expect(mockExecute).toHaveBeenCalledWith(
      expect.any(String), // toolCallId (UUID)
      { query: "test" },
    );
    expect(respond).toHaveBeenCalledWith(true, {
      content: [{ type: "text", text: "result data" }],
      details: { found: 3 },
    });
  });

  it("returns error when toolName is missing", async () => {
    const { opts, respond } = createHandlerArgs("plugin:tools:invoke", {});
    // oxlint-disable-next-line typescript/no-explicit-any
    await pluginToolsHandlers["plugin:tools:invoke"](opts as any);

    expect(respond).toHaveBeenCalledWith(
      false,
      undefined,
      expect.objectContaining({ message: "toolName required" }),
    );
  });

  it("returns error when tool is not found", async () => {
    mockResolvePluginTools.mockReturnValue([]);

    const { opts, respond } = createHandlerArgs("plugin:tools:invoke", {
      toolName: "nonexistent",
    });
    // oxlint-disable-next-line typescript/no-explicit-any
    await pluginToolsHandlers["plugin:tools:invoke"](opts as any);

    expect(respond).toHaveBeenCalledWith(
      false,
      undefined,
      expect.objectContaining({ message: "plugin tool not found: nonexistent" }),
    );
  });

  it("returns error when tool execution fails", async () => {
    mockResolvePluginTools.mockReturnValue([
      {
        name: "failing_tool",
        execute: vi.fn().mockRejectedValue(new Error("execution failed")),
      },
    ]);

    const { opts, respond } = createHandlerArgs("plugin:tools:invoke", {
      toolName: "failing_tool",
      params: {},
    });
    // oxlint-disable-next-line typescript/no-explicit-any
    await pluginToolsHandlers["plugin:tools:invoke"](opts as any);

    expect(respond).toHaveBeenCalledWith(
      false,
      undefined,
      expect.objectContaining({ message: expect.stringContaining("execution failed") }),
    );
  });
});
