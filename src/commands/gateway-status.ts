import { parseGatewayPortOption } from "../cli/gateway-port-option.js";
import { withProgress } from "../cli/progress.js";
import { readBestEffortConfig, resolveGatewayPort } from "../config/config.js";
import { probeGateway } from "../gateway/probe.js";
import { discoverGatewayBeacons } from "../infra/bonjour-discovery.js";
import { parseSshTarget, startSshPortForward } from "../infra/ssh-tunnel.js";
import { resolveWideAreaDiscoveryDomain } from "../infra/widearea-dns.js";
import type { RuntimeEnv } from "../runtime.js";
import { colorize, isRich, theme } from "../terminal/theme.js";
import {
  inferSshTargetFromRemoteUrl,
  pickAutoSshTargetFromDiscovery,
  resolveSshTarget,
  serializeGatewayDiscoveryBeacon,
} from "./gateway-status/discovery.js";
import {
  buildNetworkHints,
  extractConfigSummary,
  isProbeReachable,
  isScopeLimitedProbeFailure,
  type GatewayStatusTarget,
  parseTimeoutMs,
  pickGatewaySelfPresence,
  renderProbeSummaryLine,
  renderTargetHeader,
  resolveAuthForTarget,
  resolveProbeBudgetMs,
  resolveTargets,
  sanitizeSshTarget,
} from "./gateway-status/helpers.js";

export async function gatewayStatusCommand(
  opts: {
    url?: string;
    port?: unknown;
    token?: string;
    password?: string;
    timeout?: unknown;
    json?: boolean;
    ssh?: string;
    sshIdentity?: string;
    sshAuto?: boolean;
  },
  runtime: RuntimeEnv,
) {
  const startedAt = Date.now();
  const cfg = await readBestEffortConfig();
  const rich = isRich() && opts.json !== true;
  const defaultTimeoutMs = Math.max(3000, cfg.gateway?.handshakeTimeoutMs ?? 0);
  const overallTimeoutMs = parseTimeoutMs(opts.timeout, defaultTimeoutMs);
  const wideAreaDomain = resolveWideAreaDiscoveryDomain({
    configDomain: cfg.discovery?.wideArea?.domain,
  });

  const baseTargets = resolveTargets(cfg, opts.url);
  const network = buildNetworkHints(cfg);

  const discoveryTimeoutMs = Math.min(1200, overallTimeoutMs);
  const discoveryPromise = discoverGatewayBeacons({
    timeoutMs: discoveryTimeoutMs,
    wideAreaDomain,
  });

  // An explicit --port is a local probe: it must not reach for the configured remote. Only an
  // explicit --url re-enables the configured fallbacks; an explicit --ssh always wins regardless.
  const portOverride = parseGatewayPortOption(opts.port);
  const hasExplicitUrl = typeof opts.url === "string" && opts.url.trim().length > 0;
  const useConfiguredRemoteTargets = portOverride === undefined || hasExplicitUrl;

  let sshTarget =
    sanitizeSshTarget(opts.ssh) ??
    (useConfiguredRemoteTargets ? sanitizeSshTarget(cfg.gateway?.remote?.sshTarget) : null);
  let sshIdentity =
    sanitizeSshTarget(opts.sshIdentity) ??
    (useConfiguredRemoteTargets ? sanitizeSshTarget(cfg.gateway?.remote?.sshIdentity) : null);
  const remotePort = resolveGatewayPort(cfg);

  let sshTunnelError: string | null = null;
  let sshTunnelStarted = false;

  if (!sshTarget && useConfiguredRemoteTargets) {
    sshTarget = inferSshTargetFromRemoteUrl(cfg.gateway?.remote?.url);
  }

  if (sshTarget) {
    const resolved = await resolveSshTarget({
      rawTarget: sshTarget,
      identity: sshIdentity,
      overallTimeoutMs,
      loadSshConfigModule: async () => await import("../infra/ssh-config.js"),
      loadSshTunnelModule: async () => await import("../infra/ssh-tunnel.js"),
    });
    if (resolved) {
      sshTarget = resolved.target;
      if (!sshIdentity && resolved.identity) {
        sshIdentity = resolved.identity;
      }
    }
  }

  const { discovery, probed } = await withProgress(
    {
      label: "Inspecting gateways…",
      indeterminate: true,
      enabled: opts.json !== true,
    },
    async () => {
      const tryStartTunnel = async () => {
        if (!sshTarget) {
          return null;
        }
        try {
          const tunnel = await startSshPortForward({
            target: sshTarget,
            identity: sshIdentity ?? undefined,
            localPortPreferred: remotePort,
            remotePort,
            timeoutMs: Math.min(1500, overallTimeoutMs),
          });
          sshTunnelStarted = true;
          return tunnel;
        } catch (err) {
          sshTunnelError = err instanceof Error ? err.message : String(err);
          return null;
        }
      };

      const discoveryTask = discoveryPromise.catch(() => []);
      const tunnelTask = sshTarget ? tryStartTunnel() : Promise.resolve(null);

      const [discovery, tunnelFirst] = await Promise.all([discoveryTask, tunnelTask]);

      if (!sshTarget && opts.sshAuto) {
        // TXT hints (tailnetDns / lanHost) are attacker-publishable — deliberately
        // no longer a fallback here; only a resolved endpoint yields an auto target.
        sshTarget = pickAutoSshTargetFromDiscovery({
          discovery,
          parseSshTarget,
          sshUser: process.env.USER,
        });
      }

      const tunnel =
        tunnelFirst ||
        (sshTarget && !sshTunnelStarted && !sshTunnelError ? await tryStartTunnel() : null);

      const tunnelTarget: GatewayStatusTarget | null = tunnel
        ? {
            id: "sshTunnel",
            kind: "sshTunnel",
            url: `ws://127.0.0.1:${tunnel.localPort}`,
            active: true,
            tunnel: {
              kind: "ssh",
              target: sshTarget ?? "",
              localPort: tunnel.localPort,
              remotePort,
              pid: tunnel.pid,
            },
          }
        : null;

      const targets: GatewayStatusTarget[] = tunnelTarget
        ? [tunnelTarget, ...baseTargets.filter((t) => t.url !== tunnelTarget.url)]
        : baseTargets;

      try {
        const probed = await Promise.all(
          targets.map(async (target) => {
            const authResolution = await resolveAuthForTarget(cfg, target, {
              token: typeof opts.token === "string" ? opts.token : undefined,
              password: typeof opts.password === "string" ? opts.password : undefined,
            });
            const auth = {
              token: authResolution.token,
              password: authResolution.password,
            };
            const timeoutMs = resolveProbeBudgetMs(overallTimeoutMs, target.kind);
            const probe = await probeGateway({
              url: target.url,
              auth,
              timeoutMs,
            });
            const configSummary = probe.configSnapshot
              ? extractConfigSummary(probe.configSnapshot)
              : null;
            const self = pickGatewaySelfPresence(probe.presence);
            return {
              target,
              probe,
              configSummary,
              self,
              authDiagnostics: authResolution.diagnostics ?? [],
            };
          }),
        );

        return { discovery, probed };
      } finally {
        if (tunnel) {
          try {
            await tunnel.stop();
          } catch {
            // best-effort
          }
        }
      }
    },
  );

  const reachable = probed.filter((p) => isProbeReachable(p.probe));
  const ok = reachable.length > 0;
  const degradedScopeLimited = probed.filter((p) => isScopeLimitedProbeFailure(p.probe));
  const degraded = degradedScopeLimited.length > 0;
  const multipleGateways = reachable.length > 1;
  const primary =
    reachable.find((p) => p.target.kind === "explicit") ??
    reachable.find((p) => p.target.kind === "sshTunnel") ??
    reachable.find((p) => p.target.kind === "configRemote") ??
    reachable.find((p) => p.target.kind === "localLoopback") ??
    null;

  const warnings: Array<{
    code: string;
    message: string;
    targetIds?: string[];
  }> = [];
  if (sshTarget && !sshTunnelStarted) {
    warnings.push({
      code: "ssh_tunnel_failed",
      message: sshTunnelError
        ? `SSH tunnel failed: ${String(sshTunnelError)}`
        : "SSH tunnel failed to start; falling back to direct probes.",
    });
  }
  if (multipleGateways) {
    warnings.push({
      code: "multiple_gateways",
      message:
        "Unconventional setup: multiple reachable gateways detected. Usually one gateway per network is recommended unless you intentionally run isolated profiles, like a rescue bot (see docs: /gateway#multiple-gateways-same-host).",
      targetIds: reachable.map((p) => p.target.id),
    });
  }
  for (const result of probed) {
    if (result.authDiagnostics.length === 0) {
      continue;
    }
    for (const diagnostic of result.authDiagnostics) {
      warnings.push({
        code: "auth_secretref_unresolved",
        message: diagnostic,
        targetIds: [result.target.id],
      });
    }
  }
  for (const result of degradedScopeLimited) {
    warnings.push({
      code: "probe_scope_limited",
      message:
        "Probe diagnostics are limited by gateway scopes (missing operator.read). Connection succeeded, but status details may be incomplete. Hint: pair device identity or use credentials with operator.read.",
      targetIds: [result.target.id],
    });
  }

  if (opts.json) {
    runtime.log(
      JSON.stringify(
        {
          ok,
          degraded,
          ts: Date.now(),
          durationMs: Date.now() - startedAt,
          timeoutMs: overallTimeoutMs,
          primaryTargetId: primary?.target.id ?? null,
          warnings,
          network,
          discovery: {
            timeoutMs: discoveryTimeoutMs,
            count: discovery.length,
            beacons: discovery.map(serializeGatewayDiscoveryBeacon),
          },
          targets: probed.map((p) => ({
            id: p.target.id,
            kind: p.target.kind,
            url: p.target.url,
            active: p.target.active,
            tunnel: p.target.tunnel ?? null,
            connect: {
              ok: isProbeReachable(p.probe),
              rpcOk: p.probe.ok,
              scopeLimited: isScopeLimitedProbeFailure(p.probe),
              latencyMs: p.probe.connectLatencyMs,
              error: p.probe.error,
              close: p.probe.close,
            },
            self: p.self,
            config: p.configSummary,
            health: p.probe.health,
            summary: p.probe.status,
            presence: p.probe.presence,
          })),
        },
        null,
        2,
      ),
    );
    if (!ok) {
      runtime.exit(1);
    }
    return;
  }

  runtime.log(colorize(rich, theme.heading, "Gateway Status"));
  runtime.log(
    ok
      ? `${colorize(rich, theme.success, "Reachable")}: yes`
      : `${colorize(rich, theme.error, "Reachable")}: no`,
  );
  runtime.log(colorize(rich, theme.muted, `Probe budget: ${overallTimeoutMs}ms`));

  if (warnings.length > 0) {
    runtime.log("");
    runtime.log(colorize(rich, theme.warn, "Warning:"));
    for (const w of warnings) {
      runtime.log(`- ${w.message}`);
    }
  }

  runtime.log("");
  runtime.log(colorize(rich, theme.heading, "Discovery (this machine)"));
  const discoveryDomains = wideAreaDomain ? `local. + ${wideAreaDomain}` : "local.";
  runtime.log(
    discovery.length > 0
      ? `Found ${discovery.length} gateway(s) via Bonjour (${discoveryDomains})`
      : `Found 0 gateways via Bonjour (${discoveryDomains})`,
  );
  if (discovery.length === 0) {
    runtime.log(
      colorize(
        rich,
        theme.muted,
        "Tip: if the gateway is remote, mDNS won’t cross networks; use Wide-Area Bonjour (split DNS) or SSH tunnels.",
      ),
    );
  }

  runtime.log("");
  runtime.log(colorize(rich, theme.heading, "Targets"));
  for (const p of probed) {
    runtime.log(renderTargetHeader(p.target, rich));
    runtime.log(`  ${renderProbeSummaryLine(p.probe, rich)}`);
    if (p.target.tunnel?.kind === "ssh") {
      runtime.log(
        `  ${colorize(rich, theme.muted, "ssh")}: ${colorize(rich, theme.command, p.target.tunnel.target)}`,
      );
    }
    if (p.probe.ok && p.self) {
      const host = p.self.host ?? "unknown";
      const ip = p.self.ip ? ` (${p.self.ip})` : "";
      const platform = p.self.platform ? ` · ${p.self.platform}` : "";
      const version = p.self.version ? ` · app ${p.self.version}` : "";
      runtime.log(`  ${colorize(rich, theme.info, "Gateway")}: ${host}${ip}${platform}${version}`);
    }
    if (p.configSummary) {
      const c = p.configSummary;
      const wideArea =
        c.discovery.wideAreaEnabled === true
          ? "enabled"
          : c.discovery.wideAreaEnabled === false
            ? "disabled"
            : "unknown";
      runtime.log(`  ${colorize(rich, theme.info, "Wide-area discovery")}: ${wideArea}`);
    }
    runtime.log("");
  }

  if (!ok) {
    runtime.exit(1);
  }
}
