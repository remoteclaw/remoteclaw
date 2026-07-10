import { expect, test, vi } from "vitest";
import { loadCombinedSessionStoreForGateway } from "../config/sessions/combined-store-gateway.js";
import type { SessionEntry } from "../config/sessions/types.js";
import type { RemoteClawConfig } from "../config/types.remoteclaw.js";
import { findDirectChildSessionsForParent } from "./session-child-sessions.js";

vi.mock("../config/sessions/combined-store-gateway.js", () => ({
  loadCombinedSessionStoreForGateway: vi.fn(),
}));

const cfg = {} as unknown as RemoteClawConfig;

function entry(patch: Partial<SessionEntry>): SessionEntry {
  return {
    sessionId: "session",
    updatedAt: Date.now(),
    ...patch,
  };
}

test("findDirectChildSessionsForParent matches direct lineage only", () => {
  vi.mocked(loadCombinedSessionStoreForGateway).mockReturnValue({
    storePath: "(combined)",
    store: {
      "agent:main:main": entry({
        spawnedBy: "agent:main:main",
      }),
      "agent:codex:acp:spawned": entry({
        spawnedBy: " agent:main:main ",
      }),
      "agent:codex:sub:parent": entry({
        parentSessionKey: "agent:main:main",
      }),
      "agent:codex:acp:grandchild": entry({
        spawnedBy: "agent:codex:acp:spawned",
      }),
      "agent:codex:acp:unrelated": entry({
        spawnedBy: "agent:main:other",
      }),
    },
  });

  expect(
    findDirectChildSessionsForParent({
      cfg,
      parentKey: "agent:main:main",
    }).map(({ sessionKey }) => sessionKey),
  ).toEqual(["agent:codex:acp:spawned", "agent:codex:sub:parent"]);
});
