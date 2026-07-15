import type { MSTeamsConfig } from "remoteclaw/plugin-sdk/msteams";
import { describe, expect, it, vi } from "vitest";

const hostMockState = vi.hoisted(() => ({
  tokenError: null as Error | null,
}));

// probe.ts acquires tokens through `loadMSTeamsSdkWithAuth().sdk.MsalTokenProvider`
// (agents-hosting), not the legacy `@microsoft/teams.apps` App surface. Mock the
// SDK loader so no real MSAL/AAD call is attempted.
vi.mock("./sdk.js", () => ({
  loadMSTeamsSdkWithAuth: vi.fn(async () => ({
    sdk: {
      MsalTokenProvider: class {
        constructor(_authConfig: unknown) {}
        async getAccessToken(_resource: string) {
          if (hostMockState.tokenError) {
            throw hostMockState.tokenError;
          }
          return { value: "token" };
        }
      },
    },
    authConfig: {},
  })),
}));

import { probeMSTeams } from "./probe.js";

describe("msteams probe", () => {
  it("returns an error when credentials are missing", async () => {
    const cfg = { enabled: true } as unknown as MSTeamsConfig;
    await expect(probeMSTeams(cfg)).resolves.toEqual({
      ok: false,
      error: "missing credentials (appId, appPassword, tenantId)",
    });
  });

  it("validates credentials by acquiring a token", async () => {
    hostMockState.tokenError = null;
    const cfg = {
      enabled: true,
      appId: "app",
      appPassword: "pw",
      tenantId: "tenant",
    } as unknown as MSTeamsConfig;
    await expect(probeMSTeams(cfg)).resolves.toEqual({
      ok: true,
      appId: "app",
      graph: { ok: true, roles: undefined, scopes: undefined },
    });
  });

  it("returns a helpful error when token acquisition fails", async () => {
    hostMockState.tokenError = new Error("bad creds");
    const cfg = {
      enabled: true,
      appId: "app",
      appPassword: "pw",
      tenantId: "tenant",
    } as unknown as MSTeamsConfig;
    await expect(probeMSTeams(cfg)).resolves.toEqual({
      ok: false,
      appId: "app",
      error: "bad creds",
    });
  });
});
