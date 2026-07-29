/**
 * Resolves ClickClack account configuration from root channel config, named
 * account overrides, and secret-provider references.
 */
import {
  createAccountListHelpers,
  DEFAULT_ACCOUNT_ID,
  hasConfiguredAccountValue,
  normalizeAccountId,
  normalizeOptionalString,
  normalizeResolvedSecretInputString,
  normalizeSecretInputString,
  resolveDefaultSecretProviderAlias,
  resolveIntegerOption,
  resolveMergedAccountConfig,
  resolveSecretInputString,
} from "remoteclaw/plugin-sdk/clickclack";
import type { ClickClackAccountConfig, CoreConfig, ResolvedClickClackAccount } from "./types.js";

const DEFAULT_RECONNECT_MS = 1_500;
const MIN_RECONNECT_MS = 100;
const MAX_RECONNECT_MS = 60_000;

/**
 * Narrow read of one `secrets.providers.*` entry. The fork's config types the
 * provider map as `Record<string, unknown>`, so callers must project the two
 * fields they actually gate on instead of reaching through `any`.
 */
type SecretProviderConfigShape = { source?: string; allowlist?: readonly string[] };

function readSecretProviderConfig(
  cfg: CoreConfig,
  provider: string,
): SecretProviderConfigShape | undefined {
  const entry = cfg.secrets?.providers?.[provider];
  return entry && typeof entry === "object" ? (entry as SecretProviderConfigShape) : undefined;
}

const {
  listAccountIds: listClickClackAccountIds,
  resolveDefaultAccountId: resolveDefaultClickClackAccountId,
} = createAccountListHelpers("clickclack", {
  normalizeAccountId,
  hasImplicitDefaultAccount: (cfg) => {
    const channel = (cfg as CoreConfig).channels?.clickclack;
    return Boolean(
      channel?.baseUrl?.trim() &&
      hasConfiguredAccountValue(channel.token) &&
      channel.workspace?.trim(),
    );
  },
});

export { DEFAULT_ACCOUNT_ID, listClickClackAccountIds, resolveDefaultClickClackAccountId };

function resolveMergedClickClackAccountConfig(
  cfg: CoreConfig,
  accountId: string,
): ClickClackAccountConfig {
  return resolveMergedAccountConfig<ClickClackAccountConfig & Record<string, unknown>>({
    channelConfig: cfg.channels?.clickclack as ClickClackAccountConfig | undefined,
    accounts: cfg.channels?.clickclack?.accounts,
    accountId,
    omitKeys: ["defaultAccount"],
    normalizeAccountId,
  });
}

function resolveClickClackToken(params: {
  cfg: CoreConfig;
  value: unknown;
  accountId: string;
  env?: NodeJS.ProcessEnv;
}): string {
  const resolved = resolveSecretInputString({
    value: params.value,
    path:
      params.accountId === DEFAULT_ACCOUNT_ID
        ? "channels.clickclack.token"
        : `channels.clickclack.accounts.${params.accountId}.token`,
    defaults: params.cfg.secrets?.defaults,
    mode: "inspect",
  });
  if (resolved.status !== "available") {
    if (resolved.status === "configured_unavailable" && resolved.ref.source === "env") {
      const providerConfig = readSecretProviderConfig(params.cfg, resolved.ref.provider);
      if (providerConfig) {
        if (providerConfig.source !== "env") {
          throw new Error(
            `Secret provider "${resolved.ref.provider}" has source "${providerConfig.source}" but ref requests "env".`,
          );
        }
        if (providerConfig.allowlist && !providerConfig.allowlist.includes(resolved.ref.id)) {
          throw new Error(
            `Environment variable "${resolved.ref.id}" is not allowlisted in secrets.providers.${resolved.ref.provider}.allowlist.`,
          );
        }
      } else if (
        resolved.ref.provider !==
        // Only `secrets.defaults` is consulted here (the provider map is used
        // solely by the `preferFirstProviderForSource` option, which is off).
        resolveDefaultSecretProviderAlias(
          { secrets: { defaults: params.cfg.secrets?.defaults } },
          "env",
        )
      ) {
        throw new Error(
          `Secret provider "${resolved.ref.provider}" is not configured (ref: env:${resolved.ref.provider}:${resolved.ref.id}).`,
        );
      }
      return normalizeSecretInputString((params.env ?? process.env)[resolved.ref.id]) ?? "";
    }
    return "";
  }
  return (
    normalizeResolvedSecretInputString({
      value: resolved.value,
      path: "channels.clickclack.token",
    }) ?? ""
  );
}

/**
 * Builds the normalized account snapshot used by gateway, outbound delivery,
 * status reporting, and channel routing.
 */
export function resolveClickClackAccount(params: {
  cfg: CoreConfig;
  accountId?: string | null;
  env?: NodeJS.ProcessEnv;
}): ResolvedClickClackAccount {
  const accountId = normalizeAccountId(params.accountId);
  const merged = resolveMergedClickClackAccountConfig(params.cfg, accountId);
  const baseEnabled = params.cfg.channels?.clickclack?.enabled !== false;
  const enabled = baseEnabled && merged.enabled !== false;
  const baseUrl = merged.baseUrl?.trim().replace(/\/$/, "") ?? "";
  const token = resolveClickClackToken({
    cfg: params.cfg,
    value: merged.token,
    accountId,
    env: params.env,
  });
  const workspace = merged.workspace?.trim() ?? "";
  // Fail closed: an account with no configured `allowFrom` admits NO senders.
  //
  // Deliberate divergence from upstream OpenClaw, which defaults `["*"]`.
  // That default is open admission, not a permissive per-sender filter on top
  // of a separate gate: `access.ts` hands this exact value to
  // `resolveStableChannelMessageIngress` as the allowlist for its hardcoded
  // `dmPolicy`/`groupPolicy: "allowlist"`, and a `"*"` entry matches any
  // subject — so an unconfigured account would admit every workspace member.
  // The shared ingress kernel likewise coalesces an absent list to `[]`
  // (`message-access/runtime.ts`).
  //
  // Do NOT restore the wildcard during an upstream sync (#3054).
  const allowFrom = merged.allowFrom ?? [];
  return {
    accountId,
    enabled,
    configured: Boolean(baseUrl && token && workspace),
    name: normalizeOptionalString(merged.name),
    baseUrl,
    token,
    workspace,
    botUserId: normalizeOptionalString(merged.botUserId),
    agentId: normalizeOptionalString(merged.agentId),
    timeoutSeconds: merged.timeoutSeconds,
    defaultTo: merged.defaultTo?.trim() || "channel:general",
    allowFrom,
    reconnectMs: resolveIntegerOption(merged.reconnectMs, DEFAULT_RECONNECT_MS, {
      min: MIN_RECONNECT_MS,
      max: MAX_RECONNECT_MS,
    }),
    config: {
      ...merged,
      allowFrom,
    },
  };
}

/**
 * Returns all enabled accounts, including the implicit default account when
 * legacy top-level ClickClack config is present.
 */
export function listEnabledClickClackAccounts(cfg: CoreConfig): ResolvedClickClackAccount[] {
  return listClickClackAccountIds(cfg)
    .map((accountId) => resolveClickClackAccount({ cfg, accountId }))
    .filter((account) => account.enabled);
}
