// Feishu plugin module implements client behavior.
import type { Agent } from "node:https";
import { createRequire } from "node:module";
import * as Lark from "@larksuiteoapi/node-sdk";
import { HttpsProxyAgent } from "https-proxy-agent";
import { matchesNoProxy, resolveEnvHttpProxyUrl } from "../../../src/infra/net/proxy-env.js";
import { resolveActiveManagedProxyTlsOptions } from "../../../src/infra/net/proxy/managed-proxy-undici.js";
import type { FeishuConfig, FeishuDomain, ResolvedFeishuAccount } from "./types.js";

type FeishuClientSdk = Pick<
  typeof Lark,
  | "AppType"
  | "Client"
  | "defaultHttpInstance"
  | "Domain"
  | "EventDispatcher"
  | "LoggerLevel"
  | "WSClient"
>;

const defaultFeishuClientSdk: FeishuClientSdk = {
  AppType: Lark.AppType,
  Client: Lark.Client,
  defaultHttpInstance: Lark.defaultHttpInstance,
  Domain: Lark.Domain,
  EventDispatcher: Lark.EventDispatcher,
  LoggerLevel: Lark.LoggerLevel,
  WSClient: Lark.WSClient,
};

let feishuClientSdk: FeishuClientSdk = defaultFeishuClientSdk;
let httpsProxyAgentCtor: typeof HttpsProxyAgent = HttpsProxyAgent;

/** Default HTTP timeout for Feishu API requests (30 seconds). */
export const FEISHU_HTTP_TIMEOUT_MS = 30_000;
export const FEISHU_HTTP_TIMEOUT_MAX_MS = 300_000;
export const FEISHU_HTTP_TIMEOUT_ENV_VAR = "REMOTECLAW_FEISHU_HTTP_TIMEOUT_MS";

type FeishuHttpInstanceLike = Pick<
  typeof feishuClientSdk.defaultHttpInstance,
  "request" | "get" | "post" | "put" | "patch" | "delete" | "head" | "options"
>;

/**
 * Build an HTTPS proxy agent from the standard proxy env vars for the Feishu
 * long-connection WebSocket. Mirrors the Slack path (`resolveSlackProxyAgent`):
 * honor NO_PROXY for the target Feishu/Lark host, and apply the active
 * managed-proxy CA so a TLS-terminating managed proxy is trusted.
 *
 * `targetUrl` is the resolved Feishu/Lark domain the long connection reaches, so
 * an operator can exclude it via NO_PROXY exactly as they would any other host.
 *
 * Returns `undefined` when no proxy is configured, when NO_PROXY excludes the
 * target host, or when the proxy URL is unusable — each of which leaves Feishu on
 * a direct connection, matching the behavior before a proxy was configured.
 */
function getWsProxyAgent(targetUrl: string): HttpsProxyAgent<string> | undefined {
  try {
    const proxyUrl = resolveEnvHttpProxyUrl("https");
    if (!proxyUrl || matchesNoProxy(targetUrl)) {
      return undefined;
    }
    // An intercepting managed proxy terminates TLS with its own CA; without it
    // the long-connection handshake fails certificate validation.
    const ca = resolveActiveManagedProxyTlsOptions({ proxyUrl })?.ca;
    return new httpsProxyAgentCtor(proxyUrl, ca ? { ca } : undefined);
  } catch {
    return undefined;
  }
}

// Multi-account client cache
const clientCache = new Map<
  string,
  {
    client: Lark.Client;
    config: { appId: string; appSecret: string; domain?: FeishuDomain; httpTimeoutMs: number };
  }
>();

function resolveDomain(domain: FeishuDomain | undefined): Lark.Domain | string {
  if (domain === "lark") {
    return feishuClientSdk.Domain.Lark;
  }
  if (domain === "feishu" || !domain) {
    return feishuClientSdk.Domain.Feishu;
  }
  return domain.replace(/\/+$/, ""); // Custom URL for private deployment
}

/**
 * The egress URL the Feishu/Lark long connection reaches, used as the NO_PROXY
 * match target. NOT `resolveDomain`: that returns the Lark SDK's `Domain` enum,
 * which is NUMERIC at runtime (`Domain.Feishu === 0`, `Domain.Lark === 1`), so
 * `String(resolveDomain(...))` yields "0"/"1" — not a URL — and NO_PROXY would
 * never match. The base URLs mirror the SDK's own domain mapping
 * (`@larksuiteoapi/node-sdk`: Feishu → open.feishu.cn, Lark → open.larksuite.com).
 */
function resolveDomainUrl(domain: FeishuDomain | undefined): string {
  if (domain === "lark") {
    return "https://open.larksuite.com";
  }
  if (domain === "feishu" || !domain) {
    return "https://open.feishu.cn";
  }
  return domain.replace(/\/+$/, ""); // Custom URL for private deployment
}

/**
 * Create an HTTP instance that delegates to the Lark SDK's default instance
 * but injects a default request timeout to prevent indefinite hangs
 * (e.g. when the Feishu API is slow, causing per-chat queue deadlocks).
 */
function createTimeoutHttpInstance(defaultTimeoutMs: number): Lark.HttpInstance {
  const base: FeishuHttpInstanceLike = feishuClientSdk.defaultHttpInstance;

  function injectTimeout<D>(opts?: Lark.HttpRequestOptions<D>): Lark.HttpRequestOptions<D> {
    return { timeout: defaultTimeoutMs, ...opts } as Lark.HttpRequestOptions<D>;
  }

  return {
    request: (opts) => base.request(injectTimeout(opts)),
    get: (url, opts) => base.get(url, injectTimeout(opts)),
    post: (url, data, opts) => base.post(url, data, injectTimeout(opts)),
    put: (url, data, opts) => base.put(url, data, injectTimeout(opts)),
    patch: (url, data, opts) => base.patch(url, data, injectTimeout(opts)),
    delete: (url, opts) => base.delete(url, injectTimeout(opts)),
    head: (url, opts) => base.head(url, injectTimeout(opts)),
    options: (url, opts) => base.options(url, injectTimeout(opts)),
  };
}

/**
 * Credentials needed to create a Feishu client.
 * Both FeishuConfig and ResolvedFeishuAccount satisfy this interface.
 */
export type FeishuClientCredentials = {
  accountId?: string;
  appId?: string;
  appSecret?: string;
  domain?: FeishuDomain;
  httpTimeoutMs?: number;
  config?: Pick<FeishuConfig, "httpTimeoutMs">;
};

function resolveConfiguredHttpTimeoutMs(creds: FeishuClientCredentials): number {
  const clampTimeout = (value: number): number => {
    const rounded = Math.floor(value);
    return Math.min(Math.max(rounded, 1), FEISHU_HTTP_TIMEOUT_MAX_MS);
  };

  const fromDirectField = creds.httpTimeoutMs;
  if (
    typeof fromDirectField === "number" &&
    Number.isFinite(fromDirectField) &&
    fromDirectField > 0
  ) {
    return clampTimeout(fromDirectField);
  }

  const envRaw = process.env[FEISHU_HTTP_TIMEOUT_ENV_VAR];
  if (envRaw) {
    const envValue = Number(envRaw);
    if (Number.isFinite(envValue) && envValue > 0) {
      return clampTimeout(envValue);
    }
  }

  const fromConfig = creds.config?.httpTimeoutMs;
  const timeout = fromConfig;
  if (typeof timeout !== "number" || !Number.isFinite(timeout) || timeout <= 0) {
    return FEISHU_HTTP_TIMEOUT_MS;
  }
  return clampTimeout(timeout);
}

/**
 * Create or get a cached Feishu client for an account.
 * Accepts any object with appId, appSecret, and optional domain/accountId.
 */
export function createFeishuClient(creds: FeishuClientCredentials): Lark.Client {
  const { accountId = "default", appId, appSecret, domain } = creds;
  const defaultHttpTimeoutMs = resolveConfiguredHttpTimeoutMs(creds);

  if (!appId || !appSecret) {
    throw new Error(`Feishu credentials not configured for account "${accountId}"`);
  }

  // Check cache
  const cached = clientCache.get(accountId);
  if (
    cached &&
    cached.config.appId === appId &&
    cached.config.appSecret === appSecret &&
    cached.config.domain === domain &&
    cached.config.httpTimeoutMs === defaultHttpTimeoutMs
  ) {
    return cached.client;
  }

  // Create new client with timeout-aware HTTP instance
  const client = new feishuClientSdk.Client({
    appId,
    appSecret,
    appType: feishuClientSdk.AppType.SelfBuild,
    domain: resolveDomain(domain),
    httpInstance: createTimeoutHttpInstance(defaultHttpTimeoutMs),
  });

  // Cache it
  clientCache.set(accountId, {
    client,
    config: { appId, appSecret, domain, httpTimeoutMs: defaultHttpTimeoutMs },
  });

  return client;
}

/**
 * Create a Feishu WebSocket client for an account.
 * Note: WSClient is not cached since each call creates a new connection.
 */
export function createFeishuWSClient(account: ResolvedFeishuAccount): Lark.WSClient {
  const { accountId, appId, appSecret, domain } = account;

  if (!appId || !appSecret) {
    throw new Error(`Feishu credentials not configured for account "${accountId}"`);
  }

  const agent = getWsProxyAgent(resolveDomainUrl(domain));
  return new feishuClientSdk.WSClient({
    appId,
    appSecret,
    domain: resolveDomain(domain),
    loggerLevel: feishuClientSdk.LoggerLevel.info,
    ...(agent ? { agent } : {}),
  });
}

/**
 * Create an event dispatcher for an account.
 */
export function createEventDispatcher(account: ResolvedFeishuAccount): Lark.EventDispatcher {
  return new feishuClientSdk.EventDispatcher({
    encryptKey: account.encryptKey,
    verificationToken: account.verificationToken,
  });
}

/**
 * Get a cached client for an account (if exists).
 */
export function getFeishuClient(accountId: string): Lark.Client | null {
  return clientCache.get(accountId)?.client ?? null;
}

/**
 * Clear client cache for a specific account or all accounts.
 */
export function clearClientCache(accountId?: string): void {
  if (accountId) {
    clientCache.delete(accountId);
  } else {
    clientCache.clear();
  }
}

export function setFeishuClientRuntimeForTest(overrides?: {
  sdk?: Partial<FeishuClientSdk>;
  HttpsProxyAgent?: typeof HttpsProxyAgent;
}): void {
  feishuClientSdk = overrides?.sdk
    ? { ...defaultFeishuClientSdk, ...overrides.sdk }
    : defaultFeishuClientSdk;
  httpsProxyAgentCtor = overrides?.HttpsProxyAgent ?? HttpsProxyAgent;
}
