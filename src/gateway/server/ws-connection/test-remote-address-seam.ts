import type { IncomingMessage } from "node:http";

/**
 * TEST-ONLY seam: simulate a non-loopback peer address on the gateway WS
 * upgrade socket so the harness can exercise the *successful* trusted-proxy
 * auth path.
 *
 * ## Why this exists
 *
 * `authorizeTrustedProxy` (src/gateway/auth.ts) rejects trusted-proxy auth from
 * a loopback source unconditionally (`trusted_proxy_loopback_source`). That is
 * the correct production posture: a real reverse proxy fronts the gateway from a
 * non-loopback address, so a "trusted proxy" arriving over loopback is almost
 * certainly a local process spoofing forwarding headers. The gateway test
 * harness, however, can only connect over `ws://127.0.0.1`, so without a seam it
 * can ONLY ever observe the loopback *rejection* — never the post-auth behavior
 * (e.g. self-declared scope clearing for a device-less trusted-proxy control-UI
 * operator, covered by `server.auth.control-ui.suite.ts`).
 *
 * This seam lets a test make the server observe a non-loopback `remoteAddress`
 * for the connection it is about to open — exactly the network condition that
 * holds in production behind a real proxy — WITHOUT relaxing the loopback
 * rejection itself.
 *
 * ## Why it is production-safe (read before changing)
 *
 * 1. **Off by default.** `override` is `undefined` until a test sets it, and
 *    {@link applyTestUpgradeRemoteAddressOverride} is a strict no-op while unset.
 *    Production reads the real socket address — behavior is byte-for-byte
 *    unchanged.
 * 2. **No production caller.** {@link setTestUpgradeRemoteAddressOverride} is
 *    only ever called from test code. Grep `setTestUpgradeRemoteAddressOverride`
 *    across `src/`: the sole non-test references are this definition and the
 *    test-helper re-export. Production connect/auth code never imports it. (This
 *    is the same "no live non-test caller" property the fork's
 *    throwing-stub-callers-gate enforces.)
 * 3. **Belt-and-suspenders runtime guard.** The apply path additionally bails
 *    unless the process is a Vitest run (`process.env.VITEST` is `"true"`/`"1"`,
 *    set by `test/setup.ts` and never by production). So even an accidental
 *    production call to the setter cannot alter a real connection.
 * 4. **It does NOT weaken `authorizeTrustedProxy`.** The loopback-rejection
 *    branch in auth.ts is untouched. This only changes WHICH address a *test*
 *    connection appears to originate from — equivalent to running the test on a
 *    host with a non-loopback NIC behind a proxy. Any genuine loopback
 *    trusted-proxy connection in production is still rejected.
 */
let override: string | undefined;

function isVitestRuntime(): boolean {
  const value = process.env.VITEST;
  return value === "true" || value === "1";
}

/**
 * TEST-ONLY. Set (or clear, with `undefined`) the simulated non-loopback peer
 * address applied to subsequent WS upgrades. Tests MUST reset to `undefined`
 * after use (the override is process-global). Never call from production code.
 */
export function setTestUpgradeRemoteAddressOverride(addr: string | undefined): void {
  override = addr;
}

/**
 * Apply the test override (if any) to the upgrade request's socket so that all
 * downstream reads of `req.socket.remoteAddress` — including
 * `authorizeTrustedProxy` — observe the simulated peer. No-op in production
 * (override unset and/or not a Vitest run). See module doc for safety rationale.
 */
export function applyTestUpgradeRemoteAddressOverride(req: IncomingMessage): void {
  if (!override || !isVitestRuntime()) {
    return;
  }
  const socket = req.socket;
  if (!socket) {
    return;
  }
  // Shadow the real getter/own-property with a configurable own value so every
  // downstream read (the connection handler's `remoteAddr`, and the auth layer's
  // `req.socket.remoteAddress`) sees the simulated address consistently.
  Object.defineProperty(socket, "remoteAddress", {
    configurable: true,
    enumerable: true,
    value: override,
  });
}
