import { GatewayIntents, GatewayPlugin } from "@buape/carbon/gateway";
import type { APIGatewayBotInfo } from "discord-api-types/v10";
import { HttpsProxyAgent } from "https-proxy-agent";
import { normalizeLowercaseStringOrEmpty } from "remoteclaw/plugin-sdk/text-runtime";
import { ProxyAgent, fetch as undiciFetch } from "undici";
import WebSocket from "ws";
import type { DiscordAccountConfig } from "../../../../src/config/types.js";
import { danger } from "../../../../src/globals.js";
import { formatErrorMessage } from "../../../../src/infra/errors.js";
import type { RuntimeEnv } from "../../../../src/runtime.js";
import { validateDiscordProxyUrl } from "../proxy-fetch.js";
import { normalizeDiscordGatewayInfoTimeoutMs } from "./timeouts.js";

const DISCORD_GATEWAY_BOT_URL = "https://discord.com/api/v10/gateway/bot";
const DEFAULT_DISCORD_GATEWAY_URL = "wss://gateway.discord.gg/";

type DiscordGatewayMetadataResponse = Pick<Response, "ok" | "status" | "text">;
type DiscordGatewayFetchInit = Record<string, unknown> & {
  headers?: Record<string, string>;
};
type DiscordGatewayFetch = (
  input: string,
  init?: DiscordGatewayFetchInit,
) => Promise<DiscordGatewayMetadataResponse>;

export function resolveDiscordGatewayIntents(
  intentsConfig?: import("../../../../src/config/types.discord.js").DiscordIntentsConfig,
): number {
  let intents =
    GatewayIntents.Guilds |
    GatewayIntents.GuildMessages |
    GatewayIntents.MessageContent |
    GatewayIntents.DirectMessages |
    GatewayIntents.GuildMessageReactions |
    GatewayIntents.DirectMessageReactions |
    GatewayIntents.GuildVoiceStates;
  if (intentsConfig?.presence) {
    intents |= GatewayIntents.GuildPresences;
  }
  if (intentsConfig?.guildMembers) {
    intents |= GatewayIntents.GuildMembers;
  }
  return intents;
}

function summarizeGatewayResponseBody(body: string): string {
  const normalized = body.trim().replace(/\s+/g, " ");
  if (!normalized) {
    return "<empty>";
  }
  return normalized.slice(0, 240);
}

function isTransientDiscordGatewayResponse(status: number, body: string): boolean {
  if (status >= 500) {
    return true;
  }
  const normalized = normalizeLowercaseStringOrEmpty(body);
  return (
    normalized.includes("upstream connect error") ||
    normalized.includes("disconnect/reset before headers") ||
    normalized.includes("reset reason:")
  );
}

/**
 * Carries the transient verdict on the error itself so callers can branch on it without re-sniffing
 * the message.
 *
 * `name` is deliberately left as the inherited "Error": `provider.ts`'s #2692 gateway-rejection guard
 * and `src/infra/unhandled-rejections.ts` both classify these by MESSAGE, and the latter special-cases
 * `name === "AbortError"`. Renaming would silently re-route both.
 */
class DiscordGatewayMetadataError extends Error {
  readonly transient: boolean;

  constructor(message: string, options: { transient: boolean; cause?: unknown }) {
    super(message, { cause: options.cause });
    this.transient = options.transient;
  }
}

function createGatewayMetadataError(params: {
  detail: string;
  transient: boolean;
  cause?: unknown;
}): DiscordGatewayMetadataError {
  if (params.transient) {
    return new DiscordGatewayMetadataError(
      "Failed to get gateway information from Discord: fetch failed",
      { transient: true, cause: params.cause ?? new Error(params.detail) },
    );
  }
  return new DiscordGatewayMetadataError(
    `Failed to get gateway information from Discord: ${params.detail}`,
    { transient: false, cause: params.cause },
  );
}

function isTransientGatewayMetadataError(error: unknown): boolean {
  return error instanceof DiscordGatewayMetadataError && error.transient;
}

/**
 * Bound `run` by `timeoutMs`, aborting it on expiry and rejecting with a transient metadata error.
 *
 * The abort alone is not enough: a caller-supplied `fetchImpl` may ignore the signal, so the race is
 * what guarantees the deadline.
 */
async function runWithGatewayMetadataTimeout<T>(params: {
  timeoutMs: number;
  run: (signal: AbortSignal) => Promise<T>;
}): Promise<T> {
  const controller = new AbortController();
  let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_resolve, reject) => {
    timeoutHandle = setTimeout(() => {
      controller.abort();
      reject(
        createGatewayMetadataError({
          detail: `Discord API /gateway/bot timed out after ${params.timeoutMs}ms`,
          transient: true,
        }),
      );
    }, params.timeoutMs);
  });
  const runPromise = params.run(controller.signal);
  // Once the timeout wins the race, the abort rejects the in-flight fetch with nobody listening.
  // Attaching a handler marks it handled without consuming the rejection the race still sees.
  runPromise.catch(() => {});
  try {
    return await Promise.race([runPromise, timeoutPromise]);
  } finally {
    clearTimeout(timeoutHandle);
  }
}

async function readDiscordGatewayInfo(params: {
  token: string;
  fetchImpl: DiscordGatewayFetch;
  fetchInit?: DiscordGatewayFetchInit;
  signal: AbortSignal;
}): Promise<APIGatewayBotInfo> {
  let response: DiscordGatewayMetadataResponse;
  try {
    response = await params.fetchImpl(DISCORD_GATEWAY_BOT_URL, {
      ...params.fetchInit,
      signal: params.signal,
      headers: {
        ...params.fetchInit?.headers,
        Authorization: `Bot ${params.token}`,
      },
    });
  } catch (error) {
    throw createGatewayMetadataError({
      detail: formatErrorMessage(error),
      transient: true,
      cause: error,
    });
  }

  let body: string;
  try {
    body = await response.text();
  } catch (error) {
    throw createGatewayMetadataError({
      detail: formatErrorMessage(error),
      transient: true,
      cause: error,
    });
  }
  const summary = summarizeGatewayResponseBody(body);
  const transient = isTransientDiscordGatewayResponse(response.status, body);

  if (!response.ok) {
    throw createGatewayMetadataError({
      detail: `Discord API /gateway/bot failed (${response.status}): ${summary}`,
      transient,
    });
  }

  try {
    const parsed = JSON.parse(body) as Partial<APIGatewayBotInfo>;
    return {
      ...parsed,
      url:
        typeof parsed.url === "string" && parsed.url.trim()
          ? parsed.url
          : DEFAULT_DISCORD_GATEWAY_URL,
    } as APIGatewayBotInfo;
  } catch (error) {
    throw createGatewayMetadataError({
      detail: `Discord API /gateway/bot returned invalid JSON: ${summary}`,
      transient,
      cause: error,
    });
  }
}

function fetchDiscordGatewayInfo(params: {
  token: string;
  fetchImpl: DiscordGatewayFetch;
  fetchInit?: DiscordGatewayFetchInit;
  timeoutMs: number;
}): Promise<APIGatewayBotInfo> {
  return runWithGatewayMetadataTimeout({
    timeoutMs: params.timeoutMs,
    run: (signal) => readDiscordGatewayInfo({ ...params, signal }),
  });
}

function createGatewayPlugin(params: {
  options: {
    reconnect: { maxAttempts: number };
    intents: number;
    autoInteractions: boolean;
  };
  fetchImpl: DiscordGatewayFetch;
  fetchInit?: DiscordGatewayFetchInit;
  wsAgent?: HttpsProxyAgent<string>;
  runtime: RuntimeEnv;
  gatewayInfoTimeoutMs: number;
}): GatewayPlugin {
  class SafeGatewayPlugin extends GatewayPlugin {
    /** True while `gatewayInfo` holds the default-URL fallback rather than a real /gateway/bot payload. */
    private usedFallbackGatewayInfo = false;

    constructor() {
      super(params.options);
    }

    override async registerClient(client: Parameters<GatewayPlugin["registerClient"]>[0]) {
      // Re-enter on a fallback so the next attempt gets a real payload instead of pinning the
      // default URL for the process lifetime.
      if (!this.gatewayInfo || this.usedFallbackGatewayInfo) {
        this.gatewayInfo = await this.resolveGatewayInfo(client.options.token);
      }
      return super.registerClient(client);
    }

    private async resolveGatewayInfo(token: string): Promise<APIGatewayBotInfo> {
      try {
        const gatewayInfo = await fetchDiscordGatewayInfo({
          token,
          fetchImpl: params.fetchImpl,
          fetchInit: params.fetchInit,
          timeoutMs: params.gatewayInfoTimeoutMs,
        });
        this.usedFallbackGatewayInfo = false;
        return gatewayInfo;
      } catch (error) {
        // A bad/revoked token (401/403), a 429, or a proxy interstitial on a 2xx never resolves by
        // retrying — keep those fatal so provider.ts's #2692 guard still classifies them.
        if (!isTransientGatewayMetadataError(error)) {
          throw error;
        }
        this.usedFallbackGatewayInfo = true;
        params.runtime.log?.(
          `discord: gateway metadata lookup failed transiently, connecting to ${DEFAULT_DISCORD_GATEWAY_URL} and refreshing metadata on the next attempt: ${formatErrorMessage(error)}`,
        );
        // `shards` / `session_start_limit` are omitted deliberately: Carbon's non-sharded
        // GatewayPlugin reads only `url` off gatewayInfo (its `connect()` defaults to this very
        // URL); the rest is ShardingPlugin's, which this fork does not use.
        return { url: DEFAULT_DISCORD_GATEWAY_URL } as APIGatewayBotInfo;
      }
    }

    override createWebSocket(url: string) {
      if (!params.wsAgent) {
        return super.createWebSocket(url);
      }
      return new WebSocket(url, { agent: params.wsAgent });
    }
  }

  return new SafeGatewayPlugin();
}

export function createDiscordGatewayPlugin(params: {
  discordConfig: DiscordAccountConfig;
  runtime: RuntimeEnv;
}): GatewayPlugin {
  const intents = resolveDiscordGatewayIntents(params.discordConfig?.intents);
  const proxy = params.discordConfig?.proxy?.trim();
  const gatewayInfoTimeoutMs = normalizeDiscordGatewayInfoTimeoutMs(
    params.discordConfig?.gatewayInfoTimeoutMs,
  );
  const options = {
    reconnect: { maxAttempts: 50 },
    intents,
    autoInteractions: true,
  };

  if (!proxy) {
    return createGatewayPlugin({
      options,
      fetchImpl: (input, init) => fetch(input, init as RequestInit),
      runtime: params.runtime,
      gatewayInfoTimeoutMs,
    });
  }

  try {
    // The bot token rides this leg too — on the WS IDENTIFY and on the /gateway/bot metadata
    // fetch — so the proxy is held to the same loopback-only bar as the REST path.
    validateDiscordProxyUrl(proxy);
    const wsAgent = new HttpsProxyAgent<string>(proxy);
    const fetchAgent = new ProxyAgent(proxy);

    params.runtime.log?.("discord: gateway proxy enabled");

    return createGatewayPlugin({
      options,
      fetchImpl: (input, init) => undiciFetch(input, init),
      fetchInit: { dispatcher: fetchAgent },
      wsAgent,
      runtime: params.runtime,
      gatewayInfoTimeoutMs,
    });
  } catch (err) {
    params.runtime.error?.(danger(`discord: invalid gateway proxy: ${String(err)}`));
    return createGatewayPlugin({
      options,
      fetchImpl: (input, init) => fetch(input, init as RequestInit),
      runtime: params.runtime,
      gatewayInfoTimeoutMs,
    });
  }
}
