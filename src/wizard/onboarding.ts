import { formatCliCommand } from "../cli/command-format.js";
import { collectWorkspaceDirs } from "../commands/cleanup-utils.js";
import { detectOpenClawInstallation, importCommand } from "../commands/import.js";
import type {
  AgentRuntime,
  GatewayAuthChoice,
  OnboardMode,
  OnboardOptions,
  ResetScope,
} from "../commands/onboard-types.js";
import type { RemoteClawConfig } from "../config/config.js";
import {
  DEFAULT_GATEWAY_PORT,
  readConfigFileSnapshot,
  resolveGatewayPort,
  writeConfigFile,
} from "../config/config.js";
import type { RuntimeEnv } from "../runtime.js";
import { defaultRuntime } from "../runtime.js";
import { resolveUserPath, shortenHomePath } from "../utils.js";
import type { QuickstartGatewayDefaults, WizardFlow } from "./onboarding.types.js";
import { WizardCancelledError, type WizardPrompter } from "./prompts.js";

// Skip guidance messages shown when user chooses "Skip" for credential.
// Skipping sets `agents.defaults.auth: false` — the CLI handles its own authentication.
const SKIP_GUIDANCE: Record<AgentRuntime, string> = {
  claude: [
    "CLI handles its own authentication (auth: false).",
    "Make sure Claude Code can authenticate. Options: run `claude login`,",
    "set `ANTHROPIC_API_KEY`, or configure AWS Bedrock (`CLAUDE_CODE_USE_BEDROCK=1`)",
    "or Google Vertex AI (`CLAUDE_CODE_USE_VERTEX=1`).",
  ].join(" "),
  gemini: [
    "CLI handles its own authentication (auth: false).",
    "Make sure Gemini CLI can authenticate. Options: run `gemini` and select",
    "'Login with Google', set `GEMINI_API_KEY`, or configure",
    "`gcloud auth application-default login` for Vertex AI.",
  ].join(" "),
  codex: [
    "CLI handles its own authentication (auth: false).",
    "Make sure Codex CLI can authenticate. Options: run `codex login`,",
    "or set `CODEX_API_KEY` in your environment.",
  ].join(" "),
  opencode: [
    "CLI handles its own authentication (auth: false).",
    "Make sure OpenCode can authenticate. Options: run `opencode` and use `/connect`,",
    "configure `opencode.json`, or set the appropriate provider env var",
    "(e.g., `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`).",
  ].join(" "),
};

type UpsertAuthProfileFn = (params: {
  profileId: string;
  credential:
    | { type: "api_key"; provider: string; key: string }
    | { type: "token"; provider: string; token: string };
}) => void;

async function promptRuntimeCredential(params: {
  runtime: AgentRuntime;
  config: RemoteClawConfig;
  prompter: WizardPrompter;
  upsertAuthProfile: UpsertAuthProfileFn;
  opts: OnboardOptions;
}): Promise<RemoteClawConfig> {
  const { runtime, prompter, upsertAuthProfile, opts } = params;
  let config = params.config;

  /** Set `agents.defaults.auth` on the config being built. */
  function setAuthDefault(auth: false | string): void {
    config = {
      ...config,
      agents: {
        ...config.agents,
        defaults: {
          ...config.agents?.defaults,
          auth,
        },
      },
    };
  }

  if (runtime === "claude") {
    const choice = await prompter.select({
      message: "Authentication for Claude Code",
      options: [
        {
          value: "api-key",
          label: "Provide API key",
          hint: "RemoteClaw injects ANTHROPIC_API_KEY",
        },
        {
          value: "auth-token",
          label: "Provide auth token",
          hint: "RemoteClaw injects CLAUDE_CODE_OAUTH_TOKEN",
        },
        {
          value: "skip",
          label: "Skip",
          hint: "CLI handles its own authentication",
        },
      ],
      initialValue: "skip",
    });

    if (choice === "api-key") {
      const key =
        opts.anthropicApiKey ??
        (await prompter.text({ message: "Anthropic API key", initialValue: "" }));
      if (key.trim()) {
        upsertAuthProfile({
          profileId: "anthropic:default",
          credential: { type: "api_key", provider: "anthropic", key: key.trim() },
        });
        setAuthDefault("anthropic:default");
      }
    } else if (choice === "auth-token") {
      const token =
        opts.authToken ?? (await prompter.text({ message: "Claude auth token", initialValue: "" }));
      if (token.trim()) {
        upsertAuthProfile({
          profileId: "claude:oauth-token",
          credential: { type: "token", provider: "anthropic", token: token.trim() },
        });
        setAuthDefault("claude:oauth-token");
      }
    } else {
      await prompter.note(SKIP_GUIDANCE.claude, "Authentication");
      setAuthDefault(false);
    }
  } else if (runtime === "gemini") {
    const choice = await prompter.select({
      message: "Authentication for Gemini CLI",
      options: [
        { value: "api-key", label: "Provide API key", hint: "RemoteClaw injects GEMINI_API_KEY" },
        {
          value: "skip",
          label: "Skip",
          hint: "CLI handles its own authentication",
        },
      ],
      initialValue: "skip",
    });

    if (choice === "api-key") {
      const key =
        opts.geminiApiKey ?? (await prompter.text({ message: "Gemini API key", initialValue: "" }));
      if (key.trim()) {
        upsertAuthProfile({
          profileId: "google:default",
          credential: { type: "api_key", provider: "google", key: key.trim() },
        });
        setAuthDefault("google:default");
      }
    } else {
      await prompter.note(SKIP_GUIDANCE.gemini, "Authentication");
      setAuthDefault(false);
    }
  } else if (runtime === "codex") {
    const choice = await prompter.select({
      message: "Authentication for Codex CLI",
      options: [
        { value: "api-key", label: "Provide API key", hint: "RemoteClaw injects CODEX_API_KEY" },
        {
          value: "skip",
          label: "Skip",
          hint: "CLI handles its own authentication",
        },
      ],
      initialValue: "skip",
    });

    if (choice === "api-key") {
      const key =
        opts.codexApiKey ?? (await prompter.text({ message: "Codex API key", initialValue: "" }));
      if (key.trim()) {
        upsertAuthProfile({
          profileId: "codex:default",
          credential: { type: "api_key", provider: "codex", key: key.trim() },
        });
        setAuthDefault("codex:default");
      }
    } else {
      await prompter.note(SKIP_GUIDANCE.codex, "Authentication");
      setAuthDefault(false);
    }
  } else if (runtime === "opencode") {
    const choice = await prompter.select({
      message: "Authentication for OpenCode",
      options: [
        { value: "api-key", label: "Provide API key" },
        {
          value: "skip",
          label: "Skip",
          hint: "CLI handles its own authentication",
        },
      ],
      initialValue: "skip",
    });

    if (choice === "api-key") {
      const provider = await prompter.select({
        message: "Which provider does your OpenCode use?",
        options: [
          { value: "anthropic", label: "Anthropic", hint: "Injects ANTHROPIC_API_KEY" },
          { value: "openai", label: "OpenAI", hint: "Injects OPENAI_API_KEY" },
          { value: "other", label: "Other", hint: "Prompt for env var name + value" },
        ],
      });

      if (provider === "anthropic") {
        const key =
          opts.anthropicApiKey ??
          (await prompter.text({ message: "Anthropic API key", initialValue: "" }));
        if (key.trim()) {
          upsertAuthProfile({
            profileId: "anthropic:default",
            credential: { type: "api_key", provider: "anthropic", key: key.trim() },
          });
          setAuthDefault("anthropic:default");
        }
      } else if (provider === "openai") {
        const key =
          opts.openaiApiKey ??
          (await prompter.text({ message: "OpenAI API key", initialValue: "" }));
        if (key.trim()) {
          upsertAuthProfile({
            profileId: "openai:default",
            credential: { type: "api_key", provider: "openai", key: key.trim() },
          });
          setAuthDefault("openai:default");
        }
      } else {
        const envVarName = await prompter.text({
          message: "Environment variable name",
          initialValue: "",
        });
        const envVarValue = await prompter.text({
          message: `Value for ${envVarName.trim() || "env var"}`,
          initialValue: "",
        });
        if (envVarName.trim() && envVarValue.trim()) {
          const profileId = `opencode:${envVarName.trim().toLowerCase()}`;
          upsertAuthProfile({
            profileId,
            credential: {
              type: "api_key",
              provider: "opencode",
              key: envVarValue.trim(),
            },
          });
          setAuthDefault(profileId);
        }
      }
    } else {
      await prompter.note(SKIP_GUIDANCE.opencode, "Authentication");
      setAuthDefault(false);
    }
  }

  return config;
}

async function requireRiskAcknowledgement(params: {
  opts: OnboardOptions;
  prompter: WizardPrompter;
}) {
  if (params.opts.acceptRisk === true) {
    return;
  }

  await params.prompter.note(
    [
      "Security notice",
      "",
      "RemoteClaw connects AI agent CLIs to messaging channels.",
      "Agents can read messages, run tools, and take actions on your behalf.",
      "",
      "Before exposing to the internet:",
      "- Configure allowlists to control who can interact.",
      "- Enable mention gating for group channels.",
      "- Keep secrets out of the agent’s reachable filesystem.",
      "",
      "Docs: https://docs.remoteclaw.org/gateway/security",
    ].join("\n"),
    "Security",
  );

  const ok = await params.prompter.confirm({
    message: "I understand the security implications. Continue?",
    initialValue: false,
  });
  if (!ok) {
    throw new WizardCancelledError("risk not accepted");
  }
}

export async function runOnboardingWizard(
  opts: OnboardOptions,
  runtime: RuntimeEnv = defaultRuntime,
  prompter: WizardPrompter,
) {
  const onboardHelpers = await import("../commands/onboard-helpers.js");
  onboardHelpers.printWizardHeader(runtime);
  await prompter.intro("RemoteClaw onboarding");
  await requireRiskAcknowledgement({ opts, prompter });

  // Detect existing RemoteClaw installation and offer migration before proceeding.
  const openclawDir = detectOpenClawInstallation();
  if (openclawDir) {
    const preCheck = await readConfigFileSnapshot();
    if (!preCheck.exists) {
      await prompter.note(
        [
          `Existing OpenClaw installation found at ${shortenHomePath(openclawDir)}.`,
          "",
          "RemoteClaw can import your config, sessions, and channel settings.",
        ].join("\n"),
        "OpenClaw detected",
      );
      const shouldImport = await prompter.confirm({
        message: `Import from ${shortenHomePath(openclawDir)}?`,
        initialValue: true,
      });
      if (shouldImport) {
        await importCommand({ sourcePath: openclawDir }, runtime);
        await prompter.note("OpenClaw config imported. Continuing with setup.", "Import complete");
      }
    }
  }

  const snapshot = await readConfigFileSnapshot();
  let baseConfig: RemoteClawConfig = snapshot.valid ? snapshot.config : {};

  if (snapshot.exists && !snapshot.valid) {
    await prompter.note(onboardHelpers.summarizeExistingConfig(baseConfig), "Invalid config");
    if (snapshot.issues.length > 0) {
      await prompter.note(
        [
          ...snapshot.issues.map((iss) => `- ${iss.path}: ${iss.message}`),
          "",
          "Docs: https://docs.remoteclaw.org/gateway/configuration",
        ].join("\n"),
        "Config issues",
      );
    }
    await prompter.outro(
      `Config invalid. Run \`${formatCliCommand("remoteclaw doctor")}\` to repair it, then re-run onboarding.`,
    );
    runtime.exit(1);
    return;
  }

  const quickstartHint = `Configure details later via ${formatCliCommand("remoteclaw configure")}.`;
  const manualHint = "Configure port, network, Tailscale, and auth options.";
  const explicitFlowRaw = opts.flow?.trim();
  const normalizedExplicitFlow = explicitFlowRaw === "manual" ? "advanced" : explicitFlowRaw;
  if (
    normalizedExplicitFlow &&
    normalizedExplicitFlow !== "quickstart" &&
    normalizedExplicitFlow !== "advanced"
  ) {
    runtime.error("Invalid --flow (use quickstart, manual, or advanced).");
    runtime.exit(1);
    return;
  }
  const explicitFlow: WizardFlow | undefined =
    normalizedExplicitFlow === "quickstart" || normalizedExplicitFlow === "advanced"
      ? normalizedExplicitFlow
      : undefined;
  let flow: WizardFlow =
    explicitFlow ??
    (await prompter.select({
      message: "Onboarding mode",
      options: [
        { value: "quickstart", label: "QuickStart", hint: quickstartHint },
        { value: "advanced", label: "Manual", hint: manualHint },
      ],
      initialValue: "quickstart",
    }));

  if (opts.mode === "remote" && flow === "quickstart") {
    await prompter.note(
      "QuickStart only supports local gateways. Switching to Manual mode.",
      "QuickStart",
    );
    flow = "advanced";
  }

  if (snapshot.exists) {
    await prompter.note(
      onboardHelpers.summarizeExistingConfig(baseConfig),
      "Existing config detected",
    );

    const action = await prompter.select({
      message: "Config handling",
      options: [
        { value: "keep", label: "Use existing values" },
        { value: "modify", label: "Update values" },
        { value: "reset", label: "Reset" },
      ],
    });

    if (action === "reset") {
      const workspaceDirs = collectWorkspaceDirs(baseConfig);
      const hasWorkspaces = workspaceDirs.length > 0;
      const resetScope = (await prompter.select({
        message: "Reset scope",
        options: [
          { value: "config", label: "Config only" },
          {
            value: "config+creds+sessions",
            label: "Config + creds + sessions",
          },
          ...(hasWorkspaces
            ? [
                {
                  value: "full" as const,
                  label: "Full reset (config + creds + sessions + workspace)",
                },
              ]
            : []),
        ],
      })) as ResetScope;
      if (hasWorkspaces) {
        await onboardHelpers.handleReset(resetScope, workspaceDirs[0], runtime);
      } else {
        await onboardHelpers.handleReset(resetScope, "", runtime);
      }
      baseConfig = {};
    }
  }

  const quickstartGateway: QuickstartGatewayDefaults = (() => {
    const hasExisting =
      typeof baseConfig.gateway?.port === "number" ||
      baseConfig.gateway?.bind !== undefined ||
      baseConfig.gateway?.auth?.mode !== undefined ||
      baseConfig.gateway?.auth?.token !== undefined ||
      baseConfig.gateway?.auth?.password !== undefined ||
      baseConfig.gateway?.customBindHost !== undefined ||
      baseConfig.gateway?.tailscale?.mode !== undefined;

    const bindRaw = baseConfig.gateway?.bind;
    const bind =
      bindRaw === "loopback" ||
      bindRaw === "lan" ||
      bindRaw === "auto" ||
      bindRaw === "custom" ||
      bindRaw === "tailnet"
        ? bindRaw
        : "loopback";

    let authMode: GatewayAuthChoice = "token";
    if (
      baseConfig.gateway?.auth?.mode === "token" ||
      baseConfig.gateway?.auth?.mode === "password"
    ) {
      authMode = baseConfig.gateway.auth.mode;
    } else if (baseConfig.gateway?.auth?.token) {
      authMode = "token";
    } else if (baseConfig.gateway?.auth?.password) {
      authMode = "password";
    }

    const tailscaleRaw = baseConfig.gateway?.tailscale?.mode;
    const tailscaleMode =
      tailscaleRaw === "off" || tailscaleRaw === "serve" || tailscaleRaw === "funnel"
        ? tailscaleRaw
        : "off";

    return {
      hasExisting,
      port: resolveGatewayPort(baseConfig),
      bind,
      authMode,
      tailscaleMode,
      token: baseConfig.gateway?.auth?.token,
      password: baseConfig.gateway?.auth?.password,
      customBindHost: baseConfig.gateway?.customBindHost,
      tailscaleResetOnExit: baseConfig.gateway?.tailscale?.resetOnExit ?? false,
    };
  })();

  if (flow === "quickstart") {
    const formatBind = (value: "loopback" | "lan" | "auto" | "custom" | "tailnet") => {
      if (value === "loopback") {
        return "Loopback (127.0.0.1)";
      }
      if (value === "lan") {
        return "LAN";
      }
      if (value === "custom") {
        return "Custom IP";
      }
      if (value === "tailnet") {
        return "Tailnet (Tailscale IP)";
      }
      return "Auto";
    };
    const formatAuth = (value: GatewayAuthChoice) => {
      if (value === "token") {
        return "Token (default)";
      }
      return "Password";
    };
    const formatTailscale = (value: "off" | "serve" | "funnel") => {
      if (value === "off") {
        return "Off";
      }
      if (value === "serve") {
        return "Serve";
      }
      return "Funnel";
    };
    const quickstartLines = quickstartGateway.hasExisting
      ? [
          "Keeping your current gateway settings:",
          `Gateway port: ${quickstartGateway.port}`,
          `Gateway bind: ${formatBind(quickstartGateway.bind)}`,
          ...(quickstartGateway.bind === "custom" && quickstartGateway.customBindHost
            ? [`Gateway custom IP: ${quickstartGateway.customBindHost}`]
            : []),
          `Gateway auth: ${formatAuth(quickstartGateway.authMode)}`,
          `Tailscale exposure: ${formatTailscale(quickstartGateway.tailscaleMode)}`,
          "Direct to chat channels.",
        ]
      : [
          `Gateway port: ${DEFAULT_GATEWAY_PORT}`,
          "Gateway bind: Loopback (127.0.0.1)",
          "Gateway auth: Token (default)",
          "Tailscale exposure: Off",
          "Direct to chat channels.",
        ];
    await prompter.note(quickstartLines.join("\n"), "QuickStart");
  }

  const localPort = resolveGatewayPort(baseConfig);
  const localUrl = `ws://127.0.0.1:${localPort}`;
  const localProbe = await onboardHelpers.probeGatewayReachable({
    url: localUrl,
    token: baseConfig.gateway?.auth?.token ?? process.env.REMOTECLAW_GATEWAY_TOKEN,
    password: baseConfig.gateway?.auth?.password ?? process.env.REMOTECLAW_GATEWAY_PASSWORD,
  });
  const remoteUrl = baseConfig.gateway?.remote?.url?.trim() ?? "";
  const remoteProbe = remoteUrl
    ? await onboardHelpers.probeGatewayReachable({
        url: remoteUrl,
        token: baseConfig.gateway?.remote?.token,
      })
    : null;

  const mode =
    opts.mode ??
    (flow === "quickstart"
      ? "local"
      : ((await prompter.select({
          message: "What do you want to set up?",
          options: [
            {
              value: "local",
              label: "Local gateway (this machine)",
              hint: localProbe.ok
                ? `Gateway reachable (${localUrl})`
                : `No gateway detected (${localUrl})`,
            },
            {
              value: "remote",
              label: "Remote gateway (info-only)",
              hint: !remoteUrl
                ? "No remote URL configured yet"
                : remoteProbe?.ok
                  ? `Gateway reachable (${remoteUrl})`
                  : `Configured but unreachable (${remoteUrl})`,
            },
          ],
        })) as OnboardMode));

  if (mode === "remote") {
    const { promptRemoteGatewayConfig } = await import("../commands/onboard-remote.js");
    const { logConfigUpdated } = await import("../config/logging.js");
    let nextConfig = await promptRemoteGatewayConfig(baseConfig, prompter);
    nextConfig = onboardHelpers.applyWizardMetadata(nextConfig, { command: "onboard", mode });
    await writeConfigFile(nextConfig);
    logConfigUpdated(runtime);
    await prompter.outro("Remote gateway configured.");
    return;
  }

  const existingWorkspaceDirs = collectWorkspaceDirs(baseConfig);
  const workspaceInput =
    opts.workspace ??
    existingWorkspaceDirs[0] ??
    (await prompter.text({
      message: "Workspace directory",
      initialValue: "~/remoteclaw-workspace",
    }));

  const trimmedWorkspace = workspaceInput.trim();
  if (!trimmedWorkspace) {
    await prompter.outro("Workspace directory is required.");
    runtime.exit(1);
    return;
  }
  const workspaceDir = resolveUserPath(trimmedWorkspace);

  const { applyOnboardingLocalWorkspaceConfig } = await import("../commands/onboard-config.js");
  let nextConfig: RemoteClawConfig = applyOnboardingLocalWorkspaceConfig(
    baseConfig,
    trimmedWorkspace,
  );

  const { upsertAuthProfile } = await import("../auth/index.js");

  // Step 1: Runtime selection
  const selectedRuntime: AgentRuntime =
    opts.runtime ??
    (await prompter.select({
      message: "Which agent runtime?",
      options: [
        { value: "claude", label: "Claude Code (claude)" },
        { value: "gemini", label: "Gemini CLI (gemini)" },
        { value: "codex", label: "Codex CLI (codex exec)" },
        { value: "opencode", label: "OpenCode (opencode)" },
      ],
      initialValue: "claude",
    }));

  nextConfig = {
    ...nextConfig,
    agents: {
      ...nextConfig.agents,
      defaults: {
        ...nextConfig.agents?.defaults,
        runtime: selectedRuntime,
      },
    },
  };

  // Step 2: Credential prompt (runtime-specific)
  nextConfig = await promptRuntimeCredential({
    runtime: selectedRuntime,
    config: nextConfig,
    prompter,
    upsertAuthProfile,
    opts,
  });

  const { configureGatewayForOnboarding } = await import("./onboarding.gateway-config.js");
  const gateway = await configureGatewayForOnboarding({
    flow,
    baseConfig,
    nextConfig,
    localPort,
    quickstartGateway,
    prompter,
    runtime,
  });
  nextConfig = gateway.nextConfig;
  const settings = gateway.settings;

  if (opts.skipChannels ?? opts.skipProviders) {
    await prompter.note("Skipping channel setup.", "Channels");
  } else {
    const { listChannelPlugins } = await import("../channels/plugins/index.js");
    const { setupChannels } = await import("../commands/onboard-channels.js");
    const quickstartAllowFromChannels =
      flow === "quickstart"
        ? listChannelPlugins()
            .filter((plugin) => plugin.meta.quickstartAllowFrom)
            .map((plugin) => plugin.id)
        : [];
    nextConfig = await setupChannels(nextConfig, runtime, prompter, {
      allowSignalInstall: true,
      forceAllowFromChannels: quickstartAllowFromChannels,
      skipDmPolicyPrompt: flow === "quickstart",
      skipConfirm: flow === "quickstart",
      quickstartDefaults: flow === "quickstart",
    });
  }

  await writeConfigFile(nextConfig);
  const { logConfigUpdated } = await import("../config/logging.js");
  logConfigUpdated(runtime);
  await onboardHelpers.ensureWorkspaceAndSessions(workspaceDir, runtime, {
    skipBootstrap: Boolean(nextConfig.agents?.defaults?.skipBootstrap),
  });

  nextConfig = onboardHelpers.applyWizardMetadata(nextConfig, { command: "onboard", mode });
  await writeConfigFile(nextConfig);

  const { finalizeOnboardingWizard } = await import("./onboarding.finalize.js");
  const { launchedTui } = await finalizeOnboardingWizard({
    flow,
    opts,
    baseConfig,
    nextConfig,
    workspaceDir,
    settings,
    prompter,
    runtime,
  });
  if (launchedTui) {
    return;
  }
}
