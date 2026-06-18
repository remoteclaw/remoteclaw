import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { describe, expect, test } from "vitest";
import { WebSocket, WebSocketServer } from "ws";
import { CANVAS_HOST_PATH, CANVAS_WS_PATH } from "../canvas-host/a2ui.js";
import type { CanvasHostHandler } from "../canvas-host/server.js";
import { createAuthRateLimiter } from "./auth-rate-limit.js";
import type { ResolvedGatewayAuth } from "./auth.js";
import { CANVAS_CAPABILITY_PATH_PREFIX } from "./canvas-capability.js";
import { attachGatewayUpgradeHandler, createGatewayHttpServer } from "./server-http.js";
import { createPreauthConnectionBudget } from "./server/preauth-connection-budget.js";
import type { GatewayWsClient } from "./server/ws-types.js";
import { withTempConfig } from "./test-temp-config.js";

const WS_REJECT_TIMEOUT_MS = 2_000;

async function listen(
  server: ReturnType<typeof createGatewayHttpServer>,
  host = "127.0.0.1",
): Promise<{
  host: string;
  port: number;
  close: () => Promise<void>;
}> {
  await new Promise<void>((resolve) => server.listen(0, host, resolve));
  const addr = server.address();
  const port = typeof addr === "object" && addr ? addr.port : 0;
  return {
    host,
    port,
    close: async () => {
      await new Promise<void>((resolve, reject) =>
        server.close((err) => (err ? reject(err) : resolve())),
      );
    },
  };
}

async function expectWsRejected(
  url: string,
  headers: Record<string, string>,
  expectedStatus = 401,
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const ws = new WebSocket(url, { headers });
    const timer = setTimeout(() => reject(new Error("timeout")), WS_REJECT_TIMEOUT_MS);
    ws.once("open", () => {
      clearTimeout(timer);
      ws.terminate();
      reject(new Error("expected ws to reject"));
    });
    ws.once("unexpected-response", (_req, res) => {
      clearTimeout(timer);
      expect(res.statusCode).toBe(expectedStatus);
      resolve();
    });
    ws.once("error", () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

function makeWsClient(params: {
  connId: string;
  clientIp: string;
  role: "node" | "operator";
  mode: "node" | "backend";
  canvasCapability?: string;
  canvasCapabilityExpiresAtMs?: number;
}): GatewayWsClient {
  return {
    socket: {} as unknown as WebSocket,
    usesSharedGatewayAuth: false,
    connect: {
      role: params.role,
      client: {
        mode: params.mode,
      },
    } as GatewayWsClient["connect"],
    connId: params.connId,
    clientIp: params.clientIp,
    canvasCapability: params.canvasCapability,
    canvasCapabilityExpiresAtMs: params.canvasCapabilityExpiresAtMs,
  };
}

function scopedCanvasPath(capability: string, path: string): string {
  return `${CANVAS_CAPABILITY_PATH_PREFIX}/${encodeURIComponent(capability)}${path}`;
}

const allowCanvasHostHttp: CanvasHostHandler["handleHttpRequest"] = async (req, res) => {
  const url = new URL(req.url ?? "/", "http://localhost");
  if (url.pathname !== CANVAS_HOST_PATH && !url.pathname.startsWith(`${CANVAS_HOST_PATH}/`)) {
    return false;
  }
  res.statusCode = 200;
  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.end("ok");
  return true;
};
async function withCanvasGatewayHarness(params: {
  resolvedAuth: ResolvedGatewayAuth;
  listenHost?: string;
  rateLimiter?: ReturnType<typeof createAuthRateLimiter>;
  handleHttpRequest: CanvasHostHandler["handleHttpRequest"];
  run: (ctx: {
    listener: Awaited<ReturnType<typeof listen>>;
    clients: Set<GatewayWsClient>;
  }) => Promise<void>;
}) {
  const clients = new Set<GatewayWsClient>();
  const canvasWss = new WebSocketServer({ noServer: true });
  const canvasHost: CanvasHostHandler = {
    rootDir: "test",
    basePath: "/canvas",
    close: async () => {},
    handleUpgrade: (req, socket, head) => {
      const url = new URL(req.url ?? "/", "http://localhost");
      if (url.pathname !== CANVAS_WS_PATH) {
        return false;
      }
      canvasWss.handleUpgrade(req, socket, head, (ws) => ws.close());
      return true;
    },
    handleHttpRequest: params.handleHttpRequest,
  };

  const httpServer = createGatewayHttpServer({
    canvasHost,
    clients,
    controlUiEnabled: false,
    controlUiBasePath: "/__control__",
    openAiChatCompletionsEnabled: false,
    openResponsesEnabled: false,
    handleHooksRequest: async () => false,
    resolvedAuth: params.resolvedAuth,
    rateLimiter: params.rateLimiter,
  });

  const wss = new WebSocketServer({ noServer: true });
  attachGatewayUpgradeHandler({
    httpServer,
    wss,
    canvasHost,
    clients,
    preauthConnectionBudget: createPreauthConnectionBudget(),
    resolvedAuth: params.resolvedAuth,
    rateLimiter: params.rateLimiter,
  });

  const listener = await listen(httpServer, params.listenHost);
  try {
    await params.run({ listener, clients });
  } finally {
    await listener.close();
    params.rateLimiter?.dispose();
    canvasWss.close();
    wss.close();
  }
}

// NOTE — Canvas gateway-AUTH is deliberately gutted in the RemoteClaw fork.
//
// Upstream OpenClaw guarded the canvas host behind gateway auth (HTTP 401 for
// unauthenticated/uncapable callers; WS upgrade authorized via node-scoped
// capability). RemoteClaw inlined both gates as no-ops in `server-http.ts`
// (commit 4e846400b0 / PR #2375):
//   - canvas-auth HTTP stage: `run: async () => false` ("always skip"), so the
//     canvas HTTP request falls through to `canvasHost.handleHttpRequest`
//     WITHOUT a gateway-auth challenge.
//   - canvas WS upgrade: "always reject" — the gateway never authorizes a
//     canvas WS upgrade itself (fail-secure on the high-authority WS channel).
// The backing modules (`connection-auth.ts`, `server/http-auth.ts`) are
// EXCLUDE-GUT in the HQ disposition registry and physically deleted.
//
// The 6 prior tests here asserted the upstream 401/429/capability-scoped
// contract and were removed (they encode a contract production no longer
// implements — verified against the gutting markers above, NOT a regression).
// This tripwire replaces them: it documents the CURRENT gutted posture and
// fails loudly if a future upstream sync silently re-introduces (or further
// changes) canvas gateway auth, so the gut stays a conscious decision.
// Follow-up RESOLVED (#2724 sub-part b): `canvasHost.handleHttpRequest` internal
// authz has been audited (verdict: INTENTIONAL_SAFE). The handler is
// unauthenticated by design but METHOD- and PATH-confined; the posture and its
// emergent-from-dead-code precondition are documented at the handler in
// `../canvas-host/server.ts` and pinned by the internal-authz asymmetry test in
// `../canvas-host/server.test.ts`. The DIFF-SYNC re-introduction guard for the
// precondition is the "canvas document pipeline re-wire tripwire" at the bottom
// of this file.
describe("gateway canvas host auth (gutted-posture tripwire)", () => {
  const tokenResolvedAuth: ResolvedGatewayAuth = {
    mode: "token",
    token: "test-token",
    password: undefined,
    allowTailscale: false,
  };

  test("canvas HTTP reaches the host handler unauthenticated (gateway auth gutted, always-skip)", async () => {
    await withTempConfig({
      cfg: { gateway: { trustedProxies: ["127.0.0.1"] } },
      prefix: "remoteclaw-canvas-auth-gutted-http-",
      run: async () => {
        await withCanvasGatewayHarness({
          resolvedAuth: tokenResolvedAuth,
          handleHttpRequest: allowCanvasHostHttp,
          run: async ({ listener }) => {
            // No bearer, no capability — upstream returned 401; the gutted fork
            // skips the gateway-auth stage so the canvas host handler runs.
            const unauthCanvas = await fetch(
              `http://127.0.0.1:${listener.port}${CANVAS_HOST_PATH}/`,
            );
            expect(unauthCanvas.status).toBe(200);
            expect(await unauthCanvas.text()).toBe("ok");
          },
        });
      },
    });
  }, 60_000);

  test("canvas WS upgrade is always rejected by the gateway (gutted, fail-secure)", async () => {
    await withTempConfig({
      cfg: { gateway: { trustedProxies: ["127.0.0.1"] } },
      prefix: "remoteclaw-canvas-auth-gutted-ws-",
      run: async () => {
        await withCanvasGatewayHarness({
          resolvedAuth: tokenResolvedAuth,
          handleHttpRequest: allowCanvasHostHttp,
          run: async ({ listener, clients }) => {
            // Even a fully-valid active node capability cannot open a canvas WS:
            // the gateway upgrade path is gutted to always reject.
            const capability = "active-node";
            clients.add(
              makeWsClient({
                connId: "c-active-node",
                clientIp: "192.168.1.30",
                role: "node",
                mode: "node",
                canvasCapability: capability,
                canvasCapabilityExpiresAtMs: Date.now() + 60_000,
              }),
            );
            const wsPath = scopedCanvasPath(capability, CANVAS_WS_PATH);
            await expectWsRejected(`ws://127.0.0.1:${listener.port}${wsPath}`, {});
          },
        });
      },
    });
  }, 60_000);
});

// ---------------------------------------------------------------------------
// Canvas document pipeline re-wire tripwire (#2724 sub-part b).
//
// Canvas HTTP is served UNAUTHENTICATED (the gateway canvas-auth perimeter is
// gutted to always-skip — see `server-http.ts`). The audit concluded that is
// SAFE only because the served canvas root holds a static shell, NOT sensitive
// agent-rendered content. The single writer that would place such content in the
// root is `createCanvasDocument` (`canvas-documents.ts`), and it is fork-orphaned
// — no production caller. THAT dead-code fact is the load-bearing precondition of
// the "unauthenticated is safe" verdict.
//
// This tripwire mechanizes the precondition: it fails the instant any production
// (non-test) module under `src/` imports or calls `createCanvasDocument`. If it
// fails, the document pipeline was re-wired while canvas HTTP is still
// unauthenticated → an unauthenticated-disclosure regression. The fix is to
// RE-AUTHORIZE canvas HTTP (the capability-token scheme in `canvas-capability.ts`
// exists for exactly this), NOT to delete this test. Re-enabling document
// publishing is an architecture decision needing its own ADR + security review.
//
// Mechanism is AST-confirmed (not raw grep): a cheap substring scan narrows the
// candidate files, then the TypeScript compiler API confirms a real import/call
// — so a mention of the symbol in a comment or string (e.g. the audit note in
// `canvas-host/server.ts`) is not a false positive.

const CANVAS_AUDIT_SRC_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CANVAS_DOCUMENTS_MODULE = path.join(CANVAS_AUDIT_SRC_DIR, "gateway", "canvas-documents.ts");

function collectProductionTsFiles(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === "__tests__") {
      continue;
    }
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      collectProductionTsFiles(full, acc);
    } else if (
      entry.isFile() &&
      entry.name.endsWith(".ts") &&
      !entry.name.endsWith(".d.ts") &&
      !entry.name.endsWith(".test.ts") &&
      !entry.name.endsWith(".spec.ts") &&
      full !== CANVAS_DOCUMENTS_MODULE
    ) {
      acc.push(full);
    }
  }
  return acc;
}

function importsOrCallsCreateCanvasDocument(file: string): boolean {
  const text = readFileSync(file, "utf8");
  if (!text.includes("createCanvasDocument")) {
    return false; // cheap narrow — skip the AST parse for the vast majority
  }
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, /* setParentNodes */ true);
  let referenced = false;
  const visit = (node: ts.Node) => {
    if (
      ts.isImportDeclaration(node) &&
      node.importClause?.namedBindings !== undefined &&
      ts.isNamedImports(node.importClause.namedBindings) &&
      node.importClause.namedBindings.elements.some((el) => el.name.text === "createCanvasDocument")
    ) {
      referenced = true;
    }
    if (
      ts.isCallExpression(node) &&
      ((ts.isIdentifier(node.expression) && node.expression.text === "createCanvasDocument") ||
        (ts.isPropertyAccessExpression(node.expression) &&
          node.expression.name.text === "createCanvasDocument"))
    ) {
      referenced = true;
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return referenced;
}

describe("canvas document pipeline re-wire tripwire (#2724)", () => {
  test("keeps createCanvasDocument fork-orphaned — no production caller of the canvas-document writer", () => {
    const offenders = collectProductionTsFiles(CANVAS_AUDIT_SRC_DIR)
      .filter(importsOrCallsCreateCanvasDocument)
      .map((f) => path.relative(CANVAS_AUDIT_SRC_DIR, f));
    expect(offenders).toEqual([]);
  });
});
