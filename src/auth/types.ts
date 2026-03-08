export type ApiKeyCredential = {
  type: "api_key";
  provider: string;
  key?: string;
  email?: string;
  /** Optional provider-specific metadata (e.g., account IDs, gateway IDs). */
  metadata?: Record<string, string>;
};

export type AuthProfileCredential = ApiKeyCredential;

export type AuthProfileStore = {
  version: number;
  profiles: Record<string, AuthProfileCredential>;
};
