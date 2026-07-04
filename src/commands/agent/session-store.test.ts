import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RemoteClawConfig } from "../../config/config.js";
import type { SessionEntry } from "../../config/sessions.js";

const hoisted = vi.hoisted(() => ({
  updateSessionStoreMock: vi.fn(),
}));

vi.mock("../../config/sessions.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../config/sessions.js")>();
  return {
    ...actual,
    updateSessionStore: (...args: unknown[]) => hoisted.updateSessionStoreMock(...args),
  };
});

const { updateSessionStoreAfterAgentRun } = await import("./session-store.js");

type MergeCb = (store: Record<string, SessionEntry>) => SessionEntry;

async function runWith(params: { defaultProvider: string; cliSessionProvider?: string }) {
  let merged: SessionEntry | undefined;
  hoisted.updateSessionStoreMock.mockImplementation(async (_storePath: string, update: MergeCb) => {
    merged = update({});
    return merged;
  });
  await updateSessionStoreAfterAgentRun({
    cfg: {} as RemoteClawConfig,
    sessionId: "sess-1",
    sessionKey: "key-1",
    storePath: "/tmp/store.json",
    sessionStore: {},
    defaultProvider: params.defaultProvider,
    defaultModel: "unknown",
    cliSessionProvider: params.cliSessionProvider,
    result: { meta: { agentMeta: { sessionId: "cli-sess-xyz" } } } as never,
  });
  return merged;
}

describe("updateSessionStoreAfterAgentRun — CLI session key (#2790)", () => {
  beforeEach(() => {
    hoisted.updateSessionStoreMock.mockReset();
  });

  it("keys cliSessionIds by cliSessionProvider (runtime), not the model provider", async () => {
    // The /agent command resolves defaultProvider to the model provider ("unknown"),
    // but CLI session IDs must be keyed by the resolved runtime ("claude") — the same
    // key the bridge reads with. Keying by "unknown" is the #2790 no-resume bug.
    const merged = await runWith({ defaultProvider: "unknown", cliSessionProvider: "claude" });
    expect(merged?.cliSessionIds?.["claude"]).toBe("cli-sess-xyz");
    expect(merged?.cliSessionIds?.["unknown"]).toBeUndefined();
  });

  it("drops the CLI session when keyed by a non-runtime provider (the pre-fix bug)", async () => {
    // Without a runtime key, the key falls back to providerUsed ("unknown"), which
    // isCliProvider() rejects — so nothing is persisted and --resume never fires.
    const merged = await runWith({ defaultProvider: "unknown", cliSessionProvider: undefined });
    expect(merged?.cliSessionIds).toBeUndefined();
  });
});
