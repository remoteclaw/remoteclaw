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
});
