import type { createSubsystemLogger } from "../logging/subsystem.js";

type SubsystemLogger = ReturnType<typeof createSubsystemLogger>;

type ModelTransportDebugEnv = NodeJS.ProcessEnv;

export type ModelPayloadDebugMode = "off" | "summary" | "tools" | "full-redacted";
export type ModelSseDebugMode = "off" | "events" | "peek";

/**
 * Runtime attestation (ADR 0005 H9). Declares the implementation status
 * of each runtime export in this module. See CONTRIBUTING.md § Module
 * attestations for the category definitions and the convention for
 * updating these when sync or rebrand changes the surface.
 */
export const MODULE_ATTESTATIONS = {
  resolveModelPayloadDebugMode: "live",
  resolveModelSseDebugMode: "live",
  isModelTransportDebugEnabled: "live",
  emitModelTransportDebug: "live",
} as const;

function normalizeEnv(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function isTruthyEnv(value: unknown): boolean {
  const normalized = normalizeEnv(value);
  return (
    normalized.length > 0 &&
    normalized !== "0" &&
    normalized !== "false" &&
    normalized !== "off" &&
    normalized !== "no"
  );
}

export function resolveModelPayloadDebugMode(
  env: ModelTransportDebugEnv = process.env,
): ModelPayloadDebugMode {
  const normalized = normalizeEnv(env.REMOTECLAW_DEBUG_MODEL_PAYLOAD);
  if (normalized === "tools" || normalized === "full-redacted") {
    return normalized;
  }
  if (normalized === "summary") {
    return "summary";
  }
  return "off";
}

export function resolveModelSseDebugMode(
  env: ModelTransportDebugEnv = process.env,
): ModelSseDebugMode {
  const normalized = normalizeEnv(env.REMOTECLAW_DEBUG_SSE);
  if (normalized === "peek") {
    return "peek";
  }
  if (normalized === "events" || isTruthyEnv(normalized)) {
    return "events";
  }
  return "off";
}

export function isModelTransportDebugEnabled(env: ModelTransportDebugEnv = process.env): boolean {
  return (
    isTruthyEnv(env.REMOTECLAW_DEBUG_MODEL_TRANSPORT) ||
    resolveModelPayloadDebugMode(env) !== "off" ||
    resolveModelSseDebugMode(env) !== "off" ||
    isTruthyEnv(env.REMOTECLAW_DEBUG_CODE_MODE)
  );
}

export function emitModelTransportDebug(log: SubsystemLogger, message: string): void {
  if (isModelTransportDebugEnabled()) {
    log.info(message);
    return;
  }
  log.debug(message);
}
