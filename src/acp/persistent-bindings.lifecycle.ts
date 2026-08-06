/* eslint-disable @typescript-eslint/no-explicit-any */
import type { RemoteClawConfig } from "../config/config.js";
import type { SessionAcpMeta } from "../config/sessions/types.js";
import { logVerbose } from "../globals.js";
import { formatErrorMessage } from "../infra/errors.js";
import { normalizeLowercaseStringOrEmpty } from "../shared/string-coerce.js";
import { resolveConfiguredAcpBindingSpecBySessionKey } from "./persistent-bindings.resolve.js";
import {
  buildConfiguredAcpSessionKey,
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

/**
 * The ACP session manager (`initializeSession` / `closeSession` /
 * `updateSessionRuntimeOptions`) is gutted in the RemoteClaw fork — the Pi-era
 * implementation was removed and AgentRuntime does not own ACP session
 * lifecycle yet. Anything that needs it to have *acted* must report that it
 * could not, instead of resolving as though it had (#2929).
 */
export const ACP_SESSION_LIFECYCLE_UNAVAILABLE =
  "ACP session lifecycle is not available in RemoteClaw fork";

/**
 * Route-readiness gate: `ok` means "this bound route may carry traffic", NOT
 * "a session was (re)initialized". Callers drop inbound messages when this is
 * not ok (see extensions/discord message-handler.preflight.ts), so it must stay
 * permissive while the session manager is gutted. It is deliberately NOT
 * evidence that a reset happened — see `resetAcpSessionInPlace`.
 */
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

/**
 * Reset actuator for `/new` and `/reset` on a bound ACP session.
 *
 * `ok: true` means the ACP runtime was actually closed and re-initialized. It
 * MUST NOT be returned for a no-op: `session.ts` suppresses the normal session
 * rotation whenever a conversation resolves to a bound ACP session, so a
 * falsely-successful result here is exactly what let the user be told the reset
 * worked while nothing happened (#2929).
 *
 * Restoring a working reset means driving the gutted session manager:
 * `closeSession` (reason `${reason}-in-place-reset`, `clearMeta: false`) then
 * `initializeSession` with the stored agent/mode/cwd/backend, then re-applying
 * `meta.runtimeOptions` via `updateSessionRuntimeOptions`. Until that manager
 * exists, report the failure so callers can surface it.
 */
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
  if (!meta && !configuredBinding) {
    // Nothing addressed by this key — there is no ACP session to reset.
    return {
      ok: false,
      skipped: true,
    };
  }

  // There IS an ACP session (or a configured binding for one) that should have
  // been reset, and no session manager to do it with. Note this is deliberately
  // not delegated to ensureConfiguredAcpBindingSession: that gate answers
  // "may this route carry traffic", never "was this session reset".
  logVerbose(
    `acp-persistent-binding: cannot ${params.reason}-in-place-reset ${sessionKey}: ${ACP_SESSION_LIFECYCLE_UNAVAILABLE}`,
  );
  return {
    ok: false,
    error: ACP_SESSION_LIFECYCLE_UNAVAILABLE,
  };
}
