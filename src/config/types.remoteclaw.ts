import type { AgentBinding, AgentsConfig } from "./types.agents.js";
import type { AuthConfig } from "./types.auth.js";
import type { DiagnosticsConfig, LoggingConfig, SessionConfig, WebConfig } from "./types.base.js";
import type { BrowserConfig } from "./types.browser.js";
import type { ChannelsConfig } from "./types.channels.js";
import type { CronConfig } from "./types.cron.js";
import type { CanvasHostConfig, DiscoveryConfig, GatewayConfig, TalkConfig } from "./types.gateway.js";
import type { HooksConfig } from "./types.hooks.js";
import type { AudioConfig, BroadcastConfig, CommandsConfig, MessagesConfig } from "./types.messages.js";
import type { ModelsConfig } from "./types.models.js";
import type { NodeHostConfig } from "./types.node-host.js";
import type { PluginsConfig } from "./types.plugins.js";
import type { ToolsConfig } from "./types.tools.js";

export type RemoteClawConfig = {
  meta?: {
    /** Last RemoteClaw version that wrote this config. */
    lastTouchedVersion?: string;
    /** ISO timestamp when this config was last written. */
    lastTouchedAt?: string;
  };
  auth?: AuthConfig;
  env?: {
    /** Opt-in: import missing secrets from a login shell environment (exec `$SHELL -l -c 'env -0'`). */
    shellEnv?: {
      enabled?: boolean;
      /** Timeout for the login shell exec (ms). Default: 15000. */
      timeoutMs?: number;
    };
    /** Inline env vars to apply when not already present in the process env. */
    vars?: Record<string, string>;
    /** Sugar: allow env vars directly under env (string values only). */
    [key: string]: string | Record<string, string> | { enabled?: boolean; timeoutMs?: number } | undefined;
  };
  wizard?: {
    lastRunAt?: string;
    lastRunVersion?: string;
    lastRunCommit?: string;
    lastRunCommand?: string;
    lastRunMode?: "local" | "remote";
  };
  diagnostics?: DiagnosticsConfig;
  logging?: LoggingConfig;
  update?: {
    /** Update channel ("stable", "beta", or "next"). */
    channel?: "stable" | "beta" | "next";
    /** Check for updates on gateway start (npm installs only). */
    checkOnStart?: boolean;
    /** Core auto-update policy for package installs. */
    auto?: {
      /** Enable background auto-update checks and apply logic. Default: false. */
      enabled?: boolean;
      /** Stable channel minimum delay before auto-apply. Default: 6. */
      stableDelayHours?: number;
      /** Additional stable-channel jitter window. Default: 12. */
      stableJitterHours?: number;
      /** Beta channel check cadence. Default: 1 hour. */
      betaCheckIntervalHours?: number;
    };
  };
  browser?: BrowserConfig;
  ui?: {
    /** Accent color for RemoteClaw UI chrome (hex). */
    seamColor?: string;
    assistant?: {
      /** Assistant display name for UI surfaces. */
      name?: string;
      /** Assistant avatar (emoji, short text, or image URL/data URI). */
      avatar?: string;
    };
  };
  plugins?: PluginsConfig;
  nodeHost?: NodeHostConfig;
  agents?: AgentsConfig;
  tools?: ToolsConfig;
  bindings?: AgentBinding[];
  /**
   * Routing policy for messages that match no binding in multi-agent configs.
   *
   * - omitted / `"reject"`: Silent drop with telemetry.
   * - `{ agent: "id" }`: Route unmatched messages to the named agent (must exist in `agents.list`).
   *
   * Single-agent configs route to the sole agent regardless of this setting.
   */
  routing?: {
    unmatched?: "reject" | { agent: string };
  };
  broadcast?: BroadcastConfig;
  audio?: AudioConfig;
  messages?: MessagesConfig;
  commands?: CommandsConfig;
  session?: SessionConfig;
  web?: WebConfig;
  channels?: ChannelsConfig;
  cron?: CronConfig;
  hooks?: HooksConfig;
  discovery?: DiscoveryConfig;
  canvasHost?: CanvasHostConfig;
  talk?: TalkConfig;
  gateway?: GatewayConfig;
  /** Model catalog configuration (upstream feature). */
  models?: ModelsConfig;
  /** Access control policy configuration (upstream feature). */
  acp?: unknown;
  /** Secrets configuration (upstream feature). */
  secrets?: {
    providers?: Record<string, unknown>;
    defaults?: {
      env?: string;
      file?: string;
      exec?: string;
    };
    resolution?: Record<string, unknown>;
    [key: string]: unknown;
  };
  /** CLI configuration (upstream feature). */
  cli?: unknown;
  /** Skills configuration (upstream feature). */
  skills?: unknown;
  /** Media configuration (upstream feature). */
  media?: {
    /** TTL in hours for media cleanup. */
    ttlHours?: number;
    [key: string]: unknown;
  };
};

export type ConfigValidationIssue = {
  path: string;
  message: string;
  allowedValues?: string[];
  allowedValuesHiddenCount?: number;
};

export type LegacyConfigIssue = {
  path: string;
  message: string;
};

export type ConfigFileSnapshot = {
  path: string;
  exists: boolean;
  raw: string | null;
  parsed: unknown;
  /**
   * Config after $include resolution and ${ENV} substitution, but BEFORE runtime
   * defaults are applied. Use this for config set/unset operations to avoid
   * leaking runtime defaults into the written config file.
   */
  resolved: RemoteClawConfig;
  valid: boolean;
  config: RemoteClawConfig;
  hash?: string;
  issues: ConfigValidationIssue[];
  warnings: ConfigValidationIssue[];
  legacyIssues: LegacyConfigIssue[];
};
