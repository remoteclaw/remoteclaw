import { describe, expect, it } from "vitest";
import type { SessionEntry } from "../config/sessions.js";
import { getCliSessionId, setCliSessionId } from "./cli-session.js";

function makeEntry(overrides: Partial<SessionEntry> = {}): SessionEntry {
  return {
    sessionId: "test-session",
    updatedAt: Date.now(),
    ...overrides,
  };
}

describe("getCliSessionId", () => {
  it("returns undefined for undefined entry", () => {
    expect(getCliSessionId(undefined, "claude")).toBeUndefined();
  });

  it("returns session ID keyed by provider", () => {
    const entry = makeEntry({ cliSessionIds: { claude: "abc-123" } });
    expect(getCliSessionId(entry, "claude")).toBe("abc-123");
  });

  it("normalizes provider name before lookup", () => {
    const entry = makeEntry({ cliSessionIds: { claude: "abc-123" } });
    expect(getCliSessionId(entry, " Claude ")).toBe("abc-123");
  });

  it("returns undefined when provider has no stored session", () => {
    const entry = makeEntry({ cliSessionIds: { claude: "abc-123" } });
    expect(getCliSessionId(entry, "gemini")).toBeUndefined();
  });

  it("returns undefined when cliSessionIds map is absent", () => {
    const entry = makeEntry();
    expect(getCliSessionId(entry, "claude")).toBeUndefined();
  });

  it("trims whitespace from stored session ID", () => {
    const entry = makeEntry({ cliSessionIds: { claude: "  abc-123  " } });
    expect(getCliSessionId(entry, "claude")).toBe("abc-123");
  });

  it("returns undefined for whitespace-only session ID", () => {
    const entry = makeEntry({ cliSessionIds: { claude: "   " } });
    expect(getCliSessionId(entry, "claude")).toBeUndefined();
  });
});

describe("setCliSessionId", () => {
  it("stores session ID keyed by normalized provider", () => {
    const entry = makeEntry();
    setCliSessionId(entry, "claude", "new-sess-1");
    expect(entry.cliSessionIds?.["claude"]).toBe("new-sess-1");
  });

  it("normalizes provider name before storing", () => {
    const entry = makeEntry();
    setCliSessionId(entry, " Gemini ", "gem-sess");
    expect(entry.cliSessionIds?.["gemini"]).toBe("gem-sess");
  });

  it("creates cliSessionIds map if absent", () => {
    const entry = makeEntry();
    expect(entry.cliSessionIds).toBeUndefined();
    setCliSessionId(entry, "claude", "new-sess");
    expect(entry.cliSessionIds).toBeDefined();
    expect(entry.cliSessionIds?.["claude"]).toBe("new-sess");
  });

  it("preserves existing entries for other providers", () => {
    const entry = makeEntry({ cliSessionIds: { claude: "claude-sess" } });
    setCliSessionId(entry, "gemini", "gem-sess");
    expect(entry.cliSessionIds?.["claude"]).toBe("claude-sess");
    expect(entry.cliSessionIds?.["gemini"]).toBe("gem-sess");
  });

  it("overwrites existing session ID for same provider", () => {
    const entry = makeEntry({ cliSessionIds: { claude: "old-sess" } });
    setCliSessionId(entry, "claude", "new-sess");
    expect(entry.cliSessionIds?.["claude"]).toBe("new-sess");
  });

  it("does nothing for empty session ID", () => {
    const entry = makeEntry();
    setCliSessionId(entry, "claude", "");
    expect(entry.cliSessionIds).toBeUndefined();
  });

  it("does nothing for whitespace-only session ID", () => {
    const entry = makeEntry();
    setCliSessionId(entry, "claude", "   ");
    expect(entry.cliSessionIds).toBeUndefined();
  });

  it("trims whitespace from session ID before storing", () => {
    const entry = makeEntry();
    setCliSessionId(entry, "claude", "  trimmed-sess  ");
    expect(entry.cliSessionIds?.["claude"]).toBe("trimmed-sess");
  });
});

describe("session isolation across providers", () => {
  it("different runtimes get independent session IDs", () => {
    const entry = makeEntry();
    setCliSessionId(entry, "claude", "claude-sess-1");
    setCliSessionId(entry, "gemini", "gemini-sess-1");
    setCliSessionId(entry, "codex", "codex-sess-1");

    expect(getCliSessionId(entry, "claude")).toBe("claude-sess-1");
    expect(getCliSessionId(entry, "gemini")).toBe("gemini-sess-1");
    expect(getCliSessionId(entry, "codex")).toBe("codex-sess-1");
  });

  it("updating one provider does not affect others", () => {
    const entry = makeEntry();
    setCliSessionId(entry, "claude", "claude-v1");
    setCliSessionId(entry, "gemini", "gemini-v1");

    setCliSessionId(entry, "claude", "claude-v2");

    expect(getCliSessionId(entry, "claude")).toBe("claude-v2");
    expect(getCliSessionId(entry, "gemini")).toBe("gemini-v1");
  });
});
