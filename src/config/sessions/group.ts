import {
  normalizeLowercaseStringOrEmpty,
  normalizeOptionalLowercaseString,
  normalizeOptionalString,
} from "@remoteclaw/normalization-core/string-coerce";
import { normalizeHyphenSlug } from "@remoteclaw/normalization-core/string-normalization";
import type { MsgContext } from "../../auto-reply/templating.js";
import { listChannelPlugins } from "../../channels/plugins/registry.js";
import { normalizeSessionPeerId } from "../../sessions/session-key-utils.js";
import { listDeliverableMessageChannels } from "../../utils/message-channel.js";
import type { GroupKeyResolution } from "./types.js";

const getGroupSurfaces = () => new Set<string>([...listDeliverableMessageChannels(), "webchat"]);

type LegacyGroupSessionSurface = {
  resolveLegacyGroupSessionKey?: (ctx: MsgContext) => GroupKeyResolution | null;
};

function resolveLegacyGroupSessionKey(ctx: MsgContext): GroupKeyResolution | null {
  for (const plugin of listChannelPlugins()) {
    const resolved = (
      plugin.messaging as LegacyGroupSessionSurface | undefined
    )?.resolveLegacyGroupSessionKey?.(ctx);
    if (resolved) {
      return resolved;
    }
  }
  return null;
}

function normalizeGroupLabel(raw?: string) {
  return normalizeHyphenSlug(raw);
}

function joinOpaqueTail(parts: string[], start: number): string | null {
  return normalizeOptionalString(parts[start]) ? parts.slice(start).join(":") : null;
}

function resolveOriginatingGroupTargetId(params: {
  ctx: MsgContext;
  provider: string;
}): string | null {
  const target = normalizeOptionalString(params.ctx.OriginatingTo ?? params.ctx.To) ?? "";
  if (!target) {
    return null;
  }
  const parts = target.split(":");
  if (parts.length < 2) {
    return null;
  }

  const head = normalizeLowercaseStringOrEmpty(parts[0]);
  const second = normalizeOptionalLowercaseString(parts[1]);
  const secondIsKind = second === "group" || second === "channel";
  if (secondIsKind && (head === params.provider || getGroupSurfaces().has(head))) {
    return joinOpaqueTail(parts, 2);
  }
  if (head === params.provider || head === "chat" || head === "room" || head === "group") {
    return joinOpaqueTail(parts, 1);
  }
  if (head === "channel") {
    return joinOpaqueTail(parts, 1);
  }
  return null;
}

function shortenGroupId(value?: string) {
  const trimmed = normalizeOptionalString(value) ?? "";
  if (!trimmed) {
    return "";
  }
  if (trimmed.length <= 14) {
    return trimmed;
  }
  return `${trimmed.slice(0, 6)}...${trimmed.slice(-4)}`;
}

export function buildGroupDisplayName(params: {
  provider?: string;
  subject?: string;
  groupChannel?: string;
  space?: string;
  id?: string;
  key: string;
}) {
  const providerKey = normalizeOptionalLowercaseString(params.provider) ?? "group";
  const groupChannel = normalizeOptionalString(params.groupChannel);
  const space = normalizeOptionalString(params.space);
  const subject = normalizeOptionalString(params.subject);
  const detail =
    (groupChannel && space
      ? `${space}${groupChannel.startsWith("#") ? "" : "#"}${groupChannel}`
      : groupChannel || subject || space || "") || "";
  const fallbackId = normalizeOptionalString(params.id) ?? params.key;
  const rawLabel = detail || fallbackId;
  let token = normalizeGroupLabel(rawLabel);
  if (!token) {
    token = normalizeGroupLabel(shortenGroupId(rawLabel));
  }
  if (!params.groupChannel && token.startsWith("#")) {
    token = token.replace(/^#+/, "");
  }
  if (token && !/^[@#]/.test(token) && !token.startsWith("g-") && !token.includes("#")) {
    token = `g-${token}`;
  }
  return token ? `${providerKey}:${token}` : providerKey;
}

export function resolveGroupSessionKey(ctx: MsgContext): GroupKeyResolution | null {
  const from = normalizeOptionalString(ctx.From) ?? "";
  const chatType = normalizeOptionalLowercaseString(ctx.ChatType);
  const normalizedChatType =
    chatType === "channel" ? "channel" : chatType === "group" ? "group" : undefined;

  // PROTECTED (fork): hardcoded @g.us → WhatsApp group detection. The
  // upstream v2026.4.5 refactor moved this into a plugin-provided
  // `resolveLegacyGroupSessionKey` callback, but the WhatsApp plugin's
  // messaging config does not actually register that callback in the fork
  // and unit tests in `src/config/sessions.test.ts` exercise this path with
  // no plugins loaded. Keeping the inline @g.us fallback preserves the
  // fork's pre-sync test contract while leaving the plugin-provided hook
  // (`resolveLegacyGroupSessionKey` above) intact for future plugin
  // surfaces. See #2672 for the v2026.4.5 sync regression context.
  const isWhatsAppGroupId = from.toLowerCase().endsWith("@g.us") && !from.includes(":");

  const legacyResolution = resolveLegacyGroupSessionKey(ctx);
  const looksLikeGroup =
    normalizedChatType === "group" ||
    normalizedChatType === "channel" ||
    from.includes(":group:") ||
    from.includes(":channel:") ||
    legacyResolution !== null ||
    isWhatsAppGroupId;
  if (!looksLikeGroup) {
    return null;
  }

  const providerHint = normalizeOptionalLowercaseString(ctx.Provider);

  const parts = from.split(":");
  const head = normalizeLowercaseStringOrEmpty(parts[0]);
  const headIsSurface = head ? getGroupSurfaces().has(head) : false;

  if (!headIsSurface && !providerHint && legacyResolution) {
    return legacyResolution;
  }

  const provider = headIsSurface
    ? head
    : (providerHint ?? legacyResolution?.channel ?? (isWhatsAppGroupId ? "whatsapp" : undefined));
  if (!provider) {
    return null;
  }

  const second = normalizeOptionalLowercaseString(parts[1]);
  const secondIsKind = second === "group" || second === "channel";
  const kind = secondIsKind
    ? second
    : from.includes(":channel:") || normalizedChatType === "channel"
      ? "channel"
      : "group";
  const originatingGroupTargetId =
    !secondIsKind && normalizedChatType ? resolveOriginatingGroupTargetId({ ctx, provider }) : null;
  const id = originatingGroupTargetId
    ? originatingGroupTargetId
    : headIsSurface
      ? secondIsKind
        ? joinOpaqueTail(parts, 2)
        : joinOpaqueTail(parts, 1)
      : from;
  if (!id) {
    return null;
  }
  const finalId = normalizeSessionPeerId({ channel: provider, peerKind: kind, peerId: id });
  if (!finalId) {
    return null;
  }

  return {
    key: `${provider}:${kind}:${finalId}`,
    channel: provider,
    id: finalId,
    chatType: kind === "channel" ? "channel" : "group",
  };
}
