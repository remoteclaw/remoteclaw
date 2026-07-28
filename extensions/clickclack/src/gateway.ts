/**
 * Gateway loop for polling ClickClack backlog events, opening the realtime
 * websocket, and dispatching user messages into RemoteClaw.
 */
import type { ChannelGatewayContext } from "remoteclaw/plugin-sdk/clickclack";
import type { RawData } from "ws";
import { resolveClickClackInboundAccess } from "./access.js";
import { resolveClickClackAccount } from "./accounts.js";
import { createClickClackClient } from "./http-client.js";
import { handleClickClackInbound } from "./inbound.js";
import { resolveWorkspaceId } from "./resolve.js";
import type {
  ClickClackEvent,
  ClickClackMessage,
  CoreConfig,
  ResolvedClickClackAccount,
} from "./types.js";

/** ClickClack's `after_seq` cursor is exclusive, so step back one to include it. */
const REFETCH_WINDOW_BEFORE = 1;
/** Covers a same-tick burst without pulling unrelated history. */
const REFETCH_WINDOW_SIZE = 10;

function payloadString(event: ClickClackEvent, key: string): string {
  const value = event.payload?.[key];
  return typeof value === "string" ? value : "";
}

async function resolveEventMessage(params: {
  client: ReturnType<typeof createClickClackClient>;
  event: ClickClackEvent;
}): Promise<ClickClackMessage | null> {
  const messageId = payloadString(params.event, "message_id");
  if (!messageId) {
    return null;
  }
  const directConversationId = payloadString(params.event, "direct_conversation_id");
  if (directConversationId && typeof params.event.seq === "number") {
    // ClickClack event payloads carry ids and cursors but not the message
    // body/author, so refetch a narrow window around the sequence and keep the
    // API's copy authoritative.
    const messages = await params.client.directMessages(
      directConversationId,
      params.event.seq - REFETCH_WINDOW_BEFORE,
      REFETCH_WINDOW_SIZE,
    );
    return messages.find((message) => message.id === messageId) ?? null;
  }
  if (params.event.type === "thread.reply_created") {
    const rootId = payloadString(params.event, "root_message_id");
    if (!rootId) {
      return null;
    }
    const thread = await params.client.thread(rootId);
    return thread.replies.find((message) => message.id === messageId) ?? null;
  }
  if (params.event.channel_id && typeof params.event.seq === "number") {
    const messages = await params.client.channelMessages(
      params.event.channel_id,
      params.event.seq - REFETCH_WINDOW_BEFORE,
      REFETCH_WINDOW_SIZE,
    );
    return messages.find((message) => message.id === messageId) ?? null;
  }
  return null;
}

function decodeSocketMessage(data: RawData): string {
  if (typeof data === "string") {
    return data;
  }
  if (Buffer.isBuffer(data)) {
    return data.toString("utf8");
  }
  if (data instanceof ArrayBuffer) {
    return Buffer.from(data).toString("utf8");
  }
  return Buffer.concat(data).toString("utf8");
}

function parseSocketEvent(data: RawData): ClickClackEvent | null {
  try {
    return JSON.parse(decodeSocketMessage(data)) as ClickClackEvent;
  } catch {
    return null;
  }
}

async function processEvent(params: {
  account: ResolvedClickClackAccount;
  config: CoreConfig;
  client: ReturnType<typeof createClickClackClient>;
  event: ClickClackEvent;
  botUserId: string;
}) {
  if (params.event.type !== "message.created" && params.event.type !== "thread.reply_created") {
    return;
  }
  if (payloadString(params.event, "author_id") === params.botUserId) {
    return;
  }
  const message = await resolveEventMessage({ client: params.client, event: params.event });
  if (!message || message.author_id === params.botUserId) {
    return;
  }
  if (message.author?.kind === "bot") {
    return;
  }
  // Admission is resolved and enforced BEFORE the message reaches the inbound
  // handler: a message the ingress gate did not admit never enters the agent
  // pipeline, regardless of its command authorization outcome.
  const access = await resolveClickClackInboundAccess({
    account: params.account,
    config: params.config,
    message,
  });
  if (!access.shouldDispatch) {
    return;
  }
  await handleClickClackInbound({
    account: params.account,
    config: params.config,
    message,
    access,
  });
}

export async function startClickClackGatewayAccount(
  ctx: ChannelGatewayContext<ResolvedClickClackAccount>,
) {
  const configuredAccount = resolveClickClackAccount({
    cfg: ctx.cfg,
    accountId: ctx.account.accountId,
  });
  if (!configuredAccount.configured) {
    throw new Error(`ClickClack is not configured for account "${configuredAccount.accountId}"`);
  }
  const client = createClickClackClient({
    baseUrl: configuredAccount.baseUrl,
    token: configuredAccount.token,
  });
  const workspaceId = await resolveWorkspaceId(client, configuredAccount.workspace);
  const me = await client.me();
  const account = {
    ...configuredAccount,
    workspace: workspaceId,
    botUserId: configuredAccount.botUserId ?? me.id,
  };
  ctx.setStatus({
    accountId: account.accountId,
    running: true,
    configured: true,
    enabled: account.enabled,
    baseUrl: account.baseUrl,
  });
  // Backlog replay and the websocket feed must dispatch identically — keeping
  // one binding stops the two call sites from drifting apart.
  const dispatch = (event: ClickClackEvent) =>
    processEvent({
      account,
      config: ctx.cfg,
      client,
      event,
      botUserId: account.botUserId,
    });
  let afterCursor = "";
  let initialized = false;
  while (!ctx.abortSignal.aborted) {
    const backlog = await client.events(workspaceId, afterCursor);
    if (!initialized) {
      // First pass establishes the cursor without replaying historical backlog
      // into fresh gateway sessions.
      for (const event of backlog) {
        afterCursor = event.cursor || afterCursor;
      }
      initialized = true;
    } else {
      for (const event of backlog) {
        afterCursor = event.cursor || afterCursor;
        await dispatch(event);
      }
    }
    const socket = client.websocket(workspaceId, afterCursor);
    await new Promise<void>((resolve, reject) => {
      const abort = () => {
        socket.close();
        resolve();
      };
      ctx.abortSignal.addEventListener("abort", abort, { once: true });
      socket.on("message", (data) => {
        void (async () => {
          const event = parseSocketEvent(data);
          if (!event) {
            ctx.log?.warn?.(`[${account.accountId}] skipped malformed ClickClack websocket event`);
            return;
          }
          afterCursor = event.cursor || afterCursor;
          await dispatch(event);
        })().catch(reject);
      });
      socket.on("close", () => {
        ctx.abortSignal.removeEventListener("abort", abort);
        resolve();
      });
      socket.on("error", reject);
    });
    if (!ctx.abortSignal.aborted) {
      await new Promise((resolve) => {
        setTimeout(resolve, account.reconnectMs);
      });
    }
  }
  ctx.setStatus({ accountId: account.accountId, running: false });
}
