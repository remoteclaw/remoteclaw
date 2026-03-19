import type { BaseTokenResolution } from "../channels/plugins/types.js";
import type { RemoteClawConfig } from "../config/config.js";
import type { SecretInput } from "../config/types.secrets.js";
import { DEFAULT_ACCOUNT_ID, normalizeAccountId } from "../routing/session-key.js";

function resolveSecretToString(input?: SecretInput | null): string | undefined {
  if (!input) {
    return undefined;
  }
  if (typeof input === "string") {
    return input;
  }
  // SecretRef — resolve from env
  if (input.env) {
    return process.env[input.env] ?? undefined;
  }
  return undefined;
}

export type DiscordTokenSource = "env" | "config" | "none";

export type DiscordTokenResolution = BaseTokenResolution & {
  source: DiscordTokenSource;
};

export function normalizeDiscordToken(raw?: string | null): string | undefined {
  if (!raw) {
    return undefined;
  }
  const trimmed = raw.trim();
  if (!trimmed) {
    return undefined;
  }
  return trimmed.replace(/^Bot\s+/i, "");
}

export function resolveDiscordToken(
  cfg?: RemoteClawConfig,
  opts: { accountId?: string | null; envToken?: string | null } = {},
): DiscordTokenResolution {
  const accountId = normalizeAccountId(opts.accountId);
  const discordCfg = cfg?.channels?.discord;
  const accountCfg =
    accountId !== DEFAULT_ACCOUNT_ID
      ? discordCfg?.accounts?.[accountId]
      : discordCfg?.accounts?.[DEFAULT_ACCOUNT_ID];
  const accountToken = normalizeDiscordToken(resolveSecretToString(accountCfg?.token));
  if (accountToken) {
    return { token: accountToken, source: "config" };
  }

  const allowEnv = accountId === DEFAULT_ACCOUNT_ID;
  const configToken = allowEnv
    ? normalizeDiscordToken(resolveSecretToString(discordCfg?.token))
    : undefined;
  if (configToken) {
    return { token: configToken, source: "config" };
  }

  const envToken = allowEnv
    ? normalizeDiscordToken(opts.envToken ?? process.env.DISCORD_BOT_TOKEN)
    : undefined;
  if (envToken) {
    return { token: envToken, source: "env" };
  }

  return { token: "", source: "none" };
}
