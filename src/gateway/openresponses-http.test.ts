import type { IncomingMessage } from "node:http";
import { beforeAll, describe, expect, it } from "vitest";
import { resolveOpenAiCompatibleHttpSenderIsOwner } from "./http-utils.js";
import { agentCommand, getFreePort, installGatewayTestHooks } from "./test-helpers.js";

installGatewayTestHooks({ scope: "suite" });

let startGatewayServer: typeof import("./server.js").startGatewayServer;

beforeAll(async () => {
  ({ startGatewayServer } = await import("./server.js"));
});

function createReq(headers: Record<string, string> = {}): IncomingMessage {
  return { headers } as IncomingMessage;
}

// #2735: the OpenResponses (/v1/responses) surface threads the SAME auth-derived
// `senderIsOwner` (resolveOpenAiCompatibleHttpSenderIsOwner) into
// runResponsesAgentCommand that the chat-completions surface uses. It was
// previously hardcoded `true`, which would hand owner-only MCP tool families to
// an unauthenticated caller on an `auth:"none"` gateway.
//
// NOTE: the fork's `buildAgentPrompt` (openresponses-prompt.ts) is GUTTED — it
// returns an empty message — so `/v1/responses` 400s ("Missing user message")
// BEFORE reaching runResponsesAgentCommand. The owner hardcode was therefore
// unreachable in the fork today; threading the derived value is correctness +
// future-proofing for when the prompt builder is restored. Because the e2e path
// cannot reach the agent dispatch, the owner derivation is asserted here at the
// unit level (the comprehensive table lives in http-utils.owner-derivation.test.ts).
describe("OpenResponses HTTP senderIsOwner derivation (#2735)", () => {
  it("does NOT treat an unauthenticated no-header caller as owner (none)", () => {
    expect(
      resolveOpenAiCompatibleHttpSenderIsOwner(createReq(), {
        authMethod: "none",
        trustDeclaredOperatorScopes: true,
      }),
    ).toBe(false);
  });

  it("does NOT treat a non-admin declared scope as owner (none)", () => {
    expect(
      resolveOpenAiCompatibleHttpSenderIsOwner(
        createReq({ "x-remoteclaw-scopes": "operator.write" }),
        { authMethod: "none", trustDeclaredOperatorScopes: true },
      ),
    ).toBe(false);
  });

  it("treats an explicit operator.admin declared scope as owner (none)", () => {
    expect(
      resolveOpenAiCompatibleHttpSenderIsOwner(
        createReq({ "x-remoteclaw-scopes": "operator.admin" }),
        { authMethod: "none", trustDeclaredOperatorScopes: true },
      ),
    ).toBe(true);
  });

  it("treats shared-secret bearer callers as owner regardless of declared scope", () => {
    expect(
      resolveOpenAiCompatibleHttpSenderIsOwner(
        createReq({ "x-remoteclaw-scopes": "operator.approvals" }),
        { authMethod: "token", trustDeclaredOperatorScopes: false },
      ),
    ).toBe(true);
  });

  // Tripwire: documents the current gutted-endpoint contract. An unauthenticated
  // caller on an `auth:"none"` gateway never reaches the agent (400), so there is
  // no owner-tool exposure via /v1/responses today. If `buildAgentPrompt` is
  // restored (200 path enabled), this test fails loudly — at which point add an
  // e2e senderIsOwner===false assertion mirroring openai-http.test.ts.
  it("does not dispatch an unauthenticated /v1/responses caller to the agent (gutted prompt builder)", async () => {
    const port = await getFreePort();
    const server = await startGatewayServer(port, {
      host: "127.0.0.1",
      auth: { mode: "none" },
      controlUiEnabled: false,
      openResponsesEnabled: true,
    });
    try {
      agentCommand.mockClear();
      const res = await fetch(`http://127.0.0.1:${port}/v1/responses`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          model: "remoteclaw",
          input: [{ type: "message", role: "user", content: "hi" }],
        }),
      });
      expect(res.status).toBe(400);
      expect(agentCommand).toHaveBeenCalledTimes(0);
      await res.text();
    } finally {
      await server.close({ reason: "openresponses gutted-endpoint contract test done" });
    }
  });
});
