import fs from "node:fs";
import { SsrFBlockedError } from "../infra/net/ssrf.js";
import { movePathToTrash } from "../infra/trash.js";
import { isCdpHttpReachable, isCdpReady } from "./cdp-reachability.js";
import { fetchJson, fetchOk } from "./cdp.helpers.js";
import { appendCdpPath, createTargetViaCdp, normalizeCdpWsUrl } from "./cdp.js";
import type { ResolvedBrowserProfile } from "./config.js";
import { resolveProfile } from "./config.js";
import { ensureChromeExtensionRelayServer, stopChromeExtensionRelayServer } from "./extension-relay.js";
import {
  assertBrowserNavigationAllowed,
  assertBrowserNavigationResultAllowed,
  InvalidBrowserNavigationUrlError,
  withBrowserNavigationPolicy,
} from "./navigation-guard.js";
import { resolveRemoteClawUserDataDir } from "./profile-paths.js";
import { refreshResolvedBrowserConfigFromDisk, resolveBrowserProfileWithHotReload } from "./resolved-config-refresh.js";
import type {
  BrowserServerState,
  BrowserRouteContext,
  BrowserTab,
  ContextOptions,
  ProfileContext,
  ProfileRuntimeState,
  ProfileStatus,
} from "./server-context.types.js";
import { resolveTargetIdFromTabs } from "./target-id.js";

export type {
  BrowserRouteContext,
  BrowserServerState,
  BrowserTab,
  ProfileContext,
  ProfileRuntimeState,
  ProfileStatus,
} from "./server-context.types.js";

export function listKnownProfileNames(state: BrowserServerState): string[] {
  const names = new Set(Object.keys(state.resolved.profiles));
  for (const name of state.profiles.keys()) {
    names.add(name);
  }
  return [...names];
}

/**
 * Normalize a CDP WebSocket URL to use the correct base URL.
 */
function normalizeWsUrl(raw: string | undefined, cdpBaseUrl: string): string | undefined {
  if (!raw) {
    return undefined;
  }
  try {
    return normalizeCdpWsUrl(raw, cdpBaseUrl);
  } catch {
    return raw;
  }
}

/**
 * Create a profile-scoped context for browser operations.
 */
function createProfileContext(opts: ContextOptions, profile: ResolvedBrowserProfile): ProfileContext {
  const state = () => {
    const current = opts.getState();
    if (!current) {
      throw new Error("Browser server not started");
    }
    return current;
  };

  const getProfileState = (): ProfileRuntimeState => {
    const current = state();
    const existing = current.profiles.get(profile.name);
    if (existing) {
      return existing;
    }
    const created: ProfileRuntimeState = { profile, lastTargetId: null };
    current.profiles.set(profile.name, created);
    return created;
  };

  const listTabs = async (): Promise<BrowserTab[]> => {
    const raw = await fetchJson<
      Array<{
        id?: string;
        title?: string;
        url?: string;
        webSocketDebuggerUrl?: string;
        type?: string;
      }>
    >(appendCdpPath(profile.cdpUrl, "/json/list"));
    return raw
      .map((t) => ({
        targetId: t.id ?? "",
        title: t.title ?? "",
        url: t.url ?? "",
        wsUrl: normalizeWsUrl(t.webSocketDebuggerUrl, profile.cdpUrl),
        type: t.type,
      }))
      .filter((t) => Boolean(t.targetId));
  };

  const openTab = async (url: string): Promise<BrowserTab> => {
    const ssrfPolicyOpts = withBrowserNavigationPolicy(state().resolved.ssrfPolicy);

    const createdViaCdp = await createTargetViaCdp({
      cdpUrl: profile.cdpUrl,
      url,
      ...ssrfPolicyOpts,
    })
      .then((r) => r.targetId)
      .catch(() => null);

    if (createdViaCdp) {
      const profileState = getProfileState();
      profileState.lastTargetId = createdViaCdp;
      const deadline = Date.now() + 2000;
      while (Date.now() < deadline) {
        const tabs = await listTabs().catch(() => [] as BrowserTab[]);
        const found = tabs.find((t) => t.targetId === createdViaCdp);
        if (found) {
          await assertBrowserNavigationResultAllowed({ url: found.url, ...ssrfPolicyOpts });
          return found;
        }
        await new Promise((r) => setTimeout(r, 100));
      }
      return { targetId: createdViaCdp, title: "", url, type: "page" };
    }

    const encoded = encodeURIComponent(url);
    type CdpTarget = {
      id?: string;
      title?: string;
      url?: string;
      webSocketDebuggerUrl?: string;
      type?: string;
    };

    const endpointUrl = new URL(appendCdpPath(profile.cdpUrl, "/json/new"));
    await assertBrowserNavigationAllowed({ url, ...ssrfPolicyOpts });
    const endpoint = endpointUrl.search
      ? (() => {
          endpointUrl.searchParams.set("url", url);
          return endpointUrl.toString();
        })()
      : `${endpointUrl.toString()}?${encoded}`;
    const created = await fetchJson<CdpTarget>(endpoint, 1500, {
      method: "PUT",
    }).catch(async (err) => {
      if (String(err).includes("HTTP 405")) {
        return await fetchJson<CdpTarget>(endpoint, 1500);
      }
      throw err;
    });

    if (!created.id) {
      throw new Error("Failed to open tab (missing id)");
    }
    const profileState = getProfileState();
    profileState.lastTargetId = created.id;
    const resolvedUrl = created.url ?? url;
    await assertBrowserNavigationResultAllowed({ url: resolvedUrl, ...ssrfPolicyOpts });
    return {
      targetId: created.id,
      title: created.title ?? "",
      url: resolvedUrl,
      wsUrl: normalizeWsUrl(created.webSocketDebuggerUrl, profile.cdpUrl),
      type: created.type,
    };
  };

  const resolveRemoteHttpTimeout = (timeoutMs: number | undefined) => {
    if (profile.cdpIsLoopback) {
      return timeoutMs ?? 300;
    }
    const resolved = state().resolved;
    if (typeof timeoutMs === "number" && Number.isFinite(timeoutMs)) {
      return Math.max(Math.floor(timeoutMs), resolved.remoteCdpTimeoutMs);
    }
    return resolved.remoteCdpTimeoutMs;
  };

  const resolveRemoteWsTimeout = (timeoutMs: number | undefined) => {
    if (profile.cdpIsLoopback) {
      const base = timeoutMs ?? 300;
      return Math.max(200, Math.min(2000, base * 2));
    }
    const resolved = state().resolved;
    if (typeof timeoutMs === "number" && Number.isFinite(timeoutMs)) {
      return Math.max(Math.floor(timeoutMs) * 2, resolved.remoteCdpHandshakeTimeoutMs);
    }
    return resolved.remoteCdpHandshakeTimeoutMs;
  };

  const isReachable = async (timeoutMs?: number) => {
    const httpTimeout = resolveRemoteHttpTimeout(timeoutMs);
    const wsTimeout = resolveRemoteWsTimeout(timeoutMs);
    return await isCdpReady(profile.cdpUrl, httpTimeout, wsTimeout);
  };

  const isHttpReachable = async (timeoutMs?: number) => {
    const httpTimeout = resolveRemoteHttpTimeout(timeoutMs);
    return await isCdpHttpReachable(profile.cdpUrl, httpTimeout);
  };

  const ensureBrowserAvailable = async (): Promise<void> => {
    const remoteCdp = !profile.cdpIsLoopback;
    const isExtension = profile.driver === "extension";
    const httpReachable = await isHttpReachable();

    if (isExtension && remoteCdp) {
      throw new Error(
        `Profile "${profile.name}" uses driver=extension but cdpUrl is not loopback (${profile.cdpUrl}).`,
      );
    }

    if (isExtension) {
      if (!httpReachable) {
        await ensureChromeExtensionRelayServer({ cdpUrl: profile.cdpUrl });
        if (await isHttpReachable(1200)) {
          // continue: we still need the extension to connect for CDP websocket.
        } else {
          throw new Error(
            `Chrome extension relay for profile "${profile.name}" is not reachable at ${profile.cdpUrl}.`,
          );
        }
      }

      if (await isReachable(600)) {
        return;
      }
      // Relay server is up, but no attached tab yet. Prompt user to attach.
      throw new Error(
        `Chrome extension relay is running, but no tab is connected. Click the RemoteClaw Chrome extension icon on a tab to attach it (profile "${profile.name}").`,
      );
    }

    if (!httpReachable) {
      if (opts.onEnsureAttachTarget) {
        await opts.onEnsureAttachTarget(profile);
        if (await isHttpReachable(1200)) {
          return;
        }
      }
      throw new Error(
        remoteCdp
          ? `Remote CDP for profile "${profile.name}" is not reachable at ${profile.cdpUrl}.`
          : `CDP for profile "${profile.name}" is not reachable at ${profile.cdpUrl}.`,
      );
    }

    if (await isReachable()) {
      return;
    }

    if (opts.onEnsureAttachTarget) {
      await opts.onEnsureAttachTarget(profile);
      if (await isReachable(1200)) {
        return;
      }
    }
    throw new Error(
      remoteCdp
        ? `Remote CDP websocket for profile "${profile.name}" is not reachable.`
        : `CDP websocket for profile "${profile.name}" is not reachable.`,
    );
  };

  const ensureTabAvailable = async (targetId?: string): Promise<BrowserTab> => {
    await ensureBrowserAvailable();
    const profileState = getProfileState();
    const tabs1 = await listTabs();
    if (tabs1.length === 0) {
      if (profile.driver === "extension") {
        throw new Error(
          `tab not found (no attached Chrome tabs for profile "${profile.name}"). ` +
            "Click the RemoteClaw Browser Relay toolbar icon on the tab you want to control (badge ON).",
        );
      }
      await openTab("about:blank");
    }

    const tabs = await listTabs();
    const candidates =
      profile.driver === "extension" || !profile.cdpIsLoopback ? tabs : tabs.filter((t) => Boolean(t.wsUrl));

    const resolveById = (raw: string) => {
      const resolved = resolveTargetIdFromTabs(raw, candidates);
      if (!resolved.ok) {
        if (resolved.reason === "ambiguous") {
          return "AMBIGUOUS" as const;
        }
        return null;
      }
      return candidates.find((t) => t.targetId === resolved.targetId) ?? null;
    };

    const pickDefault = () => {
      const last = profileState.lastTargetId?.trim() || "";
      const lastResolved = last ? resolveById(last) : null;
      if (lastResolved && lastResolved !== "AMBIGUOUS") {
        return lastResolved;
      }
      // Prefer a real page tab first (avoid service workers/background targets).
      const page = candidates.find((t) => (t.type ?? "page") === "page");
      return page ?? candidates.at(0) ?? null;
    };

    let chosen = targetId ? resolveById(targetId) : pickDefault();
    if (!chosen && (profile.driver === "extension" || !profile.cdpIsLoopback) && candidates.length === 1) {
      // If an agent passes a stale/foreign targetId but only one candidate remains,
      // recover by using that tab instead of failing hard.
      chosen = candidates[0] ?? null;
    }

    if (chosen === "AMBIGUOUS") {
      throw new Error("ambiguous target id prefix");
    }
    if (!chosen) {
      throw new Error("tab not found");
    }
    profileState.lastTargetId = chosen.targetId;
    return chosen;
  };

  const resolveTargetIdOrThrow = async (targetId: string): Promise<string> => {
    const tabs = await listTabs();
    const resolved = resolveTargetIdFromTabs(targetId, tabs);
    if (!resolved.ok) {
      if (resolved.reason === "ambiguous") {
        throw new Error("ambiguous target id prefix");
      }
      throw new Error("tab not found");
    }
    return resolved.targetId;
  };

  const focusTab = async (targetId: string): Promise<void> => {
    const resolvedTargetId = await resolveTargetIdOrThrow(targetId);
    await fetchOk(appendCdpPath(profile.cdpUrl, `/json/activate/${resolvedTargetId}`));
    const profileState = getProfileState();
    profileState.lastTargetId = resolvedTargetId;
  };

  const closeTab = async (targetId: string): Promise<void> => {
    const resolvedTargetId = await resolveTargetIdOrThrow(targetId);
    await fetchOk(appendCdpPath(profile.cdpUrl, `/json/close/${resolvedTargetId}`));
  };

  const stopRunningBrowser = async (): Promise<{ stopped: boolean }> => {
    if (profile.driver === "extension") {
      const stopped = await stopChromeExtensionRelayServer({
        cdpUrl: profile.cdpUrl,
      });
      return { stopped };
    }
    return { stopped: false };
  };

  const resetProfile = async () => {
    if (profile.driver === "extension") {
      await stopChromeExtensionRelayServer({ cdpUrl: profile.cdpUrl }).catch(() => {});
      return { moved: false, from: profile.cdpUrl };
    }
    if (!profile.cdpIsLoopback) {
      throw new Error(`reset-profile is only supported for local profiles (profile "${profile.name}" is remote).`);
    }
    const userDataDir = resolveRemoteClawUserDataDir(profile.name);
    if (!fs.existsSync(userDataDir)) {
      return { moved: false, from: userDataDir };
    }
    const moved = await movePathToTrash(userDataDir);
    return { moved: true, from: userDataDir, to: moved };
  };

  return {
    profile,
    ensureBrowserAvailable,
    ensureTabAvailable,
    isHttpReachable,
    isReachable,
    listTabs,
    openTab,
    focusTab,
    closeTab,
    stopRunningBrowser,
    resetProfile,
  };
}

export function createBrowserRouteContext(opts: ContextOptions): BrowserRouteContext {
  const refreshConfigFromDisk = opts.refreshConfigFromDisk === true;

  const state = () => {
    const current = opts.getState();
    if (!current) {
      throw new Error("Browser server not started");
    }
    return current;
  };

  const forProfile = (profileName?: string): ProfileContext => {
    const current = state();
    const name = profileName ?? current.resolved.defaultProfile;
    const profile = resolveBrowserProfileWithHotReload({
      current,
      refreshConfigFromDisk,
      name,
    });

    if (!profile) {
      const available = Object.keys(current.resolved.profiles).join(", ");
      throw new Error(`Profile "${name}" not found. Available profiles: ${available || "(none)"}`);
    }
    return createProfileContext(opts, profile);
  };

  const listProfiles = async (): Promise<ProfileStatus[]> => {
    const current = state();
    refreshResolvedBrowserConfigFromDisk({
      current,
      refreshConfigFromDisk,
      mode: "cached",
    });
    const result: ProfileStatus[] = [];

    for (const name of Object.keys(current.resolved.profiles)) {
      const profile = resolveProfile(current.resolved, name);
      if (!profile) {
        continue;
      }

      let tabCount = 0;
      let running = false;

      try {
        const reachable = await isCdpHttpReachable(profile.cdpUrl, 200);
        if (reachable) {
          running = true;
          const ctx = createProfileContext(opts, profile);
          const tabs = await ctx.listTabs().catch(() => []);
          tabCount = tabs.filter((t) => t.type === "page").length;
        }
      } catch {
        // Not reachable
      }

      result.push({
        name,
        cdpPort: profile.cdpPort,
        cdpUrl: profile.cdpUrl,
        color: profile.color,
        running,
        tabCount,
        isDefault: name === current.resolved.defaultProfile,
        isRemote: !profile.cdpIsLoopback,
      });
    }

    return result;
  };

  // Create default profile context for backward compatibility
  const getDefaultContext = () => forProfile();

  const mapTabError = (err: unknown) => {
    if (err instanceof SsrFBlockedError) {
      return { status: 400, message: err.message };
    }
    if (err instanceof InvalidBrowserNavigationUrlError) {
      return { status: 400, message: err.message };
    }
    const msg = String(err);
    if (msg.includes("ambiguous target id prefix")) {
      return { status: 409, message: "ambiguous target id prefix" };
    }
    if (msg.includes("tab not found")) {
      return { status: 404, message: msg };
    }
    if (msg.includes("not found")) {
      return { status: 404, message: msg };
    }
    return null;
  };

  return {
    state,
    forProfile,
    listProfiles,
    // Legacy methods delegate to default profile
    ensureBrowserAvailable: () => getDefaultContext().ensureBrowserAvailable(),
    ensureTabAvailable: (targetId) => getDefaultContext().ensureTabAvailable(targetId),
    isHttpReachable: (timeoutMs) => getDefaultContext().isHttpReachable(timeoutMs),
    isReachable: (timeoutMs) => getDefaultContext().isReachable(timeoutMs),
    listTabs: () => getDefaultContext().listTabs(),
    openTab: (url) => getDefaultContext().openTab(url),
    focusTab: (targetId) => getDefaultContext().focusTab(targetId),
    closeTab: (targetId) => getDefaultContext().closeTab(targetId),
    stopRunningBrowser: () => getDefaultContext().stopRunningBrowser(),
    resetProfile: () => getDefaultContext().resetProfile(),
    mapTabError,
  };
}
