import { DEFAULT_ACCOUNT_ID } from "remoteclaw/plugin-sdk/account-id";
import type { RemoteClawPluginApi } from "remoteclaw/plugin-sdk/channel-plugin-common";
import { normalizeSlackWebhookPath } from "./paths.js";
import { handleSlackHttpRequest } from "./registry.js";

type SlackWebhookConfig = {
  webhookPath?: unknown;
  accounts?: Record<string, { webhookPath?: unknown } | undefined>;
};

function resolveSlackWebhookPaths(config: RemoteClawPluginApi["config"]): string[] {
  const slack = config.channels?.slack as SlackWebhookConfig | undefined;
  const accountConfigs = slack?.accounts ?? {};
  const paths = new Set<string>();
  for (const accountId of new Set([DEFAULT_ACCOUNT_ID, ...Object.keys(accountConfigs)])) {
    const path = accountConfigs[accountId]?.webhookPath ?? slack?.webhookPath;
    paths.add(normalizeSlackWebhookPath(typeof path === "string" ? path : undefined));
  }
  return [...paths].toSorted((left, right) => left.localeCompare(right));
}

export function registerSlackPluginHttpRoutes(api: RemoteClawPluginApi): void {
  for (const path of resolveSlackWebhookPaths(api.config)) {
    api.registerHttpRoute({
      path,
      auth: "plugin",
      handler: async (req, res) => await handleSlackHttpRequest(req, res),
    });
  }
}
