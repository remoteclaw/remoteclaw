import { describe, expect, it } from "vitest";
import {
  deriveSessionChatType,
  getSubagentDepth,
  isCronSessionKey,
} from "../sessions/session-key-utils.js";
import {
  buildAgentMainSessionKey,
  classifySessionKeyShape,
  DEFAULT_MAIN_KEY,
  isValidAgentId,
  normalizeAgentId,
  normalizeAgentIdOrNull,
  normalizeMainKey,
  parseAgentSessionKey,
  toAgentStoreSessionKey,
} from "./session-key.js";

describe("classifySessionKeyShape", () => {
  it("classifies empty keys as missing", () => {
    expect(classifySessionKeyShape(undefined)).toBe("missing");
    expect(classifySessionKeyShape("   ")).toBe("missing");
  });

  it("classifies valid agent keys", () => {
    expect(classifySessionKeyShape("agent:main:main")).toBe("agent");
    expect(classifySessionKeyShape("agent:research:subagent:worker")).toBe("agent");
  });

  it("classifies malformed agent keys", () => {
    expect(classifySessionKeyShape("agent::broken")).toBe("malformed_agent");
    expect(classifySessionKeyShape("agent:main")).toBe("malformed_agent");
  });

  it("treats non-agent legacy or alias keys as non-malformed", () => {
    expect(classifySessionKeyShape("main")).toBe("legacy_or_alias");
    expect(classifySessionKeyShape("custom-main")).toBe("legacy_or_alias");
    expect(classifySessionKeyShape("subagent:worker")).toBe("legacy_or_alias");
  });
});

describe("session key backward compatibility", () => {
  it("classifies legacy :dm: session keys as valid agent keys", () => {
    // Legacy session keys use :dm: instead of :direct:
    // Both should be recognized as valid agent keys
    expect(classifySessionKeyShape("agent:main:telegram:dm:123456")).toBe("agent");
    expect(classifySessionKeyShape("agent:main:whatsapp:dm:+15551234567")).toBe("agent");
    expect(classifySessionKeyShape("agent:main:discord:dm:user123")).toBe("agent");
  });

  it("classifies new :direct: session keys as valid agent keys", () => {
    expect(classifySessionKeyShape("agent:main:telegram:direct:123456")).toBe("agent");
    expect(classifySessionKeyShape("agent:main:whatsapp:direct:+15551234567")).toBe("agent");
    expect(classifySessionKeyShape("agent:main:discord:direct:user123")).toBe("agent");
  });
});

describe("getSubagentDepth", () => {
  it("returns 0 for non-subagent session keys", () => {
    expect(getSubagentDepth("agent:main:main")).toBe(0);
    expect(getSubagentDepth("main")).toBe(0);
    expect(getSubagentDepth(undefined)).toBe(0);
  });

  it("returns 2 for nested subagent session keys", () => {
    expect(getSubagentDepth("agent:main:subagent:parent:subagent:child")).toBe(2);
  });
});

describe("isCronSessionKey", () => {
  it("matches base and run cron agent session keys", () => {
    expect(isCronSessionKey("agent:main:cron:job-1")).toBe(true);
    expect(isCronSessionKey("agent:main:cron:job-1:run:run-1")).toBe(true);
  });

  it("does not match non-cron sessions", () => {
    expect(isCronSessionKey("agent:main:main")).toBe(false);
    expect(isCronSessionKey("agent:main:subagent:worker")).toBe(false);
    expect(isCronSessionKey("cron:job-1")).toBe(false);
    expect(isCronSessionKey(undefined)).toBe(false);
  });
});

describe("deriveSessionChatType", () => {
  it("detects canonical direct/group/channel session keys", () => {
    expect(deriveSessionChatType("agent:main:discord:direct:user1")).toBe("direct");
    expect(deriveSessionChatType("agent:main:telegram:group:g1")).toBe("group");
    expect(deriveSessionChatType("agent:main:discord:channel:c1")).toBe("channel");
  });

  it("detects legacy direct markers", () => {
    expect(deriveSessionChatType("agent:main:telegram:dm:123456")).toBe("direct");
    expect(deriveSessionChatType("telegram:dm:123456")).toBe("direct");
  });

  it("detects legacy discord guild channel keys", () => {
    expect(deriveSessionChatType("discord:acc-1:guild-123:channel-456")).toBe("channel");
  });

  it("returns unknown for main or malformed session keys", () => {
    expect(deriveSessionChatType("agent:main:main")).toBe("unknown");
    expect(deriveSessionChatType("agent:main")).toBe("unknown");
    expect(deriveSessionChatType("")).toBe("unknown");
  });
});

describe("session key canonicalization", () => {
  it("parses agent keys case-insensitively and returns lowercase tokens", () => {
    expect(parseAgentSessionKey("AGENT:Main:Hook:Webhook:42")).toEqual({
      agentId: "main",
      rest: "hook:webhook:42",
    });
  });

  it("does not double-prefix already-qualified agent keys", () => {
    expect(
      toAgentStoreSessionKey({
        agentId: "main",
        requestKey: "agent:main:main",
      }),
    ).toBe("agent:main:main");
  });
});

describe("isValidAgentId", () => {
  it("accepts valid agent ids", () => {
    expect(isValidAgentId("main")).toBe(true);
    expect(isValidAgentId("my-research_agent01")).toBe(true);
  });

  it("rejects malformed agent ids", () => {
    expect(isValidAgentId("")).toBe(false);
    expect(isValidAgentId("Agent not found: xyz")).toBe(false);
    expect(isValidAgentId("../../../etc/passwd")).toBe(false);
    expect(isValidAgentId("a".repeat(65))).toBe(false);
  });
});

// Regression coverage for #2311: normalizeAgentId split into strict + nullable
// variants, DEFAULT_AGENT_ID deleted. These tests pin the post-split semantics
// so the phantom-agent fallback cannot silently return.
describe("normalizeAgentId (strict)", () => {
  it("returns the normalized form for a valid id", () => {
    expect(normalizeAgentId("valid-id")).toBe("valid-id");
    expect(normalizeAgentId("my_agent01")).toBe("my_agent01");
  });

  it("throws on an empty string", () => {
    expect(() => normalizeAgentId("")).toThrow();
  });

  it("throws on a whitespace-only string", () => {
    expect(() => normalizeAgentId("   ")).toThrow();
    expect(() => normalizeAgentId("\t\n")).toThrow();
  });

  it("lowers uppercase input", () => {
    expect(normalizeAgentId("UPPER")).toBe("upper");
    expect(normalizeAgentId("MixedCase")).toBe("mixedcase");
  });

  it("collapses invalid characters to '-' when the input is otherwise salvageable", () => {
    expect(normalizeAgentId("INVALID!")).toBe("invalid");
    expect(normalizeAgentId("foo bar")).toBe("foo-bar");
    expect(normalizeAgentId("foo@bar!baz")).toBe("foo-bar-baz");
  });

  it("strips leading and trailing dashes from the normalized form", () => {
    expect(normalizeAgentId("---valid---")).toBe("valid");
    expect(normalizeAgentId("!!!valid!!!")).toBe("valid");
  });

  it("truncates the normalized form to 64 characters", () => {
    const long = "a".repeat(100);
    expect(normalizeAgentId(long)).toBe("a".repeat(64));
  });

  it("throws when the input normalizes to an empty string (all-invalid)", () => {
    // Post-#2311 semantics: there is no DEFAULT_AGENT_ID fallback anymore.
    // An input like "!!!" previously returned the phantom default; the strict
    // variant must now throw because the result would be empty.
    expect(() => normalizeAgentId("!!!")).toThrow();
    expect(() => normalizeAgentId("---")).toThrow();
  });
});

describe("normalizeAgentIdOrNull", () => {
  it("returns null for undefined", () => {
    expect(normalizeAgentIdOrNull(undefined)).toBeNull();
  });

  it("returns null for null", () => {
    expect(normalizeAgentIdOrNull(null)).toBeNull();
  });

  it("returns null for an empty string", () => {
    expect(normalizeAgentIdOrNull("")).toBeNull();
  });

  it("returns null for a whitespace-only string", () => {
    expect(normalizeAgentIdOrNull("   ")).toBeNull();
    expect(normalizeAgentIdOrNull("\t\n")).toBeNull();
  });

  it("returns the normalized string for a valid input", () => {
    expect(normalizeAgentIdOrNull("valid")).toBe("valid");
    expect(normalizeAgentIdOrNull("UPPER")).toBe("upper");
  });

  it("returns a sanitized string (not null) for a non-empty input with invalid chars", () => {
    expect(normalizeAgentIdOrNull("INVALID!")).toBe("invalid");
    expect(normalizeAgentIdOrNull("foo bar")).toBe("foo-bar");
  });

  it("returns null when sanitization collapses to an empty string", () => {
    expect(normalizeAgentIdOrNull("!!!")).toBeNull();
    expect(normalizeAgentIdOrNull("---")).toBeNull();
  });
});

// Regression guard for DEFAULT_MAIN_KEY.
//
// IMPORTANT: Do NOT delete DEFAULT_MAIN_KEY alongside DEFAULT_AGENT_ID.
//
// DEFAULT_AGENT_ID (the phantom default agent identity) was deleted in #2311.
// DEFAULT_MAIN_KEY (the session-key segment `"main"` in `agent:{id}:{mainKey}`)
// was intentionally preserved. Both constants used to live adjacent to each
// other in this file and both equal the literal string `"main"`, which makes
// them easy to conflate. They are different concepts:
//
//   - DEFAULT_AGENT_ID: the deleted phantom default agent. Gone.
//   - DEFAULT_MAIN_KEY: the default main-session segment used to build the
//     canonical session key for direct chats. Still needed.
//
// A future contributor seeing `DEFAULT_MAIN_KEY = "main"` next to recently
// deleted `DEFAULT_AGENT_ID = "main"` history may assume both were phantom
// defaults and delete DEFAULT_MAIN_KEY as a follow-up cleanup. This test
// exists to make that mistake loud: deleting DEFAULT_MAIN_KEY will fail here
// before it can break session-key construction across the runtime.
describe("DEFAULT_MAIN_KEY preservation (do not delete — see comment)", () => {
  it("is exported as the literal 'main'", () => {
    expect(DEFAULT_MAIN_KEY).toBe("main");
  });

  it("is used as the default mainKey by buildAgentMainSessionKey", () => {
    expect(buildAgentMainSessionKey({ agentId: "ops" })).toBe("agent:ops:main");
    expect(buildAgentMainSessionKey({ agentId: "ops" })).toBe(`agent:ops:${DEFAULT_MAIN_KEY}`);
  });

  it("can be overridden by an explicit mainKey parameter", () => {
    expect(buildAgentMainSessionKey({ agentId: "ops", mainKey: "primary" })).toBe(
      "agent:ops:primary",
    );
  });

  it("normalizes the agent id when building a main session key", () => {
    expect(buildAgentMainSessionKey({ agentId: "OPS" })).toBe("agent:ops:main");
  });

  it("is the fallback when normalizeMainKey receives undefined or empty input", () => {
    expect(normalizeMainKey(undefined)).toBe(DEFAULT_MAIN_KEY);
    expect(normalizeMainKey(null)).toBe(DEFAULT_MAIN_KEY);
    expect(normalizeMainKey("")).toBe(DEFAULT_MAIN_KEY);
    expect(normalizeMainKey("   ")).toBe(DEFAULT_MAIN_KEY);
  });

  it("drives the main-key collapse branch in toAgentStoreSessionKey", () => {
    // When the caller passes a raw requestKey that equals DEFAULT_MAIN_KEY
    // (case-insensitive), toAgentStoreSessionKey must produce the canonical
    // `agent:{id}:main` form via buildAgentMainSessionKey — that branch is
    // what relies on DEFAULT_MAIN_KEY surviving.
    expect(
      toAgentStoreSessionKey({
        agentId: "ops",
        requestKey: DEFAULT_MAIN_KEY,
      }),
    ).toBe("agent:ops:main");
    expect(
      toAgentStoreSessionKey({
        agentId: "ops",
        requestKey: "MAIN",
      }),
    ).toBe("agent:ops:main");
  });
});
