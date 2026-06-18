import type { IncomingMessage } from "node:http";
import { describe, expect, it } from "vitest";
import {
  resolveHttpSenderIsOwner,
  resolveOpenAiCompatibleHttpOperatorScopes,
  resolveOpenAiCompatibleHttpSenderIsOwner,
  resolveTrustedHttpOperatorScopes,
  usesSharedSecretGatewayMethod,
} from "./http-utils.js";
import { ADMIN_SCOPE, WRITE_SCOPE } from "./method-scopes.js";

// #2735: HTTP auth → operator-scope / owner derivation for the gateway HTTP
// surface. The load-bearing fork divergence from upstream is asserted in
// "resolveTrustedHttpOperatorScopes" → "no-header non-shared-secret → []".
function createReq(headers: Record<string, string> = {}): IncomingMessage {
  return { headers } as IncomingMessage;
}

const tokenAuth = { mode: "token" as const };
const noneAuth = { mode: "none" as const };

describe("usesSharedSecretGatewayMethod", () => {
  it("is true only for token/password methods", () => {
    expect(usesSharedSecretGatewayMethod("token")).toBe(true);
    expect(usesSharedSecretGatewayMethod("password")).toBe(true);
    expect(usesSharedSecretGatewayMethod("none")).toBe(false);
    expect(usesSharedSecretGatewayMethod("trusted-proxy")).toBe(false);
    expect(usesSharedSecretGatewayMethod(undefined)).toBe(false);
  });
});

describe("resolveTrustedHttpOperatorScopes (owner feed)", () => {
  it("keeps an explicitly declared scope set for a non-shared-secret request", () => {
    expect(
      resolveTrustedHttpOperatorScopes(
        createReq({ "x-remoteclaw-scopes": "operator.admin, operator.write" }),
        noneAuth,
      ),
    ).toEqual(["operator.admin", "operator.write"]);
  });

  it("FORK #2735 divergence: non-shared-secret + NO header → [] (NOT CLI defaults)", () => {
    // Upstream returns [...CLI_DEFAULT_OPERATOR_SCOPES] (incl operator.admin) here;
    // the fork must return [] so a header-less auth:"none" caller is NOT owner.
    expect(resolveTrustedHttpOperatorScopes(createReq(), noneAuth)).toEqual([]);
    // Same divergence via the explicit AuthorizedGatewayHttpRequest input shape
    // (trustDeclaredOperatorScopes:true ⇒ non-shared-secret ⇒ honor declared,
    // but there is none, so []).
    expect(
      resolveTrustedHttpOperatorScopes(createReq(), { trustDeclaredOperatorScopes: true }),
    ).toEqual([]);
  });

  it("returns [] for a present-but-empty header", () => {
    expect(
      resolveTrustedHttpOperatorScopes(createReq({ "x-remoteclaw-scopes": "" }), noneAuth),
    ).toEqual([]);
  });

  it("drops self-asserted scopes for shared-secret bearer requests", () => {
    expect(
      resolveTrustedHttpOperatorScopes(
        createReq({ authorization: "Bearer secret", "x-remoteclaw-scopes": "operator.admin" }),
        tokenAuth,
      ),
    ).toEqual([]);
  });
});

describe("resolveHttpSenderIsOwner", () => {
  it("requires an explicitly declared operator.admin on a non-shared-secret request", () => {
    expect(
      resolveHttpSenderIsOwner(createReq({ "x-remoteclaw-scopes": "operator.admin" }), noneAuth),
    ).toBe(true);
    expect(
      resolveHttpSenderIsOwner(createReq({ "x-remoteclaw-scopes": "operator.write" }), noneAuth),
    ).toBe(false);
  });

  it("is false for a header-less non-shared-secret request (#2735)", () => {
    expect(resolveHttpSenderIsOwner(createReq(), noneAuth)).toBe(false);
  });
});

describe("resolveOpenAiCompatibleHttpOperatorScopes (chat.send gate)", () => {
  it("restores CLI defaults for shared-secret bearer auth", () => {
    const scopes = resolveOpenAiCompatibleHttpOperatorScopes(
      createReq({ authorization: "Bearer secret", "x-remoteclaw-scopes": "operator.approvals" }),
      { authMethod: "token", trustDeclaredOperatorScopes: false },
    );
    expect(scopes).toContain(ADMIN_SCOPE);
    expect(scopes).toContain(WRITE_SCOPE);
  });

  it("stays permissive (CLI defaults) on a missing header so chat.send still passes (B1, not 403)", () => {
    const scopes = resolveOpenAiCompatibleHttpOperatorScopes(createReq(), {
      authMethod: "none",
      trustDeclaredOperatorScopes: true,
    });
    // Method-authz only (never owner): includes WRITE so chat.send is allowed.
    expect(scopes).toContain(WRITE_SCOPE);
  });

  it("honors an explicitly declared narrower scope set verbatim", () => {
    expect(
      resolveOpenAiCompatibleHttpOperatorScopes(
        createReq({ "x-remoteclaw-scopes": "operator.write" }),
        { authMethod: "none", trustDeclaredOperatorScopes: true },
      ),
    ).toEqual(["operator.write"]);
  });
});

describe("resolveOpenAiCompatibleHttpSenderIsOwner", () => {
  it("treats shared-secret bearer auth as owner BEFORE consulting scopes", () => {
    expect(
      resolveOpenAiCompatibleHttpSenderIsOwner(
        createReq({ authorization: "Bearer secret", "x-remoteclaw-scopes": "operator.approvals" }),
        { authMethod: "token", trustDeclaredOperatorScopes: false },
      ),
    ).toBe(true);
  });

  it("is FALSE for an unauthenticated no-header caller (the #2735 hole)", () => {
    expect(
      resolveOpenAiCompatibleHttpSenderIsOwner(createReq(), {
        authMethod: "none",
        trustDeclaredOperatorScopes: true,
      }),
    ).toBe(false);
  });

  it("is FALSE for a non-admin declared scope, TRUE for an explicit operator.admin", () => {
    expect(
      resolveOpenAiCompatibleHttpSenderIsOwner(
        createReq({ "x-remoteclaw-scopes": "operator.write" }),
        { authMethod: "trusted-proxy", trustDeclaredOperatorScopes: true },
      ),
    ).toBe(false);
    expect(
      resolveOpenAiCompatibleHttpSenderIsOwner(
        createReq({ "x-remoteclaw-scopes": "operator.admin" }),
        { authMethod: "trusted-proxy", trustDeclaredOperatorScopes: true },
      ),
    ).toBe(true);
  });

  it("does NOT auto-grant owner to a header-less trusted-proxy caller", () => {
    expect(
      resolveOpenAiCompatibleHttpSenderIsOwner(createReq(), {
        authMethod: "trusted-proxy",
        trustDeclaredOperatorScopes: true,
      }),
    ).toBe(false);
  });
});
