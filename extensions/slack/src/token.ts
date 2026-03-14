import { normalizeSecretInputString } from "../../../src/config/types.secrets.js";

export function normalizeSlackToken(raw?: unknown): string | undefined {
  return normalizeSecretInputString({
    value: raw,
    path: "channels.slack.*.token",
  });
}

export function resolveSlackBotToken(
  raw?: unknown,
  path = "channels.slack.botToken",
): string | undefined {
  return normalizeSecretInputString({ value: raw, path });
}

export function resolveSlackAppToken(
  raw?: unknown,
  path = "channels.slack.appToken",
): string | undefined {
  return normalizeSecretInputString({ value: raw, path });
}

export function resolveSlackUserToken(
  raw?: unknown,
  path = "channels.slack.userToken",
): string | undefined {
  return normalizeSecretInputString({ value: raw, path });
}
