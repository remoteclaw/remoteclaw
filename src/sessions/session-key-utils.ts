// PROTECTED fork divergence — do not port upstream `bea53d7a3f` (#58400).
//
// Upstream moved bootstrap session-grammar parsing out of this module and into
// plugin-owned `session-key-api.ts` / `session-conversation.ts` surfaces, with
// dispatch through `src/channels/plugins/session-conversation.ts` and the
// `loadBundledPluginPublicSurfaceModuleSync` plugin-SDK facade-runtime loader.
// RemoteClaw cannot adopt that pattern as-is:
//
//   1. `src/plugin-sdk/facade-runtime.ts` and
//      `src/plugins/bundled-plugin-metadata.ts` (the loader + path resolver
//      the upstream dispatch relies on) are gutted in this fork as part of
//      the Pi-era plugin-marketplace removal. The fork retains only
//      `bundled-plugin-metadata.generated.ts`, which exposes a different
//      surface that does not back the plugin-public-surface loader.
//
//   2. `ChannelMessagingAdapter` (`src/channels/plugins/types.core.ts`) is
//      deliberately minimal in this fork (`normalizeTarget`, `targetResolver`,
//      `formatTargetDisplay`). Upstream's port adds
//      `resolveSessionConversation` and `resolveParentConversationCandidates`
//      hooks plus a per-plugin `session-key-api.ts` artifact, neither of
//      which has an analogue here.
//
//   3. `parseSessionConversationRef` (the function upstream renames to
//      `parseRawSessionConversationRef`) has no fork callers. Only
//      `parseThreadSessionSuffix` is used (by `config/sessions/reset.ts` and
//      `config/sessions/delivery-info.ts`), and the channelHint-based
//      implementation correctly handles Telegram's `:topic:` marker (see
//      `src/routing/session-key.test.ts`).
//
// Net: porting `bea53d7a3f` would require resurrecting gutted plugin-SDK
// infrastructure, expanding the channel-plugin adapter surface, and adding
// a per-adapter session-grammar artifact — all for zero functional gain
// over the existing channelHint approach. The disposition is PROTECTED in
// `hq/upstream/disposition.tsv`; future syncs MUST NOT re-port this file
// from upstream without first either (a) reversing the plugin-SDK gut, or
// (b) re-evaluating this rationale.
//
// Tracked-by: remoteclaw#2666. Paired sync revert: 477212d342 (sync v2026.4.2).

import {
  normalizeLowercaseStringOrEmpty,
  normalizeOptionalLowercaseString,
  normalizeOptionalString,
} from "../shared/string-coerce.js";

export type ParsedAgentSessionKey = {
  agentId: string;
  rest: string;
};

export type SessionKeyChatType = "direct" | "group" | "channel" | "unknown";
export type ParsedThreadSessionSuffix = {
  baseSessionKey: string | undefined;
  threadId: string | undefined;
};

export type ParsedSessionConversationRef = {
  channel: string;
  kind: "group" | "channel";
  id: string;
  threadId: string | undefined;
};

/**
 * Parse agent-scoped session keys in a canonical, case-insensitive way.
 * Returned values are normalized to lowercase for stable comparisons/routing.
 */
export function parseAgentSessionKey(
  sessionKey: string | undefined | null,
): ParsedAgentSessionKey | null {
  const raw = normalizeOptionalLowercaseString(sessionKey);
  if (!raw) {
    return null;
  }
  const parts = raw.split(":").filter(Boolean);
  if (parts.length < 3) {
    return null;
  }
  if (parts[0] !== "agent") {
    return null;
  }
  const agentId = normalizeOptionalString(parts[1]);
  const rest = parts.slice(2).join(":");
  if (!agentId || !rest) {
    return null;
  }
  return { agentId, rest };
}

/**
 * Best-effort chat-type extraction from session keys across canonical and legacy formats.
 */
export function deriveSessionChatType(sessionKey: string | undefined | null): SessionKeyChatType {
  const raw = (sessionKey ?? "").trim().toLowerCase();
  if (!raw) {
    return "unknown";
  }
  const scoped = parseAgentSessionKey(raw)?.rest ?? raw;
  const tokens = new Set(scoped.split(":").filter(Boolean));
  if (tokens.has("group")) {
    return "group";
  }
  if (tokens.has("channel")) {
    return "channel";
  }
  if (tokens.has("direct") || tokens.has("dm")) {
    return "direct";
  }
  // Legacy Discord keys can be shaped like:
  // discord:<accountId>:guild-<guildId>:channel-<channelId>
  if (/^discord:(?:[^:]+:)?guild-[^:]+:channel-[^:]+$/.test(scoped)) {
    return "channel";
  }
  return "unknown";
}

export function isCronRunSessionKey(sessionKey: string | undefined | null): boolean {
  const parsed = parseAgentSessionKey(sessionKey);
  if (!parsed) {
    return false;
  }
  return /^cron:[^:]+:run:[^:]+$/.test(parsed.rest);
}

export function isCronSessionKey(sessionKey: string | undefined | null): boolean {
  const parsed = parseAgentSessionKey(sessionKey);
  if (!parsed) {
    return false;
  }
  return normalizeOptionalLowercaseString(parsed.rest)?.startsWith("cron:") === true;
}

export function isSubagentSessionKey(sessionKey: string | undefined | null): boolean {
  const raw = normalizeOptionalString(sessionKey);
  if (!raw) {
    return false;
  }
  if (normalizeOptionalLowercaseString(raw)?.startsWith("subagent:")) {
    return true;
  }
  const parsed = parseAgentSessionKey(raw);
  return normalizeOptionalLowercaseString(parsed?.rest)?.startsWith("subagent:") === true;
}

export function getSubagentDepth(sessionKey: string | undefined | null): number {
  const raw = normalizeOptionalLowercaseString(sessionKey);
  if (!raw) {
    return 0;
  }
  return raw.split(":subagent:").length - 1;
}

export function isAcpSessionKey(sessionKey: string | undefined | null): boolean {
  const raw = normalizeOptionalString(sessionKey);
  if (!raw) {
    return false;
  }
  const normalized = normalizeLowercaseStringOrEmpty(raw);
  if (normalized.startsWith("acp:")) {
    return true;
  }
  const parsed = parseAgentSessionKey(raw);
  return normalizeOptionalLowercaseString(parsed?.rest)?.startsWith("acp:") === true;
}

function normalizeThreadSuffixChannelHint(value: string | undefined | null): string | undefined {
  const trimmed = (value ?? "").trim().toLowerCase();
  return trimmed || undefined;
}

function inferThreadSuffixChannelHint(sessionKey: string): string | undefined {
  const parts = sessionKey.split(":").filter(Boolean);
  if (parts.length === 0) {
    return undefined;
  }
  if ((parts[0] ?? "").trim().toLowerCase() === "agent") {
    return normalizeThreadSuffixChannelHint(parts[2]);
  }
  return normalizeThreadSuffixChannelHint(parts[0]);
}

export function parseThreadSessionSuffix(
  sessionKey: string | undefined | null,
  options?: { channelHint?: string | null },
): ParsedThreadSessionSuffix {
  const raw = (sessionKey ?? "").trim();
  if (!raw) {
    return { baseSessionKey: undefined, threadId: undefined };
  }

  const channelHint =
    normalizeThreadSuffixChannelHint(options?.channelHint) ?? inferThreadSuffixChannelHint(raw);
  const lowerRaw = raw.toLowerCase();
  const topicMarker = ":topic:";
  const threadMarker = ":thread:";
  const topicIndex = channelHint === "telegram" ? lowerRaw.lastIndexOf(topicMarker) : -1;
  const threadIndex = lowerRaw.lastIndexOf(threadMarker);
  const markerIndex = Math.max(topicIndex, threadIndex);
  const marker = topicIndex > threadIndex ? topicMarker : threadMarker;

  const baseSessionKey = markerIndex === -1 ? raw : raw.slice(0, markerIndex);
  const threadIdRaw = markerIndex === -1 ? undefined : raw.slice(markerIndex + marker.length);
  const threadId = threadIdRaw?.trim() || undefined;

  return { baseSessionKey, threadId };
}

export function parseSessionConversationRef(
  sessionKey: string | undefined | null,
): ParsedSessionConversationRef | null {
  const raw = (sessionKey ?? "").trim();
  if (!raw) {
    return null;
  }

  const rawParts = raw.split(":").filter(Boolean);
  const parts =
    rawParts.length >= 3 && rawParts[0]?.trim().toLowerCase() === "agent"
      ? rawParts.slice(2)
      : rawParts;
  if (parts.length < 3) {
    return null;
  }

  const channel = normalizeThreadSuffixChannelHint(parts[0]);
  const kind = parts[1]?.trim().toLowerCase();
  if (!channel || (kind !== "group" && kind !== "channel")) {
    return null;
  }

  const joined = parts.slice(2).join(":");
  const { baseSessionKey, threadId } = parseThreadSessionSuffix(joined, {
    channelHint: channel,
  });
  const id = (baseSessionKey ?? joined).trim();
  if (!id) {
    return null;
  }

  return { channel, kind, id, threadId };
}

export function resolveThreadParentSessionKey(
  sessionKey: string | undefined | null,
): string | null {
  const { baseSessionKey, threadId } = parseThreadSessionSuffix(sessionKey);
  if (!threadId) {
    return null;
  }
  const parent = baseSessionKey?.trim();
  if (!parent) {
    return null;
  }
  return parent;
}
