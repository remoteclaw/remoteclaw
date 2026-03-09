import type { TelegramGroupConfig, TelegramTopicConfig } from "../config/types.js";

export function resolveTelegramGroupPromptSettings(params: {
  groupConfig?: TelegramGroupConfig;
  topicConfig?: TelegramTopicConfig;
}): {
  groupSystemPrompt: string | undefined;
} {
  const systemPromptParts = [
    params.groupConfig?.systemPrompt?.trim() || null,
    params.topicConfig?.systemPrompt?.trim() || null,
  ].filter((entry): entry is string => Boolean(entry));
  const groupSystemPrompt =
    systemPromptParts.length > 0 ? systemPromptParts.join("\n\n") : undefined;
  return { groupSystemPrompt };
}
