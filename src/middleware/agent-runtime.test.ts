import { afterEach, describe, expect, it } from "vitest";
import type { AgentRuntime } from "./agent-runtime.js";
import {
  clearRuntimeRegistry,
  getRuntime,
  getRuntimeNames,
  registerRuntime,
} from "./agent-runtime.js";

describe("agent-runtime registry", () => {
  afterEach(() => {
    clearRuntimeRegistry();
  });

  function makeDummyRuntime(name: string): AgentRuntime {
    return {
      name,
      async *execute() {
        yield {
          type: "done" as const,
          result: {
            text: "",
            sessionId: undefined,
            durationMs: 0,
            usage: undefined,
            aborted: false,
          },
        };
      },
    };
  }

  it("registers and retrieves a runtime by name", () => {
    const dummy = makeDummyRuntime("test-rt");
    registerRuntime("test-rt", () => dummy);
    const result = getRuntime("test-rt");
    expect(result).toBe(dummy);
  });

  it("returns undefined for unknown runtime", () => {
    expect(getRuntime("nonexistent")).toBeUndefined();
  });

  it("lists registered runtime names", () => {
    registerRuntime("a", () => makeDummyRuntime("a"));
    registerRuntime("b", () => makeDummyRuntime("b"));
    expect(getRuntimeNames()).toEqual(["a", "b"]);
  });

  it("overwrites runtime with same name", () => {
    const first = makeDummyRuntime("v1");
    const second = makeDummyRuntime("v2");
    registerRuntime("rt", () => first);
    registerRuntime("rt", () => second);
    expect(getRuntime("rt")).toBe(second);
  });

  it("returns empty list when no runtimes registered", () => {
    expect(getRuntimeNames()).toEqual([]);
  });
});
