// Discord plugin module implements rest fetch behavior.
import { randomUUID } from "node:crypto";
import { Agent, type Dispatcher, fetch as undiciFetch } from "undici";
import { danger } from "../../../../src/globals.js";
import { formatErrorMessage } from "../../../../src/infra/errors.js";
import { wrapFetchWithAbortSignal } from "../../../../src/infra/fetch.js";
import { resolveEnvHttpProxyAgentOptions } from "../../../../src/infra/net/proxy-env.js";
import {
  createHttp1EnvHttpProxyAgent,
  createHttp1ProxyAgent,
} from "../../../../src/infra/net/undici-runtime.js";
import { resolveRequestUrl } from "../../../../src/plugin-sdk/request-url.js";
import { resolveEffectiveDebugProxyUrl } from "../../../../src/proxy-capture/env.js";
import { captureHttpExchange } from "../../../../src/proxy-capture/runtime.js";
import type { RuntimeEnv } from "../../../../src/runtime.js";
import { createDiscordDnsLookup } from "../network-config.js";
import { withValidatedDiscordProxy } from "../proxy-fetch.js";

const discordDnsLookup = createDiscordDnsLookup();

type DiscordRestDispatcher =
  | InstanceType<typeof Agent>
  | ReturnType<typeof createHttp1EnvHttpProxyAgent>
  | ReturnType<typeof createHttp1ProxyAgent>;

function createDirectDiscordRestDispatcher(): InstanceType<typeof Agent> {
  return new Agent({
    allowH2: false,
    connect: { lookup: discordDnsLookup },
  });
}

function createEnvProxyDiscordRestDispatcher(
  runtime: RuntimeEnv,
): ReturnType<typeof createHttp1EnvHttpProxyAgent> | undefined {
  const envProxyOptions = resolveEnvHttpProxyAgentOptions();
  if (!envProxyOptions) {
    return undefined;
  }
  try {
    return createHttp1EnvHttpProxyAgent({
      ...envProxyOptions,
      connect: { lookup: discordDnsLookup },
    });
  } catch (err) {
    runtime.error?.(
      danger(
        `discord: env proxy unavailable for REST fetch; using direct dispatcher: ${formatErrorMessage(err)}`,
      ),
    );
    return undefined;
  }
}

function createDiscordRestFetchWithDispatcher(dispatcher: DiscordRestDispatcher): typeof fetch {
  return wrapFetchWithAbortSignal(((input: RequestInfo | URL, init?: RequestInit) => {
    // This fetch is also handed to `fetchRemoteMedia` as its `fetchImpl`, and
    // `fetchWithSsrFGuard` passes its DNS-pinned dispatcher through `init` and expects a
    // caller-supplied fetch to honour it. Ours is only the default for calls that bring
    // no dispatcher of their own — overriding would silently undo the SSRF pinning.
    const initRecord = (init ?? {}) as Record<string, unknown> & { dispatcher?: Dispatcher };
    return (
      undiciFetch(input as string | URL, {
        ...initRecord,
        dispatcher: initRecord.dispatcher ?? dispatcher,
      }) as unknown as Promise<Response>
    ).then((response) => {
      captureHttpExchange({
        url: resolveRequestUrl(input),
        method: init?.method ?? "GET",
        requestHeaders: init?.headers as Headers | Record<string, string> | undefined,
        requestBody: (init as RequestInit & { body?: BodyInit | null })?.body ?? null,
        response,
        flowId: randomUUID(),
        meta: { subsystem: "discord-rest" },
      });
      return response;
    });
  }) as typeof fetch);
}

export function resolveDiscordRestFetch(
  proxyUrl: string | undefined,
  runtime: RuntimeEnv,
): typeof fetch {
  const effectiveProxyUrl = resolveEffectiveDebugProxyUrl(proxyUrl);
  if (effectiveProxyUrl) {
    const fetcher = withValidatedDiscordProxy(effectiveProxyUrl, runtime, (proxy) =>
      createDiscordRestFetchWithDispatcher(createHttp1ProxyAgent({ uri: proxy })),
    );
    if (!fetcher) {
      return fetch;
    }
    runtime.log?.("discord: rest proxy enabled");
    return fetcher;
  }

  const fetcher = createDiscordRestFetchWithDispatcher(
    createEnvProxyDiscordRestDispatcher(runtime) ?? createDirectDiscordRestDispatcher(),
  );
  return fetcher;
}
