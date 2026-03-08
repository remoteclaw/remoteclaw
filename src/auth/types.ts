export type ApiKeyCredential = {
  type: "api_key";
  provider: string;
  key?: string;
  email?: string;
  /** Optional provider-specific metadata (e.g., account IDs, gateway IDs). */
  metadata?: Record<string, string>;
};

export type TokenCredential = {
  /**
   * Static bearer-style token (often OAuth access token / PAT).
   * Not refreshable by RemoteClaw.
   */
  type: "token";
  provider: string;
  token: string;
  /** Optional expiry timestamp (ms since epoch). */
  expires?: number;
  email?: string;
};

export type AuthProfileCredential = ApiKeyCredential | TokenCredential;

export type AuthProfileStore = {
  version: number;
  profiles: Record<string, AuthProfileCredential>;
};
