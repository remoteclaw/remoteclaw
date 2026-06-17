import type { IncomingMessage, ServerResponse } from "node:http";
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
