import { type RemoteClawConfig } from "remoteclaw/plugin-sdk/config-runtime";
import { resolveTextChunkLimit } from "remoteclaw/plugin-sdk/reply-runtime";
import { resolveAccountEntry } from "remoteclaw/plugin-sdk/routing";
import { normalizeAccountId } from "remoteclaw/plugin-sdk/routing";
import { DISCORD_TEXT_CHUNK_LIMIT } from "./outbound-adapter.js";

const DEFAULT_DISCORD_DRAFT_STREAM_MIN = 200;
const DEFAULT_DISCORD_DRAFT_STREAM_MAX = 800;

export function resolveDiscordDraftStreamingChunking(
  cfg: RemoteClawConfig | undefined,
  accountId?: string | null,
): {
  minChars: number;
  maxChars: number;
  breakPreference: "paragraph" | "newline" | "sentence";
} {
  const providerChunkLimit = getChannelDock("discord")?.outbound?.textChunkLimit;
  const textLimit = resolveTextChunkLimit(cfg, "discord", accountId, {
    fallbackLimit: providerChunkLimit,
  });
  const normalizedAccountId = normalizeAccountId(accountId);
  const accountCfg = resolveAccountEntry(cfg?.channels?.discord?.accounts, normalizedAccountId);
  const draftCfg = accountCfg?.draftChunk ?? cfg?.channels?.discord?.draftChunk;

  const maxRequested = Math.max(
    1,
    Math.floor(draftCfg?.maxChars ?? DEFAULT_DISCORD_DRAFT_STREAM_MAX),
  );
  const maxChars = Math.max(1, Math.min(maxRequested, textLimit));
  const minRequested = Math.max(
    1,
    Math.floor(draftCfg?.minChars ?? DEFAULT_DISCORD_DRAFT_STREAM_MIN),
  );
  const minChars = Math.min(minRequested, maxChars);
  const breakPreference =
    draftCfg?.breakPreference === "newline" || draftCfg?.breakPreference === "sentence"
      ? draftCfg.breakPreference
      : "paragraph";
  return { minChars, maxChars, breakPreference };
}
