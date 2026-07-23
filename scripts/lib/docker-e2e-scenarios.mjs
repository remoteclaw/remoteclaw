// Docker E2E scenario catalog.
// Keep lane names, commands, image kind, timeout, resources, and release chunks
// here. Planning and execution live in separate modules.
import { fileURLToPath } from "node:url";

export const DEFAULT_LIVE_RETRIES = 1;
const LIVE_DOCKER_DEFAULT_HARNESS_DIR =
  /[\\/]\\.release-harness[\\/]/u.test(fileURLToPath(import.meta.url)) &&
  process.env.REMOTECLAW_DOCKER_E2E_REPO_ROOT
    ? ".release-harness"
    : ".";
const LIVE_ACP_TIMEOUT_MS = 20 * 60 * 1000;
const LIVE_CLI_TIMEOUT_MS = 20 * 60 * 1000;
const LIVE_PROFILE_TIMEOUT_MS = 30 * 60 * 1000;
const OPENWEBUI_TIMEOUT_MS = 20 * 60 * 1000;
const RELEASE_OPENWEBUI_COMMAND =
  "REMOTECLAW_OPENWEBUI_MODEL=openai/gpt-5.4-mini REMOTECLAW_OPENWEBUI_PROVIDER_TIMEOUT_SECONDS=300 REMOTECLAW_SKIP_DOCKER_BUILD=1 pnpm test:docker:openwebui";
export const BUNDLED_PLUGIN_INSTALL_UNINSTALL_SHARDS = 24;
const upgradeSurvivorCommand = "REMOTECLAW_SKIP_DOCKER_BUILD=1 pnpm test:docker:upgrade-survivor";
const rootManagedVpsUpgradeCommand =
  "REMOTECLAW_SKIP_DOCKER_BUILD=1 pnpm test:docker:root-managed-vps-upgrade";
const updateRestartAuthCommand =
  "REMOTECLAW_SKIP_DOCKER_BUILD=1 pnpm test:docker:update-restart-auth";
const CODEX_HARNESS_API_KEY_ENV = "REMOTECLAW_LIVE_CODEX_HARNESS_AUTH=api-key";

const LIVE_RETRY_PATTERNS = [
  /529\b/i,
  /overloaded/i,
  /capacity/i,
  /rate.?limit/i,
  /gateway closed \(1000 normal closure\)/i,
  /ECONNRESET|ETIMEDOUT|ENOTFOUND/i,
];

function liveDockerScriptCommand(script, envPrefix = "", options = {}) {
  const prefix = envPrefix ? `${envPrefix} ` : "";
  const skipBuild = options.skipBuild === false ? "" : "REMOTECLAW_SKIP_DOCKER_BUILD=1 ";
  return `${prefix}${skipBuild}bash -c 'harness="\${REMOTECLAW_DOCKER_E2E_TRUSTED_HARNESS_DIR:-${LIVE_DOCKER_DEFAULT_HARNESS_DIR}}"; REMOTECLAW_LIVE_DOCKER_REPO_ROOT="\${REMOTECLAW_DOCKER_E2E_REPO_ROOT:-$PWD}" bash "$harness/scripts/${script}"'`;
}

function lane(name, command, options = {}) {
  return {
    cacheKey: options.cacheKey,
    command,
    e2eImageKind:
      options.e2eImageKind === false
        ? undefined
        : (options.e2eImageKind ?? (options.live ? undefined : "functional")),
    estimateSeconds: options.estimateSeconds,
    live: options.live === true,
    noOutputTimeoutMs: options.noOutputTimeoutMs,
    name,
    needsLiveImage: options.needsLiveImage,
    retryPatterns: options.retryPatterns ?? [],
    retries: options.retries ?? 0,
    resources: options.resources ?? [],
    stateScenario: options.stateScenario,
    timeoutMs: options.timeoutMs,
    weight: options.weight ?? 1,
  };
}

function liveProviderResource(provider) {
  if (!provider) {
    return undefined;
  }
  if (provider === "claude-cli" || provider === "claude") {
    return "live:claude";
  }
  if (provider === "codex-cli" || provider === "codex") {
    return "live:codex";
  }
  if (provider === "droid") {
    return "live:droid";
  }
  if (provider === "google-gemini-cli" || provider === "gemini") {
    return "live:gemini";
  }
  if (provider === "opencode") {
    return "live:opencode";
  }
  if (provider === "openai") {
    return "live:openai";
  }
  return `live:${provider}`;
}

function liveProviderResources(options) {
  const providers = options.providers ?? (options.provider ? [options.provider] : []);
  return providers.map(liveProviderResource).filter(Boolean);
}

function liveLane(name, command, options = {}) {
  return lane(name, command, {
    ...options,
    live: true,
    needsLiveImage: options.needsLiveImage ?? true,
    resources: ["live", ...liveProviderResources(options), ...(options.resources ?? [])],
    retryPatterns: options.retryPatterns ?? LIVE_RETRY_PATTERNS,
    retries: options.retries ?? DEFAULT_LIVE_RETRIES,
    weight: options.weight ?? 3,
  });
}

function npmLane(name, command, options = {}) {
  return lane(name, command, {
    ...options,
    e2eImageKind: options.e2eImageKind ?? "bare",
    resources: ["npm", ...(options.resources ?? [])],
    weight: options.weight ?? 2,
  });
}

function serviceLane(name, command, options = {}) {
  return lane(name, command, {
    ...options,
    resources: ["service", ...(options.resources ?? [])],
    weight: options.weight ?? 2,
  });
}

function createPackageUpdateMaintenanceLanes() {
  return [
    npmLane("doctor-switch", "REMOTECLAW_SKIP_DOCKER_BUILD=1 pnpm test:docker:doctor-switch", {
      stateScenario: "empty",
      weight: 3,
    }),
    npmLane(
      "update-channel-switch",
      "REMOTECLAW_SKIP_DOCKER_BUILD=1 pnpm test:docker:update-channel-switch",
      {
        stateScenario: "update-stable",
        timeoutMs: 30 * 60 * 1000,
        weight: 3,
      },
    ),
    npmLane("skill-install", "REMOTECLAW_SKIP_DOCKER_BUILD=1 pnpm test:docker:skill-install", {
      retryPatterns: LIVE_RETRY_PATTERNS,
      retries: 1,
      stateScenario: "empty",
      timeoutMs: 10 * 60 * 1000,
      weight: 2,
    }),
    npmLane("upgrade-survivor", upgradeSurvivorCommand, {
      stateScenario: "upgrade-survivor",
      timeoutMs: 20 * 60 * 1000,
      weight: 3,
    }),
    npmLane(
      "published-upgrade-survivor",
      "REMOTECLAW_SKIP_DOCKER_BUILD=1 pnpm test:docker:published-upgrade-survivor",
      {
        stateScenario: "upgrade-survivor",
        timeoutMs: 25 * 60 * 1000,
        weight: 3,
      },
    ),
    npmLane("root-managed-vps-upgrade", rootManagedVpsUpgradeCommand, {
      stateScenario: "upgrade-survivor",
      timeoutMs: 25 * 60 * 1000,
      weight: 3,
    }),
    npmLane("update-restart-auth", updateRestartAuthCommand, {
      stateScenario: "upgrade-survivor",
      timeoutMs: 25 * 60 * 1000,
      weight: 3,
    }),
  ];
}

const bundledPluginInstallUninstallLanes = Array.from(
  { length: BUNDLED_PLUGIN_INSTALL_UNINSTALL_SHARDS },
  (_, index) =>
    lane(
      `bundled-plugin-install-uninstall-${index}`,
      `REMOTECLAW_BUNDLED_PLUGIN_SWEEP_TOTAL=${BUNDLED_PLUGIN_INSTALL_UNINSTALL_SHARDS} REMOTECLAW_BUNDLED_PLUGIN_SWEEP_INDEX=${index} REMOTECLAW_SKIP_DOCKER_BUILD=1 pnpm test:docker:bundled-plugin-install-uninstall`,
      {
        estimateSeconds: 120,
        resources: ["npm"],
        stateScenario: "empty",
        weight: 1,
      },
    ),
);

function livePluginToolLane() {
  return liveLane(
    "live-plugin-tool",
    "REMOTECLAW_LIVE_PLUGIN_TOOL_TIMEOUT_SECONDS=300 REMOTECLAW_SKIP_DOCKER_BUILD=1 pnpm test:docker:live-plugin-tool",
    {
      cacheKey: "plugin-tool",
      e2eImageKind: "bare",
      provider: "openai",
      resources: ["npm"],
      stateScenario: "empty",
      timeoutMs: 20 * 60 * 1000,
      weight: 3,
    },
  );
}

function liveOpenAiChatToolsLane() {
  return liveLane(
    "openai-chat-tools",
    "REMOTECLAW_SKIP_DOCKER_BUILD=1 pnpm test:docker:openai-chat-tools",
    {
      e2eImageKind: "functional",
      needsLiveImage: false,
      provider: "openai",
      resources: ["service"],
      stateScenario: "empty",
      timeoutMs: 10 * 60 * 1000,
      weight: 2,
    },
  );
}

function liveCodexNpmPluginLane() {
  return liveLane(
    "live-codex-npm-plugin",
    liveDockerScriptCommand("e2e/codex-npm-plugin-live-docker.sh"),
    {
      cacheKey: "codex-npm-plugin",
      e2eImageKind: "bare",
      provider: "openai",
      resources: ["npm"],
      stateScenario: "empty",
      timeoutMs: 30 * 60 * 1000,
      weight: 3,
    },
  );
}

function liveMcpCodeModeGatewayLane() {
  return liveLane(
    "live-mcp-code-mode-gateway",
    "REMOTECLAW_SKIP_DOCKER_BUILD=1 pnpm test:docker:live-mcp-code-mode-gateway",
    {
      cacheKey: "mcp-code-mode-gateway",
      e2eImageKind: "functional",
      needsLiveImage: false,
      provider: "openai",
      resources: ["npm", "service"],
      stateScenario: "empty",
      timeoutMs: 20 * 60 * 1000,
      weight: 3,
    },
  );
}

function kitchenSinkRpcLane() {
  return serviceLane(
    "kitchen-sink-rpc",
    "REMOTECLAW_SKIP_DOCKER_BUILD=1 pnpm test:docker:kitchen-sink-rpc",
    {
      resources: ["npm"],
      stateScenario: "empty",
      timeoutMs: 15 * 60 * 1000,
      weight: 3,
    },
  );
}

export const mainLanes = [
  liveLane("live-models", liveDockerScriptCommand("test-live-models-docker.sh"), {
    providers: ["claude-cli", "google-gemini-cli"],
    timeoutMs: LIVE_PROFILE_TIMEOUT_MS,
    weight: 4,
  }),
  liveLane(
    "live-gateway",
    liveDockerScriptCommand(
      "test-live-gateway-models-docker.sh",
      "REMOTECLAW_IMAGE=remoteclaw:local-live-gateway REMOTECLAW_DOCKER_BUILD_EXTENSIONS=matrix REMOTECLAW_LIVE_GATEWAY_PROVIDERS=claude-cli,google-gemini-cli",
      { skipBuild: false },
    ),
    {
      providers: ["claude-cli", "google-gemini-cli"],
      timeoutMs: LIVE_PROFILE_TIMEOUT_MS,
      weight: 4,
    },
  ),
  liveLane(
    "live-cli-backend-claude",
    liveDockerScriptCommand(
      "test-live-cli-backend-docker.sh",
      "REMOTECLAW_LIVE_CLI_BACKEND_MODEL=claude-cli/claude-sonnet-4-6",
    ),
    {
      cacheKey: "cli-backend-claude",
      provider: "claude-cli",
      resources: ["npm"],
      timeoutMs: LIVE_CLI_TIMEOUT_MS,
      weight: 3,
    },
  ),
  liveLane(
    "live-cli-backend-gemini",
    liveDockerScriptCommand(
      "test-live-cli-backend-docker.sh",
      "REMOTECLAW_LIVE_CLI_BACKEND_MODEL=google-gemini-cli/gemini-3-flash-preview",
    ),
    {
      cacheKey: "cli-backend-gemini",
      provider: "google-gemini-cli",
      resources: ["npm"],
      timeoutMs: LIVE_CLI_TIMEOUT_MS,
      weight: 3,
    },
  ),
  liveLane("openwebui", "REMOTECLAW_SKIP_DOCKER_BUILD=1 pnpm test:docker:openwebui", {
    e2eImageKind: "functional",
    needsLiveImage: false,
    provider: "openai",
    resources: ["service"],
    timeoutMs: OPENWEBUI_TIMEOUT_MS,
    weight: 5,
  }),
  serviceLane("onboard", "REMOTECLAW_SKIP_DOCKER_BUILD=1 pnpm test:docker:onboard", {
    stateScenario: "empty",
    weight: 2,
  }),
  npmLane("codex-on-demand", "REMOTECLAW_SKIP_DOCKER_BUILD=1 pnpm test:docker:codex-on-demand", {
    resources: ["service"],
    stateScenario: "empty",
    weight: 3,
  }),
  serviceLane(
    "codex-media-path",
    "REMOTECLAW_SKIP_DOCKER_BUILD=1 pnpm test:docker:codex-media-path",
    {
      resources: ["npm"],
      stateScenario: "empty",
      weight: 3,
    },
  ),
  npmLane(
    "npm-onboard-channel-agent",
    "REMOTECLAW_SKIP_DOCKER_BUILD=1 pnpm test:docker:npm-onboard-channel-agent",
    { resources: ["service"], stateScenario: "empty", weight: 3 },
  ),
  npmLane(
    "npm-onboard-discord-channel-agent",
    "REMOTECLAW_NPM_ONBOARD_CHANNEL=discord REMOTECLAW_SKIP_DOCKER_BUILD=1 pnpm test:docker:npm-onboard-channel-agent",
    { resources: ["service"], stateScenario: "empty", weight: 3 },
  ),
  npmLane(
    "npm-onboard-slack-channel-agent",
    "REMOTECLAW_NPM_ONBOARD_CHANNEL=slack REMOTECLAW_SKIP_DOCKER_BUILD=1 pnpm test:docker:npm-onboard-channel-agent",
    { resources: ["service"], stateScenario: "empty", weight: 3 },
  ),
  npmLane(
    "release-user-journey",
    "REMOTECLAW_SKIP_DOCKER_BUILD=1 pnpm test:docker:release-user-journey",
    {
      resources: ["npm", "service"],
      stateScenario: "empty",
      timeoutMs: 20 * 60 * 1000,
      weight: 4,
    },
  ),
  npmLane(
    "release-typed-onboarding",
    "REMOTECLAW_SKIP_DOCKER_BUILD=1 pnpm test:docker:release-typed-onboarding",
    {
      resources: ["npm", "service"],
      stateScenario: "empty",
      timeoutMs: 20 * 60 * 1000,
      weight: 3,
    },
  ),
  npmLane(
    "release-media-memory",
    "REMOTECLAW_SKIP_DOCKER_BUILD=1 pnpm test:docker:release-media-memory",
    {
      resources: ["npm", "service"],
      stateScenario: "empty",
      timeoutMs: 20 * 60 * 1000,
      weight: 3,
    },
  ),
  npmLane(
    "release-upgrade-user-journey",
    "REMOTECLAW_SKIP_DOCKER_BUILD=1 pnpm test:docker:release-upgrade-user-journey",
    {
      resources: ["npm", "service"],
      stateScenario: "empty",
      timeoutMs: 30 * 60 * 1000,
      weight: 5,
    },
  ),
  npmLane(
    "release-plugin-marketplace",
    "REMOTECLAW_SKIP_DOCKER_BUILD=1 pnpm test:docker:release-plugin-marketplace",
    {
      resources: ["npm"],
      stateScenario: "empty",
      timeoutMs: 20 * 60 * 1000,
      weight: 3,
    },
  ),
  serviceLane("gateway-network", "REMOTECLAW_SKIP_DOCKER_BUILD=1 pnpm test:docker:gateway-network"),
  serviceLane(
    "agents-delete-shared-workspace",
    "REMOTECLAW_SKIP_DOCKER_BUILD=1 pnpm test:docker:agents-delete-shared-workspace",
    { stateScenario: "empty" },
  ),
  serviceLane("mcp-channels", "REMOTECLAW_SKIP_DOCKER_BUILD=1 pnpm test:docker:mcp-channels", {
    resources: ["npm"],
    stateScenario: "empty",
    weight: 3,
  }),
  serviceLane(
    "mcp-code-mode-gateway",
    "REMOTECLAW_SKIP_DOCKER_BUILD=1 pnpm test:docker:mcp-code-mode-gateway",
    {
      resources: ["npm"],
      stateScenario: "empty",
      weight: 3,
    },
  ),
  lane(
    "agent-bundle-mcp-tools",
    "REMOTECLAW_SKIP_DOCKER_BUILD=1 pnpm test:docker:agent-bundle-mcp-tools",
    {
      stateScenario: "empty",
    },
  ),
  lane("crestodian-rescue", "REMOTECLAW_SKIP_DOCKER_BUILD=1 pnpm test:docker:crestodian-rescue", {
    stateScenario: "empty",
  }),
  lane("crestodian-planner", "REMOTECLAW_SKIP_DOCKER_BUILD=1 pnpm test:docker:crestodian-planner", {
    stateScenario: "empty",
  }),
  serviceLane(
    "cron-mcp-cleanup",
    "REMOTECLAW_SKIP_DOCKER_BUILD=1 pnpm test:docker:cron-mcp-cleanup",
    { resources: ["npm"], stateScenario: "empty", weight: 3 },
  ),
  ...createPackageUpdateMaintenanceLanes(),
  npmLane("update-migration", "REMOTECLAW_SKIP_DOCKER_BUILD=1 pnpm test:docker:update-migration", {
    stateScenario: "upgrade-survivor",
    timeoutMs: 30 * 60 * 1000,
    weight: 3,
  }),
  lane("plugins", "REMOTECLAW_SKIP_DOCKER_BUILD=1 pnpm test:docker:plugins", {
    resources: ["npm", "service"],
    stateScenario: "empty",
    weight: 6,
  }),
  lane(
    "kitchen-sink-plugin",
    "REMOTECLAW_SKIP_DOCKER_BUILD=1 pnpm test:docker:kitchen-sink-plugin",
    {
      resources: ["npm"],
      stateScenario: "empty",
      weight: 3,
    },
  ),
  kitchenSinkRpcLane(),
  ...bundledPluginInstallUninstallLanes,
  lane(
    "plugins-offline",
    "REMOTECLAW_PLUGINS_E2E_CLAWHUB=0 REMOTECLAW_SKIP_DOCKER_BUILD=1 pnpm test:docker:plugins",
    {
      resources: ["npm", "service"],
      stateScenario: "empty",
      weight: 6,
    },
  ),
  npmLane("plugin-update", "REMOTECLAW_SKIP_DOCKER_BUILD=1 pnpm test:docker:plugin-update", {
    stateScenario: "empty",
  }),
  npmLane(
    "update-corrupt-plugin",
    "REMOTECLAW_SKIP_DOCKER_BUILD=1 pnpm test:docker:update-corrupt-plugin",
    {
      stateScenario: "empty",
      timeoutMs: 30 * 60 * 1000,
      weight: 3,
    },
  ),
  npmLane(
    "plugin-lifecycle-matrix",
    "REMOTECLAW_SKIP_DOCKER_BUILD=1 pnpm test:docker:plugin-lifecycle-matrix",
    {
      stateScenario: "empty",
      timeoutMs: 12 * 60 * 1000,
    },
  ),
  serviceLane("config-reload", "REMOTECLAW_SKIP_DOCKER_BUILD=1 pnpm test:docker:config-reload", {
    stateScenario: "empty",
  }),
  lane("openai-image-auth", "REMOTECLAW_SKIP_DOCKER_BUILD=1 pnpm test:docker:openai-image-auth", {
    stateScenario: "empty",
  }),
  lane(
    "crestodian-first-run",
    "REMOTECLAW_SKIP_DOCKER_BUILD=1 pnpm test:docker:crestodian-first-run",
    { stateScenario: "empty" },
  ),
  lane(
    "session-runtime-context",
    "REMOTECLAW_SKIP_DOCKER_BUILD=1 pnpm test:docker:session-runtime-context",
  ),
  lane(
    "plugin-binding-command-escape",
    "REMOTECLAW_SKIP_DOCKER_BUILD=0 pnpm test:docker:plugin-binding-command-escape",
    {
      e2eImageKind: false,
      resources: ["npm"],
      stateScenario: "empty",
    },
  ),
  lane("commitments-safety", "REMOTECLAW_SKIP_DOCKER_BUILD=1 pnpm test:docker:commitments-safety", {
    stateScenario: "empty",
  }),
  lane("qr", "pnpm test:docker:qr"),
];

export const tailLanes = [
  serviceLane(
    "openai-web-search-minimal",
    "REMOTECLAW_SKIP_DOCKER_BUILD=1 pnpm test:docker:openai-web-search-minimal",
    { stateScenario: "empty", timeoutMs: 8 * 60 * 1000 },
  ),
  liveLane(
    "live-codex-harness",
    liveDockerScriptCommand("test-live-codex-harness-docker.sh", CODEX_HARNESS_API_KEY_ENV),
    {
      cacheKey: "codex-harness",
      provider: "openai",
      resources: ["npm"],
      timeoutMs: LIVE_ACP_TIMEOUT_MS,
      weight: 3,
    },
  ),
  liveLane(
    "live-codex-media-path",
    liveDockerScriptCommand(
      "test-live-codex-harness-docker.sh",
      "REMOTECLAW_LIVE_CODEX_HARNESS_AUTH=api-key REMOTECLAW_LIVE_CODEX_HARNESS_CHAT_IMAGE_PROBE=1 REMOTECLAW_LIVE_CODEX_HARNESS_IMAGE_PROBE=0 REMOTECLAW_LIVE_CODEX_HARNESS_MCP_PROBE=0 REMOTECLAW_LIVE_CODEX_HARNESS_SUBAGENT_PROBE=0 REMOTECLAW_LIVE_CODEX_HARNESS_GUARDIAN_PROBE=0",
    ),
    {
      cacheKey: "codex-harness",
      provider: "openai",
      resources: ["npm"],
      timeoutMs: LIVE_ACP_TIMEOUT_MS,
      weight: 3,
    },
  ),
  liveLane(
    "live-subagent-announce",
    liveDockerScriptCommand("test-live-subagent-announce-docker.sh"),
    {
      cacheKey: "subagent-announce",
      provider: "openai",
      resources: ["npm"],
      timeoutMs: 25 * 60 * 1000,
      weight: 3,
    },
  ),
  liveLane(
    "live-codex-bind",
    liveDockerScriptCommand(
      "test-live-codex-harness-docker.sh",
      `${CODEX_HARNESS_API_KEY_ENV} REMOTECLAW_LIVE_CODEX_BIND=1 REMOTECLAW_LIVE_CODEX_TEST_FILES=src/gateway/gateway-codex-bind.live.test.ts`,
    ),
    {
      cacheKey: "codex-harness",
      provider: "openai",
      resources: ["npm"],
      timeoutMs: LIVE_ACP_TIMEOUT_MS,
      weight: 3,
    },
  ),
  liveCodexNpmPluginLane(),
  liveMcpCodeModeGatewayLane(),
  livePluginToolLane(),
  liveLane(
    "live-acp-bind-claude",
    liveDockerScriptCommand(
      "test-live-acp-bind-docker.sh",
      "REMOTECLAW_LIVE_ACP_BIND_AGENT=claude",
    ),
    {
      cacheKey: "acp-bind-claude",
      provider: "claude-cli",
      resources: ["npm"],
      timeoutMs: LIVE_ACP_TIMEOUT_MS,
      weight: 3,
    },
  ),
  liveLane(
    "live-acp-bind-codex",
    liveDockerScriptCommand("test-live-acp-bind-docker.sh", "REMOTECLAW_LIVE_ACP_BIND_AGENT=codex"),
    {
      cacheKey: "acp-bind-codex",
      provider: "codex-cli",
      resources: ["live:openai", "npm"],
      timeoutMs: LIVE_ACP_TIMEOUT_MS,
      weight: 3,
    },
  ),
  liveLane(
    "live-acp-bind-droid",
    liveDockerScriptCommand(
      "test-live-acp-bind-docker.sh",
      "REMOTECLAW_LIVE_ACP_BIND_AGENT=droid REMOTECLAW_LIVE_ACP_BIND_REQUIRE_TRANSCRIPT=1",
    ),
    {
      cacheKey: "acp-bind-droid",
      provider: "droid",
      resources: ["npm"],
      timeoutMs: LIVE_ACP_TIMEOUT_MS,
      weight: 3,
    },
  ),
  liveLane(
    "live-acp-bind-gemini",
    liveDockerScriptCommand(
      "test-live-acp-bind-docker.sh",
      "REMOTECLAW_LIVE_ACP_BIND_AGENT=gemini",
    ),
    {
      cacheKey: "acp-bind-gemini",
      provider: "google-gemini-cli",
      resources: ["npm"],
      timeoutMs: LIVE_ACP_TIMEOUT_MS,
      weight: 3,
    },
  ),
  liveLane(
    "live-acp-bind-opencode",
    liveDockerScriptCommand(
      "test-live-acp-bind-docker.sh",
      "REMOTECLAW_LIVE_ACP_BIND_AGENT=opencode REMOTECLAW_LIVE_ACP_BIND_REQUIRE_TRANSCRIPT=1",
    ),
    {
      cacheKey: "acp-bind-opencode",
      provider: "opencode",
      resources: ["npm"],
      timeoutMs: LIVE_ACP_TIMEOUT_MS,
      weight: 3,
    },
  ),
];

const releasePathPluginRuntimeLanes = [
  lane("plugins", "REMOTECLAW_SKIP_DOCKER_BUILD=1 pnpm test:docker:plugins", {
    resources: ["npm", "service"],
    stateScenario: "empty",
    weight: 6,
  }),
  ...bundledPluginInstallUninstallLanes,
  serviceLane(
    "cron-mcp-cleanup",
    "REMOTECLAW_SKIP_DOCKER_BUILD=1 pnpm test:docker:cron-mcp-cleanup",
    {
      resources: ["npm"],
      stateScenario: "empty",
      weight: 3,
    },
  ),
  kitchenSinkRpcLane(),
  serviceLane(
    "openai-web-search-minimal",
    "REMOTECLAW_SKIP_DOCKER_BUILD=1 pnpm test:docker:openai-web-search-minimal",
    { stateScenario: "empty", timeoutMs: 8 * 60 * 1000 },
  ),
  livePluginToolLane(),
];

const releasePathPluginRuntimePluginLanes = [
  lane("plugins", "REMOTECLAW_SKIP_DOCKER_BUILD=1 pnpm test:docker:plugins", {
    resources: ["npm", "service"],
    stateScenario: "empty",
    weight: 6,
  }),
];

const releasePathPluginRuntimeServiceLanes = [
  serviceLane(
    "cron-mcp-cleanup",
    "REMOTECLAW_SKIP_DOCKER_BUILD=1 pnpm test:docker:cron-mcp-cleanup",
    {
      resources: ["npm"],
      stateScenario: "empty",
      weight: 3,
    },
  ),
  kitchenSinkRpcLane(),
  serviceLane(
    "openai-web-search-minimal",
    "REMOTECLAW_SKIP_DOCKER_BUILD=1 pnpm test:docker:openai-web-search-minimal",
    { stateScenario: "empty", timeoutMs: 8 * 60 * 1000 },
  ),
  livePluginToolLane(),
];

const releasePathPluginRuntimeCoreLanes = [
  ...releasePathPluginRuntimePluginLanes,
  ...releasePathPluginRuntimeServiceLanes,
];

const releasePathBundledChannelLanes = [
  npmLane("plugin-update", "REMOTECLAW_SKIP_DOCKER_BUILD=1 pnpm test:docker:plugin-update", {
    stateScenario: "empty",
  }),
];

const releasePathPackageInstallOpenAiLanes = [
  liveLane(
    "install-e2e-openai",
    "REMOTECLAW_INSTALL_TAG=beta REMOTECLAW_E2E_MODELS=openai REMOTECLAW_INSTALL_E2E_IMAGE=remoteclaw-install-e2e-openai:local REMOTECLAW_INSTALL_E2E_AGENT_TOOL_SMOKE=0 REMOTECLAW_INSTALL_E2E_OPENAI_MODEL=openai/gpt-5.4-mini REMOTECLAW_INSTALL_E2E_AGENT_TURN_TIMEOUT_SECONDS=120 REMOTECLAW_INSTALL_E2E_OPENAI_PROVIDER_TIMEOUT_SECONDS=120 pnpm test:install:e2e",
    {
      e2eImageKind: "bare",
      needsLiveImage: false,
      provider: "openai",
      resources: ["npm", "service"],
      timeoutMs: 15 * 60 * 1000,
      weight: 3,
    },
  ),
  liveOpenAiChatToolsLane(),
  liveCodexNpmPluginLane(),
  npmLane("codex-on-demand", "REMOTECLAW_SKIP_DOCKER_BUILD=1 pnpm test:docker:codex-on-demand", {
    resources: ["service"],
    stateScenario: "empty",
    timeoutMs: 30 * 60 * 1000,
    weight: 3,
  }),
];

const releasePathPackageInstallAnthropicLanes = [
  liveLane(
    "install-e2e-anthropic",
    "REMOTECLAW_INSTALL_TAG=beta REMOTECLAW_E2E_MODELS=anthropic REMOTECLAW_INSTALL_E2E_IMAGE=remoteclaw-install-e2e-anthropic:local pnpm test:install:e2e",
    {
      e2eImageKind: "bare",
      needsLiveImage: false,
      provider: "claude",
      resources: ["npm", "service"],
      weight: 3,
    },
  ),
];

const releasePathPackageUpdateCoreLanes = [
  npmLane(
    "npm-onboard-channel-agent",
    "REMOTECLAW_SKIP_DOCKER_BUILD=1 pnpm test:docker:npm-onboard-channel-agent",
    { resources: ["service"], stateScenario: "empty", weight: 3 },
  ),
  npmLane(
    "npm-onboard-discord-channel-agent",
    "REMOTECLAW_NPM_ONBOARD_CHANNEL=discord REMOTECLAW_SKIP_DOCKER_BUILD=1 pnpm test:docker:npm-onboard-channel-agent",
    { resources: ["service"], stateScenario: "empty", weight: 3 },
  ),
  npmLane(
    "npm-onboard-slack-channel-agent",
    "REMOTECLAW_NPM_ONBOARD_CHANNEL=slack REMOTECLAW_SKIP_DOCKER_BUILD=1 pnpm test:docker:npm-onboard-channel-agent",
    { resources: ["service"], stateScenario: "empty", weight: 3 },
  ),
  ...createPackageUpdateMaintenanceLanes(),
];

const primaryReleasePathChunks = {
  core: [
    lane("qr", "REMOTECLAW_SKIP_DOCKER_BUILD=1 pnpm test:docker:qr"),
    serviceLane("onboard", "REMOTECLAW_SKIP_DOCKER_BUILD=1 pnpm test:docker:onboard", {
      stateScenario: "empty",
      weight: 2,
    }),
    serviceLane(
      "gateway-network",
      "REMOTECLAW_SKIP_DOCKER_BUILD=1 pnpm test:docker:gateway-network",
    ),
    serviceLane("config-reload", "REMOTECLAW_SKIP_DOCKER_BUILD=1 pnpm test:docker:config-reload", {
      stateScenario: "empty",
    }),
    lane(
      "session-runtime-context",
      "REMOTECLAW_SKIP_DOCKER_BUILD=1 pnpm test:docker:session-runtime-context",
    ),
    lane(
      "plugin-binding-command-escape",
      "REMOTECLAW_SKIP_DOCKER_BUILD=0 pnpm test:docker:plugin-binding-command-escape",
      {
        e2eImageKind: false,
        resources: ["npm"],
        stateScenario: "empty",
      },
    ),
    lane(
      "commitments-safety",
      "REMOTECLAW_SKIP_DOCKER_BUILD=1 pnpm test:docker:commitments-safety",
      {
        stateScenario: "empty",
      },
    ),
    lane(
      "agent-bundle-mcp-tools",
      "REMOTECLAW_SKIP_DOCKER_BUILD=1 pnpm test:docker:agent-bundle-mcp-tools",
      { stateScenario: "empty" },
    ),
    serviceLane("mcp-channels", "REMOTECLAW_SKIP_DOCKER_BUILD=1 pnpm test:docker:mcp-channels", {
      resources: ["npm"],
      stateScenario: "empty",
      weight: 3,
    }),
  ],
  "package-update-openai": releasePathPackageInstallOpenAiLanes,
  "package-update-anthropic": releasePathPackageInstallAnthropicLanes,
  "package-update-core": releasePathPackageUpdateCoreLanes,
  "plugins-runtime-plugins": releasePathPluginRuntimePluginLanes,
  "plugins-runtime-services": releasePathPluginRuntimeServiceLanes,
  "plugins-runtime-install-a": bundledPluginInstallUninstallLanes.slice(0, 3),
  "plugins-runtime-install-b": bundledPluginInstallUninstallLanes.slice(3, 6),
  "plugins-runtime-install-c": bundledPluginInstallUninstallLanes.slice(6, 9),
  "plugins-runtime-install-d": bundledPluginInstallUninstallLanes.slice(9, 12),
  "plugins-runtime-install-e": bundledPluginInstallUninstallLanes.slice(12, 15),
  "plugins-runtime-install-f": bundledPluginInstallUninstallLanes.slice(15, 18),
  "plugins-runtime-install-g": bundledPluginInstallUninstallLanes.slice(18, 21),
  "plugins-runtime-install-h": bundledPluginInstallUninstallLanes.slice(21),
  openwebui: [],
};

const primaryReleasePathChunkProfiles = {
  core: ["stable", "full"],
  "package-update-openai": ["beta", "stable", "full"],
  "package-update-anthropic": ["beta", "stable", "full"],
  "package-update-core": ["beta", "stable", "full"],
  "plugins-runtime-plugins": ["stable", "full"],
  "plugins-runtime-services": ["stable", "full"],
  "plugins-runtime-install-a": ["stable", "full"],
  "plugins-runtime-install-b": ["stable", "full"],
  "plugins-runtime-install-c": ["stable", "full"],
  "plugins-runtime-install-d": ["stable", "full"],
  "plugins-runtime-install-e": ["stable", "full"],
  "plugins-runtime-install-f": ["stable", "full"],
  "plugins-runtime-install-g": ["stable", "full"],
  "plugins-runtime-install-h": ["stable", "full"],
  openwebui: ["stable", "full"],
};

const legacyReleasePathChunks = {
  "package-update": [
    ...releasePathPackageInstallOpenAiLanes,
    ...releasePathPackageInstallAnthropicLanes,
    ...releasePathPackageUpdateCoreLanes,
  ],
  "plugins-runtime-core": releasePathPluginRuntimeCoreLanes,
  "plugins-runtime": releasePathPluginRuntimeLanes,
  "plugins-integrations": [...releasePathPluginRuntimeLanes, ...releasePathBundledChannelLanes],
  "bundled-channels": releasePathBundledChannelLanes,
};

export function normalizeReleaseProfile(raw) {
  const profile = String(raw ?? "stable").trim() || "stable";
  if (profile === "minimum") {
    return "beta";
  }
  if (profile === "beta" || profile === "stable" || profile === "full") {
    return profile;
  }
  throw new Error(
    `release profile must be one of: beta, stable, full. Got: ${JSON.stringify(raw)}`,
  );
}

function chunkMatchesReleaseProfile(chunk, releaseProfile) {
  const profiles = primaryReleasePathChunkProfiles[chunk];
  return !profiles || profiles.includes(releaseProfile);
}

function openWebUILane() {
  return liveLane("openwebui", RELEASE_OPENWEBUI_COMMAND, {
    e2eImageKind: "functional",
    needsLiveImage: false,
    provider: "openai",
    resources: ["service"],
    timeoutMs: OPENWEBUI_TIMEOUT_MS,
    weight: 5,
  });
}

export function releasePathChunkLanes(chunk, options = {}) {
  const base = primaryReleasePathChunks[chunk] ?? legacyReleasePathChunks[chunk];
  if (!base) {
    throw new Error(
      `REMOTECLAW_DOCKER_ALL_CHUNK must be one of: ${[
        ...Object.keys(primaryReleasePathChunks),
        ...Object.keys(legacyReleasePathChunks),
      ].join(", ")}. Got: ${JSON.stringify(chunk)}`,
    );
  }
  const releaseProfile = normalizeReleaseProfile(options.releaseProfile);
  if (!chunkMatchesReleaseProfile(chunk, releaseProfile)) {
    return [];
  }
  if (chunk === "openwebui") {
    return options.includeOpenWebUI ? [openWebUILane()] : [];
  }
  if (
    (chunk !== "plugins-runtime-services" &&
      chunk !== "plugins-runtime-core" &&
      chunk !== "plugins-runtime" &&
      chunk !== "plugins-integrations") ||
    !options.includeOpenWebUI
  ) {
    return base;
  }
  return [...base, openWebUILane()];
}

export function allReleasePathLanes(options = {}) {
  const releaseProfile = normalizeReleaseProfile(options.releaseProfile);
  return Object.keys(primaryReleasePathChunks)
    .filter((chunk) => chunk !== "openwebui")
    .flatMap((chunk) =>
      releasePathChunkLanes(chunk, {
        includeOpenWebUI: options.includeOpenWebUI,
        releaseProfile,
      }),
    );
}
