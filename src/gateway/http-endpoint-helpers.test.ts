import type { IncomingMessage, ServerResponse } from "node:http";
import { describe, expect, it, vi } from "vitest";
import type { ResolvedGatewayAuth } from "./auth.js";
import { handleGatewayPostJsonEndpoint } from "./http-endpoint-helpers.js";
import type { AuthorizedGatewayHttpRequest } from "./http-utils.js";

vi.mock("./http-auth-helpers.js", () => {
  return {
    // #2735: the endpoint now authorizes via authorizeGatewayHttpRequestOrReply,
    // which surfaces the satisfying auth method (AuthorizedGatewayHttpRequest)
    // instead of a bare boolean so downstream owner-derivation can run.
    authorizeGatewayHttpRequestOrReply: vi.fn(),
    resolveGatewayRequestedOperatorScopes: vi.fn(),
  };
});

vi.mock("./http-common.js", () => {
  return {
    readJsonBodyOrError: vi.fn(),
    sendJson: vi.fn(),
    sendMethodNotAllowed: vi.fn(),
  };
});

vi.mock("./method-scopes.js", () => {
  return {
    authorizeOperatorScopesForMethod: vi.fn(),
  };
});

const { authorizeGatewayHttpRequestOrReply } = await import("./http-auth-helpers.js");
const { resolveGatewayRequestedOperatorScopes } = await import("./http-auth-helpers.js");
const { readJsonBodyOrError, sendJson, sendMethodNotAllowed } = await import("./http-common.js");
const { authorizeOperatorScopesForMethod } = await import("./method-scopes.js");

// Stand-in for a successful authorization: the concrete shape is irrelevant to
// these tests (operator scopes are resolved via the mocked resolver), only that
// it is a non-null AuthorizedGatewayHttpRequest threaded back as `requestAuth`.
const fakeRequestAuth: AuthorizedGatewayHttpRequest = {
  authMethod: "token",
  trustDeclaredOperatorScopes: false,
};

describe("handleGatewayPostJsonEndpoint", () => {
  it("returns false when path does not match", async () => {
    const result = await handleGatewayPostJsonEndpoint(
      {
        url: "/nope",
        method: "POST",
        headers: { host: "localhost" },
      } as unknown as IncomingMessage,
      {} as unknown as ServerResponse,
      { pathname: "/v1/ok", auth: {} as unknown as ResolvedGatewayAuth, maxBodyBytes: 1 },
    );
    expect(result).toBe(false);
  });

  it("returns undefined and replies when method is not POST", async () => {
    const mockedSendMethodNotAllowed = vi.mocked(sendMethodNotAllowed);
    mockedSendMethodNotAllowed.mockClear();
    const result = await handleGatewayPostJsonEndpoint(
      {
        url: "/v1/ok",
        method: "GET",
        headers: { host: "localhost" },
      } as unknown as IncomingMessage,
      {} as unknown as ServerResponse,
      { pathname: "/v1/ok", auth: {} as unknown as ResolvedGatewayAuth, maxBodyBytes: 1 },
    );
    expect(result).toBeUndefined();
    expect(mockedSendMethodNotAllowed).toHaveBeenCalledTimes(1);
  });

  it("returns undefined when auth fails", async () => {
    vi.mocked(authorizeGatewayHttpRequestOrReply).mockResolvedValue(null);
    const result = await handleGatewayPostJsonEndpoint(
      {
        url: "/v1/ok",
        method: "POST",
        headers: { host: "localhost" },
      } as unknown as IncomingMessage,
      {} as unknown as ServerResponse,
      { pathname: "/v1/ok", auth: {} as unknown as ResolvedGatewayAuth, maxBodyBytes: 1 },
    );
    expect(result).toBeUndefined();
  });

  it("returns body and requestAuth when auth succeeds and JSON parsing succeeds", async () => {
    vi.mocked(authorizeGatewayHttpRequestOrReply).mockResolvedValue(fakeRequestAuth);
    vi.mocked(readJsonBodyOrError).mockResolvedValue({ hello: "world" });
    const result = await handleGatewayPostJsonEndpoint(
      {
        url: "/v1/ok",
        method: "POST",
        headers: { host: "localhost" },
      } as unknown as IncomingMessage,
      {} as unknown as ServerResponse,
      { pathname: "/v1/ok", auth: {} as unknown as ResolvedGatewayAuth, maxBodyBytes: 123 },
    );
    expect(result).toEqual({ body: { hello: "world" }, requestAuth: fakeRequestAuth });
  });

  it("returns undefined and replies when required operator scope is missing", async () => {
    vi.mocked(authorizeGatewayHttpRequestOrReply).mockResolvedValue(fakeRequestAuth);
    vi.mocked(resolveGatewayRequestedOperatorScopes).mockReturnValue(["operator.approvals"]);
    vi.mocked(authorizeOperatorScopesForMethod).mockReturnValue({
      allowed: false,
      missingScope: "operator.write",
    });
    const mockedSendJson = vi.mocked(sendJson);
    mockedSendJson.mockClear();
    vi.mocked(readJsonBodyOrError).mockClear();

    const result = await handleGatewayPostJsonEndpoint(
      {
        url: "/v1/ok",
        method: "POST",
        headers: { host: "localhost" },
      } as unknown as IncomingMessage,
      {} as unknown as ServerResponse,
      {
        pathname: "/v1/ok",
        auth: {} as unknown as ResolvedGatewayAuth,
        maxBodyBytes: 123,
        requiredOperatorMethod: "chat.send",
      },
    );

    expect(result).toBeUndefined();
    expect(vi.mocked(authorizeOperatorScopesForMethod)).toHaveBeenCalledWith("chat.send", [
      "operator.approvals",
    ]);
    expect(mockedSendJson).toHaveBeenCalledWith(
      expect.anything(),
      403,
      expect.objectContaining({
        ok: false,
        error: expect.objectContaining({
          type: "forbidden",
          message: "missing scope: operator.write",
        }),
      }),
    );
    expect(vi.mocked(readJsonBodyOrError)).not.toHaveBeenCalled();
  });
});
