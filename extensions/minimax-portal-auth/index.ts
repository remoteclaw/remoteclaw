import {
  emptyPluginConfigSchema,
  type RemoteClawPluginApi,
  type ProviderAuthContext,
  type ProviderAuthResult,
} from "openclaw/plugin-sdk";
import { loginMiniMaxPortalOAuth, type MiniMaxRegion } from "./oauth.js";

const PROVIDER_ID = "minimax-portal";
const PROVIDER_LABEL = "MiniMax";
const DEFAULT_MODEL = "MiniMax-M2.5";
const DEFAULT_BASE_URL_CN = "https://api.minimaxi.com/anthropic";
const DEFAULT_BASE_URL_GLOBAL = "https://api.minimax.io/anthropic";
function getDefaultBaseUrl(region: MiniMaxRegion): string {
  return region === "cn" ? DEFAULT_BASE_URL_CN : DEFAULT_BASE_URL_GLOBAL;
}

function modelRef(modelId: string): string {
  return `${PROVIDER_ID}/${modelId}`;
}

function createOAuthHandler(region: MiniMaxRegion) {
  const defaultBaseUrl = getDefaultBaseUrl(region);
  const regionLabel = region === "cn" ? "CN" : "Global";

  return async (ctx: ProviderAuthContext): Promise<ProviderAuthResult> => {
    const progress = ctx.prompter.progress(`Starting MiniMax OAuth (${regionLabel})…`);
    try {
      const result = await loginMiniMaxPortalOAuth({
        openUrl: ctx.openUrl,
        note: ctx.prompter.note,
        progress,
        region,
      });

      progress.stop("MiniMax OAuth complete");

      if (result.notification_message) {
        await ctx.prompter.note(result.notification_message, "MiniMax OAuth");
      }

      const profileId = `${PROVIDER_ID}:default`;
      const baseUrl = result.resourceUrl || defaultBaseUrl;

      return {
        profiles: [
          {
            profileId,
            credential: {
              type: "oauth" as const,
              provider: PROVIDER_ID,
              access: result.access,
              refresh: result.refresh,
              expires: result.expires,
            },
          },
        ],
        configPatch: {},
        defaultModel: modelRef(DEFAULT_MODEL),
        notes: [
          "MiniMax OAuth tokens auto-refresh. Re-run login if refresh fails or access is revoked.",
          `Base URL defaults to ${defaultBaseUrl}. Override models.providers.${PROVIDER_ID}.baseUrl if needed.`,
          ...(result.notification_message ? [result.notification_message] : []),
        ],
      };
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      progress.stop(`MiniMax OAuth failed: ${errorMsg}`);
      await ctx.prompter.note(
        "If OAuth fails, verify your MiniMax account has portal access and try again.",
        "MiniMax OAuth",
      );
      throw err;
    }
  };
}

const minimaxPortalPlugin = {
  id: "minimax-portal-auth",
  name: "MiniMax OAuth",
  description: "OAuth flow for MiniMax models",
  configSchema: emptyPluginConfigSchema(),
  register(api: RemoteClawPluginApi) {
    api.registerProvider({
      id: PROVIDER_ID,
      label: PROVIDER_LABEL,
      docsPath: "/providers/minimax",
      aliases: ["minimax"],
      auth: [
        {
          id: "oauth",
          label: "MiniMax OAuth (Global)",
          hint: "Global endpoint - api.minimax.io",
          kind: "device_code",
          run: createOAuthHandler("global"),
        },
        {
          id: "oauth-cn",
          label: "MiniMax OAuth (CN)",
          hint: "CN endpoint - api.minimaxi.com",
          kind: "device_code",
          run: createOAuthHandler("cn"),
        },
      ],
    });
  },
};

export default minimaxPortalPlugin;
