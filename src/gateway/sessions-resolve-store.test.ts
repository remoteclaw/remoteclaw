import path from "node:path";
import { describe, expect, it } from "vitest";
import { resolveStorePath, saveSessionStore } from "../config/sessions.js";
import type { RemoteClawConfig } from "../config/types.remoteclaw.js";
import { withStateDirEnv } from "../test-helpers/state-dir-env.js";
import { ErrorCodes } from "./protocol/index.js";
import { resolveSessionKeyFromResolveParams } from "./sessions-resolve.js";

describe("resolveSessionKeyFromResolveParams store canonicalization", () => {
  const freshUpdatedAt = () => Date.now();

  // #2733: legacy main-alias remap. A legacy single-store `agent:main:main`
  // entry (default agent renamed away from `main`) remaps onto the live default
  // agent's main session via the narrow 4-conjunct gate in sessions-resolve.ts.
  // The reject falsifiers below (discovered per-agent store, explicit key) prove
  // the boundary stays narrow and the #65524 deleted-agent guard is preserved.
  it("resolves legacy main-alias matches by sessionId and label for the configured default agent", async () => {
    await withStateDirEnv("remoteclaw-sessions-resolve-alias-", async ({ stateDir }) => {
      const storePath = path.join(stateDir, "sessions.json");
      const cfg = {
        session: { store: storePath, mainKey: "main" },
        agents: { list: [{ id: "ops", default: true }] },
      } satisfies RemoteClawConfig;
      await saveSessionStore(storePath, {
        "agent:main:main": {
          sessionId: "sess-default-alias",
          label: "default-alias",
          updatedAt: freshUpdatedAt(),
        },
      });

      await expect(
        resolveSessionKeyFromResolveParams({
          cfg,
          p: { sessionId: "sess-default-alias" },
        }),
      ).resolves.toEqual({ ok: true, key: "agent:ops:main" });

      await expect(
        resolveSessionKeyFromResolveParams({
          cfg,
          p: { label: "default-alias" },
        }),
      ).resolves.toEqual({ ok: true, key: "agent:ops:main" });
    });
  });

  it("still rejects non-alias agent:main matches when main is no longer configured", async () => {
    await withStateDirEnv("remoteclaw-sessions-resolve-stale-main-", async ({ stateDir }) => {
      const storePath = path.join(stateDir, "sessions.json");
      const cfg = {
        session: { store: storePath, mainKey: "main" },
        agents: { list: [{ id: "ops", default: true }] },
      } satisfies RemoteClawConfig;
      await saveSessionStore(storePath, {
        "agent:main:guildchat:direct:u1": {
          sessionId: "sess-stale-main",
          label: "stale-main",
          updatedAt: freshUpdatedAt(),
        },
      });

      await expect(
        resolveSessionKeyFromResolveParams({
          cfg,
          p: { sessionId: "sess-stale-main" },
        }),
      ).resolves.toEqual({
        ok: false,
        error: {
          code: ErrorCodes.INVALID_REQUEST,
          message: 'Agent "main" no longer exists in configuration',
        },
      });
    });
  });

  it("does not adopt legacy main aliases from discovered deleted-agent stores", async () => {
    await withStateDirEnv("remoteclaw-sessions-resolve-discovered-main-", async () => {
      const cfg: RemoteClawConfig = {
        agents: { list: [{ id: "ops", default: true }] },
      };
      const staleMainStorePath = resolveStorePath(cfg.session?.store, { agentId: "main" });
      await saveSessionStore(staleMainStorePath, {
        "agent:main:main": {
          sessionId: "sess-discovered-main",
          label: "discovered-main",
          updatedAt: freshUpdatedAt(),
        },
      });

      await expect(
        resolveSessionKeyFromResolveParams({
          cfg,
          p: { sessionId: "sess-discovered-main" },
        }),
      ).resolves.toEqual({
        ok: false,
        error: {
          code: ErrorCodes.INVALID_REQUEST,
          message: 'Agent "main" no longer exists in configuration',
        },
      });

      await expect(
        resolveSessionKeyFromResolveParams({
          cfg,
          p: { label: "discovered-main" },
        }),
      ).resolves.toEqual({
        ok: false,
        error: {
          code: ErrorCodes.INVALID_REQUEST,
          message: 'Agent "main" no longer exists in configuration',
        },
      });
    });
  });

  it("rejects an explicit listed deleted main key instead of remapping to the live default main", async () => {
    await withStateDirEnv("remoteclaw-sessions-resolve-key-deleted-main-", async () => {
      const cfg: RemoteClawConfig = {
        agents: { list: [{ id: "ops", default: true }] },
      };
      const liveDefaultStorePath = resolveStorePath(cfg.session?.store, { agentId: "ops" });
      await saveSessionStore(liveDefaultStorePath, {
        "agent:ops:main": {
          sessionId: "sess-live-default",
          updatedAt: freshUpdatedAt(),
        },
      });
      const staleMainStorePath = resolveStorePath(cfg.session?.store, { agentId: "main" });
      await saveSessionStore(staleMainStorePath, {
        "agent:main:main": {
          sessionId: "sess-deleted-main",
          updatedAt: freshUpdatedAt(),
        },
      });

      await expect(
        resolveSessionKeyFromResolveParams({
          cfg,
          p: { key: "agent:main:main" },
        }),
      ).resolves.toEqual({
        ok: false,
        error: {
          code: ErrorCodes.INVALID_REQUEST,
          message: 'Agent "main" no longer exists in configuration',
        },
      });
    });
  });
});
