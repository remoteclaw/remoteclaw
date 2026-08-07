// Defines plugin tool metadata and filesystem policy types.
import type { ToolFsPolicy } from "../agents/tool-fs-policy.types.js";
import type { AnyAgentTool } from "../agents/tools/common.js";
import type { RemoteClawConfig } from "../config/types.remoteclaw.js";
import type { HookEntry } from "../hooks/types.js";
import type { DeliveryContext } from "../utils/delivery-context.types.js";

export type RemoteClawPluginActiveModelContext = {
  provider?: string;
  modelId?: string;
  modelRef?: string;
};

/** Trusted execution context passed to plugin-owned agent tool factories. */
export type RemoteClawPluginToolContext = {
  config?: RemoteClawConfig;
  /** Active runtime-resolved config snapshot when one is available. */
  runtimeConfig?: RemoteClawConfig;
  /** Returns the latest runtime-resolved config snapshot for long-lived tool definitions. */
  getRuntimeConfig?: () => RemoteClawConfig | undefined;
  /** Effective filesystem policy for the active tool run. */
  fsPolicy?: ToolFsPolicy;
  workspaceDir?: string;
  agentDir?: string;
  agentId?: string;
  sessionKey?: string;
  /** Ephemeral session UUID - regenerated on /new and /reset. Use for per-conversation isolation. */
  sessionId?: string;
  /**
   * Runtime-supplied active model metadata for informational use, diagnostics,
   * and plugin-owned policy decisions. This is not a security boundary against
   * the local operator, installed plugin code, or a modified RemoteClaw runtime.
   */
  activeModel?: RemoteClawPluginActiveModelContext;
  browser?: {
    sandboxBridgeUrl?: string;
    allowHostControl?: boolean;
  };
  messageChannel?: string;
  agentAccountId?: string;
  /** Trusted provider auth availability from the active auth profile store. */
  hasAuthForProvider?: (providerId: string) => boolean;
  /** Resolves an API key from the active auth profile store when available. */
  resolveApiKeyForProvider?: (providerId: string) => Promise<string | undefined>;
  /** Trusted ambient delivery route for the active agent/session. */
  deliveryContext?: DeliveryContext;
  /** Trusted sender id from inbound context (runtime-provided, not tool args). */
  requesterSenderId?: string;
  /** Trusted owner bit from inbound context (runtime-provided, not tool args). */
  senderIsOwner?: boolean;
  sandboxed?: boolean;
  /**
   * True for explicit one-shot local CLI runs that must release plugin-owned
   * process resources before the command exits.
   */
  oneShotCliRun?: boolean;
};

export type RemoteClawPluginToolFactory = (
  ctx: RemoteClawPluginToolContext,
) => AnyAgentTool | AnyAgentTool[] | null | undefined;

export type RemoteClawPluginToolOptions = {
  name?: string;
  names?: string[];
  optional?: boolean;
};

export type RemoteClawPluginHookOptions = {
  entry?: HookEntry;
  name?: string;
  description?: string;
  register?: boolean;
};
