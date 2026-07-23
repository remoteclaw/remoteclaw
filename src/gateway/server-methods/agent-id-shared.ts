import { listAgentIds, resolveDefaultAgentId } from "../../agents/agent-scope.js";
import type { RemoteClawConfig } from "../../config/types.remoteclaw.js";
import { ErrorCodes, errorShape } from "../protocol/index.js";
import type { RespondFn } from "./types.js";

export function resolveAgentIdOrRespondError(params: {
  rawAgentId: unknown;
  respond: RespondFn;
  cfg: RemoteClawConfig;
  normalize: (rawAgentId: unknown) => string | undefined;
}) {
  const knownAgents = listAgentIds(params.cfg);
  const requestedAgentId = params.normalize(params.rawAgentId) ?? "";
  const agentId = requestedAgentId || resolveDefaultAgentId(params.cfg);
  if (requestedAgentId && !knownAgents.includes(agentId)) {
    params.respond(
      false,
      undefined,
      errorShape(ErrorCodes.INVALID_REQUEST, `unknown agent id "${requestedAgentId}"`),
    );
    return null;
  }
  return { cfg: params.cfg, agentId };
}
