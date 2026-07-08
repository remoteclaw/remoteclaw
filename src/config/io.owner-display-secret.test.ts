import { describe, expect, it } from "vitest";
import {
  type OwnerDisplaySecretRuntimeState,
  retainGeneratedOwnerDisplaySecret,
} from "./io.owner-display-secret.js";
import type { RemoteClawConfig } from "./types.remoteclaw.js";

function createState(): OwnerDisplaySecretRuntimeState {
  return {
    pendingByPath: new Map<string, string>(),
  };
}

describe("retainGeneratedOwnerDisplaySecret", () => {
  it("keeps generated owner display secrets in runtime state without persisting config", () => {
    const state = createState();
    const configPath = "/tmp/remoteclaw.json";
    const config = {
      commands: {
        ownerDisplay: "hash",
        ownerDisplaySecret: "generated-owner-secret",
      },
    } as RemoteClawConfig;

    const result = retainGeneratedOwnerDisplaySecret({
      config,
      configPath,
      generatedSecret: "generated-owner-secret",
      state,
    });

    expect(result).toBe(config);
    expect(state.pendingByPath.get(configPath)).toBe("generated-owner-secret");
  });

  it("clears pending state when no generated secret is present", () => {
    const state = createState();
    const configPath = "/tmp/remoteclaw.json";
    state.pendingByPath.set(configPath, "stale-secret");
    const config = {
      commands: {
        ownerDisplay: "hash",
        ownerDisplaySecret: "existing-secret",
      },
    } as RemoteClawConfig;

    const result = retainGeneratedOwnerDisplaySecret({
      config,
      configPath,
      state,
    });

    expect(result).toBe(config);
    expect(state.pendingByPath.has(configPath)).toBe(false);
  });
});
