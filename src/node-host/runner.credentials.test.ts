import { describe, expect, it } from "vitest";
import type { RemoteClawConfig } from "../config/config.js";
import { withEnvAsync } from "../test-utils/env.js";
import { resolveNodeHostGatewayCredentials } from "./runner.js";

function createRemoteGatewayTokenRefConfig(tokenId: string): RemoteClawConfig {
  return {
    secrets: {
      providers: {
        default: { source: "env" },
      },
    },
    gateway: {
      mode: "remote",
      remote: {
        token: { source: "env", provider: "default", id: tokenId },
      },
    },
  } as RemoteClawConfig;
}

describe("resolveNodeHostGatewayCredentials", () => {
  it("does not inherit gateway.remote token in local mode", async () => {
    const config = {
      gateway: {
        mode: "local",
        remote: { token: "remote-only-token" },
      },
    } as RemoteClawConfig;

    await withEnvAsync(
      {
        REMOTECLAW_GATEWAY_TOKEN: undefined,
        REMOTECLAW_GATEWAY_PASSWORD: undefined,
      },
      async () => {
        const credentials = await resolveNodeHostGatewayCredentials({ config });
        expect(credentials.token).toBeUndefined();
        expect(credentials.password).toBeUndefined();
      },
    );
  });

  it("ignores unresolved gateway.remote token refs in local mode", async () => {
    const config = {
      secrets: {
        providers: {
          default: { source: "env" },
        },
      },
      gateway: {
        mode: "local",
        remote: {
          token: { source: "env", provider: "default", id: "MISSING_REMOTE_GATEWAY_TOKEN" },
        },
      },
    } as RemoteClawConfig;

    await withEnvAsync(
      {
        REMOTECLAW_GATEWAY_TOKEN: undefined,
        REMOTECLAW_GATEWAY_PASSWORD: undefined,
        MISSING_REMOTE_GATEWAY_TOKEN: undefined,
      },
      async () => {
        const credentials = await resolveNodeHostGatewayCredentials({ config });
        expect(credentials.token).toBeUndefined();
        expect(credentials.password).toBeUndefined();
      },
    );
  });

  // RemoteClaw fork (Middleware Boundary Principle): resolveNodeHostGatewayCredentials
  // is gutted and always returns { token: undefined, password: undefined }. Upstream
  // tests that asserted SecretRef resolution and env-var fallback were dropped during
  // the v2026.3.11 sync to align with fork contract.
});

// Re-export for IDE navigation; unused runtime reference kept to avoid linter drift.
void createRemoteGatewayTokenRefConfig;
