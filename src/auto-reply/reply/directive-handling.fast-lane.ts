import type { VerboseLevel } from "../thinking.js";
import type { ReplyPayload } from "../types.js";
import { handleDirectiveOnly } from "./directive-handling.impl.js";
import type { ApplyInlineDirectivesFastLaneParams } from "./directive-handling.params.js";
import { isDirectiveOnly } from "./directive-handling.parse.js";

export async function applyInlineDirectivesFastLane(
  params: ApplyInlineDirectivesFastLaneParams,
): Promise<{ directiveAck?: ReplyPayload }> {
  const {
    directives,
    commandAuthorized,
    ctx,
    cfg,
    agentId,
    isGroup,
    sessionEntry,
    sessionStore,
    sessionKey,
    storePath,
    messageProviderKey,
  } = params;

  if (
    !commandAuthorized ||
    isDirectiveOnly({
      directives,
      cleanedBody: directives.cleaned,
      ctx,
      cfg,
      agentId,
      isGroup,
    })
  ) {
    return { directiveAck: undefined };
  }

  const agentCfg = params.agentCfg;
  const currentVerboseLevel =
    (sessionEntry?.verboseLevel as VerboseLevel | undefined) ??
    (agentCfg?.verboseDefault as VerboseLevel | undefined);

  const directiveAck = await handleDirectiveOnly({
    cfg,
    directives,
    sessionEntry,
    sessionStore,
    sessionKey,
    storePath,
    messageProviderKey,
    currentVerboseLevel,
  });

  return { directiveAck };
}
