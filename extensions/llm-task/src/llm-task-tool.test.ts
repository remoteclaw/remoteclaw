import { describe, it, expect, vi, beforeEach } from "vitest";
import { createLlmTaskTool } from "./llm-task-tool.js";

const runAgent = vi.fn(async (_params: Record<string, unknown>) => ({
  meta: {} as Record<string, unknown>,
  payloads: [{ text: "{}" }],
}));

// oxlint-disable-next-line typescript/no-explicit-any
function fakeApi(overrides: any = {}) {
  return {
    id: "llm-task",
    name: "llm-task",
    source: "test",
    config: {
      agents: { defaults: { workspace: "/tmp", model: { primary: "openai-codex/gpt-5.2" } } },
    },
    pluginConfig: {},
    runtime: { version: "test" },
    logger: { debug() {}, info() {}, warn() {}, error() {} },
    registerTool() {},
    ...overrides,
  };
}

describe("llm-task tool (json-only)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns parsed json", async () => {
    runAgent.mockResolvedValueOnce({
      meta: {},
      payloads: [{ text: JSON.stringify({ foo: "bar" }) }],
    });
    const tool = createLlmTaskTool(fakeApi(), runAgent);
    const res = await tool.execute("id", { prompt: "return foo" });
    // oxlint-disable-next-line typescript/no-explicit-any
    expect((res as any).details.json).toEqual({ foo: "bar" });
  });

  it("strips fenced json", async () => {
    runAgent.mockResolvedValueOnce({
      meta: {},
      payloads: [{ text: '```json\n{"ok":true}\n```' }],
    });
    const tool = createLlmTaskTool(fakeApi(), runAgent);
    const res = await tool.execute("id", { prompt: "return ok" });
    // oxlint-disable-next-line typescript/no-explicit-any
    expect((res as any).details.json).toEqual({ ok: true });
  });

  it("validates schema", async () => {
    runAgent.mockResolvedValueOnce({
      meta: {},
      payloads: [{ text: JSON.stringify({ foo: "bar" }) }],
    });
    const tool = createLlmTaskTool(fakeApi(), runAgent);
    const schema = {
      type: "object",
      properties: { foo: { type: "string" } },
      required: ["foo"],
      additionalProperties: false,
    };
    const res = await tool.execute("id", { prompt: "return foo", schema });
    // oxlint-disable-next-line typescript/no-explicit-any
    expect((res as any).details.json).toEqual({ foo: "bar" });
  });

  it("throws on invalid json", async () => {
    runAgent.mockResolvedValueOnce({
      meta: {},
      payloads: [{ text: "not-json" }],
    });
    const tool = createLlmTaskTool(fakeApi(), runAgent);
    await expect(tool.execute("id", { prompt: "x" })).rejects.toThrow(/invalid json/i);
  });

  it("throws on schema mismatch", async () => {
    runAgent.mockResolvedValueOnce({
      meta: {},
      payloads: [{ text: JSON.stringify({ foo: 1 }) }],
    });
    const tool = createLlmTaskTool(fakeApi(), runAgent);
    const schema = { type: "object", properties: { foo: { type: "string" } }, required: ["foo"] };
    await expect(tool.execute("id", { prompt: "x", schema })).rejects.toThrow(/match schema/i);
  });

  it("passes provider/model overrides to agent runner", async () => {
    runAgent.mockResolvedValueOnce({
      meta: {},
      payloads: [{ text: JSON.stringify({ ok: true }) }],
    });
    const tool = createLlmTaskTool(fakeApi(), runAgent);
    await tool.execute("id", { prompt: "x", provider: "anthropic", model: "claude-4-sonnet" });
    const call = runAgent.mock.calls[0]?.[0];
    expect(call.provider).toBe("anthropic");
    expect(call.model).toBe("claude-4-sonnet");
  });

  it("enforces allowedModels", async () => {
    runAgent.mockResolvedValueOnce({
      meta: {},
      payloads: [{ text: JSON.stringify({ ok: true }) }],
    });
    const tool = createLlmTaskTool(
      fakeApi({ pluginConfig: { allowedModels: ["openai-codex/gpt-5.2"] } }),
      runAgent,
    );
    await expect(
      tool.execute("id", { prompt: "x", provider: "anthropic", model: "claude-4-sonnet" }),
    ).rejects.toThrow(/not allowed/i);
  });

  it("disables tools for agent run", async () => {
    runAgent.mockResolvedValueOnce({
      meta: {},
      payloads: [{ text: JSON.stringify({ ok: true }) }],
    });
    const tool = createLlmTaskTool(fakeApi(), runAgent);
    await tool.execute("id", { prompt: "x" });
    const call = runAgent.mock.calls[0]?.[0];
    expect(call.disableTools).toBe(true);
  });
});
