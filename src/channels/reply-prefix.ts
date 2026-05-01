import { isSlackInteractiveRepliesEnabled } from "../../extensions/slack/src/interactive-replies.js";
import { resolveAgentEffectiveModelPrimary } from "../agents/agent-scope.js";
import { resolveEffectiveMessagesConfig, resolveIdentityName } from "../agents/identity.js";
import { extractShortModelName, type ResponsePrefixContext } from "../auto-reply/reply/response-prefix-template.js";
import type { RemoteClawConfig } from "../config/config.js";

export type ReplyPrefixContextBundle = {
  prefixContext: ResponsePrefixContext;
  responsePrefix?: string;
  enableSlackInteractiveReplies?: boolean;
  responsePrefixContextProvider: () => ResponsePrefixContext;
};

export type ReplyPrefixOptions = Pick<
  ReplyPrefixContextBundle,
  "responsePrefix" | "enableSlackInteractiveReplies" | "responsePrefixContextProvider"
>;

export function createReplyPrefixContext(params: {
  cfg: RemoteClawConfig;
  agentId: string;
  channel?: string;
  accountId?: string;
}): ReplyPrefixContextBundle {
  const { cfg, agentId } = params;
  const effectiveModel = resolveAgentEffectiveModelPrimary(cfg, agentId);
  const slash = effectiveModel?.indexOf("/") ?? -1;
  const provider = slash > 0 ? effectiveModel?.slice(0, slash) : undefined;
  const modelId = slash > 0 ? effectiveModel?.slice(slash + 1) : effectiveModel;
  const prefixContext: ResponsePrefixContext = {
    identityName: resolveIdentityName(cfg, agentId),
    provider,
    model: modelId ? extractShortModelName(modelId) : undefined,
    modelFull: effectiveModel,
  };

  return {
    prefixContext,
    responsePrefix: resolveEffectiveMessagesConfig(cfg, agentId, {
      channel: params.channel,
      accountId: params.accountId,
    }).responsePrefix,
    enableSlackInteractiveReplies:
      params.channel === "slack" ? isSlackInteractiveRepliesEnabled({ cfg, accountId: params.accountId }) : undefined,
    responsePrefixContextProvider: () => prefixContext,
  };
}

export function createReplyPrefixOptions(params: {
  cfg: RemoteClawConfig;
  agentId: string;
  channel?: string;
  accountId?: string;
}): ReplyPrefixOptions {
  const { responsePrefix, enableSlackInteractiveReplies, responsePrefixContextProvider } =
    createReplyPrefixContext(params);
  return {
    responsePrefix,
    enableSlackInteractiveReplies,
    responsePrefixContextProvider,
  };
}
