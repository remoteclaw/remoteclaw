/* eslint-disable */
import { resolveSessionKeyAgentId } from "../../agents/agent-scope.js";
import { listSubagentRunsForRequester } from "../../agents/subagent-registry.js";
import {
  resolveInternalSessionKey,
  resolveMainSessionAlias,
} from "../../agents/tools/sessions-helpers.js";
import type { RemoteClawConfig } from "../../config/config.js";
import type { SessionEntry, SessionScope } from "../../config/sessions.js";
import { logVerbose } from "../../globals.js";
import { getRoutingDropCounts } from "../../routing/routing-drops-accumulator.js";
import { normalizeGroupActivation } from "../group-activation.js";
import { buildStatusMessage } from "../status.js";
import type { VerboseLevel } from "../thinking.js";
import type { ReplyPayload } from "../types.js";
import type { CommandContext } from "./commands-types.js";
import { getFollowupQueueDepth, resolveQueueSettings } from "./queue.js";
import { resolveSubagentLabel } from "./subagents-utils.js";

function formatRoutingDropsLine(): string | undefined {
  const drops = getRoutingDropCounts();
  if (drops.total === 0) {
    return undefined;
  }
  const perChannel = Object.entries(drops.byChannel)
    .toSorted((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([channel, count]) => `${channel}:${count}`)
    .join(", ");
  return `🚫 Drops: ${drops.total}${perChannel ? ` (${perChannel})` : ""}`;
}

export async function buildStatusReply(params: {
  cfg: RemoteClawConfig;
  command: CommandContext;
  sessionEntry?: SessionEntry;
  sessionKey: string;
  parentSessionKey?: string;
  sessionScope?: SessionScope;
  storePath?: string;
  provider: string;
  model: string;
  resolvedVerboseLevel: VerboseLevel;
  isGroup: boolean;
  defaultGroupActivation: () => "always" | "mention";
  contextTokens?: number;
  resolvedReasoningLevel?: unknown;
  resolvedElevatedLevel?: unknown;
  mediaDecisions?: unknown;
}): Promise<ReplyPayload | undefined> {
  const {
    cfg,
    command,
    sessionEntry,
    sessionKey,
    parentSessionKey,
    sessionScope,
    storePath,
    provider: _provider,
    model: _model,
    resolvedVerboseLevel,
    isGroup,
    defaultGroupActivation,
  } = params;
  if (!command.isAuthorizedSender) {
    logVerbose(`Ignoring /status from unauthorized sender: ${command.senderId || "<unknown>"}`);
    return undefined;
  }
  const statusAgentId = resolveSessionKeyAgentId(sessionKey, cfg);
  const queueSettings = resolveQueueSettings({
    cfg,
    channel: command.channel,
    sessionEntry,
  });
  const queueKey = sessionKey ?? sessionEntry?.sessionId;
  const queueDepth = queueKey ? getFollowupQueueDepth(queueKey) : 0;
  const queueOverrides = Boolean(
    sessionEntry?.queueDebounceMs ?? sessionEntry?.queueCap ?? sessionEntry?.queueDrop,
  );

  let subagentsLine: string | undefined;
  if (sessionKey) {
    const { mainKey, alias } = resolveMainSessionAlias(cfg);
    const requesterKey = resolveInternalSessionKey({ key: sessionKey, alias, mainKey });
    const runs = listSubagentRunsForRequester(requesterKey);
    const verboseEnabled = resolvedVerboseLevel && resolvedVerboseLevel !== "off";
    if (runs.length > 0) {
      const active = runs.filter((entry) => !entry.endedAt);
      const done = runs.length - active.length;
      if (verboseEnabled) {
        const labels = active
          .map((entry) => resolveSubagentLabel(entry, ""))
          .filter(Boolean)
          .slice(0, 3);
        const labelText = labels.length ? ` (${labels.join(", ")})` : "";
        subagentsLine = `🤖 Subagents: ${active.length} active${labelText} · ${done} done`;
      } else if (active.length > 0) {
        subagentsLine = `🤖 Subagents: ${active.length} active`;
      }
    }
  }
  const groupActivation = isGroup
    ? (normalizeGroupActivation(sessionEntry?.groupActivation) ?? defaultGroupActivation())
    : undefined;
  const agentDefaults = cfg.agents?.defaults ?? {};
  const routingDropsLine = formatRoutingDropsLine();
  const statusText = await buildStatusMessage({
    config: cfg,
    agent: {
      ...agentDefaults,
      verboseDefault: agentDefaults.verboseDefault,
    },
    agentId: statusAgentId,
    sessionEntry,
    sessionKey,
    parentSessionKey,
    sessionScope,
    sessionStorePath: storePath,
    groupActivation,
    resolvedVerbose: resolvedVerboseLevel,
    queue: {
      mode: queueSettings.mode,
      depth: queueDepth,
      debounceMs: queueSettings.debounceMs,
      cap: queueSettings.cap,
      dropPolicy: queueSettings.dropPolicy,
      showDetails: queueOverrides,
    },
    subagentsLine,
    routingDropsLine,
    includeTranscriptUsage: false,
  });

  return { text: statusText };
}
