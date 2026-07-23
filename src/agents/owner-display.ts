/**
 * Owner display settings for prompt rendering.
 *
 * Hash mode uses a dedicated prompt-display secret so auth material is never reused for owner redaction.
 */
import crypto from "node:crypto";
import { normalizeOptionalString } from "@remoteclaw/normalization-core/string-coerce";
import type { RemoteClawConfig } from "../config/types.remoteclaw.js";

export const MODULE_ATTESTATIONS = {
  resolveOwnerDisplaySetting: "live",
  ensureOwnerDisplaySecret: "live",
} as const;

type OwnerDisplaySetting = {
  ownerDisplay?: "raw" | "hash";
  ownerDisplaySecret?: string;
};

type OwnerDisplaySecretResolution = {
  config: RemoteClawConfig;
  generatedSecret?: string;
};

/**
 * Resolve owner display settings for prompt rendering.
 * Keep auth secrets decoupled from owner hash secrets.
 */
export function resolveOwnerDisplaySetting(config?: RemoteClawConfig): OwnerDisplaySetting {
  const ownerDisplay = config?.commands?.ownerDisplay;
  if (ownerDisplay !== "hash") {
    return { ownerDisplay, ownerDisplaySecret: undefined };
  }
  return {
    ownerDisplay: "hash",
    ownerDisplaySecret: normalizeOptionalString(config?.commands?.ownerDisplaySecret),
  };
}

/**
 * Ensure hash mode has a dedicated secret.
 * Returns updated config and generated secret when autofill was needed.
 */
export function ensureOwnerDisplaySecret(
  config: RemoteClawConfig,
  generateSecret: () => string = () => crypto.randomBytes(32).toString("hex"),
): OwnerDisplaySecretResolution {
  const settings = resolveOwnerDisplaySetting(config);
  if (settings.ownerDisplay !== "hash" || settings.ownerDisplaySecret) {
    return { config };
  }
  const generatedSecret = generateSecret();
  return {
    config: {
      ...config,
      commands: {
        ...config.commands,
        ownerDisplay: "hash",
        ownerDisplaySecret: generatedSecret,
      },
    },
    generatedSecret,
  };
}
