import type { LegacyConfigRule } from "./legacy.shared.js";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function hasLegacyThreadBindingTtl(value: unknown): boolean {
  return isRecord(value) && Object.prototype.hasOwnProperty.call(value, "ttlHours");
}

function hasLegacyThreadBindingTtlInAccounts(value: unknown): boolean {
  if (!isRecord(value)) {
    return false;
  }
  return Object.values(value).some((entry) =>
    hasLegacyThreadBindingTtl(isRecord(entry) ? entry.threadBindings : undefined),
  );
}

export const LEGACY_CONFIG_RULES: LegacyConfigRule[] = [
  {
    path: ["session", "threadBindings"],
    message:
      "session.threadBindings.ttlHours was renamed to session.threadBindings.idleHours (auto-migrated on load).",
    match: (value) => hasLegacyThreadBindingTtl(value),
  },
  {
    path: ["channels", "discord", "threadBindings"],
    message:
      "channels.discord.threadBindings.ttlHours was renamed to channels.discord.threadBindings.idleHours (auto-migrated on load).",
    match: (value) => hasLegacyThreadBindingTtl(value),
  },
  {
    path: ["channels", "discord", "accounts"],
    message:
      "channels.discord.accounts.<id>.threadBindings.ttlHours was renamed to channels.discord.accounts.<id>.threadBindings.idleHours (auto-migrated on load).",
    match: (value) => hasLegacyThreadBindingTtlInAccounts(value),
  },
];
