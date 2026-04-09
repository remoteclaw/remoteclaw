import { describe, expect, it } from "vitest";
import type { RemoteClawConfig } from "../config/config.js";
import { resolveOnboardingSecretInputString } from "./onboarding.secret-input.js";

function makeConfig(): RemoteClawConfig {
  return {
    secrets: {
      providers: {
        default: { source: "env" },
      },
    },
  } as RemoteClawConfig;
}

describe("resolveOnboardingSecretInputString", () => {
  // Gutted in RemoteClaw fork — resolveSecretRefString always returns undefined,
  // so env-template SecretRefs cannot be resolved at runtime.
  it.skip("resolves env-template SecretInput strings", async () => {
    // Gutted in RemoteClaw fork
    const resolved = await resolveOnboardingSecretInputString({
      config: makeConfig(),
      value: "${REMOTECLAW_GATEWAY_PASSWORD}",
      path: "gateway.auth.password",
      env: {
        REMOTECLAW_GATEWAY_PASSWORD: "gateway-secret",
      },
    });

    expect(resolved).toBe("gateway-secret");
  });

  it("returns plaintext strings when value is not a SecretRef", async () => {
    const resolved = await resolveOnboardingSecretInputString({
      config: makeConfig(),
      value: "plain-text",
      path: "gateway.auth.password",
    });

    expect(resolved).toBe("plain-text");
  });

  // Gutted in RemoteClaw fork — resolveSecretRefString always returns undefined
  // instead of throwing, so the error path is unreachable.
  it.skip("throws with path context when env-template SecretRef cannot resolve", async () => {
    // Gutted in RemoteClaw fork
    await expect(
      resolveOnboardingSecretInputString({
        config: makeConfig(),
        value: "${REMOTECLAW_GATEWAY_PASSWORD}",
        path: "gateway.auth.password",
        env: {},
      }),
    ).rejects.toThrow(
      'gateway.auth.password: failed to resolve SecretRef "env:default:REMOTECLAW_GATEWAY_PASSWORD"',
    );
  });
});
