import { describe, expect, it } from "vitest";
import {
  resolveAgentAuth,
  resolveAgentRuntime,
  resolveAgentRuntimeArgs,
  resolveAgentRuntimeEnv,
} from "../agents/agent-scope.js";
import { validateConfigObject } from "./config.js";

describe("config schema regressions", () => {
  it("accepts nested telegram groupPolicy overrides", () => {
    const res = validateConfigObject({
      channels: {
        telegram: {
          groups: {
            "-1001234567890": {
              groupPolicy: "open",
              topics: {
                "42": {
                  groupPolicy: "disabled",
                },
              },
            },
          },
        },
      },
    });

    expect(res.ok).toBe(true);
  });

  it('accepts memorySearch fallback "voyage"', () => {
    const res = validateConfigObject({
      agents: {
        defaults: {
          memorySearch: {
            fallback: "voyage",
          },
        },
      },
    });

    expect(res.ok).toBe(true);
  });

  it('accepts memorySearch provider "mistral"', () => {
    const res = validateConfigObject({
      agents: {
        defaults: {
          memorySearch: {
            provider: "mistral",
          },
        },
      },
    });

    expect(res.ok).toBe(true);
  });

  it("accepts safe iMessage remoteHost", () => {
    const res = validateConfigObject({
      channels: {
        imessage: {
          remoteHost: "bot@gateway-host",
        },
      },
    });

    expect(res.ok).toBe(true);
  });

  it("accepts channels.whatsapp.enabled", () => {
    const res = validateConfigObject({
      channels: {
        whatsapp: {
          enabled: true,
        },
      },
    });

    expect(res.ok).toBe(true);
  });

  it("rejects unsafe iMessage remoteHost", () => {
    const res = validateConfigObject({
      channels: {
        imessage: {
          remoteHost: "bot@gateway-host -oProxyCommand=whoami",
        },
      },
    });

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.issues[0]?.path).toBe("channels.imessage.remoteHost");
    }
  });

  it("accepts iMessage attachment root patterns", () => {
    const res = validateConfigObject({
      channels: {
        imessage: {
          attachmentRoots: ["/Users/*/Library/Messages/Attachments"],
          remoteAttachmentRoots: ["/Volumes/relay/attachments"],
        },
      },
    });

    expect(res.ok).toBe(true);
  });

  it("accepts string values for agents defaults model inputs", () => {
    const res = validateConfigObject({
      agents: {
        defaults: {
          model: "anthropic/claude-opus-4-6",
          imageModel: "openai/gpt-4.1-mini",
        },
      },
    });

    expect(res.ok).toBe(true);
  });

  it("accepts pdf default model and limits", () => {
    const res = validateConfigObject({
      agents: {
        defaults: {
          pdfModel: {
            primary: "anthropic/claude-opus-4-6",
            fallbacks: ["openai/gpt-5-mini"],
          },
          pdfMaxBytesMb: 12,
          pdfMaxPages: 25,
        },
      },
    });

    expect(res.ok).toBe(true);
  });

  it("rejects non-positive pdf limits", () => {
    const res = validateConfigObject({
      agents: {
        defaults: {
          pdfModel: { primary: "openai/gpt-5-mini" },
          pdfMaxBytesMb: 0,
          pdfMaxPages: 0,
        },
      },
    });

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.issues.some((issue) => issue.path.includes("agents.defaults.pdfMax"))).toBe(true);
    }
  });

  it("rejects relative iMessage attachment roots", () => {
    const res = validateConfigObject({
      channels: {
        imessage: {
          attachmentRoots: ["./attachments"],
        },
      },
    });

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.issues[0]?.path).toBe("channels.imessage.attachmentRoots.0");
    }
  });

  it("accepts browser.extraArgs for proxy and custom flags", () => {
    const res = validateConfigObject({
      browser: {
        extraArgs: ["--proxy-server=http://127.0.0.1:7890"],
      },
    });

    expect(res.ok).toBe(true);
  });

  it("rejects browser.extraArgs with non-array value", () => {
    const res = validateConfigObject({
      browser: {
        extraArgs: "--proxy-server=http://127.0.0.1:7890" as unknown,
      },
    });

    expect(res.ok).toBe(false);
  });

  it("accepts per-agent auth/runtime/runtimeArgs/runtimeEnv fields", () => {
    const res = validateConfigObject({
      agents: {
        list: [
          {
            id: "main",
            workspace: "~/remoteclaw",
            auth: "anthropic:custom",
            runtime: "gemini",
            runtimeArgs: ["--model", "pro"],
            runtimeEnv: { API_KEY: "sk-test" },
          },
        ],
      },
    });

    expect(res.ok).toBe(true);
  });

  it("accepts per-agent fork-specific fields alongside defaults", () => {
    const res = validateConfigObject({
      agents: {
        defaults: {
          auth: "anthropic:default",
          runtime: "claude",
          runtimeArgs: ["--verbose"],
          runtimeEnv: { SHARED: "yes" },
        },
        list: [
          {
            id: "main",
            workspace: "~/remoteclaw",
            auth: false,
            runtime: "codex",
            runtimeArgs: [],
            runtimeEnv: { API_KEY: "sk-agent" },
          },
        ],
      },
    });

    expect(res.ok).toBe(true);
  });

  it("round-trip: full config through Zod parse then resolver functions", () => {
    const raw = {
      agents: {
        defaults: {
          auth: "anthropic:default",
          runtime: "claude" as const,
          runtimeArgs: ["--verbose"],
          runtimeEnv: { SHARED: "yes" },
        },
        list: [
          {
            id: "main",
            workspace: "~/remoteclaw",
            auth: "anthropic:custom",
            runtime: "gemini" as const,
            runtimeArgs: ["--model", "pro"],
            runtimeEnv: { API_KEY: "sk-test" },
          },
          {
            id: "secondary",
            workspace: "~/remoteclaw-secondary",
          },
        ],
      },
    };

    const res = validateConfigObject(raw);
    expect(res.ok).toBe(true);
    if (!res.ok) {
      return;
    }

    const cfg = res.config;

    // Agent "main" — per-agent fields override defaults
    expect(resolveAgentAuth(cfg, "main")).toBe("anthropic:custom");
    expect(resolveAgentRuntime(cfg, "main")).toBe("gemini");
    expect(resolveAgentRuntimeArgs(cfg, "main")).toEqual(["--model", "pro"]);
    expect(resolveAgentRuntimeEnv(cfg, "main")).toEqual({ API_KEY: "sk-test" });

    // Agent "secondary" — inherits from defaults
    expect(resolveAgentAuth(cfg, "secondary")).toBe("anthropic:default");
    expect(resolveAgentRuntime(cfg, "secondary")).toBe("claude");
    expect(resolveAgentRuntimeArgs(cfg, "secondary")).toEqual(["--verbose"]);
    expect(resolveAgentRuntimeEnv(cfg, "secondary")).toEqual({ SHARED: "yes" });
  });
});
