import type { IncomingMessage, ServerResponse } from "node:http";
import type { RemoteClawConfig } from "../../../src/config/config.js";
import { resolveClientIp } from "../../../src/gateway/net.js";
import {
  resolveDirectDmAuthorizationOutcome,
  resolveSenderCommandAuthorizationWithRuntime,
} from "../../../src/plugin-sdk/command-auth.js";
import { resolveInboundRouteEnvelopeBuilderWithRuntime } from "../../../src/plugin-sdk/inbound-envelope.js";
import { createScopedPairingAccess } from "../../../src/plugin-sdk/pairing-access.js";
import {
  createFixedWindowRateLimiter,
  WEBHOOK_RATE_LIMIT_DEFAULTS,
} from "../../../src/plugin-sdk/webhook-memory-guards.js";
import { applyBasicWebhookRequestGuards } from "../../../src/plugin-sdk/webhook-request-guards.js";
import type { PluginHttpRouteHandler } from "../../../src/plugins/http-registry.js";
import type { PluginRuntime } from "../../../src/plugins/runtime/types.js";
import { normalizeSmsAllowFrom } from "./phone.js";
import { sendSmsTextChunks } from "./send.js";
import {
  buildTwilioInboundMessage,
  readTwilioWebhookForm,
  resolveTwilioWebhookSignatureUrl,
  respondTwiml,
  verifyTwilioSignature,
} from "./twilio.js";
import type { ResolvedSmsAccount } from "./types.js";

/**
 * Shared in-memory fixed-window limiter for the public SMS webhook.
 *
 * This route is reachable without the gateway operator credential (see the
 * module header on monitor.ts), so it is rate-limited before any body is read
 * to bound the cost of unauthenticated traffic. Peer: extensions/zalo's
 * monitor.webhook.ts, which uses the same kept primitive.
 */
const smsWebhookRateLimiter = createFixedWindowRateLimiter({
  windowMs: WEBHOOK_RATE_LIMIT_DEFAULTS.windowMs,
  maxRequests: WEBHOOK_RATE_LIMIT_DEFAULTS.maxRequests,
  maxTrackedKeys: WEBHOOK_RATE_LIMIT_DEFAULTS.maxTrackedKeys,
});

/**
 * Bounded replay/retry dedup for the public SMS webhook, keyed by `MessageSid`.
 *
 * Twilio's `X-Twilio-Signature` carries no timestamp and no nonce, so a
 * captured, signature-valid POST stays valid indefinitely and can be replayed
 * to re-inject the same inbound message into the agent (#3035). A fixed-window
 * limiter with `maxRequests: 1` IS a bounded dedup: the first request carrying
 * a given sid passes, any repeat inside the window is a replay. Reuses the same
 * kept primitive as `smsWebhookRateLimiter` above, so memory stays bounded —
 * `maxTrackedKeys` LRU-evicts the least-recently-seen sids.
 *
 * The window also makes legitimate Twilio retries idempotent: a redelivered
 * webhook is ACKed without re-running the agent.
 *
 * Two bounds are deliberately accepted for this LOW-severity hardening:
 *  - Per-process and in-memory, exactly like the rate limiter above: a restart
 *    or a second gateway instance starts with an empty window.
 *  - Fixed window rather than a sliding TTL: a replay that arrives after the
 *    window has elapsed is allowed through again.
 * Both are acceptable because Twilio retries and duplicates land within
 * minutes, and presenting a sid at all still requires a signature-valid request
 * (i.e. the account auth token) — this guard sits AFTER signature validation.
 */
const SMS_REPLAY_WINDOW_MS = 5 * 60_000;
const SMS_REPLAY_MAX_TRACKED_SIDS = 2_048;

const smsReplayGuard = createFixedWindowRateLimiter({
  windowMs: SMS_REPLAY_WINDOW_MS,
  maxRequests: 1,
  maxTrackedKeys: SMS_REPLAY_MAX_TRACKED_SIDS,
});

export function clearSmsWebhookRateLimitStateForTest(): void {
  smsWebhookRateLimiter.clear();
  smsReplayGuard.clear();
}

export type SmsWebhookLog = {
  info?: (msg: string) => void;
  warn?: (msg: string) => void;
  error?: (msg: string) => void;
  debug?: (msg: string) => void;
};

export type CreateSmsWebhookHandlerParams = {
  /** Account resolved when the route was registered; the per-request fallback. */
  account: ResolvedSmsAccount;
  /** Config loaded when the route was registered; the per-request fallback. */
  cfg: RemoteClawConfig;
  runtime: PluginRuntime;
  log?: SmsWebhookLog;
};

function headerValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function isSmsSenderAllowed(senderId: string, allowFrom: string[]): boolean {
  const normalizedSender = normalizeSmsAllowFrom(senderId);
  if (!normalizedSender) {
    return false;
  }
  for (const entry of allowFrom) {
    const normalizedEntry = normalizeSmsAllowFrom(String(entry));
    if (!normalizedEntry) {
      continue;
    }
    if (normalizedEntry === "*" || normalizedEntry === normalizedSender) {
      return true;
    }
  }
  return false;
}

/**
 * Build the public inbound webhook handler for one SMS account.
 *
 * Security contract (see monitor.ts for why this handler *is* the auth
 * boundary):
 *  1. POST-only + IP rate limit before the body is read.
 *  2. `X-Twilio-Signature` is verified fail-closed against the account auth
 *     token before ANY message reaches the runtime. Missing/invalid/unsigned
 *     ⇒ 403 and no delivery.
 *  3. A signature-valid POST is deduped by `MessageSid` before delivery, so a
 *     captured request cannot be replayed into repeated agent runs (#3035).
 *  4. Allowlist authorization is default-deny via the shared command-auth path.
 *  5. Every response body is empty TwiML: no secret, token, or signature is
 *     echoed back to the caller.
 */
export function createSmsWebhookHandler(
  params: CreateSmsWebhookHandlerParams,
): PluginHttpRouteHandler {
  // The account + config snapshot taken when the route was registered is used
  // for every request. Deliberately NOT reloaded per request: `loadConfig()` is
  // synchronous, so a per-request read on a PUBLIC pre-authentication path
  // would let unauthenticated traffic amplify into blocking disk reads. The
  // channel is restarted on `channels.sms` config changes
  // (`reload.configPrefixes` in channel.ts), which is what refreshes this
  // snapshot. Peer: extensions/zalo captures config at target registration too.
  const { account, cfg, log } = params;
  return async (req: IncomingMessage, res: ServerResponse): Promise<boolean> => {
    try {
      const clientIp =
        resolveClientIp({
          remoteAddr: req.socket.remoteAddress,
          forwardedFor: headerValue(req.headers["x-forwarded-for"]),
          realIp: headerValue(req.headers["x-real-ip"]),
          trustedProxies: cfg.gateway?.trustedProxies,
          allowRealIpFallback: cfg.gateway?.allowRealIpFallback === true,
        }) ??
        req.socket.remoteAddress ??
        "unknown";

      // Method + rate-limit guard first: an unauthenticated caller must not be
      // able to make us read an unbounded number of request bodies.
      // NOTE: `requireJsonContentType` is deliberately NOT set — Twilio POSTs
      // `application/x-www-form-urlencoded`, so demanding JSON would 415 every
      // legitimate inbound message.
      if (
        !applyBasicWebhookRequestGuards({
          req,
          res,
          allowMethods: ["POST"],
          rateLimiter: smsWebhookRateLimiter,
          rateLimitKey: `${account.accountId}:${clientIp}`,
        })
      ) {
        return true;
      }

      // The Twilio signature is computed over the POST parameters, so the body
      // must be parsed before it can be verified. `readTwilioWebhookForm`
      // (PR-1) applies the shared size + timeout caps, so this read is bounded.
      const form = await readTwilioWebhookForm(req);

      if (account.dangerouslyDisableSignatureValidation) {
        log?.warn?.(
          `[sms] account ${account.accountId}: X-Twilio-Signature validation is DISABLED ` +
            `(dangerouslyDisableSignatureValidation=true). This public endpoint is UNAUTHENTICATED — ` +
            `anyone who can reach it can inject messages into the agent. Do not use outside local testing.`,
        );
      } else {
        const signatureUrl = resolveTwilioWebhookSignatureUrl({
          req,
          publicWebhookUrl: account.publicWebhookUrl,
        });
        const signature = headerValue(req.headers["x-twilio-signature"]);
        if (
          !verifyTwilioSignature({
            signature,
            url: signatureUrl,
            authToken: account.authToken,
            form,
          })
        ) {
          // Fail closed. No detail is returned to the caller — a forged POST
          // learns nothing about why it was rejected.
          log?.warn?.(
            `[sms] rejected inbound webhook for account ${account.accountId}: invalid or missing X-Twilio-Signature`,
          );
          respondTwiml(res, 403);
          return true;
        }
      }

      const inbound = buildTwilioInboundMessage(form);
      if (!inbound) {
        log?.debug?.(
          `[sms] dropped malformed inbound webhook payload for account ${account.accountId}`,
        );
        respondTwiml(res, 400);
        return true;
      }

      // Replay dedup (#3035), after signature validation and before any
      // delivery: a signature-valid POST is only acted on once per `MessageSid`
      // inside the window. `buildTwilioInboundMessage` already rejects a blank
      // sid with 400 above, so this is unreachable with an empty key; the
      // explicit check keeps a future relaxation of that guard from coalescing
      // distinct messages under one blank key.
      if (
        inbound.messageSid &&
        smsReplayGuard.isRateLimited(`${account.accountId}:${inbound.messageSid}`)
      ) {
        log?.info?.(
          `[sms] ignored duplicate inbound webhook for account ${account.accountId} ` +
            `(MessageSid ${inbound.messageSid} already handled)`,
        );
        // Same empty-TwiML ACK as the success path: a replay learns nothing
        // from the response, and a legitimate Twilio retry is satisfied.
        respondTwiml(res, 200);
        return true;
      }

      await deliverSmsInbound({ account, cfg, runtime: params.runtime, inbound, log });
      respondTwiml(res, 200);
      return true;
    } catch (err) {
      // ACK so Twilio does not retry-storm a request we already consumed, but
      // make the failure loud on our side.
      log?.error?.(`[sms] inbound webhook failed for account ${account.accountId}: ${String(err)}`);
      if (!res.headersSent) {
        respondTwiml(res, 200);
      }
      return true;
    }
  };
}

async function deliverSmsInbound(params: {
  account: ResolvedSmsAccount;
  cfg: RemoteClawConfig;
  runtime: PluginRuntime;
  inbound: { from: string; to: string; body: string; messageSid: string };
  log?: SmsWebhookLog;
}): Promise<void> {
  const { account, cfg, runtime, inbound, log } = params;
  const core = runtime.channel;
  const pairing = createScopedPairingAccess({
    core: runtime,
    channel: "sms",
    accountId: account.accountId,
  });

  // Authorization flows through the SAME kept command-auth path every other
  // channel uses — no bespoke allowlist check. `commandAuthorized` is
  // `undefined` when the body is not a control command; finalizeInboundContext
  // then collapses it to `false` (default-deny).
  const { senderAllowedForCommands, commandAuthorized } =
    await resolveSenderCommandAuthorizationWithRuntime({
      cfg,
      rawBody: inbound.body,
      isGroup: false,
      dmPolicy: account.dmPolicy,
      configuredAllowFrom: account.allowFrom,
      senderId: inbound.from,
      isSenderAllowed: isSmsSenderAllowed,
      readAllowFromStore: pairing.readAllowFromStore,
      runtime: core.commands,
    });

  const dmOutcome = resolveDirectDmAuthorizationOutcome({
    isGroup: false,
    dmPolicy: account.dmPolicy,
    senderAllowedForCommands,
  });
  if (dmOutcome !== "allowed") {
    // Drop silently. Unlike the chat channels, SMS replies cost money per
    // segment and are billed to the operator, so an unauthorized sender must
    // not be able to trigger any outbound message (including a pairing
    // challenge). Pairing enrollment for SMS is deferred — see the PR body.
    log?.info?.(
      `[sms] dropped unauthorized inbound from ${inbound.from} (account=${account.accountId}, dmPolicy=${account.dmPolicy}, outcome=${dmOutcome})`,
    );
    return;
  }

  const { route, buildEnvelope } = resolveInboundRouteEnvelopeBuilderWithRuntime({
    cfg,
    channel: "sms",
    accountId: account.accountId,
    // SMS is strictly 1:1. The route peer union is
    // "direct" | "group" | "channel" — there is no "dm" member.
    peer: { kind: "direct" as const, id: inbound.from },
    runtime: core,
    sessionStore: cfg.session?.store,
  });

  const { storePath, body } = buildEnvelope({
    channel: "SMS",
    from: inbound.from,
    body: inbound.body,
    timestamp: Date.now(),
  });

  const ctx = core.reply.finalizeInboundContext({
    Body: body,
    BodyForAgent: inbound.body,
    RawBody: inbound.body,
    CommandBody: inbound.body,
    From: `sms:${inbound.from}`,
    To: `sms:${inbound.to}`,
    SessionKey: route.sessionKey,
    AccountId: route.accountId,
    ChatType: "direct",
    ConversationLabel: inbound.from,
    SenderId: inbound.from,
    Provider: "sms",
    Surface: "sms",
    MessageSid: inbound.messageSid,
    CommandAuthorized: commandAuthorized,
    OriginatingChannel: "sms",
    OriginatingTo: `sms:${inbound.from}`,
  });

  await core.session.recordInboundSession({
    storePath,
    sessionKey: ctx.SessionKey ?? route.sessionKey,
    ctx,
    onRecordError: (err) => {
      log?.error?.(`[sms] failed updating session meta: ${String(err)}`);
    },
  });

  // Replies leave out-of-band over the Twilio REST API; the TwiML response to
  // this request stays an empty ACK (push model, like zalo/LINE).
  await core.reply.dispatchReplyWithBufferedBlockDispatcher({
    ctx,
    cfg,
    dispatcherOptions: {
      deliver: async (payload) => {
        const text = payload.text?.trim();
        if (!text) {
          return;
        }
        await sendSmsTextChunks({ account, to: inbound.from, text });
      },
      onError: (err, info) => {
        log?.error?.(
          `[sms] account ${account.accountId}: ${info.kind} reply delivery failed: ${String(err)}`,
        );
      },
    },
  });
}
