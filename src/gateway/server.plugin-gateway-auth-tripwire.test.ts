import { readFileSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { describe, expect, it, vi } from "vitest";
import { AUTH_NONE, sendRequest, withGatewayServer } from "./server-http.test-harness.js";
import { createTestRegistry } from "./server/__tests__/test-utils.js";
import {
  createGatewayPluginRequestHandler,
  type PluginHttpRequestHandler,
} from "./server/plugins-http.js";

// Gutted-posture tripwire for the plugin-route gateway-auth perimeter (#2724,
// hq-internal ADR 0010 / ADR 0011 DIFF-SYNC re-introduction-guard family).
//
// RemoteClaw deliberately GUTS the plugin-route gateway-auth perimeter
// (`server-http.ts` `buildPluginRequestStages`, commit 4e846400b0 / upstream
// PR #2375): the "plugin-auth" stage hardcodes `gatewayAuthSatisfied = true`
// ("always pass") instead of calling the deleted `enforcePluginRouteGatewayAuth`.
//
// That perimeter gut is NOT a clean unauth bypass on its own. An
// `auth: "gateway"` plugin route stays unreachable because of a SECOND,
// independent guard in `createGatewayPluginRequestHandler` (`server/plugins-http.ts`):
// it refuses to dispatch unless `gatewayRequestOperatorScopes` is defined — and
// `buildPluginRequestStages` deliberately forwards ONLY `gatewayAuthSatisfied`,
// never the operator scopes. Safety is therefore EMERGENT from two half-disabled
// mechanisms (security-architect flag during #2720): a future upstream sync that
// re-couples scope propagation in `buildPluginRequestStages` while leaving
// `gatewayAuthSatisfied = true` would silently re-open the perimeter.
//
// The guard's own unit tests (`server/plugins-http.test.ts`) cover that guard in
// isolation, passing the dispatch context directly. These tests pin the
// INTEGRATION those unit tests cannot see: that the real server pipeline wires
// the gut to the guard such that the scope-omission safety net actually fires
// end-to-end.
//
// IF THE NEGATIVE TEST FAILS AFTER AN UPSTREAM SYNC: the fix is to RESTORE the
// gutted-posture (keep the perimeter gut AND keep operator scopes un-propagated
// out of `buildPluginRequestStages`), NOT to weaken or delete it. Re-enabling the
// upstream perimeter auth as a "missing feature" is a DIFF-SYNC
// re-introduction-guard violation (hq-internal ADR 0010 / ADR 0011). If the perimeter auth is
// being intentionally restored, that is an architecture decision requiring its
// own ADR plus security review.

type GuardLog = Parameters<typeof createGatewayPluginRequestHandler>[0]["log"];

// The guard only ever calls `log.warn`; surface that spy while satisfying the
// SubsystemLogger type (same shape as server/plugins-http.test.ts's helper).
function asGuardLog(warn: ReturnType<typeof vi.fn>): GuardLog {
  return { warn } as unknown as GuardLog;
}

function createGatewayAuthRoute(
  handler: (req: IncomingMessage, res: ServerResponse) => boolean | void | Promise<boolean | void>,
) {
  return {
    pluginId: "tripwire",
    path: "/plugin/secure",
    auth: "gateway" as const,
    match: "exact" as const,
    handler,
    source: "tripwire",
  };
}

function createReachableRouteSpy() {
  return vi.fn(async (_req: IncomingMessage, res: ServerResponse) => {
    res.statusCode = 200;
    res.end(JSON.stringify({ reached: true }));
    return true;
  });
}

describe("plugin auth:'gateway' route gutted-posture tripwire (#2724)", () => {
  it("keeps an auth:'gateway' route unreachable: the gutted perimeter always-passes, but the un-propagated operator scopes still block dispatch", async () => {
    const gatewayRouteHandler = createReachableRouteSpy();
    const warn = vi.fn();
    const handlePluginRequest = createGatewayPluginRequestHandler({
      registry: createTestRegistry({ httpRoutes: [createGatewayAuthRoute(gatewayRouteHandler)] }),
      log: asGuardLog(warn),
    });

    await withGatewayServer({
      prefix: "remoteclaw-plugin-gateway-auth-tripwire-",
      resolvedAuth: AUTH_NONE,
      overrides: {
        handlePluginRequest,
        // Force the gutted perimeter stage to treat the path as
        // gateway-auth-required so it exercises the always-pass gut
        // (`gatewayAuthSatisfied = true`) rather than skipping. The safety net
        // under test is the SECOND guard, not this perimeter check.
        shouldEnforcePluginGatewayAuth: () => true,
      },
      run: async (server) => {
        await sendRequest(server, { path: "/plugin/secure" });

        // The route handler is never invoked: the second guard blocks dispatch.
        expect(gatewayRouteHandler).not.toHaveBeenCalled();
        // And it is blocked SPECIFICALLY at the operator-scope check — proving
        // `buildPluginRequestStages` forwarded `gatewayAuthSatisfied = true` but
        // NOT `gatewayRequestOperatorScopes`. Re-couple that propagation upstream
        // and this warning stops firing while the handler runs → this test fails
        // by design. The warn assertion also makes the test non-degenerate: a
        // broken pipeline that never reaches the guard fails here, not silently.
        expect(warn).toHaveBeenCalledWith(
          expect.stringContaining("blocked without caller scope context"),
        );
      },
    });
  });

  // Positive companion (security-architect-recommended). Proves the request path
  // is genuinely LIVE end-to-end so the negative assertion above can never pass
  // for the wrong reason: it injects operator scopes (which the gutted
  // `buildPluginRequestStages` deliberately never does) to drive the guard's
  // authorized branch through the real server. The pair discriminates three
  // states — gutted → blocked, scoped → reachable, broken-wiring → neither.
  it("reaches an auth:'gateway' route once operator scopes ARE propagated (guards that the dispatch wiring stays live)", async () => {
    const gatewayRouteHandler = createReachableRouteSpy();
    const guarded = createGatewayPluginRequestHandler({
      registry: createTestRegistry({ httpRoutes: [createGatewayAuthRoute(gatewayRouteHandler)] }),
      log: asGuardLog(vi.fn()),
    });
    // Wrap the guard to inject scopes, simulating a (hypothetical) correctly
    // scope-propagating perimeter — the only thing the real gut withholds.
    const handlePluginRequest: PluginHttpRequestHandler = (req, res, pathContext) =>
      guarded(req, res, pathContext, {
        gatewayAuthSatisfied: true,
        gatewayRequestOperatorScopes: [],
      });

    await withGatewayServer({
      prefix: "remoteclaw-plugin-gateway-auth-tripwire-positive-",
      resolvedAuth: AUTH_NONE,
      overrides: {
        handlePluginRequest,
        shouldEnforcePluginGatewayAuth: () => true,
      },
      run: async (server) => {
        await sendRequest(server, { path: "/plugin/secure" });
        expect(gatewayRouteHandler).toHaveBeenCalledTimes(1);
      },
    });
  });
});

// ---------------------------------------------------------------------------
// Sub-part (b) of the #2724 gutted-posture guard: positive-presence-AND-WIRING.
//
// The behavioral tripwire above (sub-part a, PR #2726) drives the real pipeline
// and asserts the EMERGENT block still happens. This complementary guard is
// STRUCTURAL: it asserts the gateway-auth CONTROLS the fork relies on stay
// *wired at their call sites* — not merely present as defined symbols. It
// catches the orthogonal de-wiring failure mode an upstream sync can introduce:
// the control's definition survives (so "symbol exists" / a raw grep still
// passes green) while its sole invocation is deleted, silently disabling it.
//
// Mechanism is AST, NOT text-grep: the repo runs oxfmt (identifier-level
// reformatting) and a substring match cannot distinguish a real call from the
// symbol appearing in a comment or string. We parse each module with the
// TypeScript compiler API and assert an actual CallExpression resolves to the
// control. Each assertion is kept non-degenerate (degenerate-subject gate): a
// cross-module call site must IMPORT the symbol AND CALL it, and the control
// COUNT is pinned so a silently dropped row fails the suite instead of passing
// vacuously.
//
// IF A ROW FAILS AFTER AN UPSTREAM SYNC: a security control was de-wired —
// restore the call, do NOT delete the row. If a control was intentionally
// replaced, that is an architecture decision needing its own ADR + security
// review (hq-internal ADR 0010 / ADR 0011 DIFF-SYNC re-introduction family).

const GATEWAY_DIR = path.dirname(fileURLToPath(import.meta.url));

function parseGatewayModule(relPath: string): ts.SourceFile {
  const absPath = path.join(GATEWAY_DIR, relPath);
  return ts.createSourceFile(
    absPath,
    readFileSync(absPath, "utf8"),
    ts.ScriptTarget.Latest,
    /* setParentNodes */ true,
  );
}

function hasExportModifier(node: ts.Node): boolean {
  const modifiers = ts.canHaveModifiers(node) ? ts.getModifiers(node) : undefined;
  return modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword) ?? false;
}

/** True when `name` is declared at module top level (function or `const`). */
function declaresSymbol(sf: ts.SourceFile, name: string, opts: { exported: boolean }): boolean {
  for (const stmt of sf.statements) {
    if (ts.isFunctionDeclaration(stmt) && stmt.name?.text === name) {
      return opts.exported ? hasExportModifier(stmt) : true;
    }
    if (
      ts.isVariableStatement(stmt) &&
      stmt.declarationList.declarations.some((d) => ts.isIdentifier(d.name) && d.name.text === name)
    ) {
      return opts.exported ? hasExportModifier(stmt) : true;
    }
  }
  return false;
}

/** True when the module has a named-import binding for `name`. */
function importsSymbol(sf: ts.SourceFile, name: string): boolean {
  return sf.statements.some(
    (stmt) =>
      ts.isImportDeclaration(stmt) &&
      stmt.importClause?.namedBindings !== undefined &&
      ts.isNamedImports(stmt.importClause.namedBindings) &&
      stmt.importClause.namedBindings.elements.some((el) => el.name.text === name),
  );
}

/** True when the module contains a CallExpression invoking `name(...)`. */
function callsSymbol(sf: ts.SourceFile, name: string): boolean {
  let found = false;
  const visit = (node: ts.Node) => {
    if (ts.isCallExpression(node)) {
      const callee = node.expression;
      if (ts.isIdentifier(callee) && callee.text === name) {
        found = true;
      } else if (ts.isPropertyAccessExpression(callee) && callee.name.text === name) {
        found = true;
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return found;
}

/**
 * True when an `authorizeHttpGatewayConnect({ ... })` call in the module forwards
 * a `rateLimiter` property — the wiring that actually feeds the per-origin
 * limiter into the bearer-auth path. A sync that kept the call but dropped this
 * property would disable per-origin brute-force protection while every
 * call-presence assertion below still passed green.
 */
function authConnectForwardsRateLimiter(sf: ts.SourceFile): boolean {
  let forwarded = false;
  const visit = (node: ts.Node) => {
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === "authorizeHttpGatewayConnect"
    ) {
      const arg = node.arguments[0];
      if (arg && ts.isObjectLiteralExpression(arg)) {
        forwarded ||= arg.properties.some(
          (p) =>
            (ts.isPropertyAssignment(p) || ts.isShorthandPropertyAssignment(p)) &&
            ts.isIdentifier(p.name) &&
            p.name.text === "rateLimiter",
        );
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return forwarded;
}

type ControlWiring = {
  /** Human-readable control name (shows up in the test title). */
  control: string;
  symbol: string;
  defModule: string;
  defExported: boolean;
  callSiteModule: string;
  /** Cross-module call sites must import the symbol; same-module calls need not. */
  callSiteImportsSymbol: boolean;
};

// The scope-confinement + per-origin rate-limit controls this fork relies on,
// with the module that DEFINES each and the module that must CALL it. These are
// the controls whose de-wiring (call-site deletion) would be a privilege /
// authentication / rate-limit regression — not ceremony helpers.
const WIRED_GATEWAY_AUTH_CONTROLS: ControlWiring[] = [
  {
    control: "scope-confinement: per-request operator scopes (CVE-2026-32919/28473 boundary)",
    symbol: "resolveGatewayRequestedOperatorScopes",
    defModule: "http-auth-helpers.ts",
    defExported: true,
    callSiteModule: "http-endpoint-helpers.ts",
    callSiteImportsSymbol: true,
  },
  {
    control: "scope-confinement: per-method scope authorization (deny decision)",
    symbol: "authorizeOperatorScopesForMethod",
    defModule: "method-scopes.ts",
    defExported: true,
    callSiteModule: "http-endpoint-helpers.ts",
    callSiteImportsSymbol: true,
  },
  {
    control: "per-origin rate-limit + bearer-auth chokepoint",
    symbol: "authorizeGatewayBearerRequestOrReply",
    defModule: "http-auth-helpers.ts",
    defExported: true,
    callSiteModule: "http-endpoint-helpers.ts",
    callSiteImportsSymbol: true,
  },
  {
    control: "scope-confinement: plugin-route runtime client (confined to propagated scopes)",
    symbol: "createPluginRouteRuntimeClient",
    defModule: "server/plugins-http.ts",
    defExported: false, // module-local helper
    callSiteModule: "server/plugins-http.ts", // invoked in the same module
    callSiteImportsSymbol: false,
  },
];

describe("gateway-auth control wiring guard (#2724, positive-presence-AND-wiring)", () => {
  it.each(WIRED_GATEWAY_AUTH_CONTROLS)(
    "keeps wired — $control: $symbol is defined AND invoked at its call site",
    ({ symbol, defModule, defExported, callSiteModule, callSiteImportsSymbol }) => {
      const defSource = parseGatewayModule(defModule);
      // Presence half: the control is still defined where we expect it.
      expect(declaresSymbol(defSource, symbol, { exported: defExported })).toBe(true);

      const callSiteSource =
        callSiteModule === defModule ? defSource : parseGatewayModule(callSiteModule);
      // Non-degeneracy: a cross-module call site must import the symbol, so a
      // "no call found" result can never be a false alarm from parsing the
      // wrong file.
      if (callSiteImportsSymbol) {
        expect(importsSymbol(callSiteSource, symbol)).toBe(true);
      }
      // Wiring half: the control is actually CALLED, not merely defined.
      expect(callsSymbol(callSiteSource, symbol)).toBe(true);
    },
  );

  it("pins the control COUNT so a silently dropped row fails loudly (degenerate-subject gate)", () => {
    // If a future edit deletes a row to "make the suite green" after a de-wire,
    // this fails instead. Bump it ONLY when intentionally adding/removing a
    // guarded control — never to silence a real de-wiring.
    expect(WIRED_GATEWAY_AUTH_CONTROLS).toHaveLength(4);
  });

  it("keeps the per-origin rate limiter threaded through the bearer-auth chokepoint", () => {
    // authorizeGatewayBearerRequestOrReply is the single HTTP auth chokepoint;
    // it must forward `rateLimiter` into authorizeHttpGatewayConnect. The
    // call-presence row above proves the chokepoint stays wired; this proves the
    // limiter is still fed INTO it.
    expect(authConnectForwardsRateLimiter(parseGatewayModule("http-auth-helpers.ts"))).toBe(true);
  });
});
