// Slack plugin module implements client behavior.
import { createHash } from "node:crypto";
import { type RetryOptions, type WebClientOptions, WebClient } from "@slack/web-api";
import { HttpsProxyAgent } from "https-proxy-agent";
import { matchesNoProxy, resolveEnvHttpProxyUrl } from "../../../src/infra/net/proxy-env.js";
import { resolveActiveManagedProxyTlsOptions } from "../../../src/infra/net/proxy/managed-proxy-undici.js";

export const SLACK_DEFAULT_RETRY_OPTIONS: RetryOptions = {
  retries: 2,
  factor: 2,
  minTimeout: 500,
  maxTimeout: 3000,
  randomize: true,
};

export const SLACK_WRITE_RETRY_OPTIONS: RetryOptions = {
  retries: 0,
};

/**
 * Slack egress host, used to evaluate NO_PROXY. Both the Web API and the Socket
 * Mode WebSocket are reached under `slack.com`, so one entry covers both paths.
 */
const SLACK_PROXY_TARGET_URL = "https://slack.com/";

/**
 * Build an HTTPS proxy agent from the standard proxy env vars for use as the
 * `agent` option on Slack WebClients. Bolt carries the same agent through to the
 * Socket Mode WebSocket upgrade on its own, so setting it here covers both the
 * Web API and Socket Mode; client.socket-mode-proxy.test.ts pins that chain.
 *
 * Returns `undefined` when no proxy is configured, when NO_PROXY excludes Slack,
 * or when the proxy URL is unusable — each of which leaves Slack on a direct
 * connection, matching the behavior before a proxy was configured.
 */
export function resolveSlackProxyAgent(): HttpsProxyAgent<string> | undefined {
  try {
    const proxyUrl = resolveEnvHttpProxyUrl("https");
    if (!proxyUrl || matchesNoProxy(SLACK_PROXY_TARGET_URL)) {
      return undefined;
    }
    // An intercepting managed proxy terminates TLS with its own CA; without it
    // every Slack request fails certificate validation.
    const ca = resolveActiveManagedProxyTlsOptions({ proxyUrl })?.ca;
    return new HttpsProxyAgent(proxyUrl, ca ? { ca } : undefined);
  } catch {
    return undefined;
  }
}

export function resolveSlackWebClientOptions(options: WebClientOptions = {}): WebClientOptions {
  return {
    ...options,
    agent: options.agent ?? resolveSlackProxyAgent(),
    retryConfig: options.retryConfig ?? SLACK_DEFAULT_RETRY_OPTIONS,
  };
}

export function resolveSlackWriteClientOptions(options: WebClientOptions = {}): WebClientOptions {
  return {
    ...options,
    agent: options.agent ?? resolveSlackProxyAgent(),
    retryConfig: options.retryConfig ?? SLACK_WRITE_RETRY_OPTIONS,
  };
}

export function createSlackWebClient(token: string, options: WebClientOptions = {}) {
  return new WebClient(token, resolveSlackWebClientOptions(options));
}

export function createSlackWriteClient(token: string, options: WebClientOptions = {}) {
  return new WebClient(token, resolveSlackWriteClientOptions(options));
}

export function createSlackTokenCacheKey(token: string): string {
  return `sha256:${createHash("sha256").update(token).digest("base64url")}`;
}
