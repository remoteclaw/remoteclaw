import { describe, it, expect } from "vitest";
import { createLlmTaskTool } from "./llm-task-tool.js";

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

describe("llm-task tool (pi-embedded removed)", () => {
  it("creates tool with expected metadata", () => {
    const tool = createLlmTaskTool(fakeApi());
    expect(tool.name).toBe("llm-task");
    expect(tool.label).toBe("LLM Task");
  });

  it("throws because pi-embedded engine was removed", async () => {
    const tool = createLlmTaskTool(fakeApi());
    await expect(tool.execute("id", { prompt: "return foo" })).rejects.toThrow(
      /pi-embedded engine removed/i,
    );
  });

  it("still validates prompt is required", async () => {
    const tool = createLlmTaskTool(fakeApi());
    await expect(tool.execute("id", { prompt: "" })).rejects.toThrow(/prompt required/i);
  });

  it("still validates provider/model resolution", async () => {
    const tool = createLlmTaskTool(
      fakeApi({ config: { agents: { defaults: { workspace: "/tmp" } } } }),
    );
    await expect(tool.execute("id", { prompt: "x" })).rejects.toThrow(
      /provider\/model could not be resolved/i,
    );
  });

  it("still enforces allowedModels", async () => {
    const tool = createLlmTaskTool(
      fakeApi({ pluginConfig: { allowedModels: ["openai-codex/gpt-5.2"] } }),
    );
    await expect(
      tool.execute("id", { prompt: "x", provider: "anthropic", model: "claude-4-sonnet" }),
    ).rejects.toThrow(/not allowed/i);
  });
});
