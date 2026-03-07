import { upsertAuthProfile } from "../agents/auth-profiles.js";
import type { RemoteClawConfig, GatewayAuthConfig } from "../config/config.js";
import type { WizardPrompter } from "../wizard/prompts.js";
import { randomToken } from "./onboard-helpers.js";
import type { AgentRuntime } from "./onboard-types.js";

type GatewayAuthChoice = "token" | "password" | "trusted-proxy";

/** Reject undefined, empty, and common JS string-coercion artifacts for token auth. */
function sanitizeTokenValue(value: string | undefined): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  if (!trimmed || trimmed === "undefined" || trimmed === "null") {
    return undefined;
  }
  return trimmed;
}

export function buildGatewayAuthConfig(params: {
  existing?: GatewayAuthConfig;
  mode: GatewayAuthChoice;
  token?: string;
  password?: string;
  trustedProxy?: {
    userHeader: string;
    requiredHeaders?: string[];
    allowUsers?: string[];
  };
}): GatewayAuthConfig | undefined {
  const allowTailscale = params.existing?.allowTailscale;
  const base: GatewayAuthConfig = {};
  if (typeof allowTailscale === "boolean") {
    base.allowTailscale = allowTailscale;
  }

  if (params.mode === "token") {
    // Keep token mode always valid: treat empty/undefined/"undefined"/"null" as missing and generate a token.
    const token = sanitizeTokenValue(params.token) ?? randomToken();
    return { ...base, mode: "token", token };
  }
  if (params.mode === "password") {
    const password = params.password?.trim();
    return { ...base, mode: "password", ...(password && { password }) };
  }
  if (params.mode === "trusted-proxy") {
    if (!params.trustedProxy) {
      throw new Error("trustedProxy config is required when mode is trusted-proxy");
    }
    return { ...base, mode: "trusted-proxy", trustedProxy: params.trustedProxy };
  }
  return base;
}

export async function promptAuthConfig(
  cfg: RemoteClawConfig,
  _runtime: unknown,
  prompter: WizardPrompter,
): Promise<RemoteClawConfig> {
  const selectedRuntime: AgentRuntime = await prompter.select({
    message: "Which agent runtime?",
    options: [
      { value: "claude", label: "Claude Code (claude)" },
      { value: "gemini", label: "Gemini CLI (gemini)" },
      { value: "codex", label: "Codex CLI (codex exec)" },
      { value: "opencode", label: "OpenCode (opencode)" },
    ],
    initialValue: "claude",
  });

  const promptApiKey = async (message: string) => {
    const key = await prompter.text({ message, initialValue: "" });
    return key.trim();
  };

  if (selectedRuntime === "claude") {
    const key = await promptApiKey("Anthropic API key (or leave empty to skip)");
    if (key) {
      upsertAuthProfile({
        profileId: "anthropic:default",
        credential: { type: "api_key", provider: "anthropic", key },
      });
    }
  } else if (selectedRuntime === "gemini") {
    const key = await promptApiKey("Gemini API key (or leave empty to skip)");
    if (key) {
      upsertAuthProfile({
        profileId: "google:default",
        credential: { type: "api_key", provider: "google", key },
      });
    }
  } else if (selectedRuntime === "codex") {
    const key = await promptApiKey("Codex API key (or leave empty to skip)");
    if (key) {
      upsertAuthProfile({
        profileId: "codex:default",
        credential: { type: "api_key", provider: "codex", key },
      });
    }
  } else if (selectedRuntime === "opencode") {
    const key = await promptApiKey("API key (or leave empty to skip)");
    if (key) {
      upsertAuthProfile({
        profileId: "opencode:default",
        credential: { type: "api_key", provider: "opencode", key },
      });
    }
  }

  return {
    ...cfg,
    agents: {
      ...cfg.agents,
      defaults: {
        ...cfg.agents?.defaults,
        runtime: selectedRuntime,
      },
    },
  };
}
