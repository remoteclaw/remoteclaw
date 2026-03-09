import type { RemoteClawConfig } from "../../config/config.js";
import { extractModelDirective } from "../model.js";
import type { MsgContext } from "../templating.js";
import type { ElevatedLevel, VerboseLevel } from "./directives.js";
import {
  extractElevatedDirective,
  extractStatusDirective,
  extractVerboseDirective,
} from "./directives.js";
import { stripMentions, stripStructuralPrefixes } from "./mentions.js";
import type { QueueDropPolicy, QueueMode } from "./queue.js";
import { extractQueueDirective } from "./queue.js";

export type InlineDirectives = {
  cleaned: string;
  hasVerboseDirective: boolean;
  verboseLevel?: VerboseLevel;
  rawVerboseLevel?: string;
  hasElevatedDirective: boolean;
  elevatedLevel?: ElevatedLevel;
  rawElevatedLevel?: string;
  hasStatusDirective: boolean;
  hasModelDirective: boolean;
  rawModelDirective?: string;
  rawModelProfile?: string;
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
    disableElevated?: boolean;
    allowStatusDirective?: boolean;
  },
): InlineDirectives {
  const {
    cleaned: verboseCleaned,
    verboseLevel,
    rawLevel: rawVerboseLevel,
    hasDirective: hasVerboseDirective,
  } = extractVerboseDirective(body);
  const {
    cleaned: elevatedCleaned,
    elevatedLevel,
    rawLevel: rawElevatedLevel,
    hasDirective: hasElevatedDirective,
  } = options?.disableElevated
    ? {
        cleaned: verboseCleaned,
        elevatedLevel: undefined,
        rawLevel: undefined,
        hasDirective: false,
      }
    : extractElevatedDirective(verboseCleaned);
  const allowStatusDirective = options?.allowStatusDirective !== false;
  const { cleaned: statusCleaned, hasDirective: hasStatusDirective } = allowStatusDirective
    ? extractStatusDirective(elevatedCleaned)
    : { cleaned: elevatedCleaned, hasDirective: false };
  const {
    cleaned: modelCleaned,
    rawModel,
    rawProfile,
    hasDirective: hasModelDirective,
  } = extractModelDirective(statusCleaned, {
    aliases: options?.modelAliases,
  });
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
  } = extractQueueDirective(modelCleaned);

  return {
    cleaned: queueCleaned,
    hasVerboseDirective,
    verboseLevel,
    rawVerboseLevel,
    hasElevatedDirective,
    elevatedLevel,
    rawElevatedLevel,
    hasStatusDirective,
    hasModelDirective,
    rawModelDirective: rawModel,
    rawModelProfile: rawProfile,
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
  if (
    !directives.hasVerboseDirective &&
    !directives.hasElevatedDirective &&
    !directives.hasModelDirective &&
    !directives.hasQueueDirective
  ) {
    return false;
  }
  const stripped = stripStructuralPrefixes(cleanedBody ?? "");
  const noMentions = isGroup ? stripMentions(stripped, ctx, cfg, agentId) : stripped;
  return noMentions.length === 0;
}
