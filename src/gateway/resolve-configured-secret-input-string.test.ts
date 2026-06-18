import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RemoteClawConfig } from "../config/types.remoteclaw.js";
import {
  resolveConfiguredSecretInputString,
  resolveRequiredConfiguredSecretRefInputString,
} from "./resolve-configured-secret-input-string.js";

const resolveSecretRefValuesMock = vi.hoisted(() => vi.fn());
vi.mock("../secrets/resolve.js", () => ({
  resolveSecretRefValues: resolveSecretRefValuesMock,
}));

const config = {} as RemoteClawConfig;

describe("resolveConfiguredSecretInputString — SecretRef shape pre-validation", () => {
  beforeEach(() => {
    resolveSecretRefValuesMock.mockReset();
  });

  it("rejects a malformed exec id (path traversal) before attempting resolution", async () => {
    const result = await resolveConfiguredSecretInputString({
      config,
      env: {},
      value: { source: "exec", provider: "vault", id: "vault/../secret" },
      path: "gateway.auth.token",
      unresolvedReasonStyle: "detailed",
    });

    expect(result.value).toBeUndefined();
    expect(result.unresolvedRefReason).toContain("malformed");
    expect(result.unresolvedRefReason).toContain("exec:vault:vault/../secret");
    // The hardening guarantee: a malformed ref is never handed to the resolver.
    expect(resolveSecretRefValuesMock).not.toHaveBeenCalled();
  });

  it("rejects a malformed env id without leaking specifics in generic style", async () => {
    const result = await resolveConfiguredSecretInputString({
      config,
      env: {},
      value: { source: "env", provider: "default", id: "lower_bad" },
      path: "gateway.auth.token",
    });

    expect(result.value).toBeUndefined();
    expect(result.unresolvedRefReason).toBe(
      "gateway.auth.token SecretRef is malformed (env:default:lower_bad).",
    );
    expect(resolveSecretRefValuesMock).not.toHaveBeenCalled();
  });

  it("does not reject on a non-kebab provider alias (provider is a free-form lookup key)", async () => {
    resolveSecretRefValuesMock.mockResolvedValue(
      new Map([["exec:customProvider:OPENAI_API_KEY", "secret-value"]]),
    );

    const result = await resolveConfiguredSecretInputString({
      config,
      env: {},
      value: { source: "exec", provider: "customProvider", id: "OPENAI_API_KEY" },
      path: "gateway.auth.token",
    });

    expect(result.value).toBe("secret-value");
    expect(result.unresolvedRefReason).toBeUndefined();
    expect(resolveSecretRefValuesMock).toHaveBeenCalledTimes(1);
  });

  it("throws a clear error for a malformed ref via the required variant", async () => {
    await expect(
      resolveRequiredConfiguredSecretRefInputString({
        config,
        env: {},
        value: { source: "env", provider: "default", id: "lower_bad" },
        path: "gateway.auth.password",
      }),
    ).rejects.toThrow(/malformed/);
    expect(resolveSecretRefValuesMock).not.toHaveBeenCalled();
  });

  it("resolves a well-formed ref normally (no false rejection)", async () => {
    resolveSecretRefValuesMock.mockResolvedValue(
      new Map([["env:default:GW_TOKEN", "secret-value"]]),
    );

    const result = await resolveConfiguredSecretInputString({
      config,
      env: { GW_TOKEN: "secret-value" },
      value: { source: "env", provider: "default", id: "GW_TOKEN" },
      path: "gateway.auth.token",
    });

    expect(result.value).toBe("secret-value");
    expect(result.unresolvedRefReason).toBeUndefined();
    expect(resolveSecretRefValuesMock).toHaveBeenCalledTimes(1);
  });
});
