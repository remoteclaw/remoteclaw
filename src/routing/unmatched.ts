import { logInboundDrop } from "../channels/logging.js";
import type { RemoteClawConfig } from "../config/config.js";
import { logVerbose } from "../globals.js";
import { emitDiagnosticEvent } from "../infra/diagnostic-events.js";
import type { RouteScope } from "./resolve-route.js";
import { normalizeAgentId } from "./session-key.js";

function listConfiguredAgentIds(cfg: RemoteClawConfig): string[] {
  const agents = cfg.agents?.list;
  if (!Array.isArray(agents)) {
    return [];
  }
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const entry of agents) {
    const id = typeof entry?.id === "string" ? entry.id.trim() : "";
    if (!id) {
      continue;
    }
    const normalized = normalizeAgentId(id);
    if (seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    ids.push(normalized);
  }
  return ids;
}

export type UnmatchedAction = { action: "drop" } | { action: "route"; agentId: string };

function normalizeConfiguredUnmatchedAgent(cfg: RemoteClawConfig): string | null {
  const unmatched = cfg.routing?.unmatched;
  if (unmatched && typeof unmatched === "object" && "agent" in unmatched) {
    const trimmed = typeof unmatched.agent === "string" ? unmatched.agent.trim() : "";
    return trimmed ? trimmed : null;
  }
  return null;
}

function resolveDropTarget(scope: RouteScope): string | undefined {
  if (scope.peer?.id) {
    return `${scope.peer.kind}:${scope.peer.id}`;
  }
  if (scope.accountId) {
    return scope.accountId;
  }
  return undefined;
}

/**
 * Centralized policy handler invoked when {@link resolveAgentRoute} returns an
 * unmatched result. Decides whether to silently drop the message (default) or
 * route it to an operator-configured catch-all agent (`routing.unmatched.agent`).
 *
 * For the drop path, fires operator-visible telemetry through the diagnostic
 * event bus and the structured-log helper. Downstream listeners (OTel counter,
 * Control UI broadcast, `/remoteclaw status` accumulator) react to the same
 * diagnostic event — a single emission point keeps semantics aligned across
 * every surface.
 */
export function handleUnmatched(scope: RouteScope, cfg: RemoteClawConfig): UnmatchedAction {
  const catchAllAgent = normalizeConfiguredUnmatchedAgent(cfg);
  if (catchAllAgent) {
    return { action: "route", agentId: catchAllAgent };
  }

  const target = resolveDropTarget(scope);
  logInboundDrop({
    log: logVerbose,
    channel: scope.channel,
    reason: "unmatched-binding",
    target,
  });

  emitDiagnosticEvent({
    type: "routing.drop",
    channel: scope.channel,
    reason: "unmatched",
    scope: {
      channel: scope.channel,
      accountId: scope.accountId || null,
      peer: scope.peer ? { kind: scope.peer.kind, id: scope.peer.id } : null,
      guildId: scope.guildId,
      teamId: scope.teamId,
    },
    configuredAgents: listConfiguredAgentIds(cfg),
    target,
  });

  return { action: "drop" };
}
