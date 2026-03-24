import type { loadConfig } from "../config/config.js";
import { loadRemoteClawPlugins } from "../plugins/loader.js";
import type { GatewayRequestContext, GatewayRequestHandler } from "./server-methods/types.js";

// ── Fallback gateway context for non-WS paths (Telegram, WhatsApp, etc.) ──
// The WS path sets a per-request scope via AsyncLocalStorage, but channel
// adapters (Telegram polling, etc.) invoke the agent directly without going
// through handleGatewayRequest. We store the gateway context at startup so
// plugin subagent dispatch can use it as a fallback.

const FALLBACK_GATEWAY_CONTEXT_STATE_KEY: unique symbol = Symbol.for(
  "openclaw.fallbackGatewayContextState",
);

type FallbackGatewayContextState = {
  context: GatewayRequestContext | undefined;
};

const fallbackGatewayContextState = (() => {
  const globalState = globalThis as typeof globalThis & {
    [FALLBACK_GATEWAY_CONTEXT_STATE_KEY]?: FallbackGatewayContextState;
  };
  const existing = globalState[FALLBACK_GATEWAY_CONTEXT_STATE_KEY];
  if (existing) {
    return existing;
  }
  const created: FallbackGatewayContextState = { context: undefined };
  globalState[FALLBACK_GATEWAY_CONTEXT_STATE_KEY] = created;
  return created;
})();

export function setFallbackGatewayContext(ctx: GatewayRequestContext): void {
  // TODO: This startup snapshot can become stale if runtime config/context changes.
  fallbackGatewayContextState.context = ctx;
}

// ── Plugin loading ──────────────────────────────────────────────────

export function loadGatewayPlugins(params: {
  cfg: ReturnType<typeof loadConfig>;
  workspaceDir: string;
  log: {
    info: (msg: string) => void;
    warn: (msg: string) => void;
    error: (msg: string) => void;
    debug: (msg: string) => void;
  };
  coreGatewayHandlers: Record<string, GatewayRequestHandler>;
  baseMethods: string[];
  preferSetupRuntimeForChannelPlugins?: boolean;
  logDiagnostics?: boolean;
}) {
  const pluginRegistry = loadRemoteClawPlugins({
    config: params.cfg,
    workspaceDir: params.workspaceDir,
    logger: {
      info: (msg: string) => params.log.info(msg),
      warn: (msg: string) => params.log.warn(msg),
      error: (msg: string) => params.log.error(msg),
      debug: (msg: string) => params.log.debug(msg),
    },
    coreGatewayHandlers: params.coreGatewayHandlers,
    preferSetupRuntimeForChannelPlugins: params.preferSetupRuntimeForChannelPlugins,
  });
  const pluginMethods = Object.keys(pluginRegistry.gatewayHandlers);
  const gatewayMethods = Array.from(new Set([...params.baseMethods, ...pluginMethods]));
  if ((params.logDiagnostics ?? true) && pluginRegistry.diagnostics.length > 0) {
    for (const diag of pluginRegistry.diagnostics) {
      const details = [
        diag.pluginId ? `plugin=${diag.pluginId}` : null,
        diag.source ? `source=${diag.source}` : null,
      ]
        .filter((entry): entry is string => Boolean(entry))
        .join(", ");
      const message = details
        ? `[plugins] ${diag.message} (${details})`
        : `[plugins] ${diag.message}`;
      if (diag.level === "error") {
        params.log.error(message);
      } else {
        params.log.info(message);
      }
    }
  }
  return { pluginRegistry, gatewayMethods };
}
