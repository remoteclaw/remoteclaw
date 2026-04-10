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
  it("returns plaintext strings when value is not a SecretRef", async () => {
    const resolved = await resolveOnboardingSecretInputString({
      config: makeConfig(),
      value: "plain-text",
      path: "gateway.auth.password",
    });

    expect(resolved).toBe("plain-text");
  });
});
