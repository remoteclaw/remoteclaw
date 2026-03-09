import type { VerboseLevel } from "../thinking.js";

export async function resolveCurrentDirectiveLevels(params: {
  sessionEntry?: {
    verboseLevel?: unknown;
  };
  agentCfg?: {
    verboseDefault?: unknown;
  };
}): Promise<{
  currentVerboseLevel: VerboseLevel | undefined;
}> {
  const currentVerboseLevel =
    (params.sessionEntry?.verboseLevel as VerboseLevel | undefined) ??
    (params.agentCfg?.verboseDefault as VerboseLevel | undefined);
  return {
    currentVerboseLevel,
  };
}
