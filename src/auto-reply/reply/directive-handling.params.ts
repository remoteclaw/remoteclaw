import type { RemoteClawConfig } from "../../config/config.js";
import type { SessionEntry } from "../../config/sessions.js";
import type { MsgContext } from "../templating.js";
import type { InlineDirectives } from "./directive-handling.parse.js";
import type { VerboseLevel } from "./directives.js";

export type HandleDirectiveOnlyCoreParams = {
  cfg: RemoteClawConfig;
  directives: InlineDirectives;
  sessionEntry: SessionEntry;
  sessionStore: Record<string, SessionEntry>;
  sessionKey: string;
  storePath?: string;
  messageProviderKey?: string;
};

export type HandleDirectiveOnlyParams = HandleDirectiveOnlyCoreParams & {
  currentVerboseLevel?: VerboseLevel;
};

export type ApplyInlineDirectivesFastLaneParams = HandleDirectiveOnlyCoreParams & {
  commandAuthorized: boolean;
  ctx: MsgContext;
  agentId?: string;
  isGroup: boolean;
  agentCfg?: NonNullable<RemoteClawConfig["agents"]>["defaults"];
};
