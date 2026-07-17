import type { RemoteClawConfig } from "remoteclaw/plugin-sdk/zalouser";
import { getZalouserRuntime } from "./runtime.js";
import type { ZaloSendOptions } from "./types.js";

/** Zalo's own per-message ceiling; used as the fallback when config sets no limit. */
export const ZALOUSER_TEXT_CHUNK_LIMIT = 2000;

export type ZalouserTextOptions = Pick<
  ZaloSendOptions,
  "textMode" | "textChunkMode" | "textChunkLimit"
>;

/**
 * Resolve the styling + chunking options every outbound zalouser send must carry.
 *
 * `sendMessageZalouser` parses markdown into Zalo style ranges and only then splits the text,
 * slicing those ranges per chunk. Anything that chunks earlier — the core delivery layer, or
 * `sendPayload` — would cut raw markdown mid-marker and orphan the styling, so zalouser declares
 * `outbound.chunker: null`, hands the full text down once, and lets `send.ts` own the split.
 *
 * Every caller of `sendMessageZalouser` resolves through here: the options were previously
 * open-coded per call site, and the ones that forgot them silently shipped raw markdown (#2970).
 */
export function resolveZalouserTextOptions(params: {
  cfg?: RemoteClawConfig;
  accountId?: string | null;
}): ZalouserTextOptions {
  const core = getZalouserRuntime();
  const accountId = params.accountId ?? undefined;
  return {
    textMode: "markdown",
    textChunkMode: core.channel.text.resolveChunkMode(params.cfg, "zalouser", accountId),
    textChunkLimit: core.channel.text.resolveTextChunkLimit(params.cfg, "zalouser", accountId, {
      fallbackLimit: ZALOUSER_TEXT_CHUNK_LIMIT,
    }),
  };
}
