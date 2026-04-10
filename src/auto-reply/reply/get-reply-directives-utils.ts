import type { InlineDirectives } from "./directive-handling.js";

export function clearInlineDirectives(cleaned: string | InlineDirectives): InlineDirectives {
  const cleanedText = typeof cleaned === "string" ? cleaned : cleaned.cleaned;
  return {
    cleaned: cleanedText,
    hasVerboseDirective: false,
    verboseLevel: undefined,
    rawVerboseLevel: undefined,
    hasStatusDirective: false,
    hasModelDirective: false,
    rawModelDirective: undefined,
    hasQueueDirective: false,
    queueMode: undefined,
    queueReset: false,
    rawQueueMode: undefined,
    debounceMs: undefined,
    cap: undefined,
    dropPolicy: undefined,
    rawDebounce: undefined,
    rawCap: undefined,
    rawDrop: undefined,
    hasQueueOptions: false,
  };
}
