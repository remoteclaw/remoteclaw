/**
 * Auth profile → CLI subprocess env var injection.
 *
 * Resolves per-agent auth profile references to environment variables
 * suitable for injecting into CLI subprocess environments.
 */

import { resolveAgentAuth } from "../agents/agent-scope.js";
import { normalizeProviderId } from "../agents/provider-utils.js";
import type { RemoteClawConfig } from "../config/config.js";
import { createSubsystemLogger } from "../logging/subsystem.js";
import { ensureAuthProfileStore, resolveApiKeyForProfile } from "./index.js";
import type { AuthProfileStore } from "./types.js";

const log = createSubsystemLogger("auth-env");

/**
 * Round-robin state: tracks the last-used index per agent ID.
 * Resets on process restart — rotation is best-effort.
 */
const roundRobinState = new Map<string, number>();

/** @internal — exposed for tests only. */
export function _resetRoundRobinState(): void {
  roundRobinState.clear();
}

/**
 * Map a provider ID to the primary environment variable name used by CLI agents.
 *
 * Returns `undefined` for providers with no known env var mapping.
 */
export function resolveProviderEnvVarName(provider: string): string | undefined {
  const normalized = normalizeProviderId(provider);

  switch (normalized) {
    case "anthropic":
      return "ANTHROPIC_API_KEY";
    case "google":
      return "GEMINI_API_KEY";
    case "openai":
    case "openai-codex":
      return "OPENAI_API_KEY";
    case "opencode":
      return "OPENCODE_API_KEY";
    case "github-copilot":
      return "GITHUB_TOKEN";
    default:
      break;
  }

  const envMap: Record<string, string> = {
    voyage: "VOYAGE_API_KEY",
    groq: "GROQ_API_KEY",
    deepgram: "DEEPGRAM_API_KEY",
    cerebras: "CEREBRAS_API_KEY",
    xai: "XAI_API_KEY",
    openrouter: "OPENROUTER_API_KEY",
    litellm: "LITELLM_API_KEY",
    mistral: "MISTRAL_API_KEY",
    together: "TOGETHER_API_KEY",
    moonshot: "MOONSHOT_API_KEY",
    minimax: "MINIMAX_API_KEY",
    nvidia: "NVIDIA_API_KEY",
    xiaomi: "XIAOMI_API_KEY",
    venice: "VENICE_API_KEY",
    qianfan: "QIANFAN_API_KEY",
    kilocode: "KILOCODE_API_KEY",
  };

  return envMap[normalized];
}

/**
 * Pick the next profile ID from an array using round-robin.
 */
function pickRoundRobin(agentId: string, profiles: string[]): string | undefined {
  if (profiles.length === 0) {
    return undefined;
  }
  const lastIndex = roundRobinState.get(agentId) ?? -1;
  const nextIndex = (lastIndex + 1) % profiles.length;
  roundRobinState.set(agentId, nextIndex);
  return profiles[nextIndex];
}

/**
 * Return the number of auth profiles configured for an agent.
 *
 * - `auth: false` or `undefined` → 0
 * - `auth: "profile-id"` → 1
 * - `auth: ["id1", "id2"]` → N
 */
export function resolveAuthProfileCount(cfg: RemoteClawConfig, agentId: string): number {
  const auth = resolveAgentAuth(cfg, agentId);
  if (auth === false || auth === undefined) {
    return 0;
  }
  if (typeof auth === "string") {
    return 1;
  }
  return auth.length;
}

/**
 * Resolve per-agent auth profile(s) to env vars for CLI subprocess injection.
 *
 * - `auth: false` → no injection (returns `undefined`)
 * - `auth: "profile-id"` → resolve single profile, inject as env var
 * - `auth: ["id1", "id2"]` → round-robin rotation, inject selected profile
 * - `auth: undefined` → no injection (returns `undefined`)
 *
 * Missing or invalid profiles log a warning and return `undefined`
 * (fall-through to next credential precedence level).
 */
export async function resolveAuthEnv(params: {
  cfg: RemoteClawConfig;
  agentId: string;
  store?: AuthProfileStore;
}): Promise<Record<string, string> | undefined> {
  const auth = resolveAgentAuth(params.cfg, params.agentId);

  if (auth === false || auth === undefined) {
    return undefined;
  }

  const profileId = Array.isArray(auth) ? pickRoundRobin(params.agentId, auth) : auth;

  if (!profileId) {
    return undefined;
  }

  const store = params.store ?? ensureAuthProfileStore();

  let resolved: { apiKey: string; provider: string; email?: string } | null;
  try {
    resolved = await resolveApiKeyForProfile({
      cfg: params.cfg,
      store,
      profileId,
    });
  } catch {
    log.warn(`Failed to resolve auth profile "${profileId}" — skipping env injection`);
    return undefined;
  }

  if (!resolved) {
    log.warn(`Auth profile "${profileId}" not found or has no key — skipping env injection`);
    return undefined;
  }

  const envVarName = resolveProviderEnvVarName(resolved.provider);
  if (!envVarName) {
    log.warn(
      `No env var mapping for provider "${resolved.provider}" (profile "${profileId}") — skipping env injection`,
    );
    return undefined;
  }

  return { [envVarName]: resolved.apiKey };
}
