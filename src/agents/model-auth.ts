/* eslint-disable @typescript-eslint/no-explicit-any */
// Gutted in RemoteClaw fork (Middleware Boundary Principle)
// Re-export from auth/provider-auth where those symbols live
export {
  resolveApiKeyForProvider,
  resolveModelAuthMode,
  resolveEnvApiKey,
  requireApiKey,
} from "../auth/provider-auth.js";
export type { ResolvedProviderAuth } from "../auth/provider-auth.js";

import type { RemoteClawConfig } from "../config/config.js";
import type { ModelProviderConfig } from "../config/types.models.js";
import { normalizeOptionalSecretInput } from "../utils/normalize-secret-input.js";
import { normalizeProviderId } from "./provider-utils.js";

/**
 * Runtime attestation (ADR 0005 H9). Declares the implementation status
 * of each runtime export in this module. See CONTRIBUTING.md § Module
 * attestations for the category definitions and the convention for
 * updating these when sync or rebrand changes the surface.
 */
export const MODULE_ATTESTATIONS = {
  getCustomProviderApiKey: "live",
  getApiKeyForModel: "partial", // returns undefined; callers tolerate
} as const;

function resolveProviderConfig(
  cfg: RemoteClawConfig | undefined,
  provider: string,
): ModelProviderConfig | undefined {
  const providers = cfg?.models?.providers ?? {};
  const direct = providers[provider] as ModelProviderConfig | undefined;
  if (direct) {
    return direct;
  }
  const normalized = normalizeProviderId(provider);
  if (normalized === provider) {
    const matched = Object.entries(providers).find(
      ([key]) => normalizeProviderId(key) === normalized,
    );
    return matched?.[1];
  }
  return Object.entries(providers).find(([key]) => normalizeProviderId(key) === normalized)?.[1];
}

export function getCustomProviderApiKey(
  cfg: RemoteClawConfig | undefined,
  provider: string,
): string | undefined {
  const entry = resolveProviderConfig(cfg, provider);
  return normalizeOptionalSecretInput(entry?.apiKey);
}

export const getApiKeyForModel = (..._args: unknown[]) => undefined as any;
