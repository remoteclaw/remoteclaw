import crypto from "node:crypto";
import type { RemoteClawConfig } from "../config/config.js";
import { normalizeOptionalString } from "../shared/string-coerce.js";

/**
 * Runtime attestation (ADR 0005 H9). Declares the implementation status
 * of each runtime export in this module. See CONTRIBUTING.md § Module
 * attestations for the category definitions and the convention for
 * updating these when sync or rebrand changes the surface.
 */
export const MODULE_ATTESTATIONS = {
  resolveOwnerDisplaySetting: "live",
  ensureOwnerDisplaySecret: "live",
} as const;

export type OwnerDisplaySetting = {
  ownerDisplay?: "raw" | "hash";
  ownerDisplaySecret?: string;
};

export type OwnerDisplaySecretResolution = {
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
