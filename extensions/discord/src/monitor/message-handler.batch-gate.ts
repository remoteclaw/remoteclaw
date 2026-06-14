import type { ReplyToMode } from "remoteclaw/plugin-sdk/config-runtime";
import type { ReplyThreadingPolicy } from "remoteclaw/plugin-sdk/reply-reference";
import { resolveBatchedReplyThreadingPolicy } from "remoteclaw/plugin-sdk/reply-reference";

type ReplyThreadingContext = {
  ReplyThreading?: ReplyThreadingPolicy;
};

export function applyImplicitReplyBatchGate(
  ctx: object,
  replyToMode: ReplyToMode,
  isBatched: boolean,
) {
  const replyThreading = resolveBatchedReplyThreadingPolicy(replyToMode, isBatched);
  if (!replyThreading) {
    return;
  }
  (ctx as ReplyThreadingContext).ReplyThreading = replyThreading;
}
