import { describe, expect, it } from "vitest";
import { RemoteClawSchema } from "./zod-schema.js";

describe("telegram topic agentId schema", () => {
  it("accepts valid agentId in forum group topic config", () => {
    const res = RemoteClawSchema.safeParse({
      channels: {
        telegram: {
          groups: {
            "-1001234567890": {
              topics: {
                "42": {
                  agentId: "test-agent",
                },
              },
            },
          },
        },
      },
    });

    expect(res.success).toBe(true);
    if (!res.success) {
      console.error(res.error.format());
      return;
    }
    expect(res.data.channels?.telegram?.groups?.["-1001234567890"]?.topics?.["42"]?.agentId).toBe(
      "test-agent",
    );
  });

  it("accepts valid agentId in DM topic config", () => {
    const res = RemoteClawSchema.safeParse({
      channels: {
        telegram: {
          direct: {
            "123456789": {
              topics: {
                "99": {
                  agentId: "support",
                  systemPrompt: "You are support",
                },
              },
            },
          },
        },
      },
    });

    expect(res.success).toBe(true);
    if (!res.success) {
      console.error(res.error.format());
      return;
    }
    expect(res.data.channels?.telegram?.direct?.["123456789"]?.topics?.["99"]?.agentId).toBe(
      "support",
    );
  });

  it("accepts empty config without agentId (backward compatible)", () => {
    const res = RemoteClawSchema.safeParse({
      channels: {
        telegram: {
          groups: {
            "-1001234567890": {
              topics: {
                "42": {
                  systemPrompt: "Be helpful",
                },
              },
            },
          },
        },
      },
    });

    expect(res.success).toBe(true);
    if (!res.success) {
      console.error(res.error.format());
      return;
    }
    expect(res.data.channels?.telegram?.groups?.["-1001234567890"]?.topics?.["42"]).toEqual({
      systemPrompt: "Be helpful",
    });
  });

  it("accepts multiple topics with different agentIds", () => {
    const res = RemoteClawSchema.safeParse({
      channels: {
        telegram: {
          groups: {
            "-1001234567890": {
              topics: {
                "1": { agentId: "test-agent" },
                "3": { agentId: "zu" },
                "5": { agentId: "q" },
              },
            },
          },
        },
      },
    });

    expect(res.success).toBe(true);
    if (!res.success) {
      console.error(res.error.format());
      return;
    }
    const topics = res.data.channels?.telegram?.groups?.["-1001234567890"]?.topics;
    expect(topics?.["1"]?.agentId).toBe("test-agent");
    expect(topics?.["3"]?.agentId).toBe("zu");
    expect(topics?.["5"]?.agentId).toBe("q");
  });

  it("rejects unknown fields in topic config (strict schema)", () => {
    const res = RemoteClawSchema.safeParse({
      channels: {
        telegram: {
          groups: {
            "-1001234567890": {
              topics: {
                "42": {
                  agentId: "test-agent",
                  unknownField: "should fail",
                },
              },
            },
          },
        },
      },
    });

    expect(res.success).toBe(false);
  });
});

describe("telegram disableAudioPreflight schema", () => {
  it("accepts disableAudioPreflight for groups and topics", () => {
    const res = RemoteClawSchema.safeParse({
      channels: {
        telegram: {
          groups: {
            "*": {
              requireMention: true,
              disableAudioPreflight: true,
              topics: {
                "123": {
                  disableAudioPreflight: false,
                },
              },
            },
          },
        },
      },
    });

    expect(res.success).toBe(true);
    if (!res.success) {
      return;
    }

    const group = res.data.channels?.telegram?.groups?.["*"];
    expect(group?.disableAudioPreflight).toBe(true);
    expect(group?.topics?.["123"]?.disableAudioPreflight).toBe(false);
  });

  it("rejects non-boolean disableAudioPreflight values", () => {
    const res = RemoteClawSchema.safeParse({
      channels: {
        telegram: {
          groups: {
            "*": {
              disableAudioPreflight: "yes",
            },
          },
        },
      },
    });

    expect(res.success).toBe(false);
  });

  it("accepts telegram botToken without tokenFile", () => {
    const res = RemoteClawSchema.safeParse({
      channels: {
        telegram: {
          botToken: "123:ABC",
        },
      },
    });

    expect(res.success).toBe(true);
    if (!res.success) {
      return;
    }

    expect(res.data.channels?.telegram?.botToken).toBe("123:ABC");
    expect(res.data.channels?.telegram?.tokenFile).toBeUndefined();
  });

  it("accepts telegram tokenFile without botToken", () => {
    const res = RemoteClawSchema.safeParse({
      channels: {
        telegram: {
          tokenFile: "/run/agenix/telegram-token",
        },
      },
    });

    expect(res.success).toBe(true);
    if (!res.success) {
      return;
    }

    expect(res.data.channels?.telegram?.tokenFile).toBe("/run/agenix/telegram-token");
    expect(res.data.channels?.telegram?.botToken).toBeUndefined();
  });

  it("accepts telegram botToken and tokenFile together", () => {
    const res = RemoteClawSchema.safeParse({
      channels: {
        telegram: {
          botToken: "fallback:token",
          tokenFile: "/run/agenix/telegram-token",
        },
      },
    });

    expect(res.success).toBe(true);
    if (!res.success) {
      return;
    }

    expect(res.data.channels?.telegram?.botToken).toBe("fallback:token");
    expect(res.data.channels?.telegram?.tokenFile).toBe("/run/agenix/telegram-token");
  });
});
