import type { SessionEntry } from "../config/sessions.js";
import { normalizeProviderId } from "./provider-utils.js";

/**
 * Runtime attestation (ADR 0005 H9). Declares the implementation status
 * of each runtime export in this module. See CONTRIBUTING.md § Module
 * attestations for the category definitions and the convention for
 * updating these when sync or rebrand changes the surface.
 */
export const MODULE_ATTESTATIONS = {
  getCliSessionId: "live",
  setCliSessionId: "live",
} as const;

export function getCliSessionId(entry: SessionEntry | undefined, provider: string): string | undefined {
  if (!entry) {
    return undefined;
  }
  const normalized = normalizeProviderId(provider);
  const fromMap = entry.cliSessionIds?.[normalized];
  if (fromMap?.trim()) {
    return fromMap.trim();
  }
  return undefined;
}

export function setCliSessionId(entry: SessionEntry, provider: string, sessionId: string): void {
  const normalized = normalizeProviderId(provider);
  const trimmed = sessionId.trim();
  if (!trimmed) {
    return;
  }
  const existing = entry.cliSessionIds ?? {};
  entry.cliSessionIds = { ...existing };
  entry.cliSessionIds[normalized] = trimmed;
}
