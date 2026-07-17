import type { Client } from "@buape/carbon";
import {
  createChannelInboundDebouncer,
  shouldDebounceTextInbound,
} from "../../../../src/channels/inbound-debounce-policy.js";
import { resolveOpenProviderRuntimeGroupPolicy } from "../../../../src/config/runtime-group-policy.js";
import { danger } from "../../../../src/globals.js";
import {
  buildDiscordInboundReplayKey,
  claimDiscordInboundReplay,
  createDiscordInboundReplayGuard,
  releaseDiscordInboundReplay,
} from "./inbound-dedupe.js";
import { buildDiscordInboundJob } from "./inbound-job.js";
import { createDiscordInboundWorker } from "./inbound-worker.js";
import type { DiscordMessageEvent, DiscordMessageHandler } from "./listeners.js";
import { preflightDiscordMessage } from "./message-handler.preflight.js";
import type { DiscordMessagePreflightParams } from "./message-handler.preflight.types.js";
import {
  hasDiscordMessageStickers,
  resolveDiscordMessageChannelId,
  resolveDiscordMessageText,
} from "./message-utils.js";
import type { DiscordMonitorStatusSink } from "./status.js";

type DiscordMessageHandlerParams = Omit<
  DiscordMessagePreflightParams,
  "ackReactionScope" | "groupPolicy" | "data" | "client"
> & {
  setStatus?: DiscordMonitorStatusSink;
  abortSignal?: AbortSignal;
  workerRunTimeoutMs?: number;
};

export type DiscordMessageHandlerWithLifecycle = DiscordMessageHandler & {
  deactivate: () => void;
};

export function createDiscordMessageHandler(
  params: DiscordMessageHandlerParams,
): DiscordMessageHandlerWithLifecycle {
  const { groupPolicy } = resolveOpenProviderRuntimeGroupPolicy({
    providerConfigPresent: params.cfg.channels?.discord !== undefined,
    groupPolicy: params.discordConfig?.groupPolicy,
    defaultGroupPolicy: params.cfg.channels?.defaults?.groupPolicy,
  });
  const ackReactionScope =
    params.discordConfig?.ackReactionScope ??
    params.cfg.messages?.ackReactionScope ??
    "group-mentions";
  const replayGuard = createDiscordInboundReplayGuard();
  const inboundWorker = createDiscordInboundWorker({
    runtime: params.runtime,
    setStatus: params.setStatus,
    abortSignal: params.abortSignal,
    runTimeoutMs: params.workerRunTimeoutMs,
    replayGuard,
  });

  async function claimDiscordInboundReplayKeys(
    entries: ReadonlyArray<{ data: DiscordMessageEvent }>,
  ): Promise<{ claimedKeys: string[]; anyClaimAttempted: boolean }> {
    const claimedKeys: string[] = [];
    let anyClaimAttempted = false;
    for (const entry of entries) {
      const replayKey = buildDiscordInboundReplayKey({
        accountId: params.accountId,
        data: entry.data,
      });
      if (!replayKey) {
        continue;
      }
      anyClaimAttempted = true;
      const claimed = await claimDiscordInboundReplay({ replayKey, replayGuard });
      if (claimed) {
        claimedKeys.push(replayKey);
      }
    }
    return { claimedKeys, anyClaimAttempted };
  }

  const { debouncer } = createChannelInboundDebouncer<{
    data: DiscordMessageEvent;
    client: Client;
    abortSignal?: AbortSignal;
  }>({
    cfg: params.cfg,
    channel: "discord",
    buildKey: (entry) => {
      const message = entry.data.message;
      const authorId = entry.data.author?.id;
      if (!message || !authorId) {
        return null;
      }
      const channelId = resolveDiscordMessageChannelId({
        message,
        eventChannelId: entry.data.channel_id,
      });
      if (!channelId) {
        return null;
      }
      return `discord:${params.accountId}:${channelId}:${authorId}`;
    },
    shouldDebounce: (entry) => {
      const message = entry.data.message;
      if (!message) {
        return false;
      }
      const baseText = resolveDiscordMessageText(message, { includeForwarded: false });
      return shouldDebounceTextInbound({
        text: baseText,
        cfg: params.cfg,
        hasMedia: Boolean(
          (message.attachments && message.attachments.length > 0) ||
          hasDiscordMessageStickers(message),
        ),
      });
    },
    onFlush: async (entries) => {
      const last = entries.at(-1);
      if (!last) {
        return;
      }
      const abortSignal = last.abortSignal;
      if (abortSignal?.aborted) {
        return;
      }
      // Claim each message's replay key BEFORE preflight so a gateway RESUME
      // redelivery of an already-seen message is dropped here instead of being
      // preflighted and dispatched a second time. Messages without an id can't be
      // deduped and pass through; when every claimable id is a duplicate the whole
      // flush is dropped. Claimed keys travel with the job so the worker can commit
      // them on success or release them on a retryable failure.
      const { claimedKeys, anyClaimAttempted } = await claimDiscordInboundReplayKeys(entries);
      if (anyClaimAttempted && claimedKeys.length === 0) {
        return;
      }
      if (entries.length === 1) {
        const ctx = await preflightDiscordMessage({
          ...params,
          ackReactionScope,
          groupPolicy,
          abortSignal,
          data: last.data,
          client: last.client,
        });
        if (!ctx) {
          releaseDiscordInboundReplay({ replayKeys: claimedKeys, replayGuard });
          return;
        }
        inboundWorker.enqueue(buildDiscordInboundJob(ctx, { replayKeys: claimedKeys }));
        return;
      }
      const combinedBaseText = entries
        .map((entry) => resolveDiscordMessageText(entry.data.message, { includeForwarded: false }))
        .filter(Boolean)
        .join("\n");
      const syntheticMessage = {
        ...last.data.message,
        content: combinedBaseText,
        attachments: [],
        message_snapshots: (last.data.message as { message_snapshots?: unknown }).message_snapshots,
        messageSnapshots: (last.data.message as { messageSnapshots?: unknown }).messageSnapshots,
        rawData: {
          ...(last.data.message as { rawData?: Record<string, unknown> }).rawData,
        },
      };
      const syntheticData: DiscordMessageEvent = {
        ...last.data,
        message: syntheticMessage,
      };
      const ctx = await preflightDiscordMessage({
        ...params,
        ackReactionScope,
        groupPolicy,
        abortSignal,
        data: syntheticData,
        client: last.client,
      });
      if (!ctx) {
        releaseDiscordInboundReplay({ replayKeys: claimedKeys, replayGuard });
        return;
      }
      if (entries.length > 1) {
        const ids = entries.map((entry) => entry.data.message?.id).filter(Boolean) as string[];
        if (ids.length > 0) {
          const ctxBatch = ctx as typeof ctx & {
            MessageSids?: string[];
            MessageSidFirst?: string;
            MessageSidLast?: string;
          };
          ctxBatch.MessageSids = ids;
          ctxBatch.MessageSidFirst = ids[0];
          ctxBatch.MessageSidLast = ids[ids.length - 1];
        }
      }
      inboundWorker.enqueue(buildDiscordInboundJob(ctx, { replayKeys: claimedKeys }));
    },
    onError: (err) => {
      params.runtime.error?.(danger(`discord debounce flush failed: ${String(err)}`));
    },
  });

  const handler: DiscordMessageHandlerWithLifecycle = async (data, client, options) => {
    try {
      if (options?.abortSignal?.aborted) {
        return;
      }
      // Filter bot-own messages before they enter the debounce queue.
      // The same check exists in preflightDiscordMessage(), but by that point
      // the message has already consumed debounce capacity and blocked
      // legitimate user messages. On active servers this causes cumulative
      // slowdown (see #15874).
      const msgAuthorId = data.message?.author?.id ?? data.author?.id;
      if (params.botUserId && msgAuthorId === params.botUserId) {
        return;
      }

      await debouncer.enqueue({ data, client, abortSignal: options?.abortSignal });
    } catch (err) {
      params.runtime.error?.(danger(`handler failed: ${String(err)}`));
    }
  };

  handler.deactivate = inboundWorker.deactivate;

  return handler;
}
