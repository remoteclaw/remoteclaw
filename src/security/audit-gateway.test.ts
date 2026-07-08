import { describe, expect, it } from "vitest";
import type { RemoteClawConfig } from "../config/config.js";
import { withEnvAsync } from "../test-utils/env.js";
import { collectGatewayConfigFindings } from "./audit-gateway-config.js";

function hasFinding(checkId: string, findings: ReturnType<typeof collectGatewayConfigFindings>) {
  return findings.some((finding) => finding.checkId === checkId);
}

function hasFindingWithSeverity(
  checkId: string,
  severity: "info" | "warn" | "critical",
  findings: ReturnType<typeof collectGatewayConfigFindings>,
) {
  return findings.some((finding) => finding.checkId === checkId && finding.severity === severity);
}

describe("security audit gateway config findings", () => {
  it("evaluates gateway auth presence and rate-limit guardrails", async () => {
    await Promise.all([
      withEnvAsync(
        {
          REMOTECLAW_GATEWAY_TOKEN: undefined,
          REMOTECLAW_GATEWAY_PASSWORD: undefined,
        },
        async () => {
          const findings = collectGatewayConfigFindings(
            {
              gateway: {
                bind: "lan",
                auth: {},
              },
            },
            {
              gateway: {
                bind: "lan",
                auth: {},
              },
            },
            process.env,
          );
          expect(hasFindingWithSeverity("gateway.bind_no_auth", "critical", findings)).toBe(true);
        },
      ),
      (async () => {
        const cfg: RemoteClawConfig = {
          gateway: {
            bind: "lan",
            auth: {
              password: {
                source: "env",
                provider: "default",
                id: "REMOTECLAW_GATEWAY_PASSWORD",
              },
            },
          },
        };
        const findings = collectGatewayConfigFindings(cfg, cfg, {});
        expect(hasFinding("gateway.bind_no_auth", findings)).toBe(false);
      })(),
      (async () => {
        const sourceConfig: RemoteClawConfig = {
          gateway: {
            bind: "lan",
            auth: {
              token: {
                source: "env",
                provider: "default",
                id: "REMOTECLAW_GATEWAY_TOKEN",
              },
            },
          },
          secrets: {
            providers: {
              default: { source: "env" },
            },
          },
        };
        const resolvedConfig: RemoteClawConfig = {
          gateway: {
            bind: "lan",
            auth: {},
          },
          secrets: sourceConfig.secrets,
        };
        const findings = collectGatewayConfigFindings(resolvedConfig, sourceConfig, {});
        expect(hasFinding("gateway.bind_no_auth", findings)).toBe(false);
      })(),
      (async () => {
        const cfg: RemoteClawConfig = {
          gateway: {
            bind: "lan",
            auth: { token: "secret" },
          },
        };
        const findings = collectGatewayConfigFindings(cfg, cfg, {});
        expect(hasFindingWithSeverity("gateway.auth_no_rate_limit", "warn", findings)).toBe(true);
      })(),
      (async () => {
        const cfg: RemoteClawConfig = {
          gateway: {
            bind: "lan",
            auth: {
              token: "secret",
              rateLimit: { maxAttempts: 10, windowMs: 60_000, lockoutMs: 300_000 },
            },
          },
        };
        const findings = collectGatewayConfigFindings(cfg, cfg, {});
        expect(hasFinding("gateway.auth_no_rate_limit", findings)).toBe(false);
      })(),
    ]);
  });

  it("warns when REMOTECLAW_GATEWAY_TOKEN shadows a different configured token source", () => {
    const cfg: RemoteClawConfig = {
      gateway: { auth: { token: "config-token" } },
    };
    const findings = collectGatewayConfigFindings(cfg, cfg, {
      REMOTECLAW_GATEWAY_TOKEN: "env-token",
    });

    expect(hasFinding("gateway.env_token_overrides_config", findings)).toBe(true);
  });

  it("does not warn inside the managed gateway service credential context", () => {
    const cfg: RemoteClawConfig = {
      gateway: { auth: { token: "config-token" } },
    };
    const findings = collectGatewayConfigFindings(cfg, cfg, {
      REMOTECLAW_GATEWAY_TOKEN: "env-token",
      REMOTECLAW_SERVICE_KIND: "gateway",
    });

    expect(hasFinding("gateway.env_token_overrides_config", findings)).toBe(false);
  });

  it("does not warn when gateway.auth.token resolves from REMOTECLAW_GATEWAY_TOKEN", () => {
    const cfg: RemoteClawConfig = {
      gateway: { auth: { token: "${REMOTECLAW_GATEWAY_TOKEN}" } },
      secrets: { providers: { default: { source: "env" } } },
    };
    const findings = collectGatewayConfigFindings(cfg, cfg, {
      REMOTECLAW_GATEWAY_TOKEN: "env-token",
    });

    expect(hasFinding("gateway.env_token_overrides_config", findings)).toBe(false);
  });

  it("does not warn about local gateway auth token precedence in remote mode", () => {
    const cfg: RemoteClawConfig = {
      gateway: {
        mode: "remote",
        remote: { token: "remote-token" },
        auth: { token: "local-token" },
      },
    };
    const findings = collectGatewayConfigFindings(cfg, cfg, {
      REMOTECLAW_GATEWAY_TOKEN: "env-token",
    });

    expect(hasFinding("gateway.env_token_overrides_config", findings)).toBe(false);
  });
});
