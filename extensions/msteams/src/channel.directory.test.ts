import type { RemoteClawConfig, RuntimeEnv } from "remoteclaw/plugin-sdk";
import { describe, expect, it } from "vitest";
import { msteamsPlugin } from "./channel.js";

describe("msteams directory", () => {
  const runtimeEnv: RuntimeEnv = {
    log: () => {},
    error: () => {},
    exit: (code: number): never => {
      throw new Error(`exit ${code}`);
    },
  };

  describe("self()", () => {
    it("returns bot identity when credentials are configured", async () => {
      const cfg = {
        channels: {
          msteams: {
            appId: "test-app-id-1234",
            appPassword: "secret",
            tenantId: "tenant-id-5678",
          },
        },
      } as unknown as RemoteClawConfig;

      const result = await msteamsPlugin.directory?.self?.({ cfg, runtime: runtimeEnv });
      expect(result).toEqual({ kind: "user", id: "test-app-id-1234", name: "test-app-id-1234" });
    });

    it("returns null when credentials are not configured", async () => {
      const cfg = { channels: {} } as unknown as RemoteClawConfig;
      const result = await msteamsPlugin.directory?.self?.({ cfg, runtime: runtimeEnv });
      expect(result).toBeNull();
    });
  });

  it("lists peers and groups from config", async () => {
    const cfg = {
      channels: {
        msteams: {
          allowFrom: ["alice", "user:Bob"],
          dms: { carol: {}, bob: {} },
          teams: {
            team1: {
              channels: {
                "conversation:chan1": {},
                chan2: {},
              },
            },
          },
        },
      },
    } as unknown as RemoteClawConfig;

    expect(msteamsPlugin.directory).toBeTruthy();
    expect(msteamsPlugin.directory?.listPeers).toBeTruthy();
    expect(msteamsPlugin.directory?.listGroups).toBeTruthy();

    await expect(
      msteamsPlugin.directory!.listPeers!({
        cfg,
        query: undefined,
        limit: undefined,
        runtime: runtimeEnv,
      }),
    ).resolves.toEqual(
      expect.arrayContaining([
        { kind: "user", id: "user:alice" },
        { kind: "user", id: "user:Bob" },
        { kind: "user", id: "user:carol" },
        { kind: "user", id: "user:bob" },
      ]),
    );

    await expect(
      msteamsPlugin.directory!.listGroups!({
        cfg,
        query: undefined,
        limit: undefined,
        runtime: runtimeEnv,
      }),
    ).resolves.toEqual(
      expect.arrayContaining([
        { kind: "group", id: "conversation:chan1" },
        { kind: "group", id: "conversation:chan2" },
      ]),
    );
  });
});
