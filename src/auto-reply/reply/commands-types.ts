import type { ChannelId } from "../../channels/plugins/types.js";
import type { RemoteClawConfig } from "../../config/config.js";
import type { SessionEntry, SessionScope } from "../../config/sessions.js";
import type { MsgContext } from "../templating.js";
import type { VerboseLevel } from "../thinking.js";
import type { ReplyPayload } from "../types.js";
import type { InlineDirectives } from "./directive-handling.js";

export type CommandContext = {
  surface: string;
  channel: string;
  channelId?: ChannelId;
  ownerList: string[];
  senderIsOwner: boolean;
  isAuthorizedSender: boolean;
  senderId?: string;
  abortKey?: string;
  rawBodyNormalized: string;
  commandBodyNormalized: string;
  from?: string;
  to?: string;
  /** Internal marker to prevent duplicate reset-hook emission across command pipelines. */
  resetHookTriggered?: boolean;
};

export type HandleCommandsParams = {
  ctx: MsgContext;
  cfg: RemoteClawConfig;
  command: CommandContext;
  agentId?: string;
  agentDir?: string;
  directives: InlineDirectives;
  sessionEntry?: SessionEntry;
  previousSessionEntry?: SessionEntry;
  sessionStore?: Record<string, SessionEntry>;
  sessionKey: string;
  storePath?: string;
  sessionScope?: SessionScope;
  workspaceDir: string;
  defaultGroupActivation: () => "always" | "mention";
  resolvedVerboseLevel: VerboseLevel;
  provider: string;
  model: string;
  contextTokens: number;
  isGroup: boolean;
};

export type CommandHandlerResult = {
  reply?: ReplyPayload;
  shouldContinue: boolean;
};

export type CommandHandler = (
  params: HandleCommandsParams,
  allowTextCommands: boolean,
) => Promise<CommandHandlerResult | null>;
