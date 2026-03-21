import { describe, expect, it } from "vitest";
import type { RemoteClawConfig } from "../config/config.js";
import {
  resolveGatewayCredentialsFromConfig,
  resolveGatewayCredentialsFromValues,
} from "./credentials.js";

function cfg(input: Partial<RemoteClawConfig>): RemoteClawConfig {
  return input as RemoteClawConfig;
}

type ResolveFromConfigInput = Parameters<typeof resolveGatewayCredentialsFromConfig>[0];
type GatewayConfig = NonNullable<RemoteClawConfig["gateway"]>;

const DEFAULT_GATEWAY_AUTH = { token: "config-token", password: "config-password" }; // pragma: allowlist secret
const DEFAULT_REMOTE_AUTH = { token: "remote-token", password: "remote-password" }; // pragma: allowlist secret
const DEFAULT_GATEWAY_ENV = {
  REMOTECLAW_GATEWAY_TOKEN: "env-token",
  REMOTECLAW_GATEWAY_PASSWORD: "env-password", // pragma: allowlist secret
} as NodeJS.ProcessEnv;

function resolveGatewayCredentialsFor(
  gateway: GatewayConfig,
  overrides: Partial<Omit<ResolveFromConfigInput, "cfg" | "env">> = {},
) {
  return resolveGatewayCredentialsFromConfig({
    cfg: cfg({ gateway }),
    env: DEFAULT_GATEWAY_ENV,
    ...overrides,
  });
}

function expectEnvGatewayCredentials(resolved: { token?: string; password?: string }) {
  expect(resolved).toEqual({
    token: "env-token",
    password: "env-password", // pragma: allowlist secret
  });
}

function resolveRemoteModeWithRemoteCredentials(
  overrides: Partial<Omit<ResolveFromConfigInput, "cfg" | "env">> = {},
) {
  return resolveGatewayCredentialsFor(
    {
      mode: "remote",
      remote: DEFAULT_REMOTE_AUTH,
      auth: DEFAULT_GATEWAY_AUTH,
    },
    overrides,
  );
}

describe("resolveGatewayCredentialsFromConfig", () => {
  it("prefers explicit credentials over config and environment", () => {
    const resolved = resolveGatewayCredentialsFor(
      {
        auth: DEFAULT_GATEWAY_AUTH,
      },
      {
        explicitAuth: { token: "explicit-token", password: "explicit-password" }, // pragma: allowlist secret
      },
    );
    expect(resolved).toEqual({
      token: "explicit-token",
      password: "explicit-password", // pragma: allowlist secret
    });
  });

  it("returns empty credentials when url override is used without explicit auth", () => {
    const resolved = resolveGatewayCredentialsFor(
      {
        auth: DEFAULT_GATEWAY_AUTH,
      },
      {
        urlOverride: "wss://example.com",
      },
    );
    expect(resolved).toEqual({});
  });

  it("uses env credentials for env-sourced url overrides", () => {
    const resolved = resolveGatewayCredentialsFor(
      {
        auth: DEFAULT_GATEWAY_AUTH,
      },
      {
        urlOverride: "wss://example.com",
        urlOverrideSource: "env",
      },
    );
    expectEnvGatewayCredentials(resolved);
  });

  it("uses local-mode environment values before local config", () => {
    const resolved = resolveGatewayCredentialsFor({
      mode: "local",
      auth: DEFAULT_GATEWAY_AUTH,
    });
    expectEnvGatewayCredentials(resolved);
  });

  it("falls back to remote credentials in local mode when local auth is missing", () => {
    const resolved = resolveGatewayCredentialsFromConfig({
      cfg: cfg({
        gateway: {
          mode: "local",
          remote: { token: "remote-token", password: "remote-password" }, // pragma: allowlist secret
          auth: {},
        },
      }),
      env: {} as NodeJS.ProcessEnv,
      includeLegacyEnv: false,
    });
    expect(resolved).toEqual({
      token: "remote-token",
      password: "remote-password", // pragma: allowlist secret
    });
  });

  it("keeps local credentials ahead of remote fallback in local mode", () => {
    const resolved = resolveGatewayCredentialsFromConfig({
      cfg: cfg({
        gateway: {
          mode: "local",
          remote: { token: "remote-token", password: "remote-password" }, // pragma: allowlist secret
          auth: { token: "local-token", password: "local-password" }, // pragma: allowlist secret
        },
      }),
      env: {} as NodeJS.ProcessEnv,
      includeLegacyEnv: false,
    });
    expect(resolved).toEqual({
      token: "local-token",
      password: "local-password", // pragma: allowlist secret
    });
  });

  it("uses remote-mode remote credentials before env and local config", () => {
    const resolved = resolveRemoteModeWithRemoteCredentials();
    expect(resolved).toEqual({
      token: "remote-token",
      password: "env-password", // pragma: allowlist secret
    });
  });

  it("falls back to env/config when remote mode omits remote credentials", () => {
    const resolved = resolveGatewayCredentialsFor({
      mode: "remote",
      remote: {},
      auth: DEFAULT_GATEWAY_AUTH,
    });
    expectEnvGatewayCredentials(resolved);
  });

  it("supports env-first password override in remote mode for gateway call path", () => {
    const resolved = resolveRemoteModeWithRemoteCredentials({
      remotePasswordPrecedence: "env-first", // pragma: allowlist secret
    });
    expect(resolved).toEqual({
      token: "remote-token",
      password: "env-password", // pragma: allowlist secret
    });
  });

  it("supports env-first token precedence in remote mode", () => {
    const resolved = resolveRemoteModeWithRemoteCredentials({
      remoteTokenPrecedence: "env-first",
      remotePasswordPrecedence: "remote-first", // pragma: allowlist secret
    });
    expect(resolved).toEqual({
      token: "env-token",
      password: "remote-password", // pragma: allowlist secret
    });
  });

  it("supports remote-only password fallback for strict remote override call sites", () => {
    const resolved = resolveGatewayCredentialsFor(
      {
        mode: "remote",
        remote: { token: "remote-token" },
        auth: DEFAULT_GATEWAY_AUTH,
      },
      {
        remotePasswordFallback: "remote-only", // pragma: allowlist secret
      },
    );
    expect(resolved).toEqual({
      token: "remote-token",
      password: undefined,
    });
  });

  it("supports remote-only token fallback for strict remote override call sites", () => {
    const resolved = resolveGatewayCredentialsFromConfig({
      cfg: cfg({
        gateway: {
          mode: "remote",
          remote: { url: "wss://gateway.example" },
          auth: { token: "local-token" },
        },
      }),
      env: {
        REMOTECLAW_GATEWAY_TOKEN: "env-token",
      } as NodeJS.ProcessEnv,
      remoteTokenFallback: "remote-only",
    });
    expect(resolved.token).toBeUndefined();
  });

  it("can disable legacy CLAWDBOT env fallback", () => {
    const resolved = resolveGatewayCredentialsFromConfig({
      cfg: cfg({
        gateway: {
          mode: "local",
        },
      }),
      env: {
        CLAWDBOT_GATEWAY_TOKEN: "legacy-token",
        CLAWDBOT_GATEWAY_PASSWORD: "legacy-password", // pragma: allowlist secret
      } as NodeJS.ProcessEnv,
      includeLegacyEnv: false,
    });
    expect(resolved).toEqual({ token: undefined, password: undefined });
  });
});

describe("resolveGatewayCredentialsFromValues", () => {
  it("supports config-first precedence for token/password", () => {
    const resolved = resolveGatewayCredentialsFromValues({
      configToken: "config-token",
      configPassword: "config-password", // pragma: allowlist secret
      env: {
        REMOTECLAW_GATEWAY_TOKEN: "env-token",
        REMOTECLAW_GATEWAY_PASSWORD: "env-password", // pragma: allowlist secret
      } as NodeJS.ProcessEnv,
      includeLegacyEnv: false,
      tokenPrecedence: "config-first",
      passwordPrecedence: "config-first", // pragma: allowlist secret
    });
    expect(resolved).toEqual({
      token: "config-token",
      password: "config-password", // pragma: allowlist secret
    });
  });

  it("uses env-first precedence by default", () => {
    const resolved = resolveGatewayCredentialsFromValues({
      configToken: "config-token",
      configPassword: "config-password", // pragma: allowlist secret
      env: {
        REMOTECLAW_GATEWAY_TOKEN: "env-token",
        REMOTECLAW_GATEWAY_PASSWORD: "env-password", // pragma: allowlist secret
      } as NodeJS.ProcessEnv,
    });
    expect(resolved).toEqual({
      token: "env-token",
      password: "env-password", // pragma: allowlist secret
    });
  });
});
