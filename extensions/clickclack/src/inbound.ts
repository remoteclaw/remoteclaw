/**
 * Converts authorized ClickClack messages into RemoteClaw agent replies and
 * routes resulting outbound text back to ClickClack.
 *
 * Upstream also carried a `replyMode: "model"` branch that called
 * `runtime.llm.complete(...)` for short in-process bot replies. This fork's
 * `PluginRuntime` ships no `llm` surface (CLI runtimes own model execution), so
 * that branch is dropped and every admitted message routes through the standard
 * agent pipeline. Reply dispatch likewise goes through the fork's
 * `dispatchInboundReplyWithBase` helper rather than upstream's
 * `runtime.channel.inbound.dispatchReply`, which this repo's channel runtime
 * does not expose.
 *
 * One setting goes further than upstream: upstream declared `timeoutSeconds` in
 * its schema/types but never consumed it. Here it is wired to the reply
 * dispatcher's `timeoutOverrideSeconds`, so the value an operator configures
 * actually bounds the agent turn.
 */
import {
  dispatchInboundReplyWithBase,
  type RemoteClawConfig,
} from "remoteclaw/plugin-sdk/clickclack";
import { resolveClickClackInboundAccess, type ClickClackInboundAccess } from "./access.js";
import { sendClickClackText } from "./outbound.js";
import { getClickClackRuntime } from "./runtime.js";
import { buildClickClackTarget } from "./target.js";
import type { ClickClackMessage, CoreConfig, ResolvedClickClackAccount } from "./types.js";

const CHANNEL_ID = "clickclack" as const;

function resolveAccountAgentRoute(params: {
  cfg: RemoteClawConfig;
  account: ResolvedClickClackAccount;
  target: string;
  isDirect: boolean;
}) {
  const runtime = getClickClackRuntime();
  const route = runtime.channel.routing.resolveAgentRoute({
    cfg: params.cfg,
    channel: CHANNEL_ID,
    accountId: params.account.accountId,
    peer: {
      kind: params.isDirect ? "direct" : "channel",
      id: params.target,
    },
  });
  const agentId = params.account.agentId ?? route.agentId;
  if (agentId === route.agentId) {
    return route;
  }
  return {
    ...route,
    agentId,
    sessionKey: runtime.channel.routing.buildAgentSessionKey({
      agentId,
      channel: CHANNEL_ID,
      accountId: params.account.accountId,
      peer: {
        kind: params.isDirect ? "direct" : "channel",
        id: params.target,
      },
    }),
  };
}

/**
 * Dispatches one already-fetched ClickClack message through the agent pipeline.
 *
 * Admission is checked first and short-circuits the whole handler: a message
 * the ingress gate did not admit is dropped before any routing, session, or
 * command-authorization work happens. `access.commandAuthorized` only rides
 * along into the dispatched context — it never substitutes for admission.
 */
export async function handleClickClackInbound(params: {
  account: ResolvedClickClackAccount;
  config: CoreConfig;
  message: ClickClackMessage;
  access?: ClickClackInboundAccess;
}) {
  const runtime = getClickClackRuntime();
  const message = params.message;
  const access =
    params.access ??
    (await resolveClickClackInboundAccess({
      account: params.account,
      config: params.config,
      message,
    }));
  if (!access.shouldDispatch) {
    return;
  }
  const isDirect = Boolean(message.direct_conversation_id);
  const target = buildClickClackTarget(
    isDirect
      ? { chatType: "direct", kind: "dm", id: message.author_id }
      : { chatType: "group", kind: "channel", id: message.channel_id ?? "" },
  );
  const route = resolveAccountAgentRoute({
    cfg: params.config as RemoteClawConfig,
    account: params.account,
    target,
    isDirect,
  });
  const senderName = message.author?.display_name || message.author_id;
  const previousTimestamp = runtime.channel.session.readSessionUpdatedAt({
    storePath: runtime.channel.session.resolveStorePath(params.config.session?.store, {
      agentId: route.agentId,
    }),
    sessionKey: route.sessionKey,
  });
  // Preserve both normalized channel fields and ClickClack-native ids so reply
  // routing, session recovery, and command authorization see the same message.
  const body = runtime.channel.reply.formatAgentEnvelope({
    channel: "ClickClack",
    from: senderName,
    timestamp: new Date(message.created_at),
    previousTimestamp,
    envelope: runtime.channel.reply.resolveEnvelopeFormatOptions(params.config as RemoteClawConfig),
    body: message.body,
  });
  const storePath = runtime.channel.session.resolveStorePath(params.config.session?.store, {
    agentId: route.agentId,
  });
  const ctxPayload = runtime.channel.reply.finalizeInboundContext({
    Body: body,
    BodyForAgent: message.body,
    RawBody: message.body,
    CommandBody: message.body,
    From: target,
    To: target,
    SessionKey: route.sessionKey,
    AccountId: route.accountId ?? params.account.accountId,
    ChatType: isDirect ? "direct" : "group",
    WasMentioned: isDirect ? undefined : true,
    ConversationLabel: isDirect ? senderName : message.channel_id,
    GroupChannel: message.channel_id,
    NativeChannelId: message.channel_id || message.direct_conversation_id,
    MessageThreadId: message.parent_message_id ? message.thread_root_id : undefined,
    ThreadParentId: message.parent_message_id ? message.thread_root_id : undefined,
    SenderName: senderName,
    SenderId: message.author_id,
    Provider: CHANNEL_ID,
    Surface: CHANNEL_ID,
    MessageSid: message.id,
    MessageSidFull: message.id,
    ReplyToId: message.id,
    Timestamp: message.created_at,
    OriginatingChannel: CHANNEL_ID,
    OriginatingTo: target,
    CommandAuthorized: access.commandAuthorized,
  });
  await dispatchInboundReplyWithBase({
    cfg: params.config as RemoteClawConfig,
    channel: CHANNEL_ID,
    accountId: params.account.accountId,
    route: { agentId: route.agentId, sessionKey: route.sessionKey },
    storePath,
    ctxPayload,
    core: runtime,
    replyOptions: params.account.timeoutSeconds
      ? { timeoutOverrideSeconds: params.account.timeoutSeconds }
      : undefined,
    deliver: async (payload) => {
      const text = payload.text ?? "";
      if (!text.trim()) {
        return;
      }
      await sendClickClackText({
        cfg: params.config,
        accountId: params.account.accountId,
        to: target,
        text,
        threadId: message.parent_message_id ? message.thread_root_id : undefined,
        replyToId: message.id,
      });
    },
    onRecordError: (error) => {
      throw error instanceof Error
        ? error
        : new Error(`clickclack session record failed: ${String(error)}`);
    },
    onDispatchError: (error, info) => {
      throw error instanceof Error
        ? error
        : new Error(`clickclack ${info.kind} dispatch failed: ${String(error)}`);
    },
  });
}
