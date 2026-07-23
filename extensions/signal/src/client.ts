// Signal plugin module implements client behavior.
import { Buffer } from "node:buffer";
import { formatErrorMessage } from "../../../src/infra/errors.js";
import { resolveFetch } from "../../../src/infra/fetch.js";
import { generateSecureUuid } from "../../../src/infra/secure-random.js";
import { fetchWithTimeout } from "../../../src/utils/fetch-timeout.js";

export type SignalRpcOptions = {
  baseUrl: string;
  timeoutMs?: number;
};

export type SignalRpcError = {
  code?: number;
  message?: string;
  data?: unknown;
};

export type SignalRpcResponse<T> = {
  jsonrpc?: string;
  result?: T;
  error?: SignalRpcError;
  id?: string | number | null;
};

export type SignalSseEvent = {
  event?: string;
  data?: string;
  id?: string;
};

const DEFAULT_TIMEOUT_MS = 10_000;

// Bound reads from the signal-cli daemon. A compromised/hostile daemon — or a
// MITM on a plaintext http:// connection to a remote signal-cli — could otherwise
// stream unbounded data (a body with no size limit, or an SSE stream with no
// newline / an ever-growing data field) and exhaust process memory (OOM DoS).
const MAX_SIGNAL_HTTP_RESPONSE_BYTES = 1_048_576;
const MAX_SIGNAL_SSE_BUFFER_BYTES = 1_048_576;
const MAX_SIGNAL_SSE_EVENT_DATA_BYTES = 1_048_576;

// Read a response body as text while enforcing a hard byte cap. Streams via the
// reader so the cap trips before the whole (potentially unbounded) body is
// buffered — `res.text()` would read it all first, defeating the limit.
async function readBodyTextWithCap(res: Response, cap: number): Promise<string> {
  const declaredLength = Number(res.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > cap) {
    throw new Error(`Signal HTTP response exceeded ${cap} byte limit`);
  }
  const body = res.body;
  if (!body) {
    const text = await res.text();
    if (Buffer.byteLength(text, "utf8") > cap) {
      throw new Error(`Signal HTTP response exceeded ${cap} byte limit`);
    }
    return text;
  }
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let text = "";
  let totalBytes = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) {
      break;
    }
    totalBytes += value.byteLength;
    if (totalBytes > cap) {
      await reader.cancel().catch(() => {});
      throw new Error(`Signal HTTP response exceeded ${cap} byte limit`);
    }
    text += decoder.decode(value, { stream: true });
  }
  text += decoder.decode();
  return text;
}

function normalizeBaseUrl(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) {
    throw new Error("Signal base URL is required");
  }
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed.replace(/\/+$/, "");
  }
  return `http://${trimmed}`.replace(/\/+$/, "");
}

function getRequiredFetch(): typeof fetch {
  const fetchImpl = resolveFetch();
  if (!fetchImpl) {
    throw new Error("fetch is not available");
  }
  return fetchImpl;
}

function parseSignalRpcResponse<T>(text: string, status: number): SignalRpcResponse<T> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    throw new Error(`Signal RPC returned malformed JSON (status ${status})`, { cause: err });
  }

  if (!parsed || typeof parsed !== "object") {
    throw new Error(`Signal RPC returned invalid response envelope (status ${status})`);
  }

  const rpc = parsed as SignalRpcResponse<T>;
  const hasResult = Object.hasOwn(rpc, "result");
  if (!rpc.error && !hasResult) {
    throw new Error(`Signal RPC returned invalid response envelope (status ${status})`);
  }
  return rpc;
}

export async function signalRpcRequest<T = unknown>(
  method: string,
  params: Record<string, unknown> | undefined,
  opts: SignalRpcOptions,
): Promise<T> {
  const baseUrl = normalizeBaseUrl(opts.baseUrl);
  const id = generateSecureUuid();
  const body = JSON.stringify({
    jsonrpc: "2.0",
    method,
    params,
    id,
  });
  const res = await fetchWithTimeout(
    `${baseUrl}/api/v1/rpc`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    },
    opts.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    getRequiredFetch(),
  );
  if (res.status === 201) {
    return undefined as T;
  }
  const text = await readBodyTextWithCap(res, MAX_SIGNAL_HTTP_RESPONSE_BYTES);
  if (!text) {
    throw new Error(`Signal RPC empty response (status ${res.status})`);
  }
  const parsed = parseSignalRpcResponse<T>(text, res.status);
  if (parsed.error) {
    const code = parsed.error.code ?? "unknown";
    const msg = parsed.error.message ?? "Signal RPC error";
    throw new Error(`Signal RPC ${code}: ${msg}`);
  }
  return parsed.result as T;
}

export async function signalCheck(
  baseUrl: string,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<{ ok: boolean; status?: number | null; error?: string | null }> {
  const normalized = normalizeBaseUrl(baseUrl);
  try {
    const res = await fetchWithTimeout(
      `${normalized}/api/v1/check`,
      { method: "GET" },
      timeoutMs,
      getRequiredFetch(),
    );
    if (!res.ok) {
      return { ok: false, status: res.status, error: `HTTP ${res.status}` };
    }
    return { ok: true, status: res.status, error: null };
  } catch (err) {
    return {
      ok: false,
      status: null,
      error: formatErrorMessage(err),
    };
  }
}

export async function streamSignalEvents(params: {
  baseUrl: string;
  account?: string;
  abortSignal?: AbortSignal;
  onEvent: (event: SignalSseEvent) => void;
}): Promise<void> {
  const baseUrl = normalizeBaseUrl(params.baseUrl);
  const url = new URL(`${baseUrl}/api/v1/events`);
  if (params.account) {
    url.searchParams.set("account", params.account);
  }

  const fetchImpl = resolveFetch();
  if (!fetchImpl) {
    throw new Error("fetch is not available");
  }
  const res = await fetchImpl(url, {
    method: "GET",
    headers: { Accept: "text/event-stream" },
    signal: params.abortSignal,
  });
  if (!res.ok || !res.body) {
    throw new Error(`Signal SSE failed (${res.status} ${res.statusText || "error"})`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let currentEvent: SignalSseEvent = {};

  const flushEvent = () => {
    if (!currentEvent.data && !currentEvent.event && !currentEvent.id) {
      return;
    }
    params.onEvent({
      event: currentEvent.event,
      data: currentEvent.data,
      id: currentEvent.id,
    });
    currentEvent = {};
  };

  while (true) {
    const { value, done } = await reader.read();
    if (done) {
      break;
    }
    buffer += decoder.decode(value, { stream: true });
    if (Buffer.byteLength(buffer, "utf8") > MAX_SIGNAL_SSE_BUFFER_BYTES) {
      await reader.cancel().catch(() => {});
      throw new Error(`Signal SSE buffer exceeded ${MAX_SIGNAL_SSE_BUFFER_BYTES} byte limit`);
    }
    let lineEnd = buffer.indexOf("\n");
    while (lineEnd !== -1) {
      let line = buffer.slice(0, lineEnd);
      buffer = buffer.slice(lineEnd + 1);
      if (line.endsWith("\r")) {
        line = line.slice(0, -1);
      }

      if (line === "") {
        flushEvent();
        lineEnd = buffer.indexOf("\n");
        continue;
      }
      if (line.startsWith(":")) {
        lineEnd = buffer.indexOf("\n");
        continue;
      }
      const [rawField, ...rest] = line.split(":");
      const field = rawField.trim();
      const rawValue = rest.join(":");
      const value = rawValue.startsWith(" ") ? rawValue.slice(1) : rawValue;
      if (field === "event") {
        currentEvent.event = value;
      } else if (field === "data") {
        currentEvent.data = currentEvent.data ? `${currentEvent.data}\n${value}` : value;
        if (Buffer.byteLength(currentEvent.data, "utf8") > MAX_SIGNAL_SSE_EVENT_DATA_BYTES) {
          await reader.cancel().catch(() => {});
          throw new Error(
            `Signal SSE event data exceeded ${MAX_SIGNAL_SSE_EVENT_DATA_BYTES} byte limit`,
          );
        }
      } else if (field === "id") {
        currentEvent.id = value;
      }
      lineEnd = buffer.indexOf("\n");
    }
  }

  flushEvent();
}
