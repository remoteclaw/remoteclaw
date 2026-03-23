import type { RemoteClawConfig } from "../config/config.js";
import { logVerbose } from "../globals.js";
import { resolveConfiguredAcpBindingSpecBySessionKey } from "./persistent-bindings.resolve.js";
import {
  buildConfiguredAcpSessionKey,
  type ConfiguredAcpBindingSpec,
} from "./persistent-bindings.types.js";

// ACP control-plane and runtime modules have been gutted in this fork.
// These functions are stubbed to maintain the compilation contract while
// the AgentRuntime replacement is being developed.

export async function ensureConfiguredAcpBindingSession(params: {
  cfg: RemoteClawConfig;
  spec: ConfiguredAcpBindingSpec;
}): Promise<{ ok: true; sessionKey: string } | { ok: false; sessionKey: string; error: string }> {
  const sessionKey = buildConfiguredAcpSessionKey(params.spec);
  logVerbose(
    `acp-persistent-binding: ensureConfiguredAcpBindingSession stubbed for ${params.spec.channel}:${params.spec.accountId}:${params.spec.conversationId} -> ${sessionKey}`,
  );
  return {
    ok: false,
    sessionKey,
    error: "ACP runtime not available (gutted subsystem)",
  };
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

  logVerbose(`acp-persistent-binding: resetAcpSessionInPlace stubbed for ${sessionKey}`);
  return {
    ok: false,
    skipped: true,
  };
}
