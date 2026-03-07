import { formatCliCommand } from "../../cli/command-format.js";
import type { RemoteClawConfig } from "../../config/config.js";
import { resolveGatewayPort, writeConfigFile } from "../../config/config.js";
import { logConfigUpdated } from "../../config/logging.js";
import type { RuntimeEnv } from "../../runtime.js";
import { DEFAULT_GATEWAY_DAEMON_RUNTIME } from "../daemon-runtime.js";
import { applyOnboardingLocalWorkspaceConfig } from "../onboard-config.js";
import {
  applyWizardMetadata,
  ensureWorkspaceAndSessions,
  resolveControlUiLinks,
  waitForGatewayReachable,
} from "../onboard-helpers.js";
import type { AgentRuntime, OnboardOptions } from "../onboard-types.js";
import { applyNonInteractiveGatewayConfig } from "./local/gateway-config.js";
import { logNonInteractiveOnboardingJson } from "./local/output.js";
import { resolveNonInteractiveWorkspaceDir } from "./local/workspace.js";

function inferRuntimeFromFlags(opts: OnboardOptions): AgentRuntime | undefined {
  if (opts.runtime) {
    return opts.runtime;
  }
  // Infer from provided key flags.
  if (opts.codexApiKey) {
    return "codex";
  }
  if (opts.geminiApiKey) {
    return "gemini";
  }
  if (opts.authToken) {
    return "claude";
  }
  if (opts.anthropicApiKey) {
    return "claude";
  }
  if (opts.openaiApiKey) {
    return "opencode";
  }
  return undefined;
}

async function applyNonInteractiveRuntimeAuth(params: {
  nextConfig: RemoteClawConfig;
  runtime: AgentRuntime;
  opts: OnboardOptions;
}): Promise<RemoteClawConfig> {
  const { runtime, opts } = params;
  let config = {
    ...params.nextConfig,
    agents: {
      ...params.nextConfig.agents,
      defaults: {
        ...params.nextConfig.agents?.defaults,
        runtime,
      },
    },
  };

  const { upsertAuthProfile } = await import("../../agents/auth-profiles.js");

  if (runtime === "claude") {
    if (opts.authToken) {
      upsertAuthProfile({
        profileId: "claude:oauth-token",
        credential: { type: "api_key", provider: "anthropic", key: opts.authToken },
      });
    } else if (opts.anthropicApiKey) {
      upsertAuthProfile({
        profileId: "anthropic:default",
        credential: { type: "api_key", provider: "anthropic", key: opts.anthropicApiKey },
      });
    }
  } else if (runtime === "gemini") {
    if (opts.geminiApiKey) {
      upsertAuthProfile({
        profileId: "google:default",
        credential: { type: "api_key", provider: "google", key: opts.geminiApiKey },
      });
    }
  } else if (runtime === "codex") {
    if (opts.codexApiKey) {
      upsertAuthProfile({
        profileId: "codex:default",
        credential: { type: "api_key", provider: "codex", key: opts.codexApiKey },
      });
    }
  } else if (runtime === "opencode") {
    if (opts.anthropicApiKey) {
      upsertAuthProfile({
        profileId: "anthropic:default",
        credential: { type: "api_key", provider: "anthropic", key: opts.anthropicApiKey },
      });
    } else if (opts.openaiApiKey) {
      upsertAuthProfile({
        profileId: "openai:default",
        credential: { type: "api_key", provider: "openai", key: opts.openaiApiKey },
      });
    }
  }

  return config;
}

export async function runNonInteractiveOnboardingLocal(params: {
  opts: OnboardOptions;
  runtime: RuntimeEnv;
  baseConfig: RemoteClawConfig;
}) {
  const { opts, runtime, baseConfig } = params;
  const mode = "local" as const;

  const workspaceRaw = opts.workspace;
  if (!workspaceRaw?.trim()) {
    runtime.error(
      "No workspace path provided. Pass --workspace to set per-agent workspace in agents.list[].workspace.",
    );
    runtime.exit(1);
    return;
  }
  const workspaceDir = resolveNonInteractiveWorkspaceDir({
    opts,
    defaultWorkspaceDir: workspaceRaw,
  });

  let nextConfig: RemoteClawConfig = applyOnboardingLocalWorkspaceConfig(
    baseConfig,
    workspaceRaw.trim(),
  );

  const selectedRuntime = inferRuntimeFromFlags(opts);
  if (selectedRuntime) {
    nextConfig = await applyNonInteractiveRuntimeAuth({
      nextConfig,
      runtime: selectedRuntime,
      opts,
    });
  }

  const gatewayBasePort = resolveGatewayPort(baseConfig);
  const gatewayResult = applyNonInteractiveGatewayConfig({
    nextConfig,
    opts,
    runtime,
    defaultPort: gatewayBasePort,
  });
  if (!gatewayResult) {
    return;
  }
  nextConfig = gatewayResult.nextConfig;

  nextConfig = applyWizardMetadata(nextConfig, { command: "onboard", mode });
  await writeConfigFile(nextConfig);
  logConfigUpdated(runtime);

  await ensureWorkspaceAndSessions(workspaceDir, runtime, {
    skipBootstrap: Boolean(nextConfig.agents?.defaults?.skipBootstrap),
  });

  if (opts.installDaemon) {
    const { installGatewayDaemonNonInteractive } = await import("./local/daemon-install.js");
    await installGatewayDaemonNonInteractive({
      nextConfig,
      opts,
      runtime,
      port: gatewayResult.port,
      gatewayToken: gatewayResult.gatewayToken,
    });
  }

  const daemonRuntimeRaw = opts.daemonRuntime ?? DEFAULT_GATEWAY_DAEMON_RUNTIME;
  if (!opts.skipHealth) {
    const { healthCommand } = await import("../health.js");
    const links = resolveControlUiLinks({
      bind: gatewayResult.bind as "auto" | "lan" | "loopback" | "custom" | "tailnet",
      port: gatewayResult.port,
      customBindHost: nextConfig.gateway?.customBindHost,
      basePath: undefined,
    });
    await waitForGatewayReachable({
      url: links.wsUrl,
      token: gatewayResult.gatewayToken,
      deadlineMs: 15_000,
    });
    await healthCommand({ json: false, timeoutMs: 10_000 }, runtime);
  }

  logNonInteractiveOnboardingJson({
    opts,
    runtime,
    mode,
    workspaceDir,
    runtimeChoice: selectedRuntime,
    gateway: {
      port: gatewayResult.port,
      bind: gatewayResult.bind,
      authMode: gatewayResult.authMode,
      tailscaleMode: gatewayResult.tailscaleMode,
    },
    installDaemon: Boolean(opts.installDaemon),
    daemonRuntime: opts.installDaemon ? daemonRuntimeRaw : undefined,
    skipSkills: Boolean(opts.skipSkills),
    skipHealth: Boolean(opts.skipHealth),
  });

  if (!opts.json) {
    runtime.log(
      `Tip: run \`${formatCliCommand("remoteclaw configure")}\` to customize your setup. Docs: https://docs.remoteclaw.org`,
    );
  }
}
