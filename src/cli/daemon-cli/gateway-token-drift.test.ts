import { describe, expect, it } from "vitest";
import type { RemoteClawConfig } from "../../config/config.js";
import { resolveGatewayTokenForDriftCheck } from "./gateway-token-drift.js";

describe("resolveGatewayTokenForDriftCheck", () => {
  it("prefers persisted config token over shell env", () => {
    const token = resolveGatewayTokenForDriftCheck({
      cfg: {
        gateway: {
          mode: "local",
          auth: {
            token: "config-token",
          },
        },
      } as RemoteClawConfig,
      env: {
        REMOTECLAW_GATEWAY_TOKEN: "env-token",
      } as NodeJS.ProcessEnv,
    });

    expect(token).toBe("config-token");
  });

  it("does not fall back to caller env for unresolved config token refs", () => {
    // Fork: SecretRef resolution was gutted; unresolvable refs return undefined
    const token = resolveGatewayTokenForDriftCheck({
      cfg: {
        secrets: {
          providers: {
            default: { source: "env" },
          },
        },
        gateway: {
          mode: "local",
          auth: {
            token: { source: "env", provider: "default", id: "REMOTECLAW_GATEWAY_TOKEN" },
          },
        },
      } as unknown as RemoteClawConfig,
      env: {
        REMOTECLAW_GATEWAY_TOKEN: "env-token",
      } as NodeJS.ProcessEnv,
    });
    expect(token).toBeUndefined();
  });
});
