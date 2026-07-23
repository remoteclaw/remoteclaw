// Discord plugin module implements proxy fetch behavior.
import { isIP } from "node:net";
import { normalizeLowercaseStringOrEmpty } from "remoteclaw/plugin-sdk/string-coerce-runtime";
import { danger } from "../../../src/globals.js";
import type { RuntimeEnv } from "../../../src/runtime.js";

/**
 * Run `createValue` with a proxy URL only after it passes Discord proxy validation.
 * A rejected proxy yields `undefined` so callers can fall back to a guarded default
 * rather than crashing the monitor on operator misconfiguration.
 */
export function withValidatedDiscordProxy<T>(
  proxyUrl: string | undefined,
  runtime: Pick<RuntimeEnv, "error"> | undefined,
  createValue: (proxyUrl: string) => T,
): T | undefined {
  const proxy = proxyUrl?.trim();
  if (!proxy) {
    return undefined;
  }
  try {
    validateDiscordProxyUrl(proxy);
    return createValue(proxy);
  } catch (err) {
    runtime?.error?.(danger(`discord: invalid rest proxy: ${String(err)}`));
    return undefined;
  }
}

export function validateDiscordProxyUrl(proxyUrl: string): string {
  let parsed: URL;
  try {
    parsed = new URL(proxyUrl);
  } catch {
    throw new Error("Proxy URL must be a valid http or https URL");
  }
  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error("Proxy URL must use http or https");
  }
  if (!isLoopbackProxyHostname(parsed.hostname)) {
    throw new Error("Proxy URL must target a loopback host");
  }
  return proxyUrl;
}

// The bot token rides on every Discord REST call, so a proxy may only be a local
// interception point (a debug proxy or a sidecar), never a remote host.
function isLoopbackProxyHostname(hostname: string): boolean {
  const normalized = normalizeLowercaseStringOrEmpty(hostname);
  if (!normalized) {
    return false;
  }
  const bracketless =
    normalized.startsWith("[") && normalized.endsWith("]") ? normalized.slice(1, -1) : normalized;
  if (bracketless === "localhost") {
    return true;
  }
  const ipFamily = isIP(bracketless);
  if (ipFamily === 4) {
    return bracketless.startsWith("127.");
  }
  if (ipFamily === 6) {
    return bracketless === "::1" || bracketless === "0:0:0:0:0:0:0:1";
  }
  return false;
}
