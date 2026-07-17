import { createRequire } from "node:module";
import * as SlackBolt from "@slack/bolt";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resolveSlackWebClientOptions } from "./client.js";

// Same CJS/ESM interop fallback as monitor/provider.ts, but off the namespace
// import: under vitest the default export of this CJS module carries no `App`.
const slackBoltModule = SlackBolt as typeof import("@slack/bolt") & {
  default?: typeof import("@slack/bolt");
};
const slackBolt =
  (slackBoltModule.App ? slackBoltModule : slackBoltModule.default) ?? slackBoltModule;
const { App } = slackBolt;

/**
 * Socket Mode proxy support is implicit: monitor/provider.ts only passes
 * `clientOptions` to bolt's `App`, and bolt itself carries the agent the rest of
 * the way — `App` merges `clientOptions` into `installerOptions`
 * (App.js: `installerOptions = { clientOptions: this.clientOptions, ...installerOptions }`),
 * SocketModeReceiver forwards `installerOptions.clientOptions` to SocketModeClient,
 * which hands `webClientOptions.agent` to SlackWebSocket as `httpAgent`, which `ws`
 * uses to tunnel the upgrade request.
 *
 * Nothing in this repo restates that chain, so a bolt upgrade that drops the merge
 * would silently return Slack Socket Mode to direct egress — the #2954 regression,
 * with Web API calls still correctly proxied and no other test failing. This pins
 * the bolt-side half of the contract at the last seam observable without a network
 * connection: the agent arriving on the SocketModeClient.
 */
const PROXY_ENV_KEYS = ["HTTPS_PROXY", "HTTP_PROXY", "https_proxy", "http_proxy"] as const;
const originalEnv = { ...process.env };

function readSocketModeAgent(app: unknown): unknown {
  // `receiver` (App) and `webClientOptions` (SocketModeClient) are both private;
  // reach through structurally rather than suppress the type error.
  const receiver = (app as { receiver?: { client?: unknown } }).receiver;
  const socketClient = receiver?.client as { webClientOptions?: { agent?: unknown } } | undefined;
  return socketClient?.webClientOptions?.agent;
}

function createSocketModeApp(clientOptions: ReturnType<typeof resolveSlackWebClientOptions>) {
  return new App({
    token: "xoxb-test",
    appToken: "xapp-test",
    socketMode: true,
    clientOptions,
    // Otherwise the constructor fires a live auth.test against slack.com.
    tokenVerificationEnabled: false,
  });
}

describe("slack socket mode proxy wiring", () => {
  beforeEach(() => {
    for (const key of PROXY_ENV_KEYS) {
      delete process.env[key];
    }
  });

  afterEach(() => {
    for (const key of PROXY_ENV_KEYS) {
      if (originalEnv[key] !== undefined) {
        process.env[key] = originalEnv[key];
      } else {
        delete process.env[key];
      }
    }
  });

  it("hands the env proxy agent to the Socket Mode client", () => {
    process.env.HTTPS_PROXY = "http://proxy.example.com:3128";
    const clientOptions = resolveSlackWebClientOptions();
    expect(clientOptions.agent).toBeDefined();

    const agent = readSocketModeAgent(createSocketModeApp(clientOptions));

    expect(agent).toBe(clientOptions.agent);
    expect((agent as { constructor: { name: string } }).constructor.name).toBe("HttpsProxyAgent");
  });

  it("leaves the Socket Mode client unproxied when no proxy is configured", () => {
    const clientOptions = resolveSlackWebClientOptions();
    expect(clientOptions.agent).toBeUndefined();

    expect(readSocketModeAgent(createSocketModeApp(clientOptions))).toBeUndefined();
  });

  it("leaves the Socket Mode client unproxied when NO_PROXY excludes Slack", () => {
    process.env.HTTPS_PROXY = "http://proxy.example.com:3128";
    process.env.NO_PROXY = "slack.com";
    try {
      const clientOptions = resolveSlackWebClientOptions();

      expect(readSocketModeAgent(createSocketModeApp(clientOptions))).toBeUndefined();
    } finally {
      delete process.env.NO_PROXY;
    }
  });
});

/**
 * Dependency tripwire for the un-asserted tail of the Socket-Mode agent-forwarding chain.
 *
 * The proxy tests above pin the contract only up to `SocketModeClient.webClientOptions.agent`
 * — the last seam observable without opening a live WebSocket. The final hops
 * (`SocketModeClient` → `SlackWebSocket`, which hands the agent to `ws` as `httpAgent`) live
 * inside `@slack/socket-mode` and run only against the live network. A `@slack/bolt` or
 * `@slack/socket-mode` MAJOR that renamed or dropped that private
 * `installerOptions.clientOptions` → `webClientOptions.agent` → `httpAgent` forwarding would
 * leave the tests above GREEN while the WebSocket silently egressed direct (the #2954
 * regression: Web API still proxied, bot token unproxied, nothing else failing).
 *
 * Semver-major is the review signal: these guards fail when either package leaves its verified
 * major, forcing a human re-review of the forwarding path — App → SocketModeReceiver →
 * SocketModeClient → SlackWebSocket → ws `httpAgent` — before the bump lands. Within-major
 * bumps are trusted (a break there would surface as a live regression, not a semver signal).
 */
const tripwireRequire = createRequire(import.meta.url);
const VERIFIED_BOLT_MAJOR = 4; // @slack/bolt@4.7.3
const VERIFIED_SOCKET_MODE_MAJOR = 2; // @slack/socket-mode@2.0.7 (transitive via @slack/bolt)

function majorOf(version: string): number {
  return Number.parseInt(version.split(".")[0] ?? "", 10);
}

describe("slack socket mode proxy dependency tripwire", () => {
  it("keeps @slack/bolt within the verified major (installerOptions merge re-review gate)", () => {
    const { version } = tripwireRequire("@slack/bolt/package.json") as { version: string };
    expect(
      majorOf(version),
      `@slack/bolt left verified major ${VERIFIED_BOLT_MAJOR} (installed ${version}). Re-verify App → SocketModeReceiver → SocketModeClient still forwards installerOptions.clientOptions.agent, then bump VERIFIED_BOLT_MAJOR.`,
    ).toBe(VERIFIED_BOLT_MAJOR);
  });

  it("keeps @slack/socket-mode within the verified major (webClientOptions.agent → ws httpAgent re-review gate)", () => {
    // socket-mode is transitive; pnpm's strict layout hides it from the workspace root, so
    // resolve its package.json from @slack/bolt's own location.
    const requireFromBolt = createRequire(tripwireRequire.resolve("@slack/bolt"));
    const { version } = requireFromBolt("@slack/socket-mode/package.json") as { version: string };
    expect(
      majorOf(version),
      `@slack/socket-mode left verified major ${VERIFIED_SOCKET_MODE_MAJOR} (installed ${version}). Re-verify SocketModeClient still hands webClientOptions.agent to SlackWebSocket as ws httpAgent, then bump VERIFIED_SOCKET_MODE_MAJOR.`,
    ).toBe(VERIFIED_SOCKET_MODE_MAJOR);
  });
});
