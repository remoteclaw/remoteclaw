/**
 * Shared state for Mattermost slash commands.
 *
 * Bridges the plugin registration phase (HTTP route) with the monitor phase
 * (command registration with MM API). The HTTP handler needs to know which
 * tokens are valid, and the monitor needs to store registered command IDs.
 *
 * State is kept per-account so that multi-account deployments don't
 * overwrite each other's tokens, registered commands, or handlers.
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import {
  applyBasicWebhookRequestGuards,
  createFixedWindowRateLimiter,
  isRequestBodyLimitError,
  readRequestBodyWithLimit,
  type RemoteClawConfig,
  type RemoteClawPluginApi,
  requestBodyErrorToText,
  resolveRequestClientIp,
  safeEqualSecret,
  WEBHOOK_RATE_LIMIT_DEFAULTS,
} from "remoteclaw/plugin-sdk/mattermost";
import type { ResolvedMattermostAccount } from "./accounts.js";
import { resolveSlashCommandConfig, type MattermostRegisteredCommand } from "./slash-commands.js";
import { createSlashCommandHttpHandler } from "./slash-http.js";

// ─── Per-account state ───────────────────────────────────────────────────────

export type SlashCommandAccountState = {
  /** Registered commands, used for per-command token validation and cleanup. */
  registeredCommands: MattermostRegisteredCommand[];
  /** Current HTTP handler for this account. */
  handler: ((req: IncomingMessage, res: ServerResponse) => Promise<void>) | null;
  /** The account that activated slash commands. */
  account: ResolvedMattermostAccount;
  /** Map from trigger to original command name (for skill commands that start with oc_). */
  triggerMap: Map<string, string>;
};

/** Map from accountId → per-account slash command state. */
const accountStates = new Map<string, SlashCommandAccountState>();

export function resolveSlashHandlerForToken(token: string): {
  kind: "none" | "single" | "ambiguous";
  handler?: (req: IncomingMessage, res: ServerResponse) => Promise<void>;
  accountIds?: string[];
} {
  const matches: Array<{
    accountId: string;
    handler: (req: IncomingMessage, res: ServerResponse) => Promise<void>;
  }> = [];

  for (const [accountId, state] of accountStates) {
    const matchesToken = state.registeredCommands.some((command) =>
      safeEqualSecret(token, command.token),
    );
    if (matchesToken && state.handler) {
      matches.push({ accountId, handler: state.handler });
    }
  }

  if (matches.length === 0) {
    return { kind: "none" };
  }
  if (matches.length === 1) {
    return { kind: "single", handler: matches[0].handler, accountIds: [matches[0].accountId] };
  }

  return {
    kind: "ambiguous",
    accountIds: matches.map((entry) => entry.accountId),
  };
}

/**
 * Get the slash command state for a specific account, or null if not activated.
 */
export function getSlashCommandState(accountId: string): SlashCommandAccountState | null {
  return accountStates.get(accountId) ?? null;
}

/**
 * Get all active slash command account states.
 */
export function getAllSlashCommandStates(): ReadonlyMap<string, SlashCommandAccountState> {
  return accountStates;
}

/**
 * Activate slash commands for a specific account.
 * Called from the monitor after bot connects.
 */
export function activateSlashCommands(params: {
  account: ResolvedMattermostAccount;
  registeredCommands: MattermostRegisteredCommand[];
  triggerMap?: Map<string, string>;
  api: {
    cfg: import("remoteclaw/plugin-sdk/mattermost").RemoteClawConfig;
    runtime: import("remoteclaw/plugin-sdk/mattermost").RuntimeEnv;
  };
  log?: (msg: string) => void;
}) {
  const { account, registeredCommands, triggerMap, api, log } = params;
  const accountId = account.accountId;

  const handler = createSlashCommandHttpHandler({
    account,
    cfg: api.cfg,
    runtime: api.runtime,
    registeredCommands,
    triggerMap,
    log,
  });

  accountStates.set(accountId, {
    registeredCommands,
    handler,
    account,
    triggerMap: triggerMap ?? new Map(),
  });

  log?.(
    `mattermost: slash commands activated for account ${accountId} (${registeredCommands.length} commands)`,
  );
}

/**
 * Deactivate slash commands for a specific account (on shutdown/disconnect).
 */
export function deactivateSlashCommands(accountId?: string) {
  if (accountId) {
    const state = accountStates.get(accountId);
    if (state) {
      state.registeredCommands = [];
      state.handler = null;
      accountStates.delete(accountId);
    }
  } else {
    // Deactivate all accounts (full shutdown)
    for (const [, state] of accountStates) {
      state.registeredCommands = [];
      state.handler = null;
    }
    accountStates.clear();
  }
}

/**
 * Resolve the per-source rate-limit key for a slash callback request.
 *
 * Keyed by `${callbackPath}:${clientIp}` so each registered callback path gets
 * an isolated budget per client IP. When trusted proxies are configured the
 * forwarded client IP is used; otherwise the socket peer address. Falls back to
 * "unknown" when no address can be resolved (still bounded — a shared bucket).
 */
function resolveSlashCallbackRateLimitKey(
  req: IncomingMessage,
  callbackPath: string,
  config?: RemoteClawConfig,
): string {
  const clientIp =
    resolveRequestClientIp(
      req,
      config?.gateway?.trustedProxies,
      config?.gateway?.allowRealIpFallback === true,
    ) ?? "unknown";
  return `${callbackPath}:${clientIp}`;
}

/**
 * Register the HTTP route for slash command callbacks.
 * Called during plugin registration.
 *
 * The single HTTP route dispatches to the correct per-account handler
 * by matching the inbound token against each account's registered tokens.
 */
export function registerSlashCommandRoute(api: RemoteClawPluginApi) {
  const mmConfig = api.config.channels?.mattermost as Record<string, unknown> | undefined;

  // Collect callback paths from both top-level and per-account config.
  // Command registration uses account.config.commands, so the HTTP route
  // registration must include any account-specific callbackPath overrides.
  // Also extract the pathname from an explicit callbackUrl when it differs
  // from callbackPath, so that Mattermost callbacks hit a registered route.
  const callbackPaths = new Set<string>();

  const addCallbackPaths = (
    raw: Partial<import("./slash-commands.js").MattermostSlashCommandConfig> | undefined,
  ) => {
    const resolved = resolveSlashCommandConfig(raw);
    callbackPaths.add(resolved.callbackPath);
    if (resolved.callbackUrl) {
      try {
        const urlPath = new URL(resolved.callbackUrl).pathname;
        if (urlPath && urlPath !== resolved.callbackPath) {
          callbackPaths.add(urlPath);
        }
      } catch {
        // Invalid URL — ignore, will be caught during registration
      }
    }
  };

  const commandsRaw = mmConfig?.commands as
    | Partial<import("./slash-commands.js").MattermostSlashCommandConfig>
    | undefined;
  addCallbackPaths(commandsRaw);

  const accountsRaw = (mmConfig?.accounts ?? {}) as Record<string, unknown>;
  for (const accountId of Object.keys(accountsRaw)) {
    const accountCfg = accountsRaw[accountId] as Record<string, unknown> | undefined;
    const accountCommandsRaw = accountCfg?.commands as
      | Partial<import("./slash-commands.js").MattermostSlashCommandConfig>
      | undefined;
    addCallbackPaths(accountCommandsRaw);
  }

  // One per-source fixed-window limiter shared across every registered callback
  // path. Keying by `${callbackPath}:${clientIp}` isolates each path's budget
  // per source while a single instance bounds total tracked keys.
  const slashCallbackRateLimiter = createFixedWindowRateLimiter({
    windowMs: WEBHOOK_RATE_LIMIT_DEFAULTS.windowMs,
    maxRequests: WEBHOOK_RATE_LIMIT_DEFAULTS.maxRequests,
    maxTrackedKeys: WEBHOOK_RATE_LIMIT_DEFAULTS.maxTrackedKeys,
  });

  const handleSlashCallback = async (
    req: IncomingMessage,
    res: ServerResponse,
    callbackPath: string,
  ) => {
    // Bound the externally reachable callback route per source before any body
    // read or token routing. The method pre-check (405) runs before the rate
    // check, so non-POST probes spend no budget; invalid-token floods and
    // slow-drip clients are counted in the same window as any later request
    // from that source. Mirrors the telegram/feishu/zalo/googlechat guards.
    // No content-type gate: Mattermost callbacks are form-urlencoded or JSON.
    if (
      !applyBasicWebhookRequestGuards({
        req,
        res,
        allowMethods: ["POST"],
        rateLimiter: slashCallbackRateLimiter,
        rateLimitKey: resolveSlashCallbackRateLimitKey(req, callbackPath, api.config),
      })
    ) {
      return;
    }

    if (accountStates.size === 0) {
      res.statusCode = 503;
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.end(
        JSON.stringify({
          response_type: "ephemeral",
          text: "Slash commands are not yet initialized. Please try again in a moment.",
        }),
      );
      return;
    }

    // We need to peek at the token to route to the right account handler.
    // Since each account handler also validates the token, we find the
    // account whose token set contains the inbound token and delegate.

    // If there's only one active account (common case), route directly.
    if (accountStates.size === 1) {
      const [, state] = [...accountStates.entries()][0];
      if (!state.handler) {
        res.statusCode = 503;
        res.setHeader("Content-Type", "application/json; charset=utf-8");
        res.end(
          JSON.stringify({
            response_type: "ephemeral",
            text: "Slash commands are not yet initialized. Please try again in a moment.",
          }),
        );
        return;
      }
      await state.handler(req, res);
      return;
    }

    // Multi-account: buffer the body, find the matching account by token,
    // then replay the request to the correct handler. Bound the read by size
    // AND time (the timeout guards against Slowloris-style slow-drip clients).
    let bodyStr: string;
    try {
      bodyStr = await readRequestBodyWithLimit(req, {
        maxBytes: 64 * 1024,
        timeoutMs: 5_000,
      });
    } catch (err) {
      if (isRequestBodyLimitError(err)) {
        res.statusCode = err.statusCode;
        res.end(requestBodyErrorToText(err.code));
      } else {
        res.statusCode = 400;
        res.end("Bad Request");
      }
      return;
    }

    // Parse just the token to find the right account
    let token: string | null = null;
    const ct = req.headers["content-type"] ?? "";
    try {
      if (ct.includes("application/json")) {
        token = (JSON.parse(bodyStr) as { token?: string }).token ?? null;
      } else {
        token = new URLSearchParams(bodyStr).get("token");
      }
    } catch {
      // parse failed — will be caught by handler
    }

    const match = token ? resolveSlashHandlerForToken(token) : { kind: "none" as const };

    if (match.kind === "none") {
      // No matching account — reject
      res.statusCode = 401;
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.end(
        JSON.stringify({
          response_type: "ephemeral",
          text: "Unauthorized: invalid command token.",
        }),
      );
      return;
    }

    if (match.kind === "ambiguous") {
      api.logger.warn?.(
        `mattermost: slash callback token matched multiple accounts (${match.accountIds?.join(", ")})`,
      );
      res.statusCode = 409;
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.end(
        JSON.stringify({
          response_type: "ephemeral",
          text: "Conflict: command token is not unique across accounts.",
        }),
      );
      return;
    }

    const matchedHandler = match.handler!;

    // Replay: create a synthetic readable that re-emits the buffered body
    const { Readable } = await import("node:stream");
    const syntheticReq = new Readable({
      read() {
        this.push(Buffer.from(bodyStr, "utf8"));
        this.push(null);
      },
    }) as IncomingMessage;

    // Copy necessary IncomingMessage properties
    syntheticReq.method = req.method;
    syntheticReq.url = req.url;
    syntheticReq.headers = req.headers;

    await matchedHandler(syntheticReq, res);
  };

  for (const callbackPath of callbackPaths) {
    api.registerHttpRoute({
      path: callbackPath,
      auth: "plugin",
      handler: (req, res) => handleSlashCallback(req, res, callbackPath),
    });
  }
}
