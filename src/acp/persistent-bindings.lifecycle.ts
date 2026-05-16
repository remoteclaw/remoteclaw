/* eslint-disable @typescript-eslint/no-explicit-any */
import type { RemoteClawConfig } from "../config/config.js";
import type { SessionAcpMeta } from "../config/sessions/types.js";
import { logVerbose } from "../globals.js";
import { formatErrorMessage } from "../infra/errors.js";
import { normalizeLowercaseStringOrEmpty } from "../shared/string-coerce.js";
import { resolveConfiguredAcpBindingSpecBySessionKey } from "./persistent-bindings.resolve.js";
import {
  buildConfiguredAcpSessionKey,
  normalizeText,
  type ConfiguredAcpBindingSpec,
} from "./persistent-bindings.types.js";
import { readAcpSessionEntry } from "./runtime/session-meta.js";

function sessionMatchesConfiguredBinding(params: {
  cfg: RemoteClawConfig;
  spec: ConfiguredAcpBindingSpec;
  meta: SessionAcpMeta;
}): boolean {
  const desiredAgent = normalizeLowercaseStringOrEmpty(
    params.spec.acpAgentId ?? params.spec.agentId,
  );
  const currentAgent = normalizeLowercaseStringOrEmpty(params.meta.agent);
  if (!currentAgent || currentAgent !== desiredAgent) {
    return false;
  }

  if (params.meta.mode !== params.spec.mode) {
    return false;
  }

  const desiredBackend =
    (params.spec as any).backend?.trim() || (params.cfg.acp as any)?.backend?.trim() || "";
  if (desiredBackend) {
    const currentBackend = ((params.meta as any).backend ?? "").trim();
    if (!currentBackend || currentBackend !== desiredBackend) {
      return false;
    }
  }

  const desiredCwd = params.spec.cwd?.trim();
  if (desiredCwd !== undefined) {
    const currentCwd = (params.meta.runtimeOptions?.cwd ?? params.meta.cwd ?? "").trim();
    if (desiredCwd !== currentCwd) {
      return false;
    }
  }
  return true;
}

export async function ensureConfiguredAcpBindingSession(params: {
  cfg: RemoteClawConfig;
  spec: ConfiguredAcpBindingSpec;
}): Promise<{ ok: true; sessionKey: string } | { ok: false; sessionKey: string; error: string }> {
  const sessionKey = buildConfiguredAcpSessionKey(params.spec);
  try {
    const resolution: { kind: string; meta?: { agent?: string } } = { kind: "none" };
    if (
      resolution.kind === "ready" &&
      sessionMatchesConfiguredBinding({
        cfg: params.cfg,
        spec: params.spec,
        meta: resolution.meta as import("../config/sessions/types.js").SessionAcpMeta,
      })
    ) {
      return {
        ok: true,
        sessionKey,
      };
    }

    if (resolution.kind !== "none") {
      await (undefined as any)?.closeSession({
        cfg: params.cfg,
        sessionKey,
        reason: "config-binding-reconfigure",
        clearMeta: false,
        allowBackendUnavailable: true,
        requireAcpSession: false,
      });
    }

    await (undefined as any)?.initializeSession({
      cfg: params.cfg,
      sessionKey,
      agent: params.spec.acpAgentId ?? params.spec.agentId,
      mode: params.spec.mode,
      cwd: params.spec.cwd,
      backendId: params.spec.backend,
    });

    return {
      ok: true,
      sessionKey,
    };
  } catch (error) {
    const message = formatErrorMessage(error);
    logVerbose(
      `acp-persistent-binding: failed ensuring ${params.spec.channel}:${params.spec.accountId}:${params.spec.conversationId} -> ${sessionKey}: ${message}`,
    );
    return {
      ok: false,
      sessionKey,
      error: message,
    };
  }
}

export async function resetAcpSessionInPlace(params: {
  cfg: RemoteClawConfig;
  sessionKey: string;
  reason: "new" | "reset";
}): Promise<{ ok: true } | { ok: false; skipped?: boolean; error?: string }> {
  const sessionKey = params.sessionKey.trim();
  if (!sessionKey) {
    return {
      ok: false,
      skipped: true,
    };
  }

  const configuredBinding = resolveConfiguredAcpBindingSpecBySessionKey({
    cfg: params.cfg,
    sessionKey,
  });
  const meta = readAcpSessionEntry({
    cfg: params.cfg,
    sessionKey,
  })?.acp;
  if (!meta) {
    if (configuredBinding) {
      const ensured = await ensureConfiguredAcpBindingSession({
        cfg: params.cfg,
        spec: configuredBinding,
      });
      if (ensured.ok) {
        return { ok: true };
      }
      return {
        ok: false,
        error: ensured.error,
      };
    }
    return {
      ok: false,
      skipped: true,
    };
  }

  const agent =
    normalizeText(meta.agent) ??
    configuredBinding?.acpAgentId ??
    configuredBinding?.agentId ??
    undefined;
  const mode = meta.mode === "oneshot" ? "oneshot" : "persistent";
  const runtimeOptions = { ...meta.runtimeOptions };
  const cwd = normalizeText(runtimeOptions.cwd ?? meta.cwd);

  try {
    await (undefined as any)?.closeSession({
      cfg: params.cfg,
      sessionKey,
      reason: `${params.reason}-in-place-reset`,
      clearMeta: false,
      allowBackendUnavailable: true,
      requireAcpSession: false,
    });

    await (undefined as any)?.initializeSession({
      cfg: params.cfg,
      sessionKey,
      agent,
      mode,
      cwd,
      backendId: normalizeText(meta?.backend) ?? normalizeText((params.cfg.acp as any)?.backend),
    });

    const runtimeOptionsPatch = Object.fromEntries(
      Object.entries(runtimeOptions).filter(([, value]) => value !== undefined),
    ) as SessionAcpMeta["runtimeOptions"];
    if (runtimeOptionsPatch && Object.keys(runtimeOptionsPatch).length > 0) {
      await (undefined as any)?.updateSessionRuntimeOptions({
        cfg: params.cfg,
        sessionKey,
        patch: runtimeOptionsPatch,
      });
    }
    return { ok: true };
  } catch (error) {
    const message = formatErrorMessage(error);
    logVerbose(`acp-persistent-binding: failed reset for ${sessionKey}: ${message}`);
    return {
      ok: false,
      error: message,
    };
  }
}
