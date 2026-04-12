import { normalizeSecretInputString } from "../../config/types.secrets.js";
import type { AuthProfileStore } from "./types.js";

/**
 * Minimal implementation for resolving the API key or token from a stored
 * auth profile credential.  The upstream version includes full OAuth refresh
 * flows, provider plugins, and keychain prompts — none of which are needed
 * in the RemoteClaw fork (Middleware Boundary Principle).  Handles api_key
 * and token credential types with inline values.
 */
export async function resolveApiKeyForProfile(params: {
  cfg?: unknown;
  store: AuthProfileStore;
  profileId: string;
  agentDir?: string;
}): Promise<{ apiKey: string; source: string } | undefined> {
  const cred = params.store.profiles[params.profileId];
  if (!cred) {
    return undefined;
  }

  if (cred.type === "api_key") {
    const key = normalizeSecretInputString(cred.key);
    if (key) {
      return { apiKey: key, source: "auth-profile" };
    }
    return undefined;
  }

  if (cred.type === "token") {
    const token = normalizeSecretInputString(cred.token);
    if (token) {
      return { apiKey: token, source: "auth-profile" };
    }
    return undefined;
  }

  if (cred.type === "oauth") {
    const access = normalizeSecretInputString(cred.access);
    if (access) {
      return { apiKey: access, source: "auth-profile" };
    }
    return undefined;
  }

  return undefined;
}
