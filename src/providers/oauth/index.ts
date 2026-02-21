/**
 * OAuth provider registry.
 *
 * Replaces `@mariozechner/pi-ai/dist/utils/oauth/index.js` with local
 * implementations, removing the runtime dependency on pi-ai for OAuth.
 */

// Set up HTTP proxy for fetch() calls (respects HTTP_PROXY, HTTPS_PROXY env vars)
import "./http-proxy.js";
import type { OAuthProviderInterface } from "../../types/pi-ai.js";
import { anthropicOAuthProvider } from "./anthropic.js";
import { githubCopilotOAuthProvider } from "./github-copilot.js";
import { antigravityOAuthProvider } from "./google-antigravity.js";
import { geminiCliOAuthProvider } from "./google-gemini-cli.js";
import { openaiCodexOAuthProvider } from "./openai-codex.js";

const oauthProviderRegistry = new Map<string, OAuthProviderInterface>([
  [anthropicOAuthProvider.id, anthropicOAuthProvider],
  [githubCopilotOAuthProvider.id, githubCopilotOAuthProvider],
  [geminiCliOAuthProvider.id, geminiCliOAuthProvider],
  [antigravityOAuthProvider.id, antigravityOAuthProvider],
  [openaiCodexOAuthProvider.id, openaiCodexOAuthProvider],
]);

/** Get an OAuth provider by ID. */
export function getOAuthProvider(id: string): OAuthProviderInterface | undefined {
  return oauthProviderRegistry.get(id);
}

/** Get all registered OAuth providers. */
export function getOAuthProviders(): OAuthProviderInterface[] {
  return Array.from(oauthProviderRegistry.values());
}
