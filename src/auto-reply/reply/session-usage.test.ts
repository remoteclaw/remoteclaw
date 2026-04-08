import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionEntry } from "../../config/sessions.js";

const hoisted = vi.hoisted(() => {
  const updateSessionStoreEntryMock = vi.fn();
  return { updateSessionStoreEntryMock };
});

vi.mock("../../config/sessions.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../config/sessions.js")>();
  return {
    ...actual,
    updateSessionStoreEntry: (...args: unknown[]) => hoisted.updateSessionStoreEntryMock(...args),
  };
});

vi.mock("../../globals.js", () => ({
  logVerbose: vi.fn(),
}));

const { persistSessionUsageUpdate } = await import("./session-usage.js");

function makeEntry(overrides: Partial<SessionEntry> = {}): SessionEntry {
  return {
    sessionId: "test-session",
    updatedAt: Date.now(),
    ...overrides,
  };
}

describe("persistSessionUsageUpdate — CLI session ID persistence", () => {
  beforeEach(() => {
    hoisted.updateSessionStoreEntryMock.mockReset();
  });

  it("writes cliSessionId keyed by providerUsed", async () => {
    const entry = makeEntry({ modelProvider: "old-provider" });
    hoisted.updateSessionStoreEntryMock.mockImplementation(
      async (params: { update: (e: SessionEntry) => Promise<Partial<SessionEntry>> }) => {
        return params.update(entry);
      },
    );

    await persistSessionUsageUpdate({
      storePath: "/tmp/store.json",
      sessionKey: "test-key",
      usage: { input: 100, output: 50 },
      providerUsed: "claude",
      cliSessionId: "sess-abc-123",
    });

    expect(hoisted.updateSessionStoreEntryMock).toHaveBeenCalledOnce();
    const patch = await hoisted.updateSessionStoreEntryMock.mock.results[0].value;
    expect(patch.cliSessionIds?.["claude"]).toBe("sess-abc-123");
  });

  it("uses entry.modelProvider when providerUsed is absent", async () => {
    const entry = makeEntry({ modelProvider: "gemini" });
    hoisted.updateSessionStoreEntryMock.mockImplementation(
      async (params: { update: (e: SessionEntry) => Promise<Partial<SessionEntry>> }) => {
        return params.update(entry);
      },
    );

    await persistSessionUsageUpdate({
      storePath: "/tmp/store.json",
      sessionKey: "test-key",
      usage: { input: 100, output: 50 },
      cliSessionId: "gem-sess-456",
    });

    const patch = await hoisted.updateSessionStoreEntryMock.mock.results[0].value;
    expect(patch.cliSessionIds?.["gemini"]).toBe("gem-sess-456");
  });

  it("does not write cliSessionIds when cliSessionId is absent", async () => {
    const entry = makeEntry();
    hoisted.updateSessionStoreEntryMock.mockImplementation(
      async (params: { update: (e: SessionEntry) => Promise<Partial<SessionEntry>> }) => {
        return params.update(entry);
      },
    );

    await persistSessionUsageUpdate({
      storePath: "/tmp/store.json",
      sessionKey: "test-key",
      usage: { input: 100, output: 50 },
      providerUsed: "claude",
    });

    const patch = await hoisted.updateSessionStoreEntryMock.mock.results[0].value;
    expect(patch.cliSessionIds).toBeUndefined();
  });

  it("does not write cliSessionIds when provider is absent", async () => {
    const entry = makeEntry();
    hoisted.updateSessionStoreEntryMock.mockImplementation(
      async (params: { update: (e: SessionEntry) => Promise<Partial<SessionEntry>> }) => {
        return params.update(entry);
      },
    );

    await persistSessionUsageUpdate({
      storePath: "/tmp/store.json",
      sessionKey: "test-key",
      usage: { input: 100, output: 50 },
      cliSessionId: "sess-orphan",
    });

    const patch = await hoisted.updateSessionStoreEntryMock.mock.results[0].value;
    expect(patch.cliSessionIds).toBeUndefined();
  });

  it("preserves existing cliSessionIds for other providers", async () => {
    const entry = makeEntry({
      cliSessionIds: { gemini: "existing-gem-sess" },
    });
    hoisted.updateSessionStoreEntryMock.mockImplementation(
      async (params: { update: (e: SessionEntry) => Promise<Partial<SessionEntry>> }) => {
        return params.update(entry);
      },
    );

    await persistSessionUsageUpdate({
      storePath: "/tmp/store.json",
      sessionKey: "test-key",
      usage: { input: 100, output: 50 },
      providerUsed: "claude",
      cliSessionId: "claude-sess-new",
    });

    const patch = await hoisted.updateSessionStoreEntryMock.mock.results[0].value;
    expect(patch.cliSessionIds?.["claude"]).toBe("claude-sess-new");
    expect(patch.cliSessionIds?.["gemini"]).toBe("existing-gem-sess");
  });

  it("persists cliSessionId via model/context path when no usage", async () => {
    const entry = makeEntry({ modelProvider: "codex" });
    hoisted.updateSessionStoreEntryMock.mockImplementation(
      async (params: { update: (e: SessionEntry) => Promise<Partial<SessionEntry>> }) => {
        return params.update(entry);
      },
    );

    await persistSessionUsageUpdate({
      storePath: "/tmp/store.json",
      sessionKey: "test-key",
      modelUsed: "codex-latest",
      providerUsed: "codex",
      cliSessionId: "codex-sess-789",
    });

    const patch = await hoisted.updateSessionStoreEntryMock.mock.results[0].value;
    expect(patch.cliSessionIds?.["codex"]).toBe("codex-sess-789");
  });

  it("skips entirely when storePath is missing", async () => {
    await persistSessionUsageUpdate({
      sessionKey: "test-key",
      usage: { input: 100, output: 50 },
      providerUsed: "claude",
      cliSessionId: "sess-should-not-persist",
    });

    expect(hoisted.updateSessionStoreEntryMock).not.toHaveBeenCalled();
  });

  it("skips entirely when sessionKey is missing", async () => {
    await persistSessionUsageUpdate({
      storePath: "/tmp/store.json",
      usage: { input: 100, output: 50 },
      providerUsed: "claude",
      cliSessionId: "sess-should-not-persist",
    });

    expect(hoisted.updateSessionStoreEntryMock).not.toHaveBeenCalled();
  });
});
