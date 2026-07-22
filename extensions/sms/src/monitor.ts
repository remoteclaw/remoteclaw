// SMS inbound gateway lifecycle: registers the public Twilio webhook route on
// the gateway's plugin HTTP-route registry and tears it down on abort.
// See `startSmsAccountWebhook` below for the route's authentication model.

import type { ChannelGatewayContext } from "../../../src/channels/plugins/types.adapters.js";
import { registerPluginHttpRoute } from "../../../src/plugins/http-registry.js";
import { isSmsAccountConfigured, resolveSmsAccount } from "./accounts.js";
import { createSmsWebhookHandler } from "./inbound.js";
import { getSmsRuntime } from "./runtime.js";
import type { ResolvedSmsAccount } from "./types.js";

const DEFAULT_SMS_WEBHOOK_PATH = "/webhooks/sms";

/** Live route unregister hooks, keyed by `accountId:path`. */
const activeRouteUnregisters = new Map<string, () => void>();

export function getSmsActiveRouteCountForTest(): number {
  return activeRouteUnregisters.size;
}

function waitUntilAbort(signal: AbortSignal | undefined, onAbort?: () => void): Promise<void> {
  return new Promise<void>((resolve) => {
    const complete = () => {
      onAbort?.();
      resolve();
    };
    if (!signal) {
      // No abort signal: never resolve. The gateway treats a resolved
      // startAccount as "channel exited" and restarts it in a loop.
      return;
    }
    if (signal.aborted) {
      complete();
      return;
    }
    signal.addEventListener("abort", complete, { once: true });
  });
}

/**
 * Register the PUBLIC Twilio inbound webhook for one SMS account.
 *
 * ## Why this route is public — and what actually authenticates it
 *
 * The route is registered with `auth: "plugin"`. In this fork, plugin-route
 * gateway auth is gutted to always pass (src/gateway/server-http.ts — "Plugin
 * route gateway auth gutted in RemoteClaw fork — always pass."), so the route
 * is reachable from the internet WITHOUT the gateway operator credential.
 *
 * That is required, not accidental: Twilio's servers POST inbound SMS here and
 * cannot present an operator credential. The authentication boundary is
 * therefore the `X-Twilio-Signature` HMAC verified in-handler (inbound.ts),
 * which is fail-closed and runs before any message is handed to the runtime.
 *
 * This mirrors the established fork-native pattern used by the live peers
 * `extensions/synology-chat` and `extensions/mattermost` plus the built-in
 * `line` channel. It does NOT revive upstream's gutted `webhook-ingress`.
 */
export async function startSmsAccountWebhook(
  ctx: ChannelGatewayContext<ResolvedSmsAccount>,
): Promise<unknown> {
  const { cfg, accountId, log } = ctx;
  const account = resolveSmsAccount(cfg, accountId);

  if (!account.enabled) {
    log?.info(`SMS account ${accountId} is disabled; not registering inbound webhook`);
    return waitUntilAbort(ctx.abortSignal);
  }
  if (!isSmsAccountConfigured(account)) {
    log?.warn(
      `SMS account ${accountId} is not fully configured (needs accountSid, authToken and fromNumber or messagingServiceSid); not registering inbound webhook`,
    );
    return waitUntilAbort(ctx.abortSignal);
  }
  // Fail closed at startup: without a public URL we cannot reconstruct the
  // exact string Twilio signed, so every signature check would fail anyway.
  // Refusing to open the port is better than opening one that 403s everything.
  if (!account.dangerouslyDisableSignatureValidation && !account.publicWebhookUrl) {
    log?.warn(
      `SMS account ${accountId} has no publicWebhookUrl (channels.sms.publicWebhookUrl / SMS_PUBLIC_WEBHOOK_URL); ` +
        `X-Twilio-Signature cannot be verified, so the inbound webhook was NOT registered`,
    );
    return waitUntilAbort(ctx.abortSignal);
  }
  if (account.dangerouslyDisableSignatureValidation) {
    log?.warn(
      `SMS account ${accountId}: dangerouslyDisableSignatureValidation=true — registering an UNAUTHENTICATED public webhook at ${account.webhookPath}. Local testing only.`,
    );
  }

  const handler = createSmsWebhookHandler({
    account,
    cfg,
    runtime: getSmsRuntime(),
    log: {
      info: (msg) => log?.info(msg),
      warn: (msg) => log?.warn(msg),
      error: (msg) => log?.error(msg),
      debug: (msg) => log?.debug?.(msg),
    },
  });

  // Drop any stale route left by a previous start (auto-restart / config
  // reload) before re-registering, mirroring the synology-chat peer.
  const routeKey = `${accountId}:${account.webhookPath}`;
  const previous = activeRouteUnregisters.get(routeKey);
  if (previous) {
    log?.info(
      `Deregistering stale SMS webhook route before re-registering: ${account.webhookPath}`,
    );
    previous();
    activeRouteUnregisters.delete(routeKey);
  }

  const unregister = registerPluginHttpRoute({
    path: account.webhookPath,
    fallbackPath: DEFAULT_SMS_WEBHOOK_PATH,
    handler,
    auth: "plugin",
    replaceExisting: true,
    pluginId: "sms",
    accountId: account.accountId,
    log: (msg: string) => log?.info(msg),
  });
  activeRouteUnregisters.set(routeKey, unregister);
  log?.info(`Registered SMS inbound webhook route ${account.webhookPath} (account: ${accountId})`);

  // Stay pending for the lifetime of the channel: the gateway restarts an
  // account whose startAccount resolves.
  return waitUntilAbort(ctx.abortSignal, () => {
    log?.info(`Stopping SMS inbound webhook (account: ${accountId})`);
    unregister();
    activeRouteUnregisters.delete(routeKey);
  });
}

export async function stopSmsAccountWebhook(
  ctx: ChannelGatewayContext<ResolvedSmsAccount>,
): Promise<void> {
  const account = resolveSmsAccount(ctx.cfg, ctx.accountId);
  const routeKey = `${ctx.accountId}:${account.webhookPath}`;
  const unregister = activeRouteUnregisters.get(routeKey);
  if (unregister) {
    unregister();
    activeRouteUnregisters.delete(routeKey);
  }
  ctx.log?.info(`SMS account ${ctx.accountId} stopped`);
}
