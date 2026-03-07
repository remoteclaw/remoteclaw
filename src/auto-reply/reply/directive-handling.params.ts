import type { RemoteClawConfig } from "../../config/config.js";
import type { SessionEntry } from "../../config/sessions.js";
import type { MsgContext } from "../templating.js";
import type { InlineDirectives } from "./directive-handling.parse.js";
import type { ElevatedLevel, VerboseLevel } from "./directives.js";

export type HandleDirectiveOnlyCoreParams = {
  cfg: RemoteClawConfig;
  directives: InlineDirectives;
  sessionEntry: SessionEntry;
  sessionStore: Record<string, SessionEntry>;
  sessionKey: string;
  storePath?: string;
  elevatedEnabled: boolean;
  elevatedAllowed: boolean;
  elevatedFailures?: Array<{ gate: string; key: string }>;
  messageProviderKey?: string;
  defaultProvider: string;
  defaultModel: string;
  aliasIndex: Map<string, { provider: string; model: string }>;
  allowedModelKeys: Set<string>;
  allowedModelCatalog: Array<{ id: string; provider: string }>;
  resetModelOverride: boolean;
  provider: string;
  model: string;
  initialModelLabel: string;
  formatModelSwitchEvent: (label: string, alias?: string) => string;
};

export type HandleDirectiveOnlyParams = HandleDirectiveOnlyCoreParams & {
  currentVerboseLevel?: VerboseLevel;
  currentElevatedLevel?: ElevatedLevel;
  surface?: string;
};

export type ApplyInlineDirectivesFastLaneParams = HandleDirectiveOnlyCoreParams & {
  commandAuthorized: boolean;
  ctx: MsgContext;
  agentId?: string;
  isGroup: boolean;
  agentCfg?: NonNullable<RemoteClawConfig["agents"]>["defaults"];
  modelState: {
    allowedModelKeys: Set<string>;
    allowedModelCatalog: Array<{ id: string; provider: string }>;
    resetModelOverride: boolean;
  };
};
