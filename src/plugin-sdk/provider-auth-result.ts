import type { AuthProfileCredential } from "../agents/auth-profiles/types.js";
import type { RemoteClawConfig } from "../config/config.js";
import type { ProviderAuthResult } from "../plugins/types.js";

/**
 * Build a provider auth result storing the access token as a `token` credential.
 *
 * Kept for backward compatibility with extensions that call this helper.
 * Previously created `type: "oauth"` credentials; now creates `type: "token"`.
 */
export function buildOauthProviderAuthResult(params: {
  providerId: string;
  defaultModel: string;
  access: string;
  refresh?: string | null;
  expires?: number | null;
  email?: string | null;
  profilePrefix?: string;
  credentialExtra?: Record<string, unknown>;
  configPatch?: Partial<RemoteClawConfig>;
  notes?: string[];
}): ProviderAuthResult {
  const email = params.email ?? undefined;
  const profilePrefix = params.profilePrefix ?? params.providerId;
  const profileId = `${profilePrefix}:${email ?? "default"}`;

  const credential: AuthProfileCredential = {
    type: "token",
    provider: params.providerId,
    token: params.access,
    ...(Number.isFinite(params.expires) ? { expires: params.expires as number } : {}),
    ...(email ? { email } : {}),
  };

  return {
    profiles: [{ profileId, credential }],
    configPatch:
      params.configPatch ??
      ({
        agents: {
          defaults: {
            models: {
              [params.defaultModel]: {},
            },
          },
        },
      } as Partial<RemoteClawConfig>),
    defaultModel: params.defaultModel,
    notes: params.notes,
  };
}
