import type { ElevatedLevel, VerboseLevel } from "../thinking.js";

export async function resolveCurrentDirectiveLevels(params: {
  sessionEntry?: {
    verboseLevel?: unknown;
    elevatedLevel?: unknown;
  };
  agentCfg?: {
    verboseDefault?: unknown;
    elevatedDefault?: unknown;
  };
}): Promise<{
  currentVerboseLevel: VerboseLevel | undefined;
  currentElevatedLevel: ElevatedLevel | undefined;
}> {
  const currentVerboseLevel =
    (params.sessionEntry?.verboseLevel as VerboseLevel | undefined) ??
    (params.agentCfg?.verboseDefault as VerboseLevel | undefined);
  const currentElevatedLevel =
    (params.sessionEntry?.elevatedLevel as ElevatedLevel | undefined) ??
    (params.agentCfg?.elevatedDefault as ElevatedLevel | undefined);
  return {
    currentVerboseLevel,
    currentElevatedLevel,
  };
}
