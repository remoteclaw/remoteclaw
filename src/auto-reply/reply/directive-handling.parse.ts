import type { RemoteClawConfig } from "../../config/config.js";
import type { MsgContext } from "../templating.js";
import type { VerboseLevel } from "./directives.js";
import { extractStatusDirective, extractVerboseDirective } from "./directives.js";
import { stripMentions, stripStructuralPrefixes } from "./mentions.js";
import type { QueueDropPolicy, QueueMode } from "./queue.js";
import { extractQueueDirective } from "./queue.js";

export type InlineDirectives = {
  cleaned: string;
  hasVerboseDirective: boolean;
  verboseLevel?: VerboseLevel;
  rawVerboseLevel?: string;
  hasStatusDirective: boolean;
  hasQueueDirective: boolean;
  queueMode?: QueueMode;
  queueReset: boolean;
  rawQueueMode?: string;
  debounceMs?: number;
  cap?: number;
  dropPolicy?: QueueDropPolicy;
  rawDebounce?: string;
  rawCap?: string;
  rawDrop?: string;
  hasQueueOptions: boolean;
};

export function parseInlineDirectives(
  body: string,
  options?: {
    modelAliases?: string[];
    allowStatusDirective?: boolean;
  },
): InlineDirectives {
  const {
    cleaned: verboseCleaned,
    verboseLevel,
    rawLevel: rawVerboseLevel,
    hasDirective: hasVerboseDirective,
  } = extractVerboseDirective(body);
  const allowStatusDirective = options?.allowStatusDirective !== false;
  const { cleaned: statusCleaned, hasDirective: hasStatusDirective } = allowStatusDirective
    ? extractStatusDirective(verboseCleaned)
    : { cleaned: verboseCleaned, hasDirective: false };
  const {
    cleaned: queueCleaned,
    queueMode,
    queueReset,
    rawMode,
    debounceMs,
    cap,
    dropPolicy,
    rawDebounce,
    rawCap,
    rawDrop,
    hasDirective: hasQueueDirective,
    hasOptions: hasQueueOptions,
  } = extractQueueDirective(statusCleaned);

  return {
    cleaned: queueCleaned,
    hasVerboseDirective,
    verboseLevel,
    rawVerboseLevel,
    hasStatusDirective,
    hasQueueDirective,
    queueMode,
    queueReset,
    rawQueueMode: rawMode,
    debounceMs,
    cap,
    dropPolicy,
    rawDebounce,
    rawCap,
    rawDrop,
    hasQueueOptions,
  };
}

export function isDirectiveOnly(params: {
  directives: InlineDirectives;
  cleanedBody: string;
  ctx: MsgContext;
  cfg: RemoteClawConfig;
  agentId?: string;
  isGroup: boolean;
}): boolean {
  const { directives, cleanedBody, ctx, cfg, agentId, isGroup } = params;
  if (!directives.hasVerboseDirective && !directives.hasQueueDirective) {
    return false;
  }
  const stripped = stripStructuralPrefixes(cleanedBody ?? "");
  const noMentions = isGroup ? stripMentions(stripped, ctx, cfg, agentId) : stripped;
  return noMentions.length === 0;
}
