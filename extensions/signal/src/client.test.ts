import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const fetchWithTimeoutMock = vi.fn();
const resolveFetchMock = vi.fn();

// client.ts imports these directly from the repo-root `src/` tree, not from the
// `remoteclaw/plugin-sdk/*` barrels, so the mocks must target the same specifiers
// the source uses — otherwise the real fetch runs (ECONNREFUSED).
vi.mock("../../../src/infra/fetch.js", async () => {
  const actual = await vi.importActual<typeof import("../../../src/infra/fetch.js")>(
    "../../../src/infra/fetch.js",
  );
  return {
    ...actual,
    resolveFetch: (...args: unknown[]) => resolveFetchMock(...args),
  };
});

vi.mock("../../../src/infra/secure-random.js", async () => {
  const actual = await vi.importActual<typeof import("../../../src/infra/secure-random.js")>(
    "../../../src/infra/secure-random.js",
  );
  return {
    ...actual,
    generateSecureUuid: () => "test-id",
  };
});

vi.mock("../../../src/utils/fetch-timeout.js", async () => {
  const actual = await vi.importActual<typeof import("../../../src/utils/fetch-timeout.js")>(
    "../../../src/utils/fetch-timeout.js",
  );
  return {
    ...actual,
    fetchWithTimeout: (...args: unknown[]) => fetchWithTimeoutMock(...args),
  };
});

let signalRpcRequest: typeof import("./client.js").signalRpcRequest;

function rpcResponse(body: unknown, status = 200): Response {
  if (typeof body === "string") {
    return new Response(body, { status });
  }
  return new Response(JSON.stringify(body), { status });
}

describe("signalRpcRequest", () => {
  beforeAll(async () => {
    ({ signalRpcRequest } = await import("./client.js"));
  });

  beforeEach(() => {
    vi.clearAllMocks();
    resolveFetchMock.mockReturnValue(vi.fn());
  });

  it("returns parsed RPC result", async () => {
    fetchWithTimeoutMock.mockResolvedValueOnce(
      rpcResponse({ jsonrpc: "2.0", result: { version: "0.13.22" }, id: "test-id" }),
    );

    const result = await signalRpcRequest<{ version: string }>("version", undefined, {
      baseUrl: "http://127.0.0.1:8080",
    });

    expect(result).toEqual({ version: "0.13.22" });
  });

  it("throws a wrapped error when RPC response JSON is malformed", async () => {
    fetchWithTimeoutMock.mockResolvedValueOnce(rpcResponse("not-json", 502));

    await expect(
      signalRpcRequest("version", undefined, {
        baseUrl: "http://127.0.0.1:8080",
      }),
    ).rejects.toMatchObject({
      message: "Signal RPC returned malformed JSON (status 502)",
      cause: expect.any(SyntaxError),
    });
  });

  it("throws when RPC response envelope has neither result nor error", async () => {
    fetchWithTimeoutMock.mockResolvedValueOnce(rpcResponse({ jsonrpc: "2.0", id: "test-id" }));

    await expect(
      signalRpcRequest("version", undefined, {
        baseUrl: "http://127.0.0.1:8080",
      }),
    ).rejects.toThrow("Signal RPC returned invalid response envelope (status 200)");
  });
});
