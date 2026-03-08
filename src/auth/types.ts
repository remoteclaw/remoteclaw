export type ApiKeyCredential = {
  type: "api_key";
  provider: string;
  key?: string;
  email?: string;
  /** Optional provider-specific metadata (e.g., account IDs, gateway IDs). */
  metadata?: Record<string, string>;
};

/**
 * Static bearer-style token (e.g., OAuth access token / PAT).
 * Stored with `type: "token"` so env-injection can map to the correct
 * env var (e.g., CLAUDE_CODE_OAUTH_TOKEN instead of ANTHROPIC_API_KEY).
 */
export type TokenCredential = {
  type: "token";
  provider: string;
  key?: string;
  email?: string;
  metadata?: Record<string, string>;
};

export type AuthProfileCredential = ApiKeyCredential | TokenCredential;

export type AuthProfileStore = {
  version: number;
  profiles: Record<string, AuthProfileCredential>;
};
