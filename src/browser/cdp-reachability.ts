import { rawDataToString } from "../infra/ws.js";
import { CDP_REACHABILITY_TIMEOUT_MS, CDP_WS_READY_TIMEOUT_MS } from "./cdp-timeouts.js";
import { appendCdpPath, fetchCdpChecked, openCdpWebSocket } from "./cdp.helpers.js";
import { normalizeCdpWsUrl } from "./cdp.js";

type CdpVersion = {
  webSocketDebuggerUrl?: string;
  Browser?: string;
  "User-Agent"?: string;
};

async function fetchCdpVersion(cdpUrl: string, timeoutMs = CDP_REACHABILITY_TIMEOUT_MS): Promise<CdpVersion | null> {
  const ctrl = new AbortController();
  const t = setTimeout(ctrl.abort.bind(ctrl), timeoutMs);
  try {
    const versionUrl = appendCdpPath(cdpUrl, "/json/version");
    const res = await fetchCdpChecked(versionUrl, timeoutMs, { signal: ctrl.signal });
    const data = (await res.json()) as CdpVersion;
    if (!data || typeof data !== "object") {
      return null;
    }
    return data;
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

export async function isCdpHttpReachable(cdpUrl: string, timeoutMs = CDP_REACHABILITY_TIMEOUT_MS): Promise<boolean> {
  const version = await fetchCdpVersion(cdpUrl, timeoutMs);
  return Boolean(version);
}

export async function getCdpWebSocketUrl(
  cdpUrl: string,
  timeoutMs = CDP_REACHABILITY_TIMEOUT_MS,
): Promise<string | null> {
  const version = await fetchCdpVersion(cdpUrl, timeoutMs);
  const wsUrl = String(version?.webSocketDebuggerUrl ?? "").trim();
  if (!wsUrl) {
    return null;
  }
  return normalizeCdpWsUrl(wsUrl, cdpUrl);
}

async function canRunCdpHealthCommand(wsUrl: string, timeoutMs = CDP_WS_READY_TIMEOUT_MS): Promise<boolean> {
  return await new Promise<boolean>((resolve) => {
    const ws = openCdpWebSocket(wsUrl, {
      handshakeTimeoutMs: timeoutMs,
    });
    let settled = false;
    const onMessage = (raw: Parameters<typeof rawDataToString>[0]) => {
      if (settled) {
        return;
      }
      let parsed: { id?: unknown; result?: unknown } | null = null;
      try {
        parsed = JSON.parse(rawDataToString(raw)) as { id?: unknown; result?: unknown };
      } catch {
        return;
      }
      if (parsed?.id !== 1) {
        return;
      }
      finish(Boolean(parsed.result && typeof parsed.result === "object"));
    };

    const finish = (value: boolean) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      ws.off("message", onMessage);
      try {
        ws.close();
      } catch {
        // ignore
      }
      resolve(value);
    };
    const timer = setTimeout(
      () => {
        try {
          ws.terminate();
        } catch {
          // ignore
        }
        finish(false);
      },
      Math.max(50, timeoutMs + 25),
    );

    ws.once("open", () => {
      try {
        ws.send(
          JSON.stringify({
            id: 1,
            method: "Browser.getVersion",
          }),
        );
      } catch {
        finish(false);
      }
    });

    ws.on("message", onMessage);

    ws.once("error", () => {
      finish(false);
    });
    ws.once("close", () => {
      finish(false);
    });
  });
}

export async function isCdpReady(
  cdpUrl: string,
  timeoutMs = CDP_REACHABILITY_TIMEOUT_MS,
  handshakeTimeoutMs = CDP_WS_READY_TIMEOUT_MS,
): Promise<boolean> {
  const wsUrl = await getCdpWebSocketUrl(cdpUrl, timeoutMs);
  if (!wsUrl) {
    return false;
  }
  return await canRunCdpHealthCommand(wsUrl, handshakeTimeoutMs);
}
