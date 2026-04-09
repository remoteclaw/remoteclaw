import type { AuthProfileCredential } from "../agents/auth-profiles/types.js";
// Adapted for RemoteClaw fork — auth-profiles subsystem gutted (Middleware Boundary Principle)
import type { RemoteClawConfig } from "../config/config.js";
import type { ProviderAuthResult } from "../plugins/types.js";

function buildAuthProfileId(params: {
  providerId: string;
  profilePrefix?: string;
  profileName?: string;
}): string {
  const prefix = params.profilePrefix ?? params.providerId;
  const name = params.profileName ?? "default";
  return `${prefix}/${name}`;
}

/** Build the standard auth result payload for OAuth-style provider login flows. */
export function buildOauthProviderAuthResult(params: {
  providerId: string;
  defaultModel: string;
  access: string;
  refresh?: string | null;
  expires?: number | null;
  email?: string | null;
  displayName?: string | null;
  profileName?: string | null;
  profilePrefix?: string;
  credentialExtra?: Record<string, unknown>;
  configPatch?: Partial<RemoteClawConfig>;
  notes?: string[];
}): ProviderAuthResult {
  const email = params.email ?? undefined;
  const displayName = params.displayName ?? undefined;
  const profileId = buildAuthProfileId({
    providerId: params.providerId,
    profilePrefix: params.profilePrefix,
    profileName: params.profileName ?? email,
  });

  const credential = {
    type: "oauth" as const,
    provider: params.providerId,
    access: params.access,
    refresh: params.refresh ?? "",
    expires: Number.isFinite(params.expires) ? (params.expires as number) : 0,
    ...(email ? { email } : {}),
    ...(displayName ? { displayName } : {}),
    ...params.credentialExtra,
  } satisfies AuthProfileCredential;

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
