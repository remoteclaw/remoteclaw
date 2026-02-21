/**
 * Antigravity OAuth flow (Gemini 3, Claude, GPT-OSS via Google Cloud).
 *
 * Uses different OAuth credentials than google-gemini-cli for access to additional models.
 * PKCE + local callback server (port 51121) with manual paste fallback.
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

const decode = (s: string): string => atob(s);
const CLIENT_ID = decode(
  "MTA3MTAwNjA2MDU5MS10bWhzc2luMmgyMWxjcmUyMzV2dG9sb2poNGc0MDNlcC5hcHBzLmdvb2dsZXVzZXJjb250ZW50LmNvbQ==",
);
const CLIENT_SECRET = decode("R09DU1BYLUs1OEZXUjQ4NkxkTEoxbUxCOHNYQzR6NnFEQWY=");
const REDIRECT_URI = "http://localhost:51121/oauth-callback";
const SCOPES = [
  "https://www.googleapis.com/auth/cloud-platform",
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/userinfo.profile",
  "https://www.googleapis.com/auth/cclog",
  "https://www.googleapis.com/auth/experimentsandconfigs",
];
const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const DEFAULT_PROJECT_ID = "rising-fact-p41fc";

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
  throw new Error("Antigravity OAuth is only available in Node.js environments");
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
      const url = new URL(req.url || "", "http://localhost:51121");
      if (url.pathname === "/oauth-callback") {
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
    server.listen(51121, "127.0.0.1", () => {
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

async function discoverProject(
  accessToken: string,
  onProgress?: (message: string) => void,
): Promise<string> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
    "User-Agent": "google-api-nodejs-client/9.15.1",
    "X-Goog-Api-Client": "google-cloud-sdk vscode_cloudshelleditor/0.1",
    "Client-Metadata": JSON.stringify({
      ideType: "IDE_UNSPECIFIED",
      platform: "PLATFORM_UNSPECIFIED",
      pluginType: "GEMINI",
    }),
  };

  const endpoints = [
    "https://cloudcode-pa.googleapis.com",
    "https://daily-cloudcode-pa.sandbox.googleapis.com",
  ];

  onProgress?.("Checking for existing project...");
  for (const endpoint of endpoints) {
    try {
      const loadResponse = await fetch(`${endpoint}/v1internal:loadCodeAssist`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          metadata: {
            ideType: "IDE_UNSPECIFIED",
            platform: "PLATFORM_UNSPECIFIED",
            pluginType: "GEMINI",
          },
        }),
      });
      if (loadResponse.ok) {
        const data = (await loadResponse.json()) as Record<string, unknown>;
        if (typeof data.cloudaicompanionProject === "string" && data.cloudaicompanionProject) {
          return data.cloudaicompanionProject;
        }
        if (
          data.cloudaicompanionProject &&
          typeof data.cloudaicompanionProject === "object" &&
          (data.cloudaicompanionProject as Record<string, unknown>).id
        ) {
          return (data.cloudaicompanionProject as Record<string, unknown>).id as string;
        }
      }
    } catch {
      // Try next endpoint
    }
  }

  onProgress?.("Using default project...");
  return DEFAULT_PROJECT_ID;
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

/** Refresh Antigravity token. */
export async function refreshAntigravityToken(
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
    throw new Error(`Antigravity token refresh failed: ${error}`);
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
 * Login with Antigravity OAuth.
 */
export async function loginAntigravity(
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

export const antigravityOAuthProvider: OAuthProviderInterface = {
  id: "google-antigravity",
  name: "Antigravity (Gemini 3, Claude, GPT-OSS)",
  usesCallbackServer: true,
  async login(callbacks) {
    return loginAntigravity(callbacks.onAuth, callbacks.onProgress, callbacks.onManualCodeInput);
  },
  async refreshToken(credentials) {
    const creds = credentials as OAuthCredentials & { projectId?: string };
    if (!creds.projectId) {
      throw new Error("Antigravity credentials missing projectId");
    }
    return refreshAntigravityToken(creds.refresh, creds.projectId);
  },
  getApiKey(credentials) {
    const creds = credentials as OAuthCredentials & { projectId?: string };
    return JSON.stringify({ token: creds.access, projectId: creds.projectId });
  },
};
