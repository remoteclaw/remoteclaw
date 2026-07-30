// Proxy capture env helpers build proxy-related env vars for child processes.
import { randomUUID } from "node:crypto";
import type { Agent } from "node:http";
import { createRequire } from "node:module";
import process from "node:process";
import {
  resolveDebugProxyBlobDir,
  resolveDebugProxyCertDir,
  resolveDebugProxyDbPath,
} from "./paths.js";

// Environment contract for debug proxy capture. These vars are passed to child
// processes and provider transports so capture sessions share one store/proxy.
export const REMOTECLAW_DEBUG_PROXY_ENABLED = "REMOTECLAW_DEBUG_PROXY_ENABLED";
export const REMOTECLAW_DEBUG_PROXY_URL = "REMOTECLAW_DEBUG_PROXY_URL";
/** @deprecated Capture storage now lives in the shared state database. */
export const REMOTECLAW_DEBUG_PROXY_DB_PATH = "REMOTECLAW_DEBUG_PROXY_DB_PATH";
/** @deprecated Capture payloads now live in the shared state database. */
export const REMOTECLAW_DEBUG_PROXY_BLOB_DIR = "REMOTECLAW_DEBUG_PROXY_BLOB_DIR";
export const REMOTECLAW_DEBUG_PROXY_CERT_DIR = "REMOTECLAW_DEBUG_PROXY_CERT_DIR";
export const REMOTECLAW_DEBUG_PROXY_SESSION_ID = "REMOTECLAW_DEBUG_PROXY_SESSION_ID";
export const REMOTECLAW_DEBUG_PROXY_REQUIRE = "REMOTECLAW_DEBUG_PROXY_REQUIRE";

export type DebugProxySettings = {
  enabled: boolean;
  required: boolean;
  proxyUrl?: string;
  /** @deprecated Capture storage now lives in the shared state database. */
  dbPath: string;
  /** @deprecated Capture payloads now live in the shared state database. */
  blobDir: string;
  certDir: string;
  sessionId: string;
  sourceProcess: string;
};

let cachedImplicitSessionId: string | undefined;
let cachedHttpsProxyAgent: typeof import("https-proxy-agent").HttpsProxyAgent | undefined;

function loadHttpsProxyAgent(): typeof import("https-proxy-agent").HttpsProxyAgent {
  cachedHttpsProxyAgent ??= (
    createRequire(import.meta.url)("https-proxy-agent") as typeof import("https-proxy-agent")
  ).HttpsProxyAgent;
  return cachedHttpsProxyAgent;
}

function isTruthy(value: string | undefined): boolean {
  return value === "1" || value === "true" || value === "yes" || value === "on";
}

export function resolveDebugProxySettings(
  env: NodeJS.ProcessEnv = process.env,
): DebugProxySettings {
  const enabled = isTruthy(env[REMOTECLAW_DEBUG_PROXY_ENABLED]);
  const explicitSessionId = env[REMOTECLAW_DEBUG_PROXY_SESSION_ID]?.trim() || undefined;
  // Local implicit sessions stay stable within one process so repeated callers
  // write to the same capture session until an explicit id overrides it.
  const sessionId = explicitSessionId ?? (cachedImplicitSessionId ??= randomUUID());
  return {
    enabled,
    required: isTruthy(env[REMOTECLAW_DEBUG_PROXY_REQUIRE]),
    proxyUrl: env[REMOTECLAW_DEBUG_PROXY_URL]?.trim() || undefined,
    dbPath: env[REMOTECLAW_DEBUG_PROXY_DB_PATH]?.trim() || resolveDebugProxyDbPath(env),
    blobDir: env[REMOTECLAW_DEBUG_PROXY_BLOB_DIR]?.trim() || resolveDebugProxyBlobDir(env),
    certDir: env[REMOTECLAW_DEBUG_PROXY_CERT_DIR]?.trim() || resolveDebugProxyCertDir(env),
    sessionId,
    sourceProcess: "remoteclaw",
  };
}

export function applyDebugProxyEnv(
  env: NodeJS.ProcessEnv,
  params: {
    proxyUrl: string;
    sessionId: string;
    certDir?: string;
  },
): NodeJS.ProcessEnv {
  // Child process env forces proxy capture and standard proxy variables while
  // preserving unrelated environment values.
  const baseEnv = { ...env };
  delete baseEnv.REMOTECLAW_DEBUG_PROXY_DB_PATH;
  delete baseEnv.REMOTECLAW_DEBUG_PROXY_BLOB_DIR;
  return {
    ...baseEnv,
    [REMOTECLAW_DEBUG_PROXY_ENABLED]: "1",
    [REMOTECLAW_DEBUG_PROXY_REQUIRE]: "1",
    [REMOTECLAW_DEBUG_PROXY_URL]: params.proxyUrl,
    [REMOTECLAW_DEBUG_PROXY_CERT_DIR]: params.certDir ?? resolveDebugProxyCertDir(env),
    [REMOTECLAW_DEBUG_PROXY_SESSION_ID]: params.sessionId,
    HTTP_PROXY: params.proxyUrl,
    HTTPS_PROXY: params.proxyUrl,
    ALL_PROXY: params.proxyUrl,
  };
}

export function createDebugProxyWebSocketAgent(settings: DebugProxySettings): Agent | undefined {
  if (!settings.enabled || !settings.proxyUrl) {
    return undefined;
  }
  const HttpsProxyAgent = loadHttpsProxyAgent();
  return new HttpsProxyAgent(settings.proxyUrl);
}

// Configured URLs win over ambient capture settings; callers use this when a
// channel/provider already exposes an explicit proxy option.
export function resolveEffectiveDebugProxyUrl(configuredProxyUrl?: string): string | undefined {
  const explicit = configuredProxyUrl?.trim();
  if (explicit) {
    return explicit;
  }
  const settings = resolveDebugProxySettings();
  return settings.enabled ? settings.proxyUrl : undefined;
}
