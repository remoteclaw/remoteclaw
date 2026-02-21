/**
 * GitHub Copilot OAuth flow (device code flow).
 *
 * Supports GitHub.com and GitHub Enterprise Server.
 *
 * Extracted from @mariozechner/pi-ai to remove the runtime dependency.
 * Note: The `enableAllGitHubCopilotModels` post-login step from the original
 * was removed because it depended on pi-ai's model catalog. Model enabling
 * can be done by callers if needed.
 */

import type { OAuthCredentials, OAuthProviderInterface, Model } from "../../types/pi-ai.js";

const decode = (s: string): string => atob(s);
const CLIENT_ID = decode("SXYxLmI1MDdhMDhjODdlY2ZlOTg=");
const COPILOT_HEADERS: Record<string, string> = {
  "User-Agent": "GitHubCopilotChat/0.35.0",
  "Editor-Version": "vscode/1.107.0",
  "Editor-Plugin-Version": "copilot-chat/0.35.0",
  "Copilot-Integration-Id": "vscode-chat",
};

export function normalizeDomain(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) {
    return null;
  }
  try {
    const url = trimmed.includes("://") ? new URL(trimmed) : new URL(`https://${trimmed}`);
    return url.hostname;
  } catch {
    return null;
  }
}

function getUrls(domain: string) {
  return {
    deviceCodeUrl: `https://${domain}/login/device/code`,
    accessTokenUrl: `https://${domain}/login/oauth/access_token`,
    copilotTokenUrl: `https://api.${domain}/copilot_internal/v2/token`,
  };
}

/**
 * Parse the proxy-ep from a Copilot token and convert to API base URL.
 * Token format: tid=...;exp=...;proxy-ep=proxy.individual.githubcopilot.com;...
 */
function getBaseUrlFromToken(token: string): string | null {
  const match = token.match(/proxy-ep=([^;]+)/);
  if (!match) {
    return null;
  }
  const proxyHost = match[1];
  const apiHost = proxyHost.replace(/^proxy\./, "api.");
  return `https://${apiHost}`;
}

export function getGitHubCopilotBaseUrl(token: string, enterpriseDomain?: string): string {
  if (token) {
    const urlFromToken = getBaseUrlFromToken(token);
    if (urlFromToken) {
      return urlFromToken;
    }
  }
  if (enterpriseDomain) {
    return `https://copilot-api.${enterpriseDomain}`;
  }
  return "https://api.individual.githubcopilot.com";
}

async function fetchJson(url: string, init?: RequestInit): Promise<Record<string, unknown>> {
  const response = await fetch(url, init);
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`${response.status} ${response.statusText}: ${text}`);
  }
  return response.json() as Promise<Record<string, unknown>>;
}

async function startDeviceFlow(domain: string) {
  const urls = getUrls(domain);
  const data = await fetchJson(urls.deviceCodeUrl, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "User-Agent": "GitHubCopilotChat/0.35.0",
    },
    body: JSON.stringify({ client_id: CLIENT_ID, scope: "read:user" }),
  });

  const deviceCode = data.device_code;
  const userCode = data.user_code;
  const verificationUri = data.verification_uri;
  const interval = data.interval;
  const expiresIn = data.expires_in;

  if (
    typeof deviceCode !== "string" ||
    typeof userCode !== "string" ||
    typeof verificationUri !== "string" ||
    typeof interval !== "number" ||
    typeof expiresIn !== "number"
  ) {
    throw new Error("Invalid device code response fields");
  }

  return {
    device_code: deviceCode,
    user_code: userCode,
    verification_uri: verificationUri,
    interval,
    expires_in: expiresIn,
  };
}

function abortableSleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new Error("Login cancelled"));
      return;
    }
    const timeout = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timeout);
        reject(new Error("Login cancelled"));
      },
      { once: true },
    );
  });
}

async function pollForGitHubAccessToken(
  domain: string,
  deviceCode: string,
  intervalSeconds: number,
  expiresIn: number,
  signal?: AbortSignal,
): Promise<string> {
  const urls = getUrls(domain);
  const deadline = Date.now() + expiresIn * 1000;
  let intervalMs = Math.max(1000, Math.floor(intervalSeconds * 1000));

  while (Date.now() < deadline) {
    if (signal?.aborted) {
      throw new Error("Login cancelled");
    }

    const raw = await fetchJson(urls.accessTokenUrl, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "User-Agent": "GitHubCopilotChat/0.35.0",
      },
      body: JSON.stringify({
        client_id: CLIENT_ID,
        device_code: deviceCode,
        grant_type: "urn:ietf:params:oauth:grant-type:device_code",
      }),
    });

    if (typeof raw.access_token === "string") {
      return raw.access_token;
    }

    if (typeof raw.error === "string") {
      if (raw.error === "authorization_pending") {
        await abortableSleep(intervalMs, signal);
        continue;
      }
      if (raw.error === "slow_down") {
        intervalMs += 5000;
        await abortableSleep(intervalMs, signal);
        continue;
      }
      throw new Error(`Device flow failed: ${raw.error}`);
    }
    await abortableSleep(intervalMs, signal);
  }
  throw new Error("Device flow timed out");
}

/** Refresh GitHub Copilot token. */
export async function refreshGitHubCopilotToken(
  refreshToken: string,
  enterpriseDomain?: string,
): Promise<OAuthCredentials> {
  const domain = enterpriseDomain || "github.com";
  const urls = getUrls(domain);

  const raw = await fetchJson(urls.copilotTokenUrl, {
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${refreshToken}`,
      ...COPILOT_HEADERS,
    },
  });

  const token = raw.token;
  const expiresAt = raw.expires_at;
  if (typeof token !== "string" || typeof expiresAt !== "number") {
    throw new Error("Invalid Copilot token response fields");
  }

  return {
    refresh: refreshToken,
    access: token,
    expires: expiresAt * 1000 - 5 * 60 * 1000,
    enterpriseUrl: enterpriseDomain,
  };
}

export interface LoginGitHubCopilotOptions {
  onAuth: (url: string, instructions: string) => void;
  onPrompt: (prompt: {
    message: string;
    placeholder?: string;
    allowEmpty?: boolean;
  }) => Promise<string>;
  onProgress?: (message: string) => void;
  signal?: AbortSignal;
}

/**
 * Login with GitHub Copilot OAuth (device code flow).
 */
export async function loginGitHubCopilot(
  options: LoginGitHubCopilotOptions,
): Promise<OAuthCredentials> {
  const input = await options.onPrompt({
    message: "GitHub Enterprise URL/domain (blank for github.com)",
    placeholder: "company.ghe.com",
    allowEmpty: true,
  });

  if (options.signal?.aborted) {
    throw new Error("Login cancelled");
  }

  const trimmed = input.trim();
  const enterpriseDomain = normalizeDomain(input);
  if (trimmed && !enterpriseDomain) {
    throw new Error("Invalid GitHub Enterprise URL/domain");
  }

  const domain = enterpriseDomain || "github.com";
  const device = await startDeviceFlow(domain);
  options.onAuth(device.verification_uri, `Enter code: ${device.user_code}`);

  const githubAccessToken = await pollForGitHubAccessToken(
    domain,
    device.device_code,
    device.interval,
    device.expires_in,
    options.signal,
  );
  return refreshGitHubCopilotToken(githubAccessToken, enterpriseDomain ?? undefined);
}

export const githubCopilotOAuthProvider: OAuthProviderInterface = {
  id: "github-copilot",
  name: "GitHub Copilot",
  async login(callbacks) {
    return loginGitHubCopilot({
      onAuth: (url, instructions) => callbacks.onAuth({ url, instructions }),
      onPrompt: callbacks.onPrompt,
      onProgress: callbacks.onProgress,
      signal: callbacks.signal,
    });
  },
  async refreshToken(credentials) {
    const creds = credentials as OAuthCredentials & { enterpriseUrl?: string };
    return refreshGitHubCopilotToken(creds.refresh, creds.enterpriseUrl);
  },
  getApiKey(credentials) {
    return credentials.access;
  },
  modifyModels(models: Model[], credentials: OAuthCredentials): Model[] {
    const creds = credentials as OAuthCredentials & { enterpriseUrl?: string };
    const domain = creds.enterpriseUrl
      ? (normalizeDomain(creds.enterpriseUrl) ?? undefined)
      : undefined;
    const baseUrl = getGitHubCopilotBaseUrl(creds.access, domain);
    return models.map((m) => (m.provider === "github-copilot" ? { ...m, baseUrl } : m));
  },
};
