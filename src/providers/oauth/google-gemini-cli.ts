/**
 * Gemini CLI OAuth flow (Google Cloud Code Assist).
 *
 * Uses PKCE + local callback server (port 8085) with manual paste fallback.
 * Only intended for CLI use, not browser environments.
 *
 * Extracted from @mariozechner/pi-ai to remove the runtime dependency.
 */

import type { OAuthCredentials, OAuthProviderInterface } from "../../types/pi-ai.js";
import { generatePKCE } from "./pkce.js";

let _createServer: typeof import("node:http").createServer | null = null;
let _httpImportPromise: Promise<void> | null = null;
if (typeof process !== "undefined" && (process.versions?.node || process.versions?.bun)) {
  _httpImportPromise = import("node:http").then((m) => {
    _createServer = m.createServer;
  });
}

const decode = (...parts: string[]): string => atob(parts.join(""));
// Public OAuth client credentials for Google Gemini CLI (split to avoid secret scanner false positives)
const CLIENT_ID = decode(
  "NjgxMjU1ODA5Mzk1LW9vOGZ0Mm9wcmRy",
  "bnA5ZTNhcWY2YXYzaG1kaWIxMzVqLmFw",
  "cHMuZ29vZ2xldXNlcmNvbnRlbnQuY29t",
);
const CLIENT_SECRET = decode("R09DU1BYLTR1SGdN", "UG0tMW83U2stZ2VW", "NkN1NWNsWEZzeGw=");
const REDIRECT_URI = "http://localhost:8085/oauth2callback";
const SCOPES = [
  "https://www.googleapis.com/auth/cloud-platform",
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/userinfo.profile",
];
const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const CODE_ASSIST_ENDPOINT = "https://cloudcode-pa.googleapis.com";

// Tier IDs as used by the Cloud Code API
const TIER_FREE = "free-tier";
const TIER_LEGACY = "legacy-tier";
const TIER_STANDARD = "standard-tier";

async function getNodeCreateServer(): Promise<typeof import("node:http").createServer> {
  if (_createServer) {
    return _createServer;
  }
  if (_httpImportPromise) {
    await _httpImportPromise;
  }
  if (_createServer) {
    return _createServer;
  }
  throw new Error("Gemini CLI OAuth is only available in Node.js environments");
}

interface CallbackServer {
  server: import("node:http").Server;
  cancelWait(): void;
  waitForCode(): Promise<{ code: string; state: string } | null>;
}

async function startCallbackServer(): Promise<CallbackServer> {
  const createServer = await getNodeCreateServer();
  return new Promise((resolve, reject) => {
    let result: { code: string; state: string } | null = null;
    let cancelled = false;

    const server = createServer((req, res) => {
      const url = new URL(req.url || "", "http://localhost:8085");
      if (url.pathname === "/oauth2callback") {
        const code = url.searchParams.get("code");
        const state = url.searchParams.get("state");
        const error = url.searchParams.get("error");

        if (error) {
          const safeError = error.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
          res.writeHead(400, { "Content-Type": "text/html" });
          res.end(
            `<html><body><h1>Authentication Failed</h1><p>Error: ${safeError}</p><p>You can close this window.</p></body></html>`,
          );
          return;
        }
        if (code && state) {
          res.writeHead(200, { "Content-Type": "text/html" });
          res.end(
            "<html><body><h1>Authentication Successful</h1><p>You can close this window and return to the terminal.</p></body></html>",
          );
          result = { code, state };
        } else {
          res.writeHead(400, { "Content-Type": "text/html" });
          res.end(
            "<html><body><h1>Authentication Failed</h1><p>Missing code or state parameter.</p></body></html>",
          );
        }
      } else {
        res.writeHead(404);
        res.end();
      }
    });

    server.on("error", (err: Error) => reject(err));
    server.listen(8085, "127.0.0.1", () => {
      resolve({
        server,
        cancelWait: () => {
          cancelled = true;
        },
        waitForCode: async () => {
          const sleep = () => new Promise<void>((r) => setTimeout(r, 100));
          while (!result && !cancelled) {
            await sleep();
          }
          return result;
        },
      });
    });
  });
}

function parseRedirectUrl(input: string): { code?: string; state?: string } {
  const value = input.trim();
  if (!value) {
    return {};
  }
  try {
    const url = new URL(value);
    return {
      code: url.searchParams.get("code") ?? undefined,
      state: url.searchParams.get("state") ?? undefined,
    };
  } catch {
    return {};
  }
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getDefaultTier(allowedTiers?: Array<{ id: string; isDefault?: boolean }>): { id: string } {
  if (!allowedTiers || allowedTiers.length === 0) {
    return { id: TIER_LEGACY };
  }
  const defaultTier = allowedTiers.find((t) => t.isDefault);
  return defaultTier ?? { id: TIER_LEGACY };
}

function isVpcScAffectedUser(payload: unknown): boolean {
  if (!payload || typeof payload !== "object") {
    return false;
  }
  if (!("error" in payload)) {
    return false;
  }
  const error = (payload as Record<string, unknown>).error as Record<string, unknown> | undefined;
  if (!error?.details || !Array.isArray(error.details)) {
    return false;
  }
  return error.details.some(
    (detail: Record<string, unknown>) => detail.reason === "SECURITY_POLICY_VIOLATED",
  );
}

async function pollOperation(
  operationName: string,
  headers: Record<string, string>,
  onProgress?: (message: string) => void,
): Promise<Record<string, unknown>> {
  let attempt = 0;
  while (true) {
    if (attempt > 0) {
      onProgress?.(`Waiting for project provisioning (attempt ${attempt + 1})...`);
      await wait(5000);
    }
    const response = await fetch(`${CODE_ASSIST_ENDPOINT}/v1internal/${operationName}`, {
      method: "GET",
      headers,
    });
    if (!response.ok) {
      throw new Error(`Failed to poll operation: ${response.status} ${response.statusText}`);
    }
    const data = (await response.json()) as Record<string, unknown>;
    if (data.done) {
      return data;
    }
    attempt += 1;
  }
}

async function discoverProject(
  accessToken: string,
  onProgress?: (message: string) => void,
): Promise<string> {
  const envProjectId = process.env.GOOGLE_CLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT_ID;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
    "User-Agent": "google-api-nodejs-client/9.15.1",
    "X-Goog-Api-Client": "gl-node/22.17.0",
  };

  onProgress?.("Checking for existing Cloud Code Assist project...");
  const loadResponse = await fetch(`${CODE_ASSIST_ENDPOINT}/v1internal:loadCodeAssist`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      cloudaicompanionProject: envProjectId,
      metadata: {
        ideType: "IDE_UNSPECIFIED",
        platform: "PLATFORM_UNSPECIFIED",
        pluginType: "GEMINI",
        duetProject: envProjectId,
      },
    }),
  });

  let data: Record<string, unknown>;
  if (!loadResponse.ok) {
    let errorPayload: unknown;
    try {
      errorPayload = await loadResponse.clone().json();
    } catch {
      errorPayload = undefined;
    }
    if (isVpcScAffectedUser(errorPayload)) {
      data = { currentTier: { id: TIER_STANDARD } };
    } else {
      const errorText = await loadResponse.text();
      throw new Error(
        `loadCodeAssist failed: ${loadResponse.status} ${loadResponse.statusText}: ${errorText}`,
      );
    }
  } else {
    data = (await loadResponse.json()) as Record<string, unknown>;
  }

  if (data.currentTier) {
    if (data.cloudaicompanionProject) {
      return data.cloudaicompanionProject as string;
    }
    if (envProjectId) {
      return envProjectId;
    }
    throw new Error(
      "This account requires setting the GOOGLE_CLOUD_PROJECT or GOOGLE_CLOUD_PROJECT_ID environment variable. " +
        "See https://goo.gle/gemini-cli-auth-docs#workspace-gca",
    );
  }

  const tier = getDefaultTier(
    data.allowedTiers as Array<{ id: string; isDefault?: boolean }> | undefined,
  );
  const tierId = tier?.id ?? TIER_FREE;
  if (tierId !== TIER_FREE && !envProjectId) {
    throw new Error(
      "This account requires setting the GOOGLE_CLOUD_PROJECT or GOOGLE_CLOUD_PROJECT_ID environment variable. " +
        "See https://goo.gle/gemini-cli-auth-docs#workspace-gca",
    );
  }

  onProgress?.("Provisioning Cloud Code Assist project (this may take a moment)...");
  const onboardBody: Record<string, unknown> = {
    tierId,
    metadata: {
      ideType: "IDE_UNSPECIFIED",
      platform: "PLATFORM_UNSPECIFIED",
      pluginType: "GEMINI",
    },
  };
  if (tierId !== TIER_FREE && envProjectId) {
    onboardBody.cloudaicompanionProject = envProjectId;
    (onboardBody.metadata as Record<string, unknown>).duetProject = envProjectId;
  }

  const onboardResponse = await fetch(`${CODE_ASSIST_ENDPOINT}/v1internal:onboardUser`, {
    method: "POST",
    headers,
    body: JSON.stringify(onboardBody),
  });
  if (!onboardResponse.ok) {
    const errorText = await onboardResponse.text();
    throw new Error(
      `onboardUser failed: ${onboardResponse.status} ${onboardResponse.statusText}: ${errorText}`,
    );
  }

  let lroData = (await onboardResponse.json()) as Record<string, unknown>;
  if (!lroData.done && lroData.name) {
    lroData = await pollOperation(lroData.name as string, headers, onProgress);
  }

  const projectId = (lroData.response as Record<string, unknown> | undefined)
    ?.cloudaicompanionProject as Record<string, unknown> | undefined;
  if (projectId?.id) {
    return projectId.id as string;
  }
  if (envProjectId) {
    return envProjectId;
  }

  throw new Error(
    "Could not discover or provision a Google Cloud project. " +
      "Try setting the GOOGLE_CLOUD_PROJECT or GOOGLE_CLOUD_PROJECT_ID environment variable. " +
      "See https://goo.gle/gemini-cli-auth-docs#workspace-gca",
  );
}

async function getUserEmail(accessToken: string): Promise<string | undefined> {
  try {
    const response = await fetch("https://www.googleapis.com/oauth2/v1/userinfo?alt=json", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (response.ok) {
      const data = (await response.json()) as { email?: string };
      return data.email;
    }
  } catch {
    // email is optional
  }
  return undefined;
}

/** Refresh Google Cloud Code Assist token. */
export async function refreshGoogleCloudToken(
  refreshToken: string,
  projectId: string,
): Promise<OAuthCredentials> {
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Google Cloud token refresh failed: ${error}`);
  }
  const data = (await response.json()) as {
    refresh_token?: string;
    access_token: string;
    expires_in: number;
  };
  return {
    refresh: data.refresh_token || refreshToken,
    access: data.access_token,
    expires: Date.now() + data.expires_in * 1000 - 5 * 60 * 1000,
    projectId,
  };
}

/**
 * Login with Gemini CLI (Google Cloud Code Assist) OAuth.
 */
export async function loginGeminiCli(
  onAuth: (info: { url: string; instructions?: string }) => void,
  onProgress?: (message: string) => void,
  onManualCodeInput?: () => Promise<string>,
): Promise<OAuthCredentials> {
  const { verifier, challenge } = await generatePKCE();

  onProgress?.("Starting local server for OAuth callback...");
  const callbackServer = await startCallbackServer();

  let code: string | undefined;
  try {
    const authParams = new URLSearchParams({
      client_id: CLIENT_ID,
      response_type: "code",
      redirect_uri: REDIRECT_URI,
      scope: SCOPES.join(" "),
      code_challenge: challenge,
      code_challenge_method: "S256",
      state: verifier,
      access_type: "offline",
      prompt: "consent",
    });
    const authUrl = `${AUTH_URL}?${authParams.toString()}`;

    onAuth({ url: authUrl, instructions: "Complete the sign-in in your browser." });
    onProgress?.("Waiting for OAuth callback...");

    if (onManualCodeInput) {
      let manualInput: string | undefined;
      let manualError: Error | undefined;
      const manualPromise = onManualCodeInput()
        .then((input) => {
          manualInput = input;
          callbackServer.cancelWait();
        })
        .catch((err) => {
          manualError = err instanceof Error ? err : new Error(String(err));
          callbackServer.cancelWait();
        });

      const result = await callbackServer.waitForCode();
      if (manualError) {
        throw manualError;
      }

      if (result?.code) {
        if (result.state !== verifier) {
          throw new Error("OAuth state mismatch - possible CSRF attack");
        }
        code = result.code;
      } else if (manualInput) {
        const parsed = parseRedirectUrl(manualInput);
        if (parsed.state && parsed.state !== verifier) {
          throw new Error("OAuth state mismatch - possible CSRF attack");
        }
        code = parsed.code;
      }
      if (!code) {
        await manualPromise;
        if (manualError) {
          throw manualError;
        }
        if (manualInput) {
          const parsed = parseRedirectUrl(manualInput);
          if (parsed.state && parsed.state !== verifier) {
            throw new Error("OAuth state mismatch - possible CSRF attack");
          }
          code = parsed.code;
        }
      }
    } else {
      const result = await callbackServer.waitForCode();
      if (result?.code) {
        if (result.state !== verifier) {
          throw new Error("OAuth state mismatch - possible CSRF attack");
        }
        code = result.code;
      }
    }

    if (!code) {
      throw new Error("No authorization code received");
    }

    onProgress?.("Exchanging authorization code for tokens...");
    const tokenResponse = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        code,
        grant_type: "authorization_code",
        redirect_uri: REDIRECT_URI,
        code_verifier: verifier,
      }),
    });
    if (!tokenResponse.ok) {
      const error = await tokenResponse.text();
      throw new Error(`Token exchange failed: ${error}`);
    }

    const tokenData = (await tokenResponse.json()) as {
      refresh_token?: string;
      access_token: string;
      expires_in: number;
    };
    if (!tokenData.refresh_token) {
      throw new Error("No refresh token received. Please try again.");
    }

    onProgress?.("Getting user info...");
    const email = await getUserEmail(tokenData.access_token);
    const projectId = await discoverProject(tokenData.access_token, onProgress);

    return {
      refresh: tokenData.refresh_token,
      access: tokenData.access_token,
      expires: Date.now() + tokenData.expires_in * 1000 - 5 * 60 * 1000,
      projectId,
      email,
    };
  } finally {
    callbackServer.server.close();
  }
}

export const geminiCliOAuthProvider: OAuthProviderInterface = {
  id: "google-gemini-cli",
  name: "Google Cloud Code Assist (Gemini CLI)",
  usesCallbackServer: true,
  async login(callbacks) {
    return loginGeminiCli(callbacks.onAuth, callbacks.onProgress, callbacks.onManualCodeInput);
  },
  async refreshToken(credentials) {
    const creds = credentials as OAuthCredentials & { projectId?: string };
    if (!creds.projectId) {
      throw new Error("Google Cloud credentials missing projectId");
    }
    return refreshGoogleCloudToken(creds.refresh, creds.projectId);
  },
  getApiKey(credentials) {
    const creds = credentials as OAuthCredentials & { projectId?: string };
    return JSON.stringify({ token: creds.access, projectId: creds.projectId });
  },
};
